"""Submission endpoints: team submission status, karya upload, file download."""
import os
import secrets
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse

from core import (
    audit,
    db,
    require_user,
    UPLOAD_DIR,
    ALLOWED_SUB_EXTS,
    MAX_SUB_SIZE,
    assign_submission_to_jury,
)

router = APIRouter()


# ------------------------------------------------ submissions & jury evaluation API


@router.get("/api/submissions")
def get_team_submissions(request: Request, competition_slug: str | None = None):
    """Returns the caller's team submission status, problem files, and jury evaluation."""
    user = require_user(request)
    with db() as conn:
        if competition_slug:
            team_row = conn.execute(
                """
                SELECT t.id, t.verification_status, t.competition_id, c.name AS comp_name,
                       c.slug AS comp_slug, c.status AS comp_status, c.problem_statement, tm.role AS caller_role
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
                SELECT t.id, t.verification_status, t.competition_id, c.name AS comp_name,
                       c.slug AS comp_slug, c.status AS comp_status, c.problem_statement, tm.role AS caller_role
                FROM team_members tm
                JOIN teams t ON t.id = tm.team_id
                LEFT JOIN competitions c ON c.id = t.competition_id
                WHERE tm.user_id = %s
                ORDER BY t.created_at DESC LIMIT 1
                """,
                (user["id"],),
            ).fetchone()

        if not team_row:
            return {"team_id": None, "is_verified": False, "message": "Belum terdaftar dalam kompetisi."}

        is_verified = team_row["verification_status"] == "VERIFIED"
        team_id = team_row["id"]

        if not is_verified:
            return {
                "team_id": team_id,
                "is_verified": False,
                "verification_status": team_row["verification_status"],
                "message": "Pendaftaran tim Anda belum terverifikasi oleh panitia. Selesaikan verifikasi seluruh berkas identitas dan pembayaran di tab Profile & Team terlebih dahulu.",
                "submission": None,
            }

        # Submissions for this team
        sub = conn.execute(
            """
            SELECT s.id, s.team_id, s.competition_id, s.item_key, s.original_name,
                   s.file_size, s.notes, s.submitted_at, s.updated_at,
                   se.score, se.feedback AS evaluation_feedback, se.evaluated_at
            FROM submissions s
            LEFT JOIN submission_evaluations se ON se.team_id = s.team_id
            WHERE s.team_id = %s
            ORDER BY s.submitted_at DESC LIMIT 1
            """,
            (team_id,),
        ).fetchone()

    return {
        "team_id": team_id,
        "is_verified": True,
        "verification_status": "VERIFIED",
        "competition": {
            "name": team_row["comp_name"],
            "slug": team_row["comp_slug"],
            "problem_statement": team_row.get("problem_statement"),
        },
        "submission": (
            {
                "id": sub["id"],
                "original_name": sub["original_name"],
                "file_size": sub["file_size"],
                "notes": sub["notes"],
                "submitted_at": sub["submitted_at"].isoformat() if sub.get("submitted_at") else None,
                "download_url": f"/api/submissions/{sub['id']}/file",
                "evaluation": (
                    {
                        "score": float(sub["score"]) if sub.get("score") is not None else None,
                        "feedback": sub.get("evaluation_feedback"),
                        "evaluated_at": sub["evaluated_at"].isoformat() if sub.get("evaluated_at") else None,
                    }
                    if sub.get("score") is not None
                    else None
                ),
            }
            if sub
            else None
        ),
    }


