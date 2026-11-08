"""
Perkutut Cup 2026 - backend (FastAPI + PostgreSQL).

Sesuai docs/ASSESSMENT.md §5.1: auth endpoints + session cookie HTTP-only.
Password policy mengikuti keala.web.id/passpolicy:
  min 8 karakter, wajib huruf besar + huruf kecil + angka + simbol.
"""
import os
import re
import secrets
import hashlib
import json
import hmac
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator

DB_DSN = os.environ["PERKUTUT_DATABASE_URL"]  # fail fast jika env var tidak diset
SESSION_TTL_HOURS = 24
MAX_FAILED_LOGINS = 5  # Lock the account after five incorrect passwords.
COOKIE_SECURE = os.environ.get("PERKUTUT_COOKIE_SECURE", "0") == "1"  # set 1 saat di-deploy di belakang HTTPS

app = FastAPI(title="Perkutut Cup 2026 API", version="0.1.0")


@app.get("/health", include_in_schema=False)
def health():
    """Lightweight process liveness check for staging deployments."""
    return {"status": "ok"}

# ------------------------------------------------------------------ rate limit
#
# Anti brute-force: batasi percobaan auth per IP.
#  - captcha & login: 10 permintaan / menit / IP
#  - register: 5 permintaan / menit / IP
# Backend in-memory (cukup untuk satu proses uvicorn); ganti redis:// bila
# nanti dijalankan multi-worker.
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)  # X-Forwarded-For dipakai otomatis bila ada proxy
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Terlalu banyak percobaan. Coba lagi sebentar lagi."},
        headers={"Retry-After": str(getattr(exc, "retry_after", 60))},
    )


def db() -> psycopg.Connection:
    return psycopg.connect(DB_DSN, row_factory=dict_row)


@app.on_event("startup")
def init_db():
    migrations_dir = Path(__file__).with_name("migrations")
    migrations = sorted(migrations_dir.glob("[0-9][0-9][0-9][0-9]_*.sql"))
    with db() as conn:
        # Keep migration discovery/application serialized when multiple workers
        # start against the same database at once.
        with conn.transaction():
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (741928316,))
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            applied = {
                row["version"]
                for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
            }
            for migration in migrations:
                version = migration.stem
                if version in applied:
                    continue
                conn.execute(migration.read_text(encoding="utf-8"))
                conn.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s)",
                    (version,),
                )
        seed_email = os.environ.get("PERKUTUT_SEED_ADMIN_EMAIL", "").strip().lower()
        seed_password = os.environ.get("PERKUTUT_SEED_ADMIN_PASSWORD")
        if seed_email and seed_password and not conn.execute("SELECT id FROM users WHERE LOWER(email) = %s", (seed_email,)).fetchone():
            conn.execute(
                "INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, 'admin')",
                (os.environ.get("PERKUTUT_SEED_ADMIN_NAME", "Administrator").strip() or "Administrator", seed_email, hash_password(seed_password)),
            )


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


# --------------------------------------------------------------- models


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(max_length=PW_MAX_LEN)
    confirm_password: str = Field(max_length=PW_MAX_LEN)
    captcha_id: str = Field(min_length=1)   # token soal dari /api/auth/captcha
    captcha_answer: str = Field(min_length=1)
    competition: str | None = None          # slug kompetisi terpilih
    competition_slug: str | None = None     # alias slug kompetisi

    @field_validator("password")
    @classmethod
    def policy(cls, v):
        failures = validate_password_policy(v)
        if failures:
            raise HTTPException(status_code=422, detail={"password": failures})
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=PW_MAX_LEN)
    captcha_id: str = Field(min_length=1)
    captcha_answer: str = Field(min_length=1)


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


def current_user(request: Request):
    token = request.cookies.get("perkutut_session")
    if not token:
        return None
    with db() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.full_name, u.email, COALESCE(u.role, 'user') AS role, s.expires_at
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.id = %s AND s.expires_at > now()
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
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Akses ditolak: hak akses admin diperlukan")
    return user


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


# ------------------------------------------------------------- endpoints


@app.get("/api/auth/captcha")
@limiter.limit("10/minute")
def captcha(request: Request):
    """Soal perkalian acak untuk bot prevention (stateless, HMAC-signed)."""
    return captcha_create()


@app.post("/api/auth/register", status_code=201)
@limiter.limit("5/minute")
def register(request: Request, payload: RegisterIn, response: Response):
    require_captcha(payload)
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=422, detail={"confirm_password": ["Kata sandi belum sama"]})

    comp_slug = payload.competition or payload.competition_slug
    target_comp = None
    if comp_slug:
        with db() as conn:
            target_comp = conn.execute(
                "SELECT * FROM competitions WHERE slug = %s",
                (comp_slug.strip().lower(),),
            ).fetchone()
            if not target_comp:
                raise HTTPException(status_code=422, detail={"competition": ["Kompetisi tidak ditemukan"]})
            if not is_competition_open(target_comp):
                raise HTTPException(status_code=422, detail={"competition": [f"Pendaftaran untuk kompetisi {target_comp['name']} sedang ditutup"]})

    pw_hash = hash_password(payload.password)
    try:
        with db() as conn:
            with conn.transaction():
                row = conn.execute(
                    "INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, 'user') RETURNING id, full_name, email, role",
                    (payload.full_name.strip(), payload.email.lower(), pw_hash),
                ).fetchone()

                team_row = None
                if target_comp:
                    team_row = bind_user_to_competition(conn, row["id"], target_comp)
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail={"email": ["Email sudah terdaftar"]})

    create_session(response, row["id"])
    res = {
        "user": {
            "id": row["id"],
            "full_name": row["full_name"],
            "email": row["email"],
            "role": row["role"],
        }
    }
    if team_row and target_comp:
        res["team"] = team_row
        res["competition"] = {
            "slug": target_comp["slug"],
            "name": target_comp["name"],
            "participation_type": target_comp["participation_type"],
        }
    return res


