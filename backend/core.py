import os
import secrets
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import psycopg
from psycopg.rows import dict_row
from fastapi import HTTPException, Request, Response

DB_DSN = os.environ["PERKUTUT_DATABASE_URL"]  # fail fast jika env var tidak diset
SESSION_TTL_HOURS = 24
MAX_FAILED_LOGINS = 5  # Lock the account after five incorrect passwords.
COOKIE_SECURE = os.environ.get("PERKUTUT_COOKIE_SECURE", "0") == "1"  # set 1 saat di-deploy di belakang HTTPS

FRONTEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = Path(os.environ.get("PERKUTUT_UPLOAD_DIR", FRONTEND_DIR / "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "documents").mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "submissions").mkdir(parents=True, exist_ok=True)

ALLOWED_DOC_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
WHATSAPP_GROUP_URL = os.environ.get("PERKUTUT_WHATSAPP_URL", "").strip()
ALLOWED_SUB_EXTS = {".zip", ".tar.gz", ".tgz", ".pdf", ".pkt", ".pka", ".docx", ".txt"}
MAX_DOC_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_SUB_SIZE = 50 * 1024 * 1024  # 50 MB

# ------------------------------------------------------------- superkutut
# Kredensial superadmin TIDAK disimpan di DB users — murni env, diganti via .env.
SUPERADMIN_USERNAME = os.environ.get("PERKUTUT_SUPERADMIN_USER", "superkutut")
SUPERADMIN_PASSWORD = os.environ.get("PERKUTUT_SUPERADMIN_PASSWORD", "admin")
_raw_totp = os.environ.get("PERKUTUT_SUPERADMIN_TOTP_SECRET", "").strip().upper().replace(" ", "")
SUPERADMIN_TOTP_SECRET = _raw_totp + "=" * ((8 - len(_raw_totp) % 8) % 8) if _raw_totp else ""
SUPER_SESSION_TTL_HOURS = 8
SUPER_COOKIE = "perkutut_super_session"
SUPER_BASE_PATH = "/mampir-dulu-loh-mas"
SUPER_LOGIN_PATH = SUPER_BASE_PATH + "/loh-ya-boleh-wong-ditawari-kok/"
SUPER_DASH_PATH = SUPER_BASE_PATH + "/cok-gateli/"
AUDIT_RETENTION_DAYS = int(os.environ.get("PERKUTUT_AUDIT_RETENTION_DAYS", "180"))

# ------------------------------------------------------------------ rate limit
#
# Anti brute-force: batasi percobaan auth per IP.
#  - captcha & login: 10 permintaan / menit / IP
#  - register: 5 permintaan / menit / IP
# Backend in-memory (cukup untuk satu proses uvicorn); ganti redis:// bila
# nanti dijalankan multi-worker.
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)  # X-Forwarded-For dipakai otomatis bila ada proxy


def db() -> psycopg.Connection:
    return psycopg.connect(DB_DSN, row_factory=dict_row)


# ------------------------------------------------------- password policy
#
# Kebijakan (NIST SP 800-63B style):
#   - panjang 15..64 karakter
#   - TIDAK mewajibkan kombinasi huruf besar/kecil/angka/simbol
#   - TIDAK wajib diganti berkala
#   - harus diperiksa: tidak mudah ditebak / umum digunakan (zxcvbn)
#   - karakter ASCII yang dapat dicetak, spasi, dan Unicode diizinkan
#   - lupa password: hubungi admin (tidak ada self-service reset)
PW_MIN_LEN = 15
PW_MAX_LEN = 64
PW_MIN_SCORE = 3  # zxcvbn: 0..4; 3 = kuat


def _printable_or_unicode(password: str) -> bool:
    for ch in password:
        cp = ord(ch)
        if ch == "\n" or ch == "\r":
            return False
        if 0x20 <= cp <= 0x7E:      # ASCII printable (termasuk spasi)
            continue
        if cp >= 0xA0:              # Unicode non-kontrol
            continue
        return False
    return True


def validate_password_policy(password: str) -> list[str]:
    """Kembalikan daftar pesan kegagalan; kosong berarti lolos."""
    failures = []
    if len(password) < PW_MIN_LEN:
        failures.append(f"Minimal {PW_MIN_LEN} karakter")
    if len(password) > PW_MAX_LEN:
        failures.append(f"Maksimal {PW_MAX_LEN} karakter")
    if not _printable_or_unicode(password):
        failures.append("Hanya karakter yang dapat dicetak (ASCII, spasi, Unicode)")
    if not failures:
        from zxcvbn import zxcvbn
        result = zxcvbn(password, max_length=PW_MAX_LEN)
        if result["score"] < PW_MIN_SCORE:
            suggestions = ", ".join(result["feedback"]["suggestions"][:2]) or "Gunakan frasa sandi yang lebih panjang dan unik"
            failures.append(f"Kata sandi terlalu mudah ditebak atau umum digunakan. {suggestions}")
    return failures


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


# ------------------------------------------- captcha perkalian (bot prevention)
#
# Sederhana: server buat soal perkalian acak, jawaban disematkan di token HMAC
# (stateless — tidak perlu simpan state di DB/session). Token masa berlaku 10 menit.

CAPTCHA_HMAC_KEY = os.environ["PERKUTUT_ALTCHA_HMAC_KEY"]  # reuse key env, fail fast


def captcha_create() -> dict:
    a = secrets.randbelow(9) + 2   # 2..10
    b = secrets.randbelow(9) + 2   # 2..10
    expires = int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp())
    payload = f"{a}x{b}.{expires}"
    sig = hmac.new(CAPTCHA_HMAC_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return {"id": f"{payload}.{sig}", "question": f"Berapa hasil dari {a} × {b}?"}


def captcha_verify(captcha_id: str, answer: str) -> bool:
    try:
        question, expires, sig = captcha_id.split(".")   # format: "axb.expires.sig"
        payload = f"{question}.{expires}"
        expected = hmac.new(CAPTCHA_HMAC_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return False
        if int(expires) < datetime.now(timezone.utc).timestamp():
            return False
        a, b = question.split("x")
        return answer.strip() == str(int(a) * int(b))
    except (ValueError, AttributeError):
        return False


def require_captcha(data) -> None:
    """Guard captcha bersama untuk register & login."""
    if not captcha_verify(data.captcha_id, data.captcha_answer):
        raise HTTPException(status_code=400, detail={"captcha": "Jawaban captcha salah atau kedaluwarsa."})


# --------------------------------------------------------------- session


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    with db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
            (_hash_token(token), user_id, datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)),
        )
    response.set_cookie(
        key="perkutut_session",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_TTL_HOURS * 3600,
        path="/",
    )


