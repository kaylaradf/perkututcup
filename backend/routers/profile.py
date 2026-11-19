from datetime import datetime

import psycopg
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

from core import db, require_user

router = APIRouter()

PROFILE_FIELDS = ("full_name", "institution", "email", "phone", "birth_date", "instagram_handle")


@router.get("/api/me")
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


@router.patch("/api/me")
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