@app.post("/api/auth/login")
@limiter.limit("10/minute")
def login(request: Request, payload: LoginIn, response: Response):
    require_captcha(payload)
    with db() as conn:
        row = conn.execute(
            "SELECT id, full_name, email, password_hash, failed_login_count, locked_at FROM users WHERE email = %s",
            (payload.email.lower(),),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="Email atau kata sandi salah")
        if row["locked_at"] is not None:
            raise HTTPException(
                status_code=423,
                detail={"lockout": "Akun dikunci karena terlalu banyak percobaan gagal. Hubungi admin untuk membuka kembali."},
            )
        if not verify_password(payload.password, row["password_hash"]):
            failed = row["failed_login_count"] + 1
            conn.execute(
                "UPDATE users SET failed_login_count = %s, locked_at = CASE WHEN %s >= %s THEN now() ELSE locked_at END WHERE id = %s",
                (failed, failed, MAX_FAILED_LOGINS, row["id"]),
            )
            conn.commit()  # Persist the failure count before raising the HTTP error.
            if failed >= MAX_FAILED_LOGINS:
                raise HTTPException(
                    status_code=423,
                    detail={"lockout": f"Akun dikunci setelah {MAX_FAILED_LOGINS} kali salah kata sandi. Hubungi admin untuk membuka kembali."},
                )
            raise HTTPException(status_code=401, detail="Email atau kata sandi salah")
        if row["failed_login_count"] > 0:
            conn.execute(
                "UPDATE users SET failed_login_count = 0, locked_at = NULL WHERE id = %s",
                (row["id"],),
            )
    create_session(response, row["id"])
    return {"user": {"id": row["id"], "full_name": row["full_name"], "email": row["email"]}}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("perkutut_session")
    if token:
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE id = %s", (_hash_token(token),))
    response.delete_cookie("perkutut_session", path="/")
    return {"ok": True}


@app.post("/api/auth/forgot-password")
def forgot_password():
    """Kontrak §5.1 — alur pemulihan: lapor admin, tidak ada reset mandiri."""
    return {"message": "Lupa kata sandi? Silakan lapor admin untuk reset."}


@app.get("/api/auth/session")
def session_info(request: Request):
    user = current_user(request)
    if user is None:
        return JSONResponse({"authenticated": False}, status_code=200)
    return {
        "authenticated": True,
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user.get("role", "user"),
        },
    }


PROFILE_FIELDS = ("full_name", "institution", "email", "phone", "birth_date", "instagram_handle")


@app.get("/api/me")
def me(request: Request):
    user = require_user(request)
    with db() as conn:
        row = conn.execute(
            "SELECT id, full_name, institution, email, phone, birth_date, instagram_handle, COALESCE(role, 'user') AS role FROM users WHERE id = %s",
            (user["id"],),
        ).fetchone()
    # birth_date dari DATE -> string ISO agar aman di JSON
    row["birth_date"] = row["birth_date"].isoformat() if row["birth_date"] else None
    return {"user": row}


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    institution: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    birth_date: str | None = None  # ISO-8601: yyyy-mm-dd
    instagram_handle: str | None = Field(default=None, max_length=50)

    @field_validator("birth_date")
    @classmethod
    def valid_birth_date(cls, v):
        if v:
            datetime.strptime(v, "%Y-%m-%d")
        return v


@app.patch("/api/me")
def update_me(payload: ProfileIn, request: Request):
    user = require_user(request)
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="Tidak ada perubahan")

    # CWE-89 defense-in-depth: whitelist nama kolom (nilai tetap lewat parameter %s)
    if not set(updates) <= set(PROFILE_FIELDS):
        raise HTTPException(status_code=422, detail="Field tidak dikenal")

    if "birth_date" in updates:
        updates["birth_date"] = datetime.strptime(updates["birth_date"], "%Y-%m-%d").date()

    set_clause = ", ".join(f"{col} = %s" for col in updates)
    values = list(updates.values()) + [user["id"]]
    try:
        with db() as conn:
            row = conn.execute(
                f"UPDATE users SET {set_clause} WHERE id = %s RETURNING id, full_name, institution, email, phone, birth_date, instagram_handle",
                values,
            ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail={"email": ["Email sudah dipakai akun lain"]})
    row["birth_date"] = row["birth_date"].isoformat() if row["birth_date"] else None
    return {"user": row}


@app.get("/api/competitions")
def list_competitions(active_only: bool = False, status: str | None = None):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM competitions ORDER BY CASE WHEN status = 'OPEN' THEN 1 ELSE 2 END, id ASC"
        ).fetchall()
    competitions = [format_competition(r) for r in rows]
    if active_only:
        competitions = [c for c in competitions if c["is_open"]]
    elif status:
        competitions = [c for c in competitions if c["status"].upper() == status.upper()]
    return {"competitions": competitions}


@app.get("/api/competitions/{slug}")
def get_competition(slug: str):
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM competitions WHERE slug = %s",
            (slug.strip().lower(),),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Kompetisi tidak ditemukan")
    return {"competition": format_competition(row)}


class CompetitionRegisterIn(BaseModel):
    team_name: str | None = Field(default=None, max_length=100)


@app.post("/api/competitions/{slug}/register", status_code=201)
@limiter.limit("10/minute")
def register_competition(slug: str, request: Request, payload: CompetitionRegisterIn = None):
    user = require_user(request)
    with db() as conn:
        comp = conn.execute(
            "SELECT * FROM competitions WHERE slug = %s",
            (slug.strip().lower(),),
        ).fetchone()
        if not comp:
            raise HTTPException(status_code=404, detail="Kompetisi tidak ditemukan")
        if not is_competition_open(comp):
            raise HTTPException(status_code=400, detail=f"Pendaftaran untuk kompetisi {comp['name']} sedang ditutup")

        dup = conn.execute(
            "SELECT team_id FROM team_members WHERE user_id = %s AND competition_id = %s",
            (user["id"], comp["id"]),
        ).fetchone()
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"Anda sudah terdaftar dalam kompetisi {comp['name']}.",
            )

        team_name = payload.team_name if payload else None
        with conn.transaction():
            team_row = bind_user_to_competition(conn, user["id"], comp, team_name)

    return {
        "ok": True,
        "message": f"Berhasil mendaftar kompetisi {comp['name']}.",
        "team": team_row,
        "competition": {
            "slug": comp["slug"],
            "name": comp["name"],
            "participation_type": comp["participation_type"],
        },
    }