def _super_session(request: Request):
    """Session superkutut dari cookie terpisah; tidak berlaku di portal biasa."""
    token = request.cookies.get(SUPER_COOKIE)
    if not token:
        return None
    with db() as conn:
        row = conn.execute(
            "SELECT id FROM sessions WHERE id = %s AND is_super AND expires_at > now()",
            (_hash_token(token),),
        ).fetchone()
    if not row:
        return None
    return {
        "id": None,
        "full_name": "Superkutut",
        "email": SUPERADMIN_USERNAME,
        "role": "superadmin",
        "is_super": True,
    }


def current_user(request: Request):
    su = _super_session(request)
    if su is not None:
        return su
    token = request.cookies.get("perkutut_session")
    if not token:
        return None
    with db() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.full_name, u.email, COALESCE(u.role, 'user') AS role, s.expires_at
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.id = %s AND NOT s.is_super AND s.expires_at > now()
            """,
            (_hash_token(token),),
        ).fetchone()
    return row


def require_user(request: Request):
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Tidak terautentikasi")
    return user


def require_admin(request: Request):
    user = require_user(request)
    if user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Akses ditolak: hak akses admin diperlukan")
    return user


def require_jury(request: Request):
    user = require_user(request)
    if user.get("role") not in ("jury", "admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Akses ditolak: hak akses juri diperlukan")
    return user


def require_superadmin(request: Request):
    su = _super_session(request)
    if su is None:
        raise HTTPException(status_code=401, detail="Tidak terautentikasi")
    return su


def create_super_session(response: Response) -> None:
    token = secrets.token_urlsafe(32)
    with db() as conn:
        # user_id NOT NULL: pakai akun admin pertama sebagai pemilik teknis baris;
        # otoritas super ditentukan flag is_super, bukan user_id.
        owner = conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").fetchone()
        if owner is None:
            owner = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
        if owner is None:
            raise HTTPException(status_code=500, detail="Tidak ada akun pemilik session.")
        conn.execute(
            "INSERT INTO sessions (id, user_id, expires_at, is_super) VALUES (%s, %s, %s, TRUE)",
            (_hash_token(token), owner["id"], datetime.now(timezone.utc) + timedelta(hours=SUPER_SESSION_TTL_HOURS)),
        )
    response.set_cookie(
        key=SUPER_COOKIE,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        max_age=SUPER_SESSION_TTL_HOURS * 3600,
        path="/",
    )


def verify_super_totp(code: str) -> bool:
    if not SUPERADMIN_TOTP_SECRET:
        return False  # TOTP belum dikonfigurasi = login super ditolak (fail-closed)
    import pyotp
    try:
        return pyotp.TOTP(SUPERADMIN_TOTP_SECRET).verify(code.strip(), valid_window=1)
    except Exception:
        return False


# --------------------------------------------------------------- audit log

def audit(request, category, action, *, target_type=None, target_id=None, detail=None, outcome="ok", actor=None, fail_closed=False):
    """Catat aktivitas bernilai ke audit_logs. Best-effort: kegagalan insert tidak
    menggagalkan request bisnis — kecuali fail_closed (aksi superadmin)."""
    import json as _json
    import sys
    try:
        if actor is None and request is not None:
            actor = getattr(request.state, "user", None)
        actor = actor or {}
        ip = None
        ua = None
        if request is not None:
            ip = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else None)
            ua = request.headers.get("user-agent", "")[:300]
        with db() as conn:
            conn.execute(
                """
                INSERT INTO audit_logs (actor_id, actor_email, actor_role, ip, user_agent, category, action, target_type, target_id, detail, outcome)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    actor.get("id"),
                    actor.get("email"),
                    actor.get("role"),
                    ip,
                    ua,
                    category,
                    action,
                    target_type,
                    str(target_id) if target_id is not None else None,
                    _json.dumps(detail or {}, default=str, ensure_ascii=False),
                    outcome,
                ),
            )
    except Exception as e:
        print(f"[audit] insert gagal: {e}", file=sys.stderr)
        if fail_closed:
            raise HTTPException(status_code=500, detail="Audit gagal; aksi dibatalkan.")


