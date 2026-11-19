"""Jury evaluation and admin jury-assignment endpoints."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from core import audit, db, require_jury, require_admin

router = APIRouter()


# ------------------------------------------------ jury evaluation endpoints


class JuryEvaluateIn(BaseModel):
    score: float = Field(ge=0.0, le=100.0)
    feedback: str | None = None


@router.get("/api/jury/submissions")
def list_jury_submissions(request: Request):
    """Lists submissions assigned to this jury (or all for admin)."""
    user = require_jury(request)
    is_admin = user.get("role") == "admin"

    with db() as conn:
        if is_admin:
            rows = conn.execute(
                """
                SELECT s.id AS submission_id, s.team_id, s.original_name, s.file_size, s.notes, s.submitted_at,
                       t.code AS team_code, t.name AS team_name, c.name AS comp_name, c.slug AS comp_slug,
                       sa.jury_user_id, u_jury.full_name AS assigned_jury_name,
                       se.score, se.feedback, se.evaluated_at
                FROM submissions s
                JOIN teams t ON t.id = s.team_id
                JOIN competitions c ON c.id = s.competition_id
                LEFT JOIN submission_assignments sa ON sa.team_id = s.team_id
                LEFT JOIN users u_jury ON u_jury.id = sa.jury_user_id
                LEFT JOIN submission_evaluations se ON se.team_id = s.team_id
                ORDER BY s.submitted_at DESC
                """
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT s.id AS submission_id, s.team_id, s.original_name, s.file_size, s.notes, s.submitted_at,
                       t.code AS team_code, t.name AS team_name, c.name AS comp_name, c.slug AS comp_slug,
                       sa.jury_user_id, u_jury.full_name AS assigned_jury_name,
                       se.score, se.feedback, se.evaluated_at
                FROM submissions s
                JOIN teams t ON t.id = s.team_id
                JOIN competitions c ON c.id = s.competition_id
                JOIN submission_assignments sa ON sa.team_id = s.team_id AND sa.jury_user_id = %s
                LEFT JOIN users u_jury ON u_jury.id = sa.jury_user_id
                LEFT JOIN submission_evaluations se ON se.team_id = s.team_id AND se.jury_user_id = %s
                ORDER BY s.submitted_at DESC
                """,
                (user["id"], user["id"]),
            ).fetchall()

    return {
        "submissions": [
            {
                "submission_id": r["submission_id"],
                "team_id": r["team_id"],
                "team_code": r["team_code"],
                "team_name": r["team_name"],
                "competition_name": r["comp_name"],
                "competition_slug": r["comp_slug"],
                "original_name": r["original_name"],
                "file_size": r["file_size"],
                "notes": r["notes"],
                "submitted_at": r["submitted_at"].isoformat() if r.get("submitted_at") else None,
                "download_url": f"/api/submissions/{r['submission_id']}/file",
                "assigned_jury_name": r.get("assigned_jury_name"),
                "evaluation": (
                    {
                        "score": float(r["score"]),
                        "feedback": r["feedback"],
                        "evaluated_at": r["evaluated_at"].isoformat() if r.get("evaluated_at") else None,
                    }
                    if r.get("score") is not None
                    else None
                ),
            }
            for r in rows
        ]
    }


@router.post("/api/jury/submissions/{team_id}/evaluate")
def evaluate_submission(team_id: int, payload: JuryEvaluateIn, request: Request):
    """Jury inputs score (0-100) and feedback for an assigned team's submission."""
    user = require_jury(request)
    is_admin = user.get("role") == "admin"

    with db() as conn:
        with conn.transaction():
            sub = conn.execute(
                """
                SELECT s.id, s.team_id, sa.jury_user_id
                FROM submissions s
                LEFT JOIN submission_assignments sa ON sa.team_id = s.team_id
                WHERE s.team_id = %s
                """,
                (team_id,),
            ).fetchone()
            if not sub:
                raise HTTPException(status_code=404, detail="Submisi tim tidak ditemukan.")

            if not is_admin and sub.get("jury_user_id") != user["id"]:
                raise HTTPException(status_code=403, detail="Akses ditolak: Anda bukan juri yang ditugaskan untuk karya ini.")

            eval_row = conn.execute(
                """
                INSERT INTO submission_evaluations (team_id, jury_user_id, score, feedback, evaluated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (team_id, jury_user_id)
                DO UPDATE SET
                    score = EXCLUDED.score,
                    feedback = EXCLUDED.feedback,
                    evaluated_at = now()
                RETURNING id, team_id, jury_user_id, score, feedback, evaluated_at
                """,
                (team_id, user["id"], payload.score, payload.feedback.strip() if payload.feedback else None),
            ).fetchone()

    audit(request, "jury", "evaluate_submission", target_type="team", target_id=team_id, detail={"score": payload.score, "feedback": payload.feedback.strip() if payload.feedback else None})
    return {
        "ok": True,
        "message": f"Penilaian berhasil disimpan (Skor: {float(eval_row['score'])}).",
        "evaluation": {
            "score": float(eval_row["score"]),
            "feedback": eval_row["feedback"],
            "evaluated_at": eval_row["evaluated_at"].isoformat() if eval_row.get("evaluated_at") else None,
        },
    }


# ------------------------------------------------ admin jury assignment API


class AdminJuryCompetitionsIn(BaseModel):
    competition_ids: list[int]


@router.get("/api/admin/juries")
def list_admin_juries(request: Request):
    """Lists all users with role='jury' and their assigned competitions."""
    require_admin(request)
    with db() as conn:
        juries = conn.execute(
            """
            SELECT id, full_name, email, role, institution
            FROM users
            WHERE role = 'jury'
            ORDER BY id ASC
            """
        ).fetchall()

        result = []
        for j in juries:
            assigned = conn.execute(
                """
                SELECT c.id, c.name, c.slug
                FROM jury_competitions jc
                JOIN competitions c ON c.id = jc.competition_id
                WHERE jc.jury_user_id = %s
                ORDER BY c.id ASC
                """,
                (j["id"],),
            ).fetchall()
            result.append(
                {
                    **j,
                    "competitions": assigned,
                }
            )

    return {"juries": result}


@router.post("/api/admin/juries/{jury_user_id}/competitions")
def set_jury_competitions(jury_user_id: int, payload: AdminJuryCompetitionsIn, request: Request):
    """Assigns or updates competitions for a jury member."""
    require_admin(request)
    with db() as conn:
        with conn.transaction():
            user = conn.execute("SELECT id, role FROM users WHERE id = %s", (jury_user_id,)).fetchone()
            if not user or user["role"] != "jury":
                raise HTTPException(status_code=400, detail="Pengguna bukan merupakan akun dengan peran juri.")

            conn.execute("DELETE FROM jury_competitions WHERE jury_user_id = %s", (jury_user_id,))
            for cid in payload.competition_ids:
                conn.execute(
                    "INSERT INTO jury_competitions (jury_user_id, competition_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (jury_user_id, cid),
                )

    audit(request, "jury", "assign_jury_competitions", target_type="user", target_id=jury_user_id, detail={"competition_ids": payload.competition_ids})
    return {"ok": True, "message": "Penugasan kompetisi juri berhasil diperbarui."}