# ------------------------------------------------ admin competition models & endpoints


class AdminCompetitionCreateIn(BaseModel):
    slug: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=100)
    audience: str = Field(default="SEMUA JENJANG", max_length=50)
    description: str | None = Field(default=None, max_length=500)
    participation_type: str = Field(default="TEAM")
    min_team_members: int = Field(default=1, ge=1)
    max_team_members: int = Field(default=1, ge=1)
    status: str = Field(default="OPEN")
    registration_start: str | None = None
    registration_end: str | None = None

    @field_validator("slug")
    @classmethod
    def valid_slug(cls, v: str) -> str:
        s = v.strip().lower()
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", s):
            raise ValueError("Slug harus berupa huruf kecil, angka, dan tanda hubung (-)")
        return s

    @field_validator("participation_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in ("INDIVIDUAL", "TEAM"):
            raise ValueError("Tipe partisipasi harus INDIVIDUAL atau TEAM")
        return v

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in ("OPEN", "UPCOMING", "CLOSED"):
            raise ValueError("Status harus OPEN, UPCOMING, atau CLOSED")
        return v


class AdminCompetitionUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    audience: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    participation_type: str | None = None
    min_team_members: int | None = Field(default=None, ge=1)
    max_team_members: int | None = Field(default=None, ge=1)
    status: str | None = None
    registration_start: str | None = None
    registration_end: str | None = None

    @field_validator("participation_type")
    @classmethod
    def valid_type(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip().upper()
            if v not in ("INDIVIDUAL", "TEAM"):
                raise ValueError("Tipe partisipasi harus INDIVIDUAL atau TEAM")
        return v

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip().upper()
            if v not in ("OPEN", "UPCOMING", "CLOSED"):
                raise ValueError("Status harus OPEN, UPCOMING, atau CLOSED")
        return v


@app.get("/api/admin/competitions")
def admin_list_competitions(request: Request):
    require_admin(request)
    with db() as conn:
        rows = conn.execute(
            """
            SELECT c.*,
                   COUNT(DISTINCT t.id) AS teams_count,
                   COUNT(DISTINCT tm.user_id) AS participants_count
            FROM competitions c
            LEFT JOIN teams t ON t.competition_id = c.id
            LEFT JOIN team_members tm ON tm.competition_id = c.id
            GROUP BY c.id
            ORDER BY c.id ASC
            """
        ).fetchall()
    competitions = []
    for r in rows:
        comp = format_competition(r)
        comp["teams_count"] = r["teams_count"]
        comp["participants_count"] = r["participants_count"]
        comp["created_at"] = r["created_at"].isoformat() if r.get("created_at") else None
        competitions.append(comp)
    return {"competitions": competitions}


@app.post("/api/admin/competitions", status_code=201)
def admin_create_competition(payload: AdminCompetitionCreateIn, request: Request):
    require_admin(request)
    ptype = payload.participation_type.upper()
    if ptype == "INDIVIDUAL":
        min_m = 1
        max_m = 1
    else:
        if payload.min_team_members > payload.max_team_members:
            raise HTTPException(
                status_code=422,
                detail="Jumlah minimum anggota tim tidak boleh lebih besar dari batas maksimum.",
            )
        min_m = payload.min_team_members
        max_m = payload.max_team_members

    reg_start = parse_iso_datetime(payload.registration_start)
    reg_end = parse_iso_datetime(payload.registration_end)
    if reg_start and reg_end and reg_end < reg_start:
        raise HTTPException(status_code=422, detail="Tanggal selesai registrasi tidak boleh mendahului tanggal mulai.")

    try:
        with db() as conn:
            row = conn.execute(
                """
                INSERT INTO competitions (
                    slug, name, audience, description, participation_type,
                    min_team_members, max_team_members, status,
                    registration_start, registration_end
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    payload.slug,
                    payload.name.strip(),
                    payload.audience.strip(),
                    payload.description.strip() if payload.description else None,
                    ptype,
                    min_m,
                    max_m,
                    payload.status.upper(),
                    reg_start,
                    reg_end,
                ),
            ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail=f"Kompetisi dengan slug '{payload.slug}' sudah ada.")

    comp = format_competition(row)
    comp["teams_count"] = 0
    comp["participants_count"] = 0
    return {"ok": True, "competition": comp}


def _fetch_competition_by_id_or_slug(conn: psycopg.Connection, comp_id_or_slug: str) -> dict | None:
    if comp_id_or_slug.isdigit():
        return conn.execute("SELECT * FROM competitions WHERE id = %s", (int(comp_id_or_slug),)).fetchone()
    return conn.execute("SELECT * FROM competitions WHERE slug = %s", (comp_id_or_slug.strip().lower(),)).fetchone()


@app.get("/api/admin/competitions/{comp_id_or_slug}")
def admin_get_competition(comp_id_or_slug: str, request: Request):
    require_admin(request)
    with db() as conn:
        row = _fetch_competition_by_id_or_slug(conn, comp_id_or_slug)
        if not row:
            raise HTTPException(status_code=404, detail="Kompetisi tidak ditemukan")
        stats = conn.execute(
            """
            SELECT COUNT(DISTINCT t.id) AS teams_count,
                   COUNT(DISTINCT tm.user_id) AS participants_count
            FROM competitions c
            LEFT JOIN teams t ON t.competition_id = c.id
            LEFT JOIN team_members tm ON tm.competition_id = c.id
            WHERE c.id = %s
            GROUP BY c.id
            """,
            (row["id"],),
        ).fetchone() or {"teams_count": 0, "participants_count": 0}

    comp = format_competition(row)
    comp["teams_count"] = stats["teams_count"]
    comp["participants_count"] = stats["participants_count"]
    comp["created_at"] = row["created_at"].isoformat() if row.get("created_at") else None
    return {"competition": comp}


@app.patch("/api/admin/competitions/{comp_id_or_slug}")
def admin_update_competition(comp_id_or_slug: str, payload: AdminCompetitionUpdateIn, request: Request):
    require_admin(request)
    with db() as conn:
        current = _fetch_competition_by_id_or_slug(conn, comp_id_or_slug)
        if not current:
            raise HTTPException(status_code=404, detail="Kompetisi tidak ditemukan")

        p_type = payload.participation_type.upper() if payload.participation_type else current["participation_type"]
        if p_type == "INDIVIDUAL":
            min_m = 1
            max_m = 1
        else:
            min_m = payload.min_team_members if payload.min_team_members is not None else current["min_team_members"]
            max_m = payload.max_team_members if payload.max_team_members is not None else current["max_team_members"]
            if min_m > max_m:
                raise HTTPException(
                    status_code=422,
                    detail="Jumlah minimum anggota tim tidak boleh lebih besar dari batas maksimum.",
                )

        reg_start = (
            parse_iso_datetime(payload.registration_start)
            if payload.registration_start is not None
            else current["registration_start"]
        )
        reg_end = (
            parse_iso_datetime(payload.registration_end)
            if payload.registration_end is not None
            else current["registration_end"]
        )
        if reg_start and reg_end and reg_end < reg_start:
            raise HTTPException(status_code=422, detail="Tanggal selesai registrasi tidak boleh mendahului tanggal mulai.")

        name = payload.name.strip() if payload.name is not None else current["name"]
        audience = payload.audience.strip() if payload.audience is not None else current["audience"]
        desc = payload.description.strip() if payload.description is not None else current["description"]
        status = payload.status.upper() if payload.status is not None else current["status"]

        updated = conn.execute(
            """
            UPDATE competitions
            SET name = %s,
                audience = %s,
                description = %s,
                participation_type = %s,
                min_team_members = %s,
                max_team_members = %s,
                status = %s,
                registration_start = %s,
                registration_end = %s
            WHERE id = %s
            RETURNING *
            """,
            (
                name,
                audience,
                desc,
                p_type,
                min_m,
                max_m,
                status,
                reg_start,
                reg_end,
                current["id"],
            ),
        ).fetchone()

        stats = conn.execute(
            """
            SELECT COUNT(DISTINCT t.id) AS teams_count,
                   COUNT(DISTINCT tm.user_id) AS participants_count
            FROM competitions c
            LEFT JOIN teams t ON t.competition_id = c.id
            LEFT JOIN team_members tm ON tm.competition_id = c.id
            WHERE c.id = %s
            GROUP BY c.id
            """,
            (current["id"],),
        ).fetchone() or {"teams_count": 0, "participants_count": 0}

    comp = format_competition(updated)
    comp["teams_count"] = stats["teams_count"]
    comp["participants_count"] = stats["participants_count"]
    comp["created_at"] = updated["created_at"].isoformat() if updated.get("created_at") else None
    return {"ok": True, "competition": comp}



@app.delete("/api/admin/competitions/{comp_id_or_slug}")
def admin_delete_competition(comp_id_or_slug: str, request: Request):
    require_admin(request)
    with db() as conn:
        current = _fetch_competition_by_id_or_slug(conn, comp_id_or_slug)
        if not current:
            raise HTTPException(status_code=404, detail="Kompetisi tidak ditemukan")

        stats = conn.execute(
            """
            SELECT COUNT(DISTINCT t.id) AS teams_count,
                   COUNT(DISTINCT tm.user_id) AS participants_count
            FROM competitions c
            LEFT JOIN teams t ON t.competition_id = c.id
            LEFT JOIN team_members tm ON tm.competition_id = c.id
            WHERE c.id = %s
            GROUP BY c.id
            """,
            (current["id"],),
        ).fetchone() or {"teams_count": 0, "participants_count": 0}
        teams_count = int(stats.get("teams_count") or 0)
        participants_count = int(stats.get("participants_count") or 0)
        if teams_count > 0 or participants_count > 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Kompetisi '{current['name']}' tidak dapat dihapus karena masih memiliki "
                    f"{teams_count} tim dan {participants_count} peserta terdaftar. "
                    "Ubah status kompetisi menjadi CLOSED atau arsipkan data terkait sebelum menghapus."
                ),
            )

        conn.execute("DELETE FROM competitions WHERE id = %s", (current["id"],))

    return {
        "ok": True,
        "message": f"Kompetisi '{current['name']}' berhasil dihapus.",
        "competition": {"id": current["id"], "slug": current["slug"], "name": current["name"]},
    }


# ------------------------------------------------- admin user management

USER_ROLES = {"user", "admin", "jury", "committee"}


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


class AdminUserCreateIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(max_length=PW_MAX_LEN)
    role: str = Field(default="user", max_length=30)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        failures = validate_password_policy(v)
        if failures:
            raise ValueError("; ".join(failures))
        return v

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        role = (v or "user").strip().lower()
        if role not in USER_ROLES:
            raise ValueError(f"Role harus salah satu dari: {', '.join(sorted(USER_ROLES))}")
        return role


class AdminUserUpdateIn(BaseModel):
    role: str | None = None
    password: str | None = Field(default=None, max_length=PW_MAX_LEN)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str | None) -> str | None:
        if v is None:
            return v
        failures = validate_password_policy(v)
        if failures:
            raise ValueError("; ".join(failures))
        return v

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str | None) -> str | None:
        if v is None:
            return v
        role = v.strip().lower()
        if role not in USER_ROLES:
            raise ValueError(f"Role harus salah satu dari: {', '.join(sorted(USER_ROLES))}")
        return role


@app.get("/api/admin/users")
def admin_list_users(request: Request, q: str | None = None, limit: int = 50, offset: int = 0):
    require_admin(request)
    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))
    search = (q or "").strip().lower()
    with db() as conn:
        if search:
            pattern = f"%{search}%"
            total = conn.execute(
                "SELECT COUNT(*) AS count FROM users WHERE LOWER(full_name) LIKE %s OR LOWER(email) LIKE %s",
                (pattern, pattern),
            ).fetchone()["count"]
            rows = conn.execute(
                """
                SELECT id, full_name, email, COALESCE(role, 'user') AS role, institution, phone, created_at
                FROM users
                WHERE LOWER(full_name) LIKE %s OR LOWER(email) LIKE %s
                ORDER BY id DESC
                LIMIT %s OFFSET %s
                """,
                (pattern, pattern, limit, offset),
            ).fetchall()
        else:
            total = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
            rows = conn.execute(
                """
                SELECT id, full_name, email, COALESCE(role, 'user') AS role, institution, phone, created_at
                FROM users
                ORDER BY id DESC
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            ).fetchall()
    return {"users": [format_user(r) for r in rows], "total": total, "limit": limit, "offset": offset, "q": search or None}


@app.get("/api/admin/users/{user_id}")
def admin_get_user(user_id: int, request: Request):
    require_admin(request)
    with db() as conn:
        row = conn.execute(
            """
            SELECT id, full_name, email, COALESCE(role, 'user') AS role, institution, phone, created_at
            FROM users WHERE id = %s
            """,
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    return {"user": format_user(row)}


@app.post("/api/admin/users", status_code=201)
def admin_create_user(payload: AdminUserCreateIn, request: Request):
    require_admin(request)
    email = payload.email.strip().lower()
    try:
        with db() as conn:
            row = conn.execute(
                """
                INSERT INTO users (full_name, email, password_hash, role)
                VALUES (%s, %s, %s, %s)
                RETURNING id, full_name, email, COALESCE(role, 'user') AS role, institution, phone, created_at
                """,
                (payload.full_name.strip(), email, hash_password(payload.password), payload.role),
            ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Email sudah terdaftar")
    return {"ok": True, "user": format_user(row)}


@app.patch("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, payload: AdminUserUpdateIn, request: Request):
    admin = require_admin(request)
    if payload.role is None and payload.password is None:
        raise HTTPException(status_code=422, detail="Tidak ada perubahan yang dikirim")
    with db() as conn:
        row = conn.execute(
            "SELECT id, full_name, email, COALESCE(role, 'user') AS role, institution, phone, created_at FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
        if payload.role is not None and payload.role != "admin" and admin["id"] == user_id and row.get("role") == "admin":
            raise HTTPException(status_code=400, detail="Admin tidak dapat menurunkan role akunnya sendiri")
        if payload.role is not None:
            row = conn.execute(
                "UPDATE users SET role = %s WHERE id = %s RETURNING id, full_name, email, COALESCE(role, 'user') AS role, institution, phone, created_at",
                (payload.role, user_id),
            ).fetchone()
        if payload.password is not None:
            conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(payload.password), user_id))
    return {"ok": True, "user": format_user(row), "password_reset": payload.password is not None}

# ------------------------------------------------ team models & endpoints


class TeamJoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=30)


class TeamAddMemberIn(BaseModel):
    email: EmailStr
    competition_slug: str | None = None


class TeamUpdateIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    competition_slug: str | None = None


@app.get("/api/team")
def team(request: Request, competition_slug: str | None = None):
    user = require_user(request)
    with db() as conn:
        if competition_slug:
            membership = conn.execute(
                """SELECT t.id, t.code, t.name AS team_name, COALESCE(c.name, t.track) AS track, t.payment_status,
                          tm.role, t.competition_id, c.slug AS competition_slug,
                          c.name AS competition_name, c.audience, c.participation_type,
                          c.min_team_members, c.max_team_members, c.status AS competition_status,
                          c.registration_start, c.registration_end
                   FROM team_members tm
                   JOIN teams t ON t.id = tm.team_id
                   LEFT JOIN competitions c ON c.id = t.competition_id
                   WHERE tm.user_id = %s AND c.slug = %s
                   ORDER BY t.created_at DESC LIMIT 1""",
                (user["id"], competition_slug.strip().lower()),
            ).fetchone()
        else:
            membership = conn.execute(
                """SELECT t.id, t.code, t.name AS team_name, COALESCE(c.name, t.track) AS track, t.payment_status,
                          tm.role, t.competition_id, c.slug AS competition_slug,
                          c.name AS competition_name, c.audience, c.participation_type,
                          c.min_team_members, c.max_team_members, c.status AS competition_status,
                          c.registration_start, c.registration_end
                   FROM team_members tm
                   JOIN teams t ON t.id = tm.team_id
                   LEFT JOIN competitions c ON c.id = t.competition_id
                   WHERE tm.user_id = %s
                   ORDER BY t.created_at DESC LIMIT 1""",
                (user["id"],),
            ).fetchone()

        if membership is None:
            return {"team": None, "message": "Kamu belum tergabung dalam tim."}

        comp_dict = {
            "status": membership.get("competition_status"),
            "registration_start": membership.get("registration_start"),
            "registration_end": membership.get("registration_end"),
        }
        is_open = is_competition_open(comp_dict)

        members = conn.execute(
            """SELECT u.id AS user_id, u.full_name, u.email, u.institution, tm.role
               FROM team_members tm JOIN users u ON u.id = tm.user_id
               WHERE tm.team_id = %s
               ORDER BY CASE WHEN tm.role = 'leader' THEN 1 ELSE 2 END, tm.user_id ASC""",
            (membership["id"],),
        ).fetchall()

    sanitized_members = []
    for m in members:
        mem_data = {
            "user_id": m["user_id"],
            "full_name": m["full_name"],
            "institution": m["institution"],
            "role": m["role"],
        }
        if membership["role"] == "leader" or m["user_id"] == user["id"]:
            mem_data["email"] = m["email"]
        sanitized_members.append(mem_data)

    team_data = {
        **membership,
        "is_open": is_open,
        "members": sanitized_members,
        "member_count": len(sanitized_members),
    }
    return {"team": team_data}


@app.post("/api/team/join")
def join_team_by_code(payload: TeamJoinIn, request: Request):
    user = require_user(request)
    code = payload.code.strip().upper()

    with db() as conn:
        with conn.transaction():
            team_row = conn.execute(
                """
                SELECT t.*, c.slug AS comp_slug, c.name AS comp_name, c.participation_type,
                       c.min_team_members, c.max_team_members, c.status AS comp_status,
                       c.registration_start, c.registration_end
                FROM teams t
                LEFT JOIN competitions c ON c.id = t.competition_id
                WHERE UPPER(t.code) = %s
                """,
                (code,),
            ).fetchone()
            if not team_row:
                raise HTTPException(status_code=404, detail="Tim dengan kode tersebut tidak ditemukan.")

            comp_id = team_row["competition_id"]
            if not comp_id:
                raise HTTPException(status_code=400, detail="Tim tidak terhubung dengan kompetisi yang valid.")

            comp_dict = {
                "status": team_row["comp_status"],
                "registration_start": team_row["registration_start"],
                "registration_end": team_row["registration_end"],
            }
            if not is_competition_open(comp_dict):
                raise HTTPException(status_code=400, detail=f"Pendaftaran untuk kompetisi {team_row['comp_name']} sedang ditutup.")

            if team_row["participation_type"] == "INDIVIDUAL" or team_row["max_team_members"] <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Kompetisi ini bersifat individu dan tidak dapat menerima anggota tim tambahan.",
                )

            # Cek apakah user sudah berada di tim target ini
            target_mem = conn.execute(
                "SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s",
                (team_row["id"], user["id"]),
            ).fetchone()
            if target_mem:
                raise HTTPException(status_code=400, detail="Anda sudah menjadi anggota tim ini.")

            # Cek apakah user sudah terdaftar di tim lain pada kompetisi yang sama
            existing = conn.execute(
                """
                SELECT t.id, t.leader_user_id, t.payment_status,
                       (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
                FROM team_members tm
                JOIN teams t ON t.id = tm.team_id
                WHERE tm.user_id = %s AND tm.competition_id = %s
                """,
                (user["id"], comp_id),
            ).fetchone()

            if existing:
                # Bila user adalah satu-satunya anggota di tim lama (solo hasil auto-register) dan belum bayar
                if existing["member_count"] == 1 and existing["leader_user_id"] == user["id"] and existing["payment_status"] == "PENDING":
                    conn.execute("DELETE FROM teams WHERE id = %s", (existing["id"],))
                else:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Anda sudah terdaftar dalam tim lain pada kompetisi {team_row['comp_name']}. Tinggalkan tim tersebut terlebih dahulu jika ingin bergabung dengan tim ini.",
                    )

            # Cek kuota tim
            curr_count = conn.execute(
                "SELECT COUNT(*) AS count FROM team_members WHERE team_id = %s",
                (team_row["id"],),
            ).fetchone()["count"]

            if curr_count >= team_row["max_team_members"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Kuota tim sudah penuh (maksimal {team_row['max_team_members']} anggota).",
                )

            conn.execute(
                """
                INSERT INTO team_members (team_id, user_id, role, competition_id)
                VALUES (%s, %s, 'member', %s)
                """,
                (team_row["id"], user["id"], comp_id),
            )

    return {
        "ok": True,
        "message": f"Berhasil bergabung dengan tim {team_row.get('name') or team_row['code']} ({team_row['comp_name']}).",
        "team_id": team_row["id"],
    }


@app.post("/api/team/members", status_code=201)
def add_team_member(payload: TeamAddMemberIn, request: Request):
    user = require_user(request)
    target_email = payload.email.strip().lower()

    with db() as conn:
        with conn.transaction():
            if payload.competition_slug:
                team_row = conn.execute(
                    """
                    SELECT t.*, tm.role AS caller_role, c.slug AS comp_slug, c.name AS comp_name,
                           c.participation_type, c.min_team_members, c.max_team_members,
                           c.status AS comp_status, c.registration_start, c.registration_end
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    LEFT JOIN competitions c ON c.id = t.competition_id
                    WHERE tm.user_id = %s AND c.slug = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"], payload.competition_slug.strip().lower()),
                ).fetchone()
            else:
                team_row = conn.execute(
                    """
                    SELECT t.*, tm.role AS caller_role, c.slug AS comp_slug, c.name AS comp_name,
                           c.participation_type, c.min_team_members, c.max_team_members,
                           c.status AS comp_status, c.registration_start, c.registration_end
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    LEFT JOIN competitions c ON c.id = t.competition_id
                    WHERE tm.user_id = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"],),
                ).fetchone()

            if not team_row:
                raise HTTPException(status_code=404, detail="Anda belum memiliki tim.")

            if team_row["caller_role"] != "leader":
                raise HTTPException(status_code=403, detail="Hanya ketua tim yang dapat menambahkan anggota.")

            comp_id = team_row["competition_id"]
            comp_dict = {
                "status": team_row["comp_status"],
                "registration_start": team_row["registration_start"],
                "registration_end": team_row["registration_end"],
            }
            if not is_competition_open(comp_dict):
                raise HTTPException(status_code=400, detail=f"Pendaftaran untuk kompetisi {team_row['comp_name']} sedang ditutup.")

            if team_row["participation_type"] == "INDIVIDUAL" or team_row["max_team_members"] <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Kompetisi ini bersifat individu dan tidak dapat menerima anggota tim tambahan.",
                )

            curr_count = conn.execute(
                "SELECT COUNT(*) AS count FROM team_members WHERE team_id = %s",
                (team_row["id"],),
            ).fetchone()["count"]

            if curr_count >= team_row["max_team_members"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Kuota tim sudah penuh (maksimal {team_row['max_team_members']} anggota).",
                )

            target_user = conn.execute(
                "SELECT id, full_name, email FROM users WHERE LOWER(email) = %s",
                (target_email,),
            ).fetchone()
            if not target_user:
                raise HTTPException(
                    status_code=404,
                    detail="Pengguna dengan email tersebut belum terdaftar di platform Perkutut Cup.",
                )

            if target_user["id"] == user["id"]:
                raise HTTPException(status_code=400, detail="Anda adalah ketua tim ini.")

            in_same_team = conn.execute(
                "SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s",
                (team_row["id"], target_user["id"]),
            ).fetchone()
            if in_same_team:
                raise HTTPException(status_code=400, detail="Pengguna sudah menjadi anggota tim ini.")

            in_other_team = conn.execute(
                "SELECT 1 FROM team_members WHERE user_id = %s AND competition_id = %s",
                (target_user["id"], comp_id),
            ).fetchone()
            if in_other_team:
                raise HTTPException(
                    status_code=409,
                    detail=f"Pengguna ({target_user['full_name']}) sudah terdaftar dalam tim lain pada kompetisi {team_row['comp_name']}.",
                )

            conn.execute(
                """
                INSERT INTO team_members (team_id, user_id, role, competition_id)
                VALUES (%s, %s, 'member', %s)
                """,
                (team_row["id"], target_user["id"], comp_id),
            )

    return {
        "ok": True,
        "message": f"Berhasil menambahkan {target_user['full_name']} ke dalam tim.",
        "member": {
            "user_id": target_user["id"],
            "full_name": target_user["full_name"],
            "email": target_user["email"],
            "role": "member",
        },
    }


