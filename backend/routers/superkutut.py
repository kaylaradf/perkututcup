"""Superkutut: god-mode dashboard API.

Login terpisah (env credentials + captcha perkalian + TOTP), session cookie
tersendiri, live audit log (SSE), stats, export CSV. Semua endpoint di sini
require_superadmin kecuali auth. Aksi superadmin diaudit fail-closed.
"""
import hashlib
import hmac
import io
import json
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core import (
    SUPERADMIN_USERNAME,
    CAPTCHA_HMAC_KEY,
    SUPERADMIN_PASSWORD,
    SUPERADMIN_TOTP_SECRET,
    SUPER_COOKIE,
    SUPER_SESSION_TTL_HOURS,
    AUDIT_RETENTION_DAYS,
    format_log_line,
    _hash_token,
    audit,
    create_super_session,
    db,
    limiter,
    require_superadmin,
    verify_super_totp,
)

router = APIRouter(prefix="/api/superkutut")


class SuperLoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class SuperMfaIn(BaseModel):
    mfa_ticket: str = Field(min_length=1, max_length=200)
    totp: str = Field(min_length=6, max_length=8)


def _mfa_ticket_sig(payload: str) -> str:
    return hmac.new(CAPTCHA_HMAC_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def _issue_mfa_ticket(username: str) -> str:
    """Ticket stateless HMAC, berlaku 5 menit, hanya untuk langkah MFA."""
    expires = int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp())
    payload = f"mfa.{username}.{expires}"
    return f"{payload}.{_mfa_ticket_sig(payload)}"


def _verify_mfa_ticket(ticket: str, username: str) -> bool:
    try:
        kind, user, expires, sig = ticket.split(".")
        payload = f"{kind}.{user}.{expires}"
        if kind != "mfa" or user != username:
            return False
        if not hmac.compare_digest(sig, _mfa_ticket_sig(payload)):
            return False
        return int(expires) >= datetime.now(timezone.utc).timestamp()
    except (ValueError, AttributeError):
        return False


@router.post("/auth/login")
@limiter.limit("1/minute")
def super_login(request: Request, payload: SuperLoginIn):
    """Langkah 1: username + password (rate limit 1x/menit/IP). Sukses -> ticket MFA."""
    actor = {"id": None, "email": payload.username, "role": "superadmin"}
    ok_user = hmac.compare_digest(payload.username, SUPERADMIN_USERNAME)
    ok_pass = hmac.compare_digest(payload.password, SUPERADMIN_PASSWORD)
    if not (ok_user and ok_pass):
        audit(request, "superkutut", "login_failed", detail={"username": payload.username, "reason": "credentials"}, outcome="denied", actor=actor, fail_closed=True)
        raise HTTPException(status_code=401, detail="Username atau kata sandi salah")
    if not SUPERADMIN_TOTP_SECRET:
        audit(request, "superkutut", "login_failed", detail={"reason": "totp_not_configured"}, outcome="error", actor=actor, fail_closed=True)
        raise HTTPException(status_code=503, detail="TOTP belum dikonfigurasi di server.")
    audit(request, "superkutut", "credentials_ok", detail={"username": payload.username}, actor=actor, fail_closed=True)
    return {"mfa_required": True, "mfa_ticket": _issue_mfa_ticket(payload.username)}


@router.post("/auth/mfa")
@limiter.limit("5/minute")
def super_mfa(request: Request, payload: SuperMfaIn, response: Response):
    """Langkah 2: TOTP dengan ticket dari langkah 1. Sukses -> session super."""
    actor = {"id": None, "email": SUPERADMIN_USERNAME, "role": "superadmin"}
    if not _verify_mfa_ticket(payload.mfa_ticket, SUPERADMIN_USERNAME):
        audit(request, "superkutut", "login_failed", detail={"reason": "mfa_ticket"}, outcome="denied", actor=actor, fail_closed=True)
        raise HTTPException(status_code=401, detail="Sesi MFA kedaluwarsa. Ulangi login.")
    if not verify_super_totp(payload.totp):
        audit(request, "superkutut", "login_failed", detail={"username": SUPERADMIN_USERNAME, "reason": "totp"}, outcome="denied", actor=actor, fail_closed=True)
        raise HTTPException(status_code=401, detail="Kode TOTP salah atau kedaluwarsa")
    create_super_session(response)
    audit(request, "superkutut", "login_success", actor=actor, fail_closed=True)
    return {"ok": True, "user": {"username": SUPERADMIN_USERNAME, "role": "superadmin"}}