# -------------------------------------------------------- competition helpers


def is_competition_open(comp: dict) -> bool:
    if comp.get("status") != "OPEN":
        return False
    now = datetime.now(timezone.utc)
    start = comp.get("registration_start")
    end = comp.get("registration_end")
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True


def format_competition(comp: dict) -> dict:
    return {
        "id": comp["id"],
        "slug": comp["slug"],
        "name": comp["name"],
        "audience": comp["audience"],
        "description": comp.get("description"),
        "problem_statement": comp.get("problem_statement"),
        "participation_type": comp["participation_type"],
        "min_team_members": comp["min_team_members"],
        "max_team_members": comp["max_team_members"],
        "status": comp["status"],
        "registration_start": comp["registration_start"].isoformat() if comp.get("registration_start") else None,
        "registration_end": comp["registration_end"].isoformat() if comp.get("registration_end") else None,
        "is_open": is_competition_open(comp),
        "badge": comp["status"],
        "cta": {"label": "Daftar Sekarang" if is_competition_open(comp) else "Lihat Kompetisi", "enabled": is_competition_open(comp)},
    }


def generate_team_code(conn: psycopg.Connection, prefix: str = "PC26-") -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(5):
        code = prefix + "".join(secrets.choice(chars) for _ in range(6))
        found = conn.execute("SELECT id FROM teams WHERE code = %s", (code,)).fetchone()
        if not found:
            return code
    return f"{prefix}{secrets.token_hex(4).upper()}"


def parse_iso_datetime(dt_str: str | None) -> datetime | None:
    if not dt_str:
        return None
    val = dt_str.strip()
    if not val:
        return None
    try:
        if val.endswith("Z"):
            val = val[:-1] + "+00:00"
        dt = datetime.fromisoformat(val)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        raise HTTPException(
            status_code=422,
            detail=f"Format tanggal '{dt_str}' tidak valid. Gunakan format ISO-8601 (contoh: 2026-11-08T12:00:00Z).",
        )


def bind_user_to_competition(conn: psycopg.Connection, user_id: int, competition: dict, team_name: str | None = None) -> dict:
    existing = conn.execute(
        "SELECT team_id FROM team_members WHERE user_id = %s AND competition_id = %s",
        (user_id, competition["id"]),
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"competition": [f"Anda sudah terdaftar dalam kompetisi {competition['name']}."]},
        )

    code = generate_team_code(conn)
    if competition.get("participation_type") == "INDIVIDUAL":
        fallback_name = f"Peserta {competition['name']}"
    else:
        fallback_name = f"Tim {competition['name']}"
    t_name = (team_name or fallback_name).strip()[:100]

    team_row = conn.execute(
        """
        INSERT INTO teams (code, track, leader_user_id, payment_status, competition_id, name)
        VALUES (%s, %s, %s, 'PENDING', %s, %s)
        RETURNING id, code, track, payment_status, competition_id, name
        """,
        (code, competition["name"], user_id, competition["id"], t_name),
    ).fetchone()

    conn.execute(
        """
        INSERT INTO team_members (team_id, user_id, role, competition_id)
        VALUES (%s, %s, 'leader', %s)
        """,
        (team_row["id"], user_id, competition["id"]),
    )
    return team_row


# ------------------------------------------------ document & verification helpers


