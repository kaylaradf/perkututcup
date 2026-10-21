# Perkutut Cup 2026 — Project Assessment

Assessment date: 2026-10-21
Scope: entire static site (`index.html`, `about/`, `timeline/`, `sign-in/`, `join/`, `dashboard/`, `404.html`) plus CSS/JS assets.
Purpose: baseline before backend integration.

## 1. Snapshot

| Item | Value |
| --- | --- |
| Stack | Static HTML + plain CSS + vanilla JS. No framework, no bundler, no `package.json`. |
| Serving | Any static file server. `python3 -m http.server` was used for verification. |
| Pages | `index.html`, `about/index.html`, `timeline/index.html`, `sign-in/index.html`, `join/index.html`, `dashboard/profile/index.html`, `dashboard/submission/index.html`, `404.html` |
| Styles | `styles.css` (3,101 lines), `auth-motion.css` (108), `dashboard.css` (1,252) |
| Scripts | `script.js` (292), `auth-guard.js` (12) |
| Assets | `assets/fonts` 2.7 MB (3 local fonts), `assets/images` 2.5 MB (9 + 5 dashboard), `assets/svg` 18 + 26 dashboard |
| Language | UI copy mostly Indonesian (`lang="id"`), some English labels inherited from Figma. |
| Git | branch `main`, clean tree before this assessment. |

No build step means files are deployed as-is; every path is relative, so the site works from any subdirectory.

## 2. Page inventory

| Route | Purpose | Key interactive behaviour |
| --- | --- | --- |
| `/index.html` | Landing: hero, theme intro, 5-step guide, team, 8 competition cards, FAQ, footer. | Sticky nav + mobile toggle, FAQ accordion (`aria-expanded` + `inert`), IntersectionObserver scroll reveals, pointer-follow glow on `.team-card`/`.comp-card`, mascot parallax, staggered title letters. |
| `/about/` | Disclaimer / policy page. | Scroll reveal only. |
| `/timeline/` | Placeholder "Coming Soon". | Staggered title letters. |
| `/sign-in/` | Login form. | Client-side allowlist sanitising, password visibility toggle, submit → dashboard. |
| `/join/` | Registration form. | Same as sign-in plus live password-strength rules (`data-password-rule`). |
| `/dashboard/profile/` | Profile & team dashboard (Figma frame `308:2`). | Auth gate, profile form with validity check, 4 document-upload placeholders, Save Changes status message, WhatsApp/guidebook links. |
| `/dashboard/submission/` | Project submission dashboard (Figma frame `308:255`). | Auth gate, submission-item tabs (`role="tablist"`), lock/closed states. |
| `/404.html` | Custom not-found page, timeline layout with `404` + Terminess subtitle. | Auth-guard redirect target. |

## 3. Design system (current tokens)

Defined on `:root` in `styles.css` and reused everywhere — keep these as the contract for backend-rendered templates:

```
--obsidian-top #0b0c10   --mid #363262        --deep-footer #120e22
--sunset-coral #ff6b6b   --soft-violet #8644a2
--cream #ffe8d9          --cream-muted rgba(255,232,217,.56)   --lavender #c7b8e0
--card rgba(15,11,26,.8) --nav-bg rgba(15,11,26,.8)            --ink #100c2a
--grad linear-gradient(90deg, var(--sunset-coral), var(--soft-violet))
```

Fonts:

| Token | Family | Used for |
| --- | --- | --- |
| `--font-body` | Inter | Default body |
| `--font-display` | Pixelify Sans | Pixel headings, nav links |
| `--font-mono` | Space Mono | Labels, metadata |
| `--font-heading` | Montserrat 800 | Section headings |
| `--font-title` | Russo One | Numerals |
| `--font-text` | Poppins | Forms, paragraphs |
| local `Figma Game Paused` | `assets/fonts/gamepauseddemoregular-rpmy6.otf` | Hero title, "Coming Soon", 404 numerals |
| local `Figma I Pixel U` | `assets/fonts/I-pixel-u.ttf` | Hero/display variants |
| local `Figma Terminess Mono` | `assets/fonts/TerminessNerdFontMono-Regular.ttf` | Monospace accents, 404 subtitle, team code |

Dashboard pages intentionally reuse the dark palette (`--card`, `--grad`, `--lavender`) instead of the light Figma palette.

## 4. JavaScript behaviour map (`script.js`)