@app.delete("/api/team/members/{member_user_id}")
def remove_team_member(member_user_id: int, request: Request, competition_slug: str | None = None):
    user = require_user(request)

    with db() as conn:
        with conn.transaction():
            if competition_slug:
                team_row = conn.execute(
                    """
                    SELECT t.*, tm.role AS caller_role, c.slug AS comp_slug, c.name AS comp_name,
                           c.status AS comp_status, c.registration_start, c.registration_end
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    LEFT JOIN competitions c ON c.id = t.competition_id
                    WHERE tm.user_id = %s AND c.slug = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"], competition_slug.strip().lower()),
                ).fetchone()
            else:
                team_row = conn.execute(
                    """
                    SELECT t.*, tm.role AS caller_role, c.slug AS comp_slug, c.name AS comp_name,
                           c.status AS comp_status, c.registration_start, c.registration_end
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    LEFT JOIN competitions c ON c.id = t.competition_id
                    WHERE tm.user_id = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"],),
                ).fetchone()

            if not team_row:
                raise HTTPException(status_code=404, detail="Tim tidak ditemukan.")

            comp_dict = {
                "status": team_row["comp_status"],
                "registration_start": team_row["registration_start"],
                "registration_end": team_row["registration_end"],
            }
            if not is_competition_open(comp_dict):
                raise HTTPException(
                    status_code=400,
                    detail="Pendaftaran kompetisi sudah ditutup. Susunan anggota tim tidak dapat diubah.",
                )

            # Jika caller bukan mengeluarkan diri sendiri, caller harus leader
            if user["id"] != member_user_id:
                if team_row["caller_role"] != "leader":
                    raise HTTPException(status_code=403, detail="Hanya ketua tim yang dapat mengeluarkan anggota.")

            # Ketua tim tidak bisa dikeluarkan via endpoint ini
            if member_user_id == team_row["leader_user_id"]:
                raise HTTPException(
                    status_code=400,
                    detail="Ketua tim tidak dapat dikeluarkan dari tim. Hubungi panitia jika ingin membubarkan tim.",
                )

            target_mem = conn.execute(
                "SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s",
                (team_row["id"], member_user_id),
            ).fetchone()
            if not target_mem:
                raise HTTPException(status_code=404, detail="Anggota tidak ditemukan di dalam tim ini.")

            conn.execute(
                "DELETE FROM team_members WHERE team_id = %s AND user_id = %s",
                (team_row["id"], member_user_id),
            )

    return {"ok": True, "message": "Anggota berhasil dikeluarkan dari tim."}


