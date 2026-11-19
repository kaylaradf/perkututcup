import os
import secrets
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator

from core import (
    ALLOWED_DOC_EXTS,
    MAX_DOC_SIZE,
    UPLOAD_DIR,
    assign_team_to_admin,
    check_and_update_team_verification,
    db,
    require_admin,
    require_user,
)

router = APIRouter()


# ------------------------------------------------ documents API


@router.get("/api/documents")
def list_team_documents(request: Request, competition_slug: str | None = None):
    """Lists verification documents for the caller's active team."""
    user = require_user(request)
    with db() as conn:
        if competition_slug:
            team_row = conn.execute(
                """
                SELECT t.id, t.verification_status, tm.role AS caller_role
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
                SELECT t.id, t.verification_status, tm.role AS caller_role
                FROM team_members tm
                JOIN teams t ON t.id = tm.team_id
                WHERE tm.user_id = %s
                ORDER BY t.created_at DESC LIMIT 1
                """,
                (user["id"],),
            ).fetchone()

        if not team_row:
            return {"team_id": None, "verification_status": "UNVERIFIED", "documents": []}

        team_id = team_row["id"]
        docs = conn.execute(
            """
            SELECT d.id, d.team_id, d.user_id, d.document_type, d.original_name, d.mime_type,
                   d.file_size, d.status, d.feedback, d.uploaded_at, d.verified_at,
                   u.full_name AS member_name
            FROM documents d
            JOIN users u ON u.id = d.user_id
            WHERE d.team_id = %s
            ORDER BY d.uploaded_at ASC
            """,
            (team_id,),
        ).fetchall()

        members = conn.execute(
            """
            SELECT u.id AS user_id, u.full_name, tm.role
            FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = %s
            """,
            (team_id,),
        ).fetchall()

    return {
        "team_id": team_id,
        "verification_status": team_row["verification_status"],
        "caller_role": team_row["caller_role"],
        "documents": [
            {
                "id": d["id"],
                "team_id": d["team_id"],
                "user_id": d["user_id"],
                "member_name": d["member_name"],
                "document_type": d["document_type"],
                "original_name": d["original_name"],
                "file_size": d["file_size"],
                "status": d["status"],
                "feedback": d["feedback"],
                "uploaded_at": d["uploaded_at"].isoformat() if d.get("uploaded_at") else None,
                "verified_at": d["verified_at"].isoformat() if d.get("verified_at") else None,
                "download_url": f"/api/documents/{d['id']}/file",
            }
            for d in docs
        ],
        "members": members,
    }


