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

# keala.web.id/passpolicy: length>=8, upper, lower, digit, symbol
PASSWORD_RULES = {
    "length": (lambda p: len(p) >= 8, "Minimal 8 karakter"),
    "uppercase": (lambda p: re.search(r"[A-Z]", p) is not None, "Harus ada huruf besar"),
    "lowercase": (lambda p: re.search(r"[a-z]", p) is not None, "Harus ada huruf kecil"),
    "number": (lambda p: re.search(r"\d", p) is not None, "Harus ada angka"),
    "symbol": (lambda p: re.search(r"[^A-Za-z0-9\s]", p) is not None, "Harus ada simbol"),
}


def validate_password_policy(password: str) -> None:
    failures = [msg for check, msg in PASSWORD_RULES.values() if not check(password)]
    if failures:
        raise HTTPException(status_code=422, detail={"password": failures})


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
    password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)

    @field_validator("password")
    @classmethod
    def policy(cls, v):
        validate_password_policy(v)
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


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


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterIn, response: Response):
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
def login(payload: LoginIn, response: Response):
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