@app.post("/api/team/leave")
def leave_team(request: Request, competition_slug: str | None = None):
    user = require_user(request)

    with db() as conn:
        with conn.transaction():
            if competition_slug:
                team_row = conn.execute(
                    """
                    SELECT t.*, tm.role AS caller_role, c.slug AS comp_slug, c.name AS comp_name,
                           c.status AS comp_status, c.registration_start, c.registration_end
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    LEFT JOIN competitions c ON c.id = t.competition_id
                    WHERE tm.user_id = %s AND c.slug = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"], competition_slug.strip().lower()),
                ).fetchone()
            else:
                team_row = conn.execute(
                    """
                    SELECT t.*, tm.role AS caller_role, c.slug AS comp_slug, c.name AS comp_name,
                           c.status AS comp_status, c.registration_start, c.registration_end
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    LEFT JOIN competitions c ON c.id = t.competition_id
                    WHERE tm.user_id = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"],),
                ).fetchone()

            if not team_row:
                raise HTTPException(status_code=404, detail="Anda belum tergabung dalam tim.")

            comp_dict = {
                "status": team_row["comp_status"],
                "registration_start": team_row["registration_start"],
                "registration_end": team_row["registration_end"],
            }
            if not is_competition_open(comp_dict):
                raise HTTPException(
                    status_code=400,
                    detail="Pendaftaran kompetisi sudah ditutup. Susunan tim tidak dapat diubah.",
                )

            m_count = conn.execute(
                "SELECT COUNT(*) AS count FROM team_members WHERE team_id = %s",
                (team_row["id"],),
            ).fetchone()["count"]

            if team_row["caller_role"] == "leader":
                if m_count > 1:
                    raise HTTPException(
                        status_code=400,
                        detail="Ketua tim tidak dapat meninggalkan tim jika masih memiliki anggota. Keluarkan anggota terlebih dahulu.",
                    )
                # Solo leader: tim dibubarkan
                conn.execute("DELETE FROM teams WHERE id = %s", (team_row["id"],))
                return {"ok": True, "message": "Tim berhasil dibubarkan."}

            conn.execute(
                "DELETE FROM team_members WHERE team_id = %s AND user_id = %s",
                (team_row["id"], user["id"]),
            )

    return {"ok": True, "message": "Berhasil keluar dari tim."}