@router.post("/api/documents/upload")
async def upload_document(
    request: Request,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    competition_slug: str | None = Form(None),
):
    """Uploads or resubmits a verification document (KTM, pasfoto, twibbon per user, or payment_proof per team)."""
    user = require_user(request)
    doc_type = document_type.strip().lower()
    if doc_type not in ("ktm", "pasfoto", "twibbon", "payment_proof"):
        raise HTTPException(status_code=400, detail="Jenis dokumen tidak valid.")

    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_DOC_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Format file '{ext}' tidak didukung. Format yang diizinkan: {', '.join(sorted(ALLOWED_DOC_EXTS))}",
        )

    content = await file.read()
    if len(content) > MAX_DOC_SIZE:
        raise HTTPException(status_code=400, detail="Ukuran file melebihi batas maksimal 10MB.")

    with db() as conn:
        with conn.transaction():
            if competition_slug:
                team_row = conn.execute(
                    """
                    SELECT t.id, t.verification_status, tm.role AS caller_role
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
                    SELECT t.id, t.verification_status, tm.role AS caller_role
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    WHERE tm.user_id = %s
                    ORDER BY t.created_at DESC LIMIT 1
                    """,
                    (user["id"],),
                ).fetchone()

            if not team_row:
                raise HTTPException(status_code=404, detail="Anda belum tergabung dalam tim.")

            team_id = team_row["id"]

            if doc_type == "payment_proof" and team_row["caller_role"] != "leader":
                raise HTTPException(status_code=403, detail="Hanya ketua tim yang berhak mengunggah bukti pembayaran.")

            # Save file to disk safely
            safe_name = f"{team_id}_{user['id']}_{doc_type}_{secrets.token_hex(4)}{ext}"
            doc_folder = UPLOAD_DIR / "documents" / str(team_id)
            doc_folder.mkdir(parents=True, exist_ok=True)
            saved_path = doc_folder / safe_name
            saved_path.write_bytes(content)

            # Clean up old file if replacing
            old_doc = conn.execute(
                "SELECT file_path FROM documents WHERE team_id = %s AND user_id = %s AND document_type = %s",
                (team_id, user["id"], doc_type),
            ).fetchone()
            if old_doc and old_doc.get("file_path"):
                try:
                    old_path = Path(old_doc["file_path"])
                    if old_path.is_file() and old_path != saved_path:
                        old_path.unlink()
                except Exception:
                    pass

            doc_row = conn.execute(
                """
                INSERT INTO documents (team_id, user_id, document_type, file_path, original_name, mime_type, file_size, status, feedback, uploaded_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'PENDING', NULL, now())
                ON CONFLICT (team_id, user_id, document_type)
                DO UPDATE SET
                    file_path = EXCLUDED.file_path,
                    original_name = EXCLUDED.original_name,
                    mime_type = EXCLUDED.mime_type,
                    file_size = EXCLUDED.file_size,
                    status = 'PENDING',
                    feedback = NULL,
                    uploaded_at = now()
                RETURNING id, team_id, user_id, document_type, original_name, file_size, status, feedback, uploaded_at
                """,
                (
                    team_id,
                    user["id"],
                    doc_type,
                    str(saved_path),
                    filename,
                    file.content_type or "application/octet-stream",
                    len(content),
                ),
            ).fetchone()

            # Trigger auto-assign to an admin if not assigned yet
            assign_team_to_admin(conn, team_id)

            # Re-evaluate team verification status
            team_v_status = check_and_update_team_verification(conn, team_id)

    return {
        "ok": True,
        "message": "Dokumen berhasil diunggah dan sedang menunggu verifikasi admin.",
        "document": {
            "id": doc_row["id"],
            "team_id": doc_row["team_id"],
            "user_id": doc_row["user_id"],
            "document_type": doc_row["document_type"],
            "original_name": doc_row["original_name"],
            "file_size": doc_row["file_size"],
            "status": doc_row["status"],
            "feedback": doc_row["feedback"],
            "uploaded_at": doc_row["uploaded_at"].isoformat() if doc_row.get("uploaded_at") else None,
            "download_url": f"/api/documents/{doc_row['id']}/file",
        },
        "verification_status": team_v_status,
    }


@router.get("/api/documents/{document_id}/file")
def get_document_file(document_id: int, request: Request):
    """Streams a document file for authorized viewers (owner, teammate, admin, jury)."""
    user = require_user(request)
    with db() as conn:
        doc = conn.execute(
            """
            SELECT d.*, tm.user_id AS is_teammate
            FROM documents d
            LEFT JOIN team_members tm ON tm.team_id = d.team_id AND tm.user_id = %s
            WHERE d.id = %s
            """,
            (user["id"], document_id),
        ).fetchone()

    if not doc:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan.")

    is_admin = user.get("role") == "admin"
    is_jury = user.get("role") == "jury"
    is_owner_or_teammate = bool(doc.get("is_teammate"))

    if not (is_admin or is_jury or is_owner_or_teammate):
        raise HTTPException(status_code=403, detail="Anda tidak memiliki izin untuk melihat dokumen ini.")

    file_path = Path(doc["file_path"])
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File fisik dokumen tidak ditemukan pada server.")

    return FileResponse(
        file_path,
        media_type=doc.get("mime_type") or "application/octet-stream",
        filename=doc.get("original_name") or file_path.name,
    )


# ------------------------------------------------ admin verifications API


class AdminDocumentVerifyIn(BaseModel):
    status: str
    feedback: str | None = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in ("APPROVED", "REJECTED"):
            raise ValueError("Status verifikasi harus APPROVED atau REJECTED.")
        return v


