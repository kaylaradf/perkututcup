"""Admin user management endpoints (moved verbatim from app.py)."""
import psycopg
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

from core import (
    PW_MAX_LEN,
    USER_ROLES,
    db,
    format_user,
    hash_password,
    require_admin,
    validate_password_policy,
)

router = APIRouter()


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


@router.get("/api/admin/users")
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


@router.get("/api/admin/users/{user_id}")
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


@router.post("/api/admin/users", status_code=201)
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


@router.patch("/api/admin/users/{user_id}")
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