@app.patch("/api/team")
def update_team_name(payload: TeamUpdateIn, request: Request):
    user = require_user(request)
    name = payload.name.strip()

    with db() as conn:
        with conn.transaction():
            if payload.competition_slug:
                team_row = conn.execute(
                    """
                    SELECT t.*, tm.role AS caller_role
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    LEFT JOIN competitions c ON c.id = t.competition_id
                    WHERE tm.user_id = %s AND c.slug = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"], payload.competition_slug.strip().lower()),
                ).fetchone()
            else:
                team_row = conn.execute(
                    """
                    SELECT t.*, tm.role AS caller_role
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    WHERE tm.user_id = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"],),
                ).fetchone()

            if not team_row:
                raise HTTPException(status_code=404, detail="Tim tidak ditemukan.")

            if team_row["caller_role"] != "leader":
                raise HTTPException(status_code=403, detail="Hanya ketua tim yang dapat mengubah nama tim.")

            conn.execute(
                "UPDATE teams SET name = %s WHERE id = %s",
                (name, team_row["id"]),
            )

    return {"ok": True, "message": "Nama tim berhasil diperbarui.", "name": name}




# ------------------------------------------------------ app shell (SPA, wave 1)
APP_SHELL_PATH = Path(__file__).resolve().parent.parent / "app" / "index.html"