@router.get("/api/admin/verifications")
def list_admin_verifications(
    request: Request,
    filter_type: str = "mine",
    status: str | None = None,
):
    """Lists teams and their verification documents assigned to this admin (or all teams)."""
    admin = require_admin(request)
    with db() as conn:
        query = """
            SELECT t.id AS team_id, t.code AS team_code, t.name AS team_name, t.track,
                   t.payment_status, t.verification_status, t.created_at,
                   c.name AS competition_name, c.slug AS competition_slug, c.participation_type,
                   tv.assigned_admin_id, u_admin.full_name AS assigned_admin_name
            FROM teams t
            LEFT JOIN competitions c ON c.id = t.competition_id
            LEFT JOIN team_verifications tv ON tv.team_id = t.id
            LEFT JOIN users u_admin ON u_admin.id = tv.assigned_admin_id
            WHERE 1=1
        """
        params = []
        if filter_type == "mine":
            query += " AND tv.assigned_admin_id = %s"
            params.append(admin["id"])

        if status:
            query += " AND t.verification_status = %s"
            params.append(status.strip().upper())

        query += " ORDER BY t.created_at DESC"
        teams = conn.execute(query, tuple(params)).fetchall()

        result = []
        for t in teams:
            tid = t["team_id"]
            docs = conn.execute(
                """
                SELECT d.id, d.document_type, d.original_name, d.file_size, d.status,
                       d.feedback, d.uploaded_at, d.verified_at, u.full_name AS member_name
                FROM documents d
                JOIN users u ON u.id = d.user_id
                WHERE d.team_id = %s
                ORDER BY d.uploaded_at ASC
                """,
                (tid,),
            ).fetchall()

            members = conn.execute(
                """
                SELECT u.id AS user_id, u.full_name, u.email, u.institution, tm.role
                FROM team_members tm
                JOIN users u ON u.id = tm.user_id
                WHERE tm.team_id = %s
                ORDER BY CASE WHEN tm.role = 'leader' THEN 1 ELSE 2 END, u.id ASC
                """,
                (tid,),
            ).fetchall()

            approved_cnt = sum(1 for d in docs if d["status"] == "APPROVED")
            pending_cnt = sum(1 for d in docs if d["status"] == "PENDING")
            rejected_cnt = sum(1 for d in docs if d["status"] == "REJECTED")
            req_cnt = (len(members) * 3) + 1  # 3 docs per member + 1 payment proof

            result.append(
                {
                    **t,
                    "created_at": t["created_at"].isoformat() if t.get("created_at") else None,
                    "assigned_to_me": t.get("assigned_admin_id") == admin["id"],
                    "members": members,
                    "documents": [
                        {
                            **d,
                            "uploaded_at": d["uploaded_at"].isoformat() if d.get("uploaded_at") else None,
                            "verified_at": d["verified_at"].isoformat() if d.get("verified_at") else None,
                            "download_url": f"/api/documents/{d['id']}/file",
                        }
                        for d in docs
                    ],
                    "stats": {
                        "approved": approved_cnt,
                        "pending": pending_cnt,
                        "rejected": rejected_cnt,
                        "required": req_cnt,
                        "is_complete": approved_cnt >= req_cnt and req_cnt > 0,
                    },
                }
            )

    return {"teams": result}


@router.patch("/api/admin/verifications/{document_id}")
def verify_document(document_id: int, payload: AdminDocumentVerifyIn, request: Request):
    """Admin approves or rejects a document with feedback. Auto-verifies team if all approved."""
    admin = require_admin(request)
    stat = payload.status.strip().upper()
    feedback = payload.feedback.strip() if payload.feedback else None

    if stat == "REJECTED" and not feedback:
        raise HTTPException(status_code=400, detail="Catatan feedback wajib diisi saat menolak dokumen.")

    with db() as conn:
        with conn.transaction():
            doc = conn.execute(
                "SELECT * FROM documents WHERE id = %s",
                (document_id,),
            ).fetchone()
            if not doc:
                raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan.")

            team_id = doc["team_id"]

            conn.execute(
                """
                UPDATE documents
                SET status = %s, feedback = %s, verified_by = %s, verified_at = now()
                WHERE id = %s
                """,
                (stat, feedback, admin["id"], document_id),
            )

            # Auto-check if all required documents for this team are approved
            team_v_status = check_and_update_team_verification(conn, team_id)

    return {
        "ok": True,
        "message": f"Dokumen berhasil ditandai sebagai {stat}.",
        "document_id": document_id,
        "status": stat,
        "feedback": feedback,
        "team_verification_status": team_v_status,
    }