@router.post("/auth/logout")
def super_logout(request: Request, response: Response):
    user = require_superadmin(request)
    token = request.cookies.get(SUPER_COOKIE)
    if token:
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE id = %s AND is_super", (_hash_token(token),))
    response.delete_cookie(SUPER_COOKIE, path="/")
    audit(request, "superkutut", "logout", actor=user, fail_closed=True)
    return {"ok": True}


@router.get("/auth/session")
def super_session_info(request: Request):
    token = request.cookies.get(SUPER_COOKIE)
    if not token:
        return {"authenticated": False}
    with db() as conn:
        row = conn.execute(
            "SELECT expires_at FROM sessions WHERE id = %s AND is_super AND expires_at > now()",
            (_hash_token(token),),
        ).fetchone()
    if not row:
        return {"authenticated": False}
    return {"authenticated": True, "user": {"username": SUPERADMIN_USERNAME, "role": "superadmin"}}


LOG_COLS = "id, ts, actor_id, actor_email, actor_role, ip, user_agent, category, action, target_type, target_id, detail, outcome, method, path, status, duration_ms"


def _log_filters(request: Request):
    q = request.query_params
    where, params = [], []
    for col in ("category", "action", "outcome"):
        if q.get(col):
            where.append(f"{col} = %s")
            params.append(q[col])
    if q.get("actor_id"):
        where.append("actor_id = %s")
        params.append(int(q["actor_id"]))
    if q.get("before_id"):
        where.append("id < %s")
        params.append(int(q["before_id"]))
    if q.get("after_id"):
        where.append("id > %s")
        params.append(int(q["after_id"]))
    if q.get("include_http") != "1" and not q.get("category") and not q.get("action"):
        # Baris HTTP mentah middleware: duplikat event handler + noise lama.
        # Sembunyikan default; toggle HTTP rows / include_http=1 menampilkan.
        where.append("category != 'api'")
    if q.get("from"):
        where.append("ts >= %s")
        params.append(q["from"])
    if q.get("to"):
        where.append("ts <= %s")
        params.append(q["to"])
    if q.get("q"):
        where.append("(actor_email ILIKE %s OR action ILIKE %s OR target_id ILIKE %s OR detail::text ILIKE %s OR path ILIKE %s)")
        like = f"%{q['q']}%"
        params.extend([like] * 5)
    return (" WHERE " + " AND ".join(where)) if where else "", params


def _serialize(rows):
    out = []
    for r in rows:
        r = dict(r)
        r["ts"] = r["ts"].isoformat() if r.get("ts") else None
        out.append(r)
    return out


@router.get("/logs")
def super_logs(request: Request):
    require_superadmin(request)
    limit = min(int(request.query_params.get("limit", 100)), 200)
    clause, params = _log_filters(request)
    order = "ORDER BY id ASC" if request.query_params.get("after_id") else "ORDER BY id DESC"
    with db() as conn:
        rows = conn.execute(f"SELECT {LOG_COLS} FROM audit_logs{clause} {order} LIMIT %s", params + [limit]).fetchall()
    return {"logs": _serialize(rows)}