def serve_app_shell(request: Request, target_path: str | None = None):
    """Serve SPA shell with __APP_STATE__ injected (deep-link/refresh)."""
    if not APP_SHELL_PATH.is_file():
        raise HTTPException(status_code=404, detail="App shell not found.")
    u = current_user(request)
    if u is None:
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    path = target_path or str(request.url.path)
    state = {"path": path, "user": {"full_name": u.get("full_name"), "role": u.get("role")}}
    html = APP_SHELL_PATH.read_text(encoding="utf-8")
    inject = '<script>window.__APP_STATE__=' + json.dumps(state, ensure_ascii=False) + ';</script>'
    if "<!-- __APP_STATE__ injected by server -->" in html:
        html = html.replace("<!-- __APP_STATE__ injected by server -->", inject, 1)
    elif "</head>" in html:
        html = html.replace("</head>", inject + "\n</head>", 1)
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


ALLOWED_APP_PATHS = {
    "/dashboard/profile/",
    "/dashboard/submission/",
    "/dashboard/competitions/",
    "/dashboard/users/",
}


@app.get("/app")
@app.get("/app/")
def app_shell_root(request: Request):
    # If ?p= is provided (redirect flow), use it as the target path
    target = request.query_params.get("p") or "/dashboard/profile/"
    if not target.startswith("/"):
        target = "/" + target
    if not target.endswith("/"):
        target += "/"
    if target not in ALLOWED_APP_PATHS:
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path=target)


