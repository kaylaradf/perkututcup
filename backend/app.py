"""
Perkutut Cup 2026 - backend entrypoint (FastAPI + PostgreSQL).

Struktur modular:
  core.py            — config, db, limiter, password/captcha/session, helper bersama
  routers/auth.py    — register/login/logout/session + CAPTCHA
  routers/profile.py — /api/me
  routers/competitions.py — katalog, pendaftaran, admin CRUD kompetisi (+soal)
  routers/teams.py   — tim: join/member/leave/rename
  routers/documents.py — upload dokumen peserta + verifikasi admin
  routers/submissions.py — submisi karya peserta
  routers/jury.py    — penilaian juri + penugasan admin
  routers/admin_users.py — manajemen pengguna admin
  routers/web.py     — SPA shell, guard role, static catch-all (HARUS terakhir)

Menjalankan: PYTHONPATH=backend uvicorn app:app (dari direktori backend).
"""
import os
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from core import db, limiter, hash_password
from routers import (
    auth,
    profile,
    competitions,
    teams,
    documents,
    submissions,
    jury,
    admin_users,
    superkutut,
    web,
)

app = FastAPI(title="Perkutut Cup 2026 API", version="0.1.0")


@app.get("/health", include_in_schema=False)
def health():
    """Lightweight process liveness check for staging deployments."""
    return {"status": "ok"}


# ------------------------------------------------------------------ rate limit
#
# Anti brute-force: batasi percobaan auth per IP.
#  - captcha & login: 10 permintaan / menit / IP
#  - register: 5 permintaan / menit / IP
# Backend in-memory (cukup untuk satu proses uvicorn); ganti redis:// bila
# nanti dijalankan multi-worker.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Terlalu banyak percobaan. Coba lagi sebentar lagi."},
        headers={"Retry-After": str(getattr(exc, "retry_after", 60))},
    )


# ------------------------------------------------------- audit: semua request API
# Middleware mencatat SETIAP request /api/* (penggunaan seluruh fitur) tanpa
# perlu menyentuh tiap router. Detail bernilai (before/after, file, skor, dsb.)
# dicatat terpisah oleh handler via core.audit().
import time as _time
from core import current_user, audit as _audit, SUPERADMIN_USERNAME

@app.middleware("http")
async def audit_api_requests(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/"):
        return await call_next(request)
    start = _time.monotonic()
    # Resolusi actor sekali per request; handler memakai request.state.user.
    try:
        request.state.user = current_user(request)
    except Exception:
        request.state.user = None
    response = await call_next(request)
    dur = int((_time.monotonic() - start) * 1000)
    actor = request.state.user
    # Noise reduction: GET sukses = pembacaan biasa, tidak dicatat per-request.
    # Yang tetap tercatat: semua mutasi (POST/PATCH/PUT/DELETE), semua kegagalan
    # (4xx/5xx termasuk GET ditolak), dan event bernilai dari handler (auth dsb.).
    skip = request.method == "GET" and response.status_code < 400
    if not skip:
        try:
            ip = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else None)
            from core import db as _db
            with _db() as conn:
                conn.execute(
                    """
                    INSERT INTO audit_logs (actor_id, actor_email, actor_role, ip, user_agent, category, action, detail, outcome, method, path, status, duration_ms)
                    VALUES (%s, %s, %s, %s, %s, 'api', %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        (actor or {}).get("id"),
                        (actor or {}).get("email"),
                        (actor or {}).get("role"),
                        ip,
                        request.headers.get("user-agent", "")[:300],
                        request.method + " " + path,
                        json.dumps({"query": str(request.url.query)[:500]} if request.url.query else {}, ensure_ascii=False),
                        "ok" if response.status_code < 400 else ("denied" if response.status_code in (401, 403, 423) else "error"),
                        request.method,
                        path,
                        response.status_code,
                        dur,
                    ),
                )
        except Exception as e:
            import sys
            print(f"[audit-mw] {e}", file=sys.stderr)
    return response

@app.on_event("startup")
def init_db():
    migrations_dir = Path(__file__).with_name("migrations")
    migrations = sorted(migrations_dir.glob("[0-9][0-9][0-9][0-9]_*.sql"))
    with db() as conn:
        # Keep migration discovery/application serialized when multiple workers
        # start against the same database at once.
        with conn.transaction():
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (741928316,))
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            applied = {
                row["version"]
                for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
            }
            for migration in migrations:
                version = migration.stem
                if version in applied:
                    continue
                conn.execute(migration.read_text(encoding="utf-8"))
                conn.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s)",
                    (version,),
                )
        seed_email = os.environ.get("PERKUTUT_SEED_ADMIN_EMAIL", "").strip().lower()
        seed_password = os.environ.get("PERKUTUT_SEED_ADMIN_PASSWORD")
        if seed_email and seed_password and not conn.execute("SELECT id FROM users WHERE LOWER(email) = %s", (seed_email,)).fetchone():
            conn.execute(
                "INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, 'admin')",
                (os.environ.get("PERKUTUT_SEED_ADMIN_NAME", "Administrator").strip() or "Administrator", seed_email, hash_password(seed_password)),
            )


# ------------------------------------------------------------- feature routers
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(competitions.router)
app.include_router(admin_users.router)
app.include_router(teams.router)
app.include_router(documents.router)
app.include_router(submissions.router)
app.include_router(jury.router)
app.include_router(superkutut.router)

# web TERAKHIR: mount /assets + catch-all /{page_path:path} tidak boleh
# mendahului route API mana pun.
web.setup(app)
app.include_router(web.router)
