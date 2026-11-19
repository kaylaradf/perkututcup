"""SPA shell + static frontend serving (moved verbatim from app.py).

app.py MUST call web.setup(app) BEFORE include_router(web.router) so the
/assets mount is registered ahead of the catch-all route, matching the
original registration order. The catch-all GET /{page_path:path} must stay
the LAST route registered app-wide (include this router last).
"""
import json
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from core import FRONTEND_DIR, current_user

router = APIRouter()


# ------------------------------------------------------ app shell (SPA, wave 1)
APP_SHELL_PATH = FRONTEND_DIR / "app" / "index.html"


def serve_app_shell(request: Request, target_path: str | None = None):
    """Serve SPA shell with __APP_STATE__ injected (deep-link/refresh)."""
    if not APP_SHELL_PATH.is_file():
        raise HTTPException(status_code=404, detail="App shell not found.")
    u = current_user(request)
    if u is None:
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    path = target_path or str(request.url.path)
    state = {"path": path, "user": {"full_name": u.get("full_name"), "role": u.get("role")}}
    html = APP_SHELL_PATH.read_text(encoding="utf-8")
    inject = '<script>window.__APP_STATE__=' + json.dumps(state, ensure_ascii=False) + ';</script>'
    if "<!-- __APP_STATE__ injected by server -->" in html:
        html = html.replace("<!-- __APP_STATE__ injected by server -->", inject, 1)
    elif "</head>" in html:
        html = html.replace("</head>", inject + "\n</head>", 1)
    # Cache-bust JS/CSS: Cloudflare edge caches /assets for 4h; mtime query forces fresh fetch after deploys.
    def _bust(m):
        p = FRONTEND_DIR / m.group(2).lstrip("/")
        v = int(p.stat().st_mtime) if p.is_file() else 0
        return m.group(1) + m.group(2) + "?v=" + str(v) + m.group(3)
    html = re.sub(r'((?:src|href)=")(/assets/[^"?]+|/(?:styles|dashboard|auth-motion)\.css)(")', _bust, html)
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


ALLOWED_APP_PATHS = {
    "/dashboard/profile/",
    "/dashboard/submission/",
    "/dashboard/competitions/",
    "/dashboard/users/",
    "/dashboard/verifications/",
    "/dashboard/jury/",
}


@router.get("/app")
@router.get("/app/")
def app_shell_root(request: Request):
    # If ?p= is provided (redirect flow), use it as the target path
    target = request.query_params.get("p") or "/dashboard/profile/"
    if not target.startswith("/"):
        target = "/" + target
    if not target.endswith("/"):
        target += "/"
    if target not in ALLOWED_APP_PATHS:
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path=target)


@router.get("/dashboard/profile")
@router.get("/dashboard/profile/")
def app_shell_profile(request: Request):
    u = current_user(request)
    if u is None:
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    if u.get("role") != "user":
        return RedirectResponse("/dashboard/verifications/" if u.get("role") == "admin" else "/dashboard/jury/", status_code=303)
    return serve_app_shell(request, target_path="/dashboard/profile/")


@router.get("/dashboard/submission")
@router.get("/dashboard/submission/")
def app_shell_submission(request: Request):
    u = current_user(request)
    if u is None:
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    if u.get("role") != "user":
        return RedirectResponse("/dashboard/verifications/" if u.get("role") == "admin" else "/dashboard/jury/", status_code=303)
    return serve_app_shell(request, target_path="/dashboard/submission/")


@router.get("/dashboard/competitions")
@router.get("/dashboard/competitions/")
def app_shell_competitions(request: Request):
    u = current_user(request)
    if u is None or u.get("role") != "admin":
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path="/dashboard/competitions/")


@router.get("/dashboard/users")
@router.get("/dashboard/users/")
def app_shell_users(request: Request):
    u = current_user(request)
    if u is None or u.get("role") != "admin":
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path="/dashboard/users/")


@router.get("/dashboard/verifications")
@router.get("/dashboard/verifications/")
def app_shell_verifications(request: Request):
    u = current_user(request)
    if u is None or u.get("role") != "admin":
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path="/dashboard/verifications/")


@router.get("/dashboard/jury")
@router.get("/dashboard/jury/")
def app_shell_jury(request: Request):
    u = current_user(request)
    if u is None or u.get("role") not in ("jury", "admin"):
        return FileResponse(FRONTEND_DIR / "404.html", headers={"Cache-Control": "no-store"})
    return serve_app_shell(request, target_path="/dashboard/jury/")


# ------------------------------------------------- static frontend + guard


def setup(app):
    """Mount /assets on the app; call BEFORE app.include_router(web.router)
    so the mount precedes the catch-all route, as in the original app.py."""
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@router.get("/{page_path:path}")
def serve_static(page_path: str, request: Request):
    """Sajikan frontend statis dari origin yang sama (cookie butuh same-origin)."""
    # Guard server-side untuk dashboard: tanpa session -> 404.html
    if page_path.startswith("dashboard") or page_path == "dashboard":
        u = current_user(request)
        if u is None:
            page_path = "404.html"
        elif (
            page_path.startswith("dashboard/competitions")
            or page_path.startswith("dashboard/users")
            or page_path.startswith("dashboard/verifications")
        ):
            if u.get("role") != "admin":
                page_path = "404.html"
        elif page_path.startswith("dashboard/jury"):
            if u.get("role") not in ("jury", "admin"):
                page_path = "404.html"
        elif page_path.startswith(("dashboard/profile", "dashboard/submission")):
            if u.get("role") != "user":
                return RedirectResponse("/dashboard/verifications/" if u.get("role") == "admin" else "/dashboard/jury/", status_code=303)
        elif page_path in ("dashboard", "dashboard/"):
            if u.get("role") == "admin":
                return RedirectResponse("/dashboard/verifications/", status_code=303)
            elif u.get("role") == "jury":
                return RedirectResponse("/dashboard/jury/", status_code=303)
            else:
                return RedirectResponse("/dashboard/profile/", status_code=303)

    # Halaman auth: yang sudah punya session langsung dilempar ke dashboard sesuai role
    if page_path in ("sign-in", "sign-in/", "join", "join/"):
        u = current_user(request)
        if u is not None:
            if u.get("role") == "admin":
                return RedirectResponse("/dashboard/verifications/", status_code=303)
            elif u.get("role") == "jury":
                return RedirectResponse("/dashboard/jury/", status_code=303)
            else:
                return RedirectResponse("/dashboard/profile/", status_code=303)

    candidate = FRONTEND_DIR / page_path
    auth_or_dashboard = page_path.startswith(("dashboard", "sign-in", "join"))
    headers = {"Cache-Control": "no-store"} if auth_or_dashboard else None
    if page_path and candidate.is_file():
        return FileResponse(candidate, headers=headers)
    index = candidate / "index.html"
    if index.is_file():
        return FileResponse(index, headers=headers)
    return FileResponse(FRONTEND_DIR / "404.html")