@app.get("/dashboard/profile")
@app.get("/dashboard/profile/")
def app_shell_profile(request: Request):
    u = current_user(request)
    if u is None:
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    # Serve shell directly with original path for deep-link/refresh (preserves guard).
    return serve_app_shell(request, target_path="/dashboard/profile/")


@app.get("/dashboard/submission")
@app.get("/dashboard/submission/")
def app_shell_submission(request: Request):
    u = current_user(request)
    if u is None:
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path="/dashboard/submission/")


@app.get("/dashboard/competitions")
@app.get("/dashboard/competitions/")
def app_shell_competitions(request: Request):
    u = current_user(request)
    if u is None or u.get("role") != "admin":
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path="/dashboard/competitions/")


@app.get("/dashboard/users")
@app.get("/dashboard/users/")
def app_shell_users(request: Request):
    u = current_user(request)
    if u is None or u.get("role") != "admin":
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path="/dashboard/users/")


# ------------------------------------------------- static frontend + guard

FRONTEND_DIR = Path(__file__).resolve().parent.parent
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@app.get("/{page_path:path}")
def serve_static(page_path: str, request: Request):
    """Sajikan frontend statis dari origin yang sama (cookie butuh same-origin)."""
    # Guard server-side untuk dashboard: tanpa session -> 404.html
    # NOTE: /dashboard, /dashboard/profile(/), /dashboard/submission(/),
    # /dashboard/competitions(/) and /dashboard/users(/) are served by the
    # explicit shell routes above. Anything else under dashboard/ has no
    # static page anymore (the legacy index.html files were removed once the
    # SPA shell took over), so just return 404.
    if page_path.startswith("dashboard") or page_path == "dashboard":
        u = current_user(request)
        if u is None:
            page_path = "404.html"
        elif page_path.startswith("dashboard/competitions") or page_path == "dashboard/competitions":
            if u.get("role") != "admin":
                page_path = "404.html"
        elif page_path in ("dashboard", "dashboard/"):
            page_path = "404.html"

    # Halaman auth: yang sudah punya session langsung dilempar ke dashboard
    if page_path in ("sign-in", "sign-in/", "join", "join/"):
        if current_user(request) is not None:
            return RedirectResponse("/dashboard/profile/", status_code=303)

    candidate = FRONTEND_DIR / page_path
    auth_or_dashboard = page_path.startswith(("dashboard", "sign-in", "join"))
    headers = {"Cache-Control": "no-store"} if auth_or_dashboard else None
    if page_path and candidate.is_file():
        return FileResponse(candidate, headers=headers)
    index = candidate / "index.html"
    if index.is_file():
        return FileResponse(index, headers=headers)
    return FileResponse(FRONTEND_DIR / "404.html")