| Block | Selector hook | Notes for backend |
| --- | --- | --- |
| Nav | `.nav`, `.nav-toggle` | Pure presentational; safe to keep. |
| Scroll reveal | `.hero-title`, `.step`, `.comp-card`, `.faq-item`, `.coming-soon-title`, … via `motionGroups` | Adds `[data-motion]` and `.is-visible`; observer only. |
| FAQ | `.faq-list` + `.faq-question` | Accordion state lives in DOM only. |
| Card pointer glow | `.team-card`, `.comp-card` | Sets `--pointer-x/--pointer-y`. |
| Mascot parallax | `.theme-mascot` | Hover only. |
| Auth forms | `[data-auth-form]` | Sanitises input, validates password rules, **fake submit**. |
| Forgot password | `[data-forgot-password]` | Shows placeholder message. |
| Dashboard tabs | `.tabs .tab` | Toggles `is-active`/`aria-selected`; no data fetch. |
| Dashboard form | `[data-dash-form]` | `preventDefault` + status text; no persistence. |
| Upload buttons | `[data-upload]` | Status text only; no file input yet. |

## 5. Backend integration contract

### 5.1 Auth

Current: `script.js` treats a valid sign-in as success and writes `sessionStorage["perkutut-auth"] = "1"`, then redirects to `/dashboard/profile/`. `auth-guard.js` loads **synchronously in `<head>`** of both dashboard pages and `location.replace("../../404.html")` when the flag is absent.

Replace with:

| Concern | Recommendation |
| --- | --- |
| Session | HTTP-only, `Secure`, `SameSite=Lax` cookie set by `POST /api/auth/login`. JS must not read the token. |
| Guard | Server-side redirect (or middleware) for `/dashboard/*`. Keep `auth-guard.js` only as a UX nicety for static hosting; delete once server guards exist. |
| Redirect target | Unauthenticated → `/404.html` (current requirement) or `/sign-in/?next=/dashboard/profile/`. |
| Logout | `POST /api/auth/logout`, then redirect to `/sign-in/`. Currently the sidebar "LOGOUT" is a plain link to `sign-in/`. |
| Registration | `POST /api/auth/register`; enforce the same 5 password rules **server-side**. |

Endpoints to define: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/auth/session`, `POST /api/auth/forgot-password`.

### 5.2 Profile & team (`dashboard/profile/`)

Current form fields (`name` attribute → suggested API field):

| Input name | Type | Field in DB |
| --- | --- | --- |
| `fullName` | text | `user.full_name` |
| `institution` | text | `user.institution` |
| `email` | email | `user.email` (unique, verified) |
| `phone` | tel | `user.phone` (store E.164 `+62…`) |
| `birthDate` | text `dd/mm/yyyy` | `user.birth_date` (send ISO-8601) |
| `instagram` | text | `user.instagram_handle` |

Suggested endpoints:

- `GET /api/me` → profile + team + registration status + competition track.
- `PATCH /api/me` → the form above.
- `GET /api/team` → `{ id, code: "AriHana2112", members[], payment_proof }`.
- `POST /api/me/documents/:kind` (multipart) for `student_id`, `formal_photo`, `twibbon`, `follow_instagram`; `kind` mirrors the current `data-upload` values.
- `GET /api/me/documents/:kind` → signed URL for the "Click to view" links.

Static values currently hard-coded that must come from the API: `1 / 1` member count, `Verified`, track `KRIPTOGRAFI`, team id `AriHana2112`, WhatsApp group URL (`#whatsapp` placeholder), uploaded-file state.

### 5.3 Project submission (`dashboard/submission/`)

Hard-coded values to replace: deadline `2026-09-20`, `Overdue`, `0 / 3`, `Closed at 14:00 WIB`, `Window: 20 Sep 2026, 09:00 – 14:00 WIB`, problem-file names, `KRIPTOGRAFI (UNIVERSITY)`.

Suggested endpoints:

- `GET /api/submission` → `{ deadline, daysRemaining, filesUploaded, totalRequired, track, problemFiles[], windows, items[] }`.
- `POST /api/submission/:item/upload` — `item` ∈ `file_pka`, `file_poc`, `file_cisco` (matches tab ids `tab-pka`, `tab-poc`, `tab-cisco`).
- `GET /api/submission/:item` → status `pending | uploaded | closed`.
- `GET /api/submission/problems/:fileId/download` → signed URL, honouring the window close time.

Server must be the source of truth for "closed" — the UI currently only shows it.

### 5.4 Content

All section copy (hero, theme, steps, team, 8 competitions, 6 FAQs, about disclaimer) is inline HTML. Either keep as static CMS-less templates or add `GET /api/content` and hydrate. Competition cards should carry `competition_id` so "DAFTAR" can deep-link to `/join/?competition=<id>`.

## 6. Accessibility & semantics

Working well: `aria-expanded`/`inert` FAQ, labelled forms, `aria-live` status regions, tab roles, `prefers-reduced-motion` honoured in all three stylesheets, decorative layers marked `aria-hidden`.