def assign_team_to_admin(conn, team_id: int) -> int | None:
    """Auto-assigns team verification to an active admin using round-robin (least loaded)."""
    assigned = conn.execute(
        "SELECT assigned_admin_id FROM team_verifications WHERE team_id = %s",
        (team_id,),
    ).fetchone()
    if assigned:
        return assigned["assigned_admin_id"]

    admin = conn.execute(
        """
        SELECT u.id
        FROM users u
        LEFT JOIN team_verifications tv ON tv.assigned_admin_id = u.id
        WHERE u.role = 'admin'
        GROUP BY u.id
        ORDER BY COUNT(tv.team_id) ASC, u.id ASC
        LIMIT 1
        """
    ).fetchone()
    if admin:
        conn.execute(
            "INSERT INTO team_verifications (team_id, assigned_admin_id) VALUES (%s, %s) ON CONFLICT (team_id) DO NOTHING",
            (team_id, admin["id"]),
        )
        return admin["id"]
    return None


def assign_submission_to_jury(conn, team_id: int, competition_id: int) -> int | None:
    """Auto-assigns a team's submission to 1 jury using round-robin per competition."""
    assigned = conn.execute(
        "SELECT jury_user_id FROM submission_assignments WHERE team_id = %s",
        (team_id,),
    ).fetchone()
    if assigned:
        return assigned["jury_user_id"]

    # Try finding jury assigned specifically to this competition
    jury = conn.execute(
        """
        SELECT u.id
        FROM users u
        JOIN jury_competitions jc ON jc.jury_user_id = u.id AND jc.competition_id = %s
        LEFT JOIN submission_assignments sa ON sa.jury_user_id = u.id AND sa.competition_id = %s
        WHERE u.role = 'jury'
        GROUP BY u.id
        ORDER BY COUNT(sa.team_id) ASC, u.id ASC
        LIMIT 1
        """,
        (competition_id, competition_id),
    ).fetchone()

    # If no specific jury for this competition, fallback to any available jury
    if not jury:
        jury = conn.execute(
            """
            SELECT u.id
            FROM users u
            LEFT JOIN submission_assignments sa ON sa.jury_user_id = u.id
            WHERE u.role = 'jury'
            GROUP BY u.id
            ORDER BY COUNT(sa.team_id) ASC, u.id ASC
            LIMIT 1
            """
        ).fetchone()

    if jury:
        conn.execute(
            "INSERT INTO submission_assignments (team_id, competition_id, jury_user_id) VALUES (%s, %s, %s) ON CONFLICT (team_id) DO NOTHING",
            (team_id, competition_id, jury["id"]),
        )
        return jury["id"]
    return None


def check_and_update_team_verification(conn, team_id: int) -> str:
    """Checks if all required documents (member KTM, pasfoto, twibbon + team payment) are APPROVED.
    If yes, marks team verification_status = 'VERIFIED' and payment_status = 'PAID'.
    """
    members = conn.execute("SELECT user_id FROM team_members WHERE team_id = %s", (team_id,)).fetchall()
    if not members:
        conn.execute("UPDATE teams SET verification_status = 'UNVERIFIED' WHERE id = %s", (team_id,))
        return "UNVERIFIED"

    # 1. Check payment_proof
    pay = conn.execute(
        "SELECT status FROM documents WHERE team_id = %s AND document_type = 'payment_proof'",
        (team_id,),
    ).fetchone()
    if not pay or pay["status"] != "APPROVED":
        conn.execute("UPDATE teams SET verification_status = 'UNVERIFIED' WHERE id = %s", (team_id,))
        return "UNVERIFIED"

    # 2. Check each member's individual documents: ktm, pasfoto, twibbon
    for m in members:
        docs = conn.execute(
            "SELECT document_type, status FROM documents WHERE team_id = %s AND user_id = %s",
            (team_id, m["user_id"]),
        ).fetchall()
        approved_types = {d["document_type"] for d in docs if d["status"] == "APPROVED"}
        if not {"ktm", "pasfoto", "twibbon"}.issubset(approved_types):
            conn.execute("UPDATE teams SET verification_status = 'UNVERIFIED' WHERE id = %s", (team_id,))
            return "UNVERIFIED"

    # All approved! Automatically verify the team
    conn.execute(
        "UPDATE teams SET verification_status = 'VERIFIED', payment_status = 'PAID' WHERE id = %s",
        (team_id,),
    )
    return "VERIFIED"


# ------------------------------------------------- admin user management

USER_ROLES = {"user", "admin", "jury"}


def format_user(row: dict) -> dict:
    created_at = row.get("created_at")
    return {
        "id": row["id"],
        "full_name": row.get("full_name"),
        "email": row.get("email"),
        "role": row.get("role") or "user",
        "institution": row.get("institution"),
        "phone": row.get("phone"),
        "created_at": created_at.isoformat() if created_at else None,
    }
