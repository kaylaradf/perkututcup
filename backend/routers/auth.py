import psycopg
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field, field_validator

from core import (
    MAX_FAILED_LOGINS,
    PW_MAX_LEN,
    _hash_token,
    bind_user_to_competition,
    captcha_create,
    create_session,
    current_user,
    db,
    hash_password,
    is_competition_open,
    limiter,
    require_captcha,
    validate_password_policy,
    verify_password,
)

router = APIRouter()


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


# ------------------------------------------------------------- endpoints


@router.get("/api/auth/captcha")
@limiter.limit("10/minute")
def captcha(request: Request):
    """Soal perkalian acak untuk bot prevention (stateless, HMAC-signed)."""
    return captcha_create()


@router.post("/api/auth/register", status_code=201)
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


@router.post("/api/auth/login")
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


@router.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("perkutut_session")
    if token:
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE id = %s", (_hash_token(token),))
    response.delete_cookie("perkutut_session", path="/")
    return {"ok": True}


@router.post("/api/auth/forgot-password")
def forgot_password():
    """Kontrak §5.1 — alur pemulihan: lapor admin, tidak ada reset mandiri."""
    return {"message": "Lupa kata sandi? Silakan lapor admin untuk reset."}


@router.get("/api/auth/session")
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