@router.get("/logs/stream")
def super_logs_stream(request: Request):
    """SSE live tail: poll id > last_id tiap 2 detik. EventSource reconnect
    otomatis mengirim Last-Event-ID sehingga tidak ada log terlewat."""
    require_superadmin(request)
    last_id = int(request.headers.get("last-event-id") or request.query_params.get("after_id") or 0)
    if last_id == 0:
        with db() as conn:
            row = conn.execute("SELECT COALESCE(MAX(id), 0) AS m FROM audit_logs").fetchone()
            last_id = row["m"]

    def gen():
        cursor = last_id
        idle = 0
        yield "retry: 3000\n\n"
        while True:
            with db() as conn:
                rows = conn.execute(
                    f"SELECT {LOG_COLS} FROM audit_logs WHERE id > %s ORDER BY id ASC LIMIT 100",
                    (cursor,),
                ).fetchall()
            if rows:
                idle = 0
                for r in _serialize(rows):
                    cursor = r["id"]
                    yield f"id: {r['id']}\nevent: log\ndata: {json.dumps(r, ensure_ascii=False)}\n\n"
            else:
                idle += 1
                if idle >= 8:  # heartbeat tiap ~16s agar proxy tidak memutus
                    idle = 0
                    yield ": keepalive\n\n"
            time.sleep(2)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@router.get("/logs/export")
def super_logs_export(request: Request):
    user = require_superadmin(request)
    clause, params = _log_filters(request)
    with db() as conn:
        rows = conn.execute(f"SELECT {LOG_COLS} FROM audit_logs{clause} ORDER BY id DESC LIMIT 10000", params).fetchall()
    audit(request, "superkutut", "export_logs", detail={"rows": len(rows)}, actor=user, fail_closed=True)
    lines = [format_log_line(r) for r in reversed(rows)]  # kronologis ASC
    return StreamingResponse(
        iter(["\n".join(lines) + "\n"]),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="superkutut-logs.log"'},
    )


@router.get("/stats")
def super_stats(request: Request):
    require_superadmin(request)
    with db() as conn:
        s = {}
        s["logins_24h"] = conn.execute("SELECT count(*) AS n FROM audit_logs WHERE action IN ('login_success') AND ts > now() - interval '24 hours'").fetchone()["n"]
        s["login_failures_24h"] = conn.execute("SELECT count(*) AS n FROM audit_logs WHERE action = 'login_failed' AND ts > now() - interval '24 hours'").fetchone()["n"]
        s["events_24h"] = conn.execute("SELECT count(*) AS n FROM audit_logs WHERE ts > now() - interval '24 hours'").fetchone()["n"]
        s["uploads_24h"] = conn.execute("SELECT count(*) AS n FROM audit_logs WHERE action IN ('upload_document','upload_submission') AND ts > now() - interval '24 hours'").fetchone()["n"]
        s["users_total"] = conn.execute("SELECT count(*) AS n FROM users").fetchone()["n"]
        s["teams_unverified"] = conn.execute("SELECT count(*) AS n FROM teams WHERE verification_status != 'VERIFIED'").fetchone()["n"]
        s["submissions_pending_jury"] = conn.execute(
            """
            SELECT count(*) AS n FROM submissions s
            LEFT JOIN submission_evaluations se ON se.team_id = s.team_id
            WHERE se.score IS NULL
            """
        ).fetchone()["n"]
        s["per_hour"] = [
            {"hour": r["h"].isoformat(), "n": r["n"]}
            for r in conn.execute(
                "SELECT date_trunc('hour', ts) AS h, count(*) AS n FROM audit_logs WHERE ts > now() - interval '24 hours' GROUP BY 1 ORDER BY 1"
            ).fetchall()
        ]
        s["retention_days"] = AUDIT_RETENTION_DAYS
    return s


@router.post("/logs/purge")
def super_logs_purge(request: Request):
    user = require_superadmin(request)
    with db() as conn:
        n = conn.execute("DELETE FROM audit_logs WHERE ts < now() - make_interval(days => %s)", (AUDIT_RETENTION_DAYS,)).rowcount
    audit(request, "superkutut", "purge_logs", detail={"deleted": n, "retention_days": AUDIT_RETENTION_DAYS}, actor=user, fail_closed=True)
    return {"ok": True, "deleted": n}
