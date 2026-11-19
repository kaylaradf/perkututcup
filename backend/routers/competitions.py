import re

import psycopg
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from core import (
    db,
    limiter,
    require_user,
    require_admin,
    is_competition_open,
    format_competition,
    bind_user_to_competition,
    parse_iso_datetime,
)

router = APIRouter()


@router.get("/api/competitions")
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


@router.get("/api/competitions/{slug}")
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


@router.post("/api/competitions/{slug}/register", status_code=201)
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
    problem_statement: str | None = Field(default=None, max_length=20000)
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
    problem_statement: str | None = Field(default=None, max_length=20000)
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


@router.get("/api/admin/competitions")
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


@router.post("/api/admin/competitions", status_code=201)
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
                    slug, name, audience, description, problem_statement, participation_type,
                    min_team_members, max_team_members, status,
                    registration_start, registration_end
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    payload.slug,
                    payload.name.strip(),
                    payload.audience.strip(),
                    payload.description.strip() if payload.description else None,
                    payload.problem_statement.strip() if payload.problem_statement else None,
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


@router.get("/api/admin/competitions/{comp_id_or_slug}")
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


@router.patch("/api/admin/competitions/{comp_id_or_slug}")
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
        problem = payload.problem_statement.strip() if payload.problem_statement is not None else current.get("problem_statement")
        status = payload.status.upper() if payload.status is not None else current["status"]

        updated = conn.execute(
            """
            UPDATE competitions
            SET name = %s,
                audience = %s,
                description = %s,
                problem_statement = %s,
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
                problem or None,
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



@router.delete("/api/admin/competitions/{comp_id_or_slug}")
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
