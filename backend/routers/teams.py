from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from core import WHATSAPP_GROUP_URL, db, is_competition_open, require_user

router = APIRouter()

# ------------------------------------------------ team models & endpoints


class TeamJoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=30)


class TeamAddMemberIn(BaseModel):
    email: EmailStr
    competition_slug: str | None = None


class TeamUpdateIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    competition_slug: str | None = None


@router.get("/api/team")
def team(request: Request, competition_slug: str | None = None):
    user = require_user(request)
    with db() as conn:
        if competition_slug:
            membership = conn.execute(
                """SELECT t.id, t.code, t.name AS team_name, COALESCE(c.name, t.track) AS track, t.payment_status, t.verification_status,
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
                """SELECT t.id, t.code, t.name AS team_name, COALESCE(c.name, t.track) AS track, t.payment_status, t.verification_status,
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
            return {"team": None, "message": "Kamu belum tergabung dalam tim.", "whatsapp_url": WHATSAPP_GROUP_URL or None}

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
    return {"team": team_data, "whatsapp_url": WHATSAPP_GROUP_URL or None}


@router.post("/api/team/join")
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


@router.post("/api/team/members", status_code=201)
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


@router.delete("/api/team/members/{member_user_id}")
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


@router.post("/api/team/leave")
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


@router.patch("/api/team")
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