@router.post("/api/submissions/upload")
async def upload_submission(
    request: Request,
    file: UploadFile = File(...),
    notes: str | None = Form(None),
    competition_slug: str | None = Form(None),
):
    """Uploads project submission karya for a verified team. Auto-assigns to 1 jury via round-robin."""
    user = require_user(request)
    filename = file.filename or "karya"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_SUB_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Format file karya '{ext}' tidak didukung. Format yang diizinkan: {', '.join(sorted(ALLOWED_SUB_EXTS))}",
        )

    content = await file.read()
    if len(content) > MAX_SUB_SIZE:
        raise HTTPException(status_code=400, detail="Ukuran file karya melebihi batas maksimal 50MB.")

    with db() as conn:
        with conn.transaction():
            if competition_slug:
                team_row = conn.execute(
                    """
                    SELECT t.id, t.verification_status, t.competition_id, c.name AS comp_name, tm.role AS caller_role
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
                    SELECT t.id, t.verification_status, t.competition_id, c.name AS comp_name, tm.role AS caller_role
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

            if team_row["verification_status"] != "VERIFIED":
                raise HTTPException(
                    status_code=403,
                    detail="Pendaftaran tim Anda belum terverifikasi oleh panitia. Mohon selesaikan verifikasi berkas terlebih dahulu.",
                )

            team_id = team_row["id"]
            comp_id = team_row["competition_id"]

            safe_name = f"{team_id}_sub_{secrets.token_hex(4)}{ext}"
            sub_folder = UPLOAD_DIR / "submissions" / str(team_id)
            sub_folder.mkdir(parents=True, exist_ok=True)
            saved_path = sub_folder / safe_name
            saved_path.write_bytes(content)

            sub_row = conn.execute(
                """
                INSERT INTO submissions (team_id, competition_id, item_key, file_path, original_name, mime_type, file_size, notes, submitted_by, submitted_at, updated_at)
                VALUES (%s, %s, 'main', %s, %s, %s, %s, %s, %s, now(), now())
                ON CONFLICT (team_id, item_key)
                DO UPDATE SET
                    file_path = EXCLUDED.file_path,
                    original_name = EXCLUDED.original_name,
                    mime_type = EXCLUDED.mime_type,
                    file_size = EXCLUDED.file_size,
                    notes = EXCLUDED.notes,
                    submitted_by = EXCLUDED.submitted_by,
                    updated_at = now()
                RETURNING id, team_id, original_name, file_size, notes, submitted_at
                """,
                (
                    team_id,
                    comp_id,
                    str(saved_path),
                    filename,
                    file.content_type or "application/octet-stream",
                    len(content),
                    notes.strip() if notes else None,
                    user["id"],
                ),
            ).fetchone()

            # Auto-assign to 1 jury using round-robin per competition
            assigned_jury_id = assign_submission_to_jury(conn, team_id, comp_id)

    audit(request, "submission", "upload_submission", target_type="submission", target_id=sub_row["id"], detail={"original_name": filename, "file_size": len(content), "team_id": team_id, "notes": notes.strip() if notes else None})
    return {
        "ok": True,
        "message": "Karya berhasil disubmit dan dialokasikan ke juri untuk penilaian.",
        "submission": {
            "id": sub_row["id"],
            "original_name": sub_row["original_name"],
            "file_size": sub_row["file_size"],
            "notes": sub_row["notes"],
            "submitted_at": sub_row["submitted_at"].isoformat() if sub_row.get("submitted_at") else None,
            "download_url": f"/api/submissions/{sub_row['id']}/file",
        },
    }


@router.get("/api/submissions/{submission_id}/file")
def get_submission_file(submission_id: int, request: Request):
    """Streams a submission file for team members, assigned jury, or admin."""
    user = require_user(request)
    with db() as conn:
        sub = conn.execute(
            """
            SELECT s.*, tm.user_id AS is_teammate, sa.jury_user_id
            FROM submissions s
            LEFT JOIN team_members tm ON tm.team_id = s.team_id AND tm.user_id = %s
            LEFT JOIN submission_assignments sa ON sa.team_id = s.team_id
            WHERE s.id = %s
            """,
            (user["id"], submission_id),
        ).fetchone()

    if not sub:
        raise HTTPException(status_code=404, detail="File karya tidak ditemukan.")

    is_admin = user.get("role") == "admin"
    is_assigned_jury = user.get("role") == "jury" and (sub.get("jury_user_id") == user["id"])
    is_teammate = bool(sub.get("is_teammate"))

    if not (is_admin or is_assigned_jury or is_teammate):
        raise HTTPException(status_code=403, detail="Akses ditolak: Anda tidak memiliki izin untuk mengunduh karya ini.")

    file_path = Path(sub["file_path"])
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File fisik karya tidak ditemukan pada server.")

    return FileResponse(
        file_path,
        media_type=sub.get("mime_type") or "application/octet-stream",
        filename=sub.get("original_name") or file_path.name,
    )
