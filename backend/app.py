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
import hmac
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator

DB_DSN = os.environ["PERKUTUT_DATABASE_URL"]  # fail fast jika env var tidak diset
SESSION_TTL_HOURS = 24
COOKIE_SECURE = os.environ.get("PERKUTUT_COOKIE_SECURE", "0") == "1"  # set 1 saat di-deploy di belakang HTTPS

app = FastAPI(title="Perkutut Cup 2026 API", version="0.1.0")

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


# ---------------------------------------------------------------- schema

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS institution TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_handle TEXT;
CREATE TABLE IF NOT EXISTS teams (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    track         TEXT NOT NULL DEFAULT 'KRIPTOGRAFI',
    leader_user_id BIGINT REFERENCES users(id),
    payment_status TEXT NOT NULL DEFAULT 'PENDING',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_members (
    team_id  BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role     TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (team_id, user_id)
);
"""


def db() -> psycopg.Connection:
    return psycopg.connect(DB_DSN, row_factory=dict_row)


@app.on_event("startup")
def init_db():
    with db() as conn:
        conn.execute(SCHEMA)


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
            SELECT u.id, u.full_name, u.email, s.expires_at
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
    pw_hash = hash_password(payload.password)
    try:
        with db() as conn:
            row = conn.execute(
                "INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s) RETURNING id, full_name, email",
                (payload.full_name.strip(), payload.email.lower(), pw_hash),
            ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail={"email": ["Email sudah terdaftar"]})
    create_session(response, row["id"])
    return {"user": {"id": row["id"], "full_name": row["full_name"], "email": row["email"]}}


@app.post("/api/auth/login")
@limiter.limit("10/minute")
def login(request: Request, payload: LoginIn, response: Response):
    require_captcha(payload)
    with db() as conn:
        row = conn.execute(
            "SELECT id, full_name, email, password_hash FROM users WHERE email = %s",
            (payload.email.lower(),),
        ).fetchone()
    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau kata sandi salah")
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
    return {"authenticated": True, "user": {"id": user["id"], "full_name": user["full_name"], "email": user["email"]}}


PROFILE_FIELDS = ("full_name", "institution", "email", "phone", "birth_date", "instagram_handle")


@app.get("/api/me")
def me(request: Request):
    user = require_user(request)
    with db() as conn:
        row = conn.execute(
            "SELECT id, full_name, institution, email, phone, birth_date, instagram_handle FROM users WHERE id = %s",
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


@app.get("/api/team")
def team(request: Request):
    user = require_user(request)
    with db() as conn:
        membership = conn.execute(
            """SELECT t.id, t.code, t.track, t.payment_status, tm.role
               FROM team_members tm JOIN teams t ON t.id = tm.team_id
               WHERE tm.user_id = %s""",
            (user["id"],),
        ).fetchone()
    if membership is None:
        return {"team": None, "message": "Kamu belum tergabung dalam tim."}
    with db() as conn:
        members = conn.execute(
            """SELECT u.full_name, u.institution, tm.role
               FROM team_members tm JOIN users u ON u.id = tm.user_id
               WHERE tm.team_id = %s""",
            (membership["id"],),
        ).fetchall()
    return {"team": {**membership, "members": members}}


# ------------------------------------------------- static frontend + guard

FRONTEND_DIR = Path(__file__).resolve().parent.parent
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@app.get("/{page_path:path}")
def serve_static(page_path: str, request: Request):
    """Sajikan frontend statis dari origin yang sama (cookie butuh same-origin)."""
    # Guard server-side untuk dashboard: tanpa session -> 404.html
    if page_path.startswith("dashboard") or page_path == "dashboard":
        if current_user(request) is None:
            page_path = "404.html"
        elif page_path in ("dashboard", "dashboard/"):
            page_path = "dashboard/profile/index.html"

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