Gaps to close:

1. Dashboard upload buttons are `<button>` with no file input — wire `<input type="file" hidden>` + label once the API exists.
2. Tabs are buttons without arrow-key roving focus (`ArrowLeft/Right` expected for `role="tablist"`); the single shared `#tab-panel` never swaps content.
3. Sign-in/join errors rely on `setCustomValidity` only; add inline error text tied via `aria-describedby`.
4. `.dash-avatar` in the sidebar and team card repeats the same letter; give it `aria-hidden` or an accessible name.
5. 404 page is `noindex` but should also be configured as the server's error document (see §8).

## 7. SEO, performance, correctness

- Every page has a unique `<title>`, favicon, viewport and `theme-color`. No meta description or Open Graph tags — add when backend serves templates.
- Google Fonts loaded via one `<link>` per page; three local `@font-face` in `styles.css`. Fonts are the largest asset group (2.7 MB); consider subsetting `TerminessNerdFontMono` (used for short strings) and `preload`ing only the display face above the fold.
- Images: `logo-navbar-final.png` (190×106 intrinsic, displayed up to 190px) and `team-photo.png` are PNG; converting to WebP/AVIF would cut most of the 2.5 MB. Intrinsic `width`/`height` are present on most `<img>` — keep that.
- Scroll reveal adds `.has-motion` only when `IntersectionObserver` exists, so content is visible if JS fails. Good baseline.
- No CSS minification, no cache-busting on assets. Add hashed filenames when a build step is introduced.

## 8. Hosting / routing notes for the 404 requirement

- `404.html` must be registered as the server's not-found document (nginx `error_page 404 /404.html;`, Netlify `/* /404.html 404`, GitHub Pages picks it up automatically, Express `app.use((req,res)=>res.status(404).sendFile(...))`).
- Any unknown path should also land there — which is what the requirement "tanpa auth … langsung redirect ke sana" implies today.
- With a backend, keep the client redirect for unauthenticated dashboard hits **only** during the transition; the final behaviour should be an HTTP 302/303 to `/404.html` (or to `/sign-in/` if product decides 404 is too lossy).

## 9. Risks / technical debt register

| # | Risk | Impact | Suggested action |
| --- | --- | --- | --- |
| 1 | Auth is simulated in the browser (sessionStorage flag) | Anyone can open the dashboard by setting the flag | Server-side sessions before launch |
| 2 | All data is hard-coded in HTML | Registration/profile/submission cannot reflect real state | Introduce API layer per §5 |
| 3 | `styles.css` is 3.1k lines with duplicated blocks (e.g. `.site-header` and `.timeline-page` redefined several times) | Hard to change safely | Split into base/layout/components and delete later overrides |
| 4 | Two dashboards duplicate sidebar markup | Drift between pages | Extract partials once a template engine is chosen |
| 5 | No tests or linters | Regressions go unnoticed | Add HTML validation + Lighthouse CI at minimum |
| 6 | Upload flows are placeholders | Users see "Uploaded successfully" for files that do not exist | Do not ship the copy until the API returns real state |
| 7 | Mixed ID/EN copy | Inconsistent product voice | Decide one language per surface |

## 10. Suggested backend data model (minimum)

```
users(id, full_name, institution, email, phone, birth_date, instagram_handle, password_hash, email_verified_at)
teams(id, code, track_id, leader_user_id, payment_receipt_url, whatsapp_url)
team_members(team_id, user_id, role)
documents(id, user_id, kind, storage_key, uploaded_at, verified_at)
competitions(id, slug, name, audience, description)
submission_items(id, team_id, item_key, status, submitted_at)
submission_files(id, item_id, storage_key, original_name, mime, size, closed_at)
problem_files(id, competition_id, round, file_name, storage_key, window_start, window_end)
```

## 11. Recommended implementation order

1. Auth endpoints + real server-side guard, remove `sessionStorage` flag.
2. `GET /api/me` + `PATCH /api/me` wired to the profile form (read-only fields first).
3. Document upload (multipart → object storage, signed read URLs).
4. Submission status + problem-file download with window enforcement.
5. `404.html` + server error-document registration + remove client redirect.
6. Content hydration / CMS decision, SEO metadata, asset compression.

## 12. Verification performed

- Served the repo with `python3 -m http.server` and loaded every route: all 200, no broken images, no horizontal scroll at 1440 px and 390 px.
- Auth gate: `/dashboard/profile/` without the flag → `404.html`; with the flag → stays; sign-in submit → `/dashboard/profile/`.
- `node --check` passes on `script.js` and `auth-guard.js`.
- Not verified: real backend behaviour, cross-browser rendering beyond Chromium, and form submission against an API (none exists).
