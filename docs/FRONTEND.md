# Perkutut Cup 2026 — Frontend Documentation

Companion to `docs/ASSESSMENT.md` (backend contract + risks).
This file explains **what every frontend file is, what it contains, and what an agent must not break** when wiring the backend.

Last updated: 2026-10-21

---

## 0. How the site fits together

```
Browser
  │  static files only — no build, no framework, no package.json
  ├── HTML page (index / about / timeline / sign-in / join / dashboard/* / 404)
  │     ├── <link> Google Fonts
  │     ├── <link> styles.css            (all pages)
  │     ├── <link> auth-motion.css       (sign-in, join only)
  │     ├── <link> dashboard.css         (dashboard/* only)
  │     ├── <script> auth-guard.js       (dashboard/* only, synchronous in <head>)
  │     └── <script src="script.js" defer>  (all pages)
  └── assets/ (fonts, images, svg)
```

Rules that hold today and must keep holding:

1. **No absolute URLs for local assets.** Every page uses `../` / `../../` relative paths so the site runs from any subdirectory.
2. **Progressive enhancement.** Content is visible without JS. `script.js` only adds classes/behaviour.
3. **One global stylesheet chain.** No CSS-in-JS, no inline `style=""` attributes anywhere.
4. **Design tokens live in `styles.css` `:root`.** New colors must map to an existing token.

---

## 1. File-by-file reference

### 1.1 HTML pages

| File | Root class | Stylesheets | JS | Purpose / must-know |
| --- | --- | --- | --- | --- |
| `index.html` | `.page.home-page` | `styles.css` | `script.js` | Landing. Sections in order: `.hero` (`#home`), `.theme` (`#theme-introduction`), `.started` (`#get-started`), `.team`, `.competition` (`#competition`), `.faq` (`#faq`). IDs are anchor targets — nav and all "DAFTAR"/"Read Guidebook" links point at them. |
| `about/index.html` | `.page.about-page` | `styles.css` | `script.js` | Disclaimer text in `.policy-stage > .policy-content` (`.policy-title`, `.policy-copy`, `.policy-signoff`). No data dependency. |
| `timeline/index.html` | `.page.timeline-page` | `styles.css` | `script.js` | Placeholder. Single `.coming-soon-title` inside `.timeline-stage`. |
| `sign-in/index.html` | `body.auth-body` → `.auth-screen` | `styles.css`, `auth-motion.css` | `script.js` | Login. Form `[data-auth-form="sign-in"]`, inputs `email`/`password` with `[data-allowlist]`, submit `.auth-submit`, status `[data-auth-message]`. **Submit currently fakes a session and redirects — see §3.** |
| `join/index.html` | `body.auth-body` → `.auth-screen.auth-screen--join` | `styles.css`, `auth-motion.css` | `script.js` | Registration. `[data-auth-form="join"]`, fields `fullName`/`email`/`password`/`confirmPassword`, password rules `<ul class="password-rules" data-password-rule="…">`. No redirect on submit yet. |
| `404.html` | `.page.timeline-page` | `styles.css` | `script.js` | Not-found. Same shell as timeline; `.timeline-stage.not-found-stage` holds `.coming-soon-title.not-found-title` ("404") and `.not-found-sub` (Terminess Mono subtitle). Has `<meta name="robots" content="noindex">`. Also the redirect target of `auth-guard.js`. |
| `dashboard/profile/index.html` | `body.dash-body` → `.dash` | `styles.css`, `dashboard.css` | `auth-guard.js` (head), `script.js` (defer) | Profile & team screen (Figma `308:2`). Contains the sidebar, 3 metric cards, `.card` Personal Information form, `.card.card--accent` My Team + payment proof. |
| `dashboard/submission/index.html` | `body.dash-body` → `.dash` | `styles.css`, `dashboard.css` | `auth-guard.js` (head), `script.js` (defer) | Submission screen (Figma `308:255`). Same sidebar, 3 metrics, two `.dash-col`s: guide/description and problem files/submission box. |

Both dashboard pages share an identical sidebar block (`.dash-aside`, `.dash-brand`, `.dash-team`, `.dash-nav`, `.dash-aside-foot`). Only `is-active` + `aria-current` move between the two nav links. **If you introduce a template engine, extract this block first.**

### 1.2 CSS

#### `styles.css` — 3.1k lines, loaded by every page

Section map (line numbers approximate; grep the `/* ——— … ——— */` headers):

| Lines | Block | Contains |
| --- | --- | --- |
| 1–24 | `:root` tokens | Colors, fonts, `--max`, `--pad`, `--grad`. **Single source of truth.** |
| 25–120 | Base | Reset, `body`, `img`, `a`, `button`, `.container`, `.section-label/title/head`. |
| 121–241 | Header / Nav | `.site-header`, `.nav`, `.nav-links`, `.nav-actions`, `.btn`, `.btn-primary`, `.btn-muted`, `.btn-block`. Dashboard buttons use their own `.btn-upload` / `.btn-save` in `dashboard.css`. |
| 242–341 | Hero | `.hero`, `.hero-badge`, `.hero-title`, `.hero-year`, `.hero-sub`, `.sponsors*`. |
| 342–395 | Theme | `.theme-grid`, `.theme-copy`, `.theme-mascot`, `.halo`, `.mascot`. |
| 396–458 | Get started | `.steps` (grid + connector line `::before`), `.step`, `.step-num`. |
| 459–501 | Team | `.team-grid`, `.team-card`. |
| 502–576 | Competition | `.comp-grid`, `.comp-card`, `.comp-icon`, `.comp-tag`, `.comp-audience`, `.desc`. |
| 577–634 | FAQ | `.faq-list`, `.faq-question`, `.faq-answer`, `.faq-answer-inner`. |
| 635–692 | Footer | `.site-footer`, `.footer-main`, `.footer-brand`, `.footer-links`, `.footer-logo`, `.footer-legal`. |
| 693–968 | Decor + reduced motion | `.background-decor`, `.deco-star`, `.deco-pixel`, global `prefers-reduced-motion` kill switch. |
| 969–1407 | Fonts + Figma geometry | Three local `@font-face` (`Figma Game Paused`, `Figma I Pixel U`, `Figma Terminess Mono`) plus a hand-tuned 1440 px layout pass for the hero. Local `src` paths assume `styles.css` sits at repo root — **do not move this file**. |
| 1408–1536 | Responsive (first pass) | Nav/hero/grid breakpoints. |
| 1537–1890 | Persistent nav + motion | Fixed header, `[data-motion]` reveal states, footer details. |
| 1891–2343 | Supporting pages | About (`policy-*`), Timeline (`timeline-stage`, `coming-soon-title`), decorative stars per page, 404 additions (`.not-found-*`), breakpoints for those pages. |
| 2344–2537 | Compact footer | `.site-footer` final overrides; `timeline-page` min-heights; mobile footer. |
| 2538–2694 | Home entrance | `.title-letter`, hero/year/sub reveal keyframes, About/Timeline/404 title origin. |
| 2695–3101 | Sign in & join | `.auth-body`, `.auth-screen`, `.auth-card`, `.auth-field`, `.auth-control`, `.auth-submit`, `.auth-switch`, `.password-rules`; mobile + short-viewport tweaks. |

Note: several blocks intentionally override earlier ones (`.site-header`, `.timeline-page`, `.site-footer` appear twice or more). Later wins. Read top-to-bottom before editing; prefer appending a new block over rewriting an old one.

#### `dashboard.css` — 1.25k lines, dashboard only

| Lines | Block | Contains |
| --- | --- | --- |
| 1–22 | Base | `.dash-body` (dark background), `.dash` grid `288px | 1fr`, sidebar-colored first column via layered gradient. |
| 23–185 | Sidebar | `.dash-aside` (sticky, 100vh), `.dash-brand`, `.dash-brand-mark`, `.dash-team`, `.dash-avatar`, `.dash-nav` (+ `.is-active` gradient), `.dash-aside-foot`. |
| 186–313 | Main | `.dash-main`, `.dash-page-title`, `.dash-page-sub`, `.dash-metrics`, `.metric` + `.is-coral/.is-violet/.is-green/.is-amber`, `.metric-watermark`, `.metric-icon/label/value/link/note`, `.dash-inline-link`. |
| 314–428 | Cards | `.card` (dark glass), `.card--accent`, `.card--flush`, `.card-top-bar` (+`.is-rainbow`), `.card-head` (+`.card-head--plain`), `.card-title`, `.card-lead`, `.card-sub`, `.edit-link`, `.card-title-row`, `.title-icon`, `.tag`. |
| 429–701 | Form | `.dash-form`, `.field`, `.field-row`, `.input`, `.input-wrap`, `.phone-row`, `.phone-code`, `.phone-flag`, `.field-hint`, `.field-link`, `.form-divider`, uploads (`.upload-head/list/item/thumb/copy/hint/twibbon-link`), `.btn-upload`, `.btn-save`, `.dash-status`, `.sr-only`. |
| 702–826 | Team card | `.team-code`, `.team-member`, `.team-badge`, `.proof-block`, `.proof`, `.proof-icon`, `.proof-hint`. |
| 827–1160 | Submission page | `.guide-steps/.guide-step`, `.desc-list/.desc-sub`, `.lock-banner`, `.file-list/.file-row/.file-info/.file-download`, `.track-box/.track-id`, `.tabs-block/.tabs-label/.tabs/.tab` (+`.is-active`), `.closed-box`. |
| 1161–1252 | Responsive | ≤1080 px stacks the two-column grids; ≤900 px collapses the sidebar to a top block; ≤560 px single-column fields/uploads/tabs; reduced-motion overrides. |

Dashboard CSS depends on `styles.css` tokens (`var(--cream)`, `var(--grad)`, `var(--card)`, fonts). It must load **after** `styles.css`.

#### `auth-motion.css` — 108 lines, sign-in/join only

View Transitions API (`::view-transition-old/new(root)`), card entrance, staggered element entrance, submit shimmer, and a reduced-motion block. Purely presentational. Loaded after `styles.css`.

### 1.3 JavaScript

#### `script.js` — 292 lines, loaded by every page, `defer`

Single IIFE. Every block is selector-guarded (`.forEach`, optional chaining), so a page missing the markup is a no-op. Order:

| Lines | Block | Behaviour | Backend note |
| --- | --- | --- | --- |
| 1–25 | `splitTitle` | Splits `.home-page .hero-title`, `.about-page .policy-title`, `.timeline-page .coming-soon-title` into `.title-letter` spans (skipped when reduced motion). Also matches the 404 title. | None. |
| 27–58 | `motionGroups` | Adds `[data-motion]` + `--motion-delay` to section blocks. | None. |
| 59–87 | Nav | Mobile toggle, close on link click / outside pointerdown / Escape / desktop breakpoint. | None. |
| 89–100 | IntersectionObserver | Adds `.has-motion` on `<html>` and `.is-visible` per target. | None. |
| 102–117 | FAQ | Accordion; sets `aria-expanded`, `aria-hidden`, `inert`. | None. |
| 119–125 | Card glow | Sets `--pointer-x/y` on `.team-card`/`.comp-card`. | None. |
| 127–139 | Mascot parallax | Hover-only translate/rotate. | None. |
| 141–151 | Password toggle | `[data-password-toggle]` swaps input type, updates `aria-pressed`. | None. |
| 153–253 | Auth forms | Sanitises `[data-allowlist]` inputs, validates 5 password rules, confirmation match, submit → message; **sign-in additionally writes `sessionStorage["perkutut-auth"]` and redirects to `../dashboard/profile/`**. | Replace submit body with API call. Remove sessionStorage line. |
| 255–268 | Dashboard tabs | `.tabs .tab` toggle + `aria-selected`; only re-labels the shared panel. | Wire real per-tab content. |
| 270–283 | Dashboard form | `[data-dash-form]` submit → validity check → status text; `[data-upload]` → status text. | Replace with `PATCH`/multipart. |
| 285–291 | Forgot password | Placeholder message. | Wire reset endpoint. |

All user-visible strings in this file are Indonesian. Keep the language when editing.

#### `auth-guard.js` — 12 lines, dashboard only, **synchronous in `<head>`**

```js
const KEY = "perkutut-auth";
const target = document.currentScript?.dataset.redirect || "../../404.html";
authed = sessionStorage… || localStorage…
if (!authed) location.replace(target);
```

- Runs before first paint to avoid flashing dashboard content.
- Optional override: `<script src="../../auth-guard.js" data-redirect="/sign-in/"></script>`.
- Client-side only — **not security**. Server guard is required (see `ASSESSMENT.md` §5.1).

### 1.4 Assets

#### `assets/fonts/` (2.7 MB, 3 files)

| File | `@font-face` family | Used by |
| --- | --- | --- |
| `gamepauseddemoregular-rpmy6.otf` | `Figma Game Paused` | `.hero-title`, `.coming-soon-title` (Timeline + 404) |
| `I-pixel-u.ttf` | `Figma I Pixel U` | Figma hero geometry pass in `styles.css` |
| `TerminessNerdFontMono-Regular.ttf` | `Figma Terminess Mono` | `.not-found-sub`, `.team-code`, nav/UI mono accents |

Declared only in `styles.css`. URLs are relative to the repo root.

#### `assets/images/` (2.5 MB)

| File | Used in |
| --- | --- |
| `logo-navbar-final.png` | Nav + footer on all six content pages |
| `mascot-figma.png` | `index.html` theme section |
| `sponsor-final-1…6.png` | `index.html` sponsors row |
| `team-photo.png` | `index.html` four `.team-card`s (same placeholder repeated) |
| `dashboard/student-id.jpg`, `formal-photo.jpg`, `twibbon.jpg`, `instagram.jpg` | Upload thumbnails in profile page |
| `dashboard/member-leader.jpg` | Team leader avatar |

Dashboard thumbnails come from the Figma design as placeholders. When the API returns real documents, swap `src` for signed URLs and keep the 45×45 box.

#### `assets/svg/` (18 files)

`favicon.svg` (all pages), `mascot-halo.svg` (theme + auth decor), `sparkle.svg`/`sparkles.svg`/`sparkles-2.svg` (decor), `chevron-down.svg` (FAQ), `arrow-up-right.svg` (competition CTA), `icon-home.svg` (auth "Home" chip), `icon-mail.svg`/`icon-lock.svg`/`icon-eye.svg` (auth fields), `icon-code.svg`, `icon-cpu.svg`, `icon-figma.svg`, `icon-fingerprint.svg`, `icon-laptop.svg`, `icon-network.svg` (competition cards).

All are used; none are decorative inline SVG (no path inlining), so keep them as files.

#### `assets/svg/dashboard/` (26 files)

Three naming groups — keep the convention when adding icons:

- `nav-*.svg` — sidebar links (`nav-profile`, `nav-submission`, `nav-home`, `nav-logout`).
- `icon-*.svg` — metric/action icons (`icon-members`, `icon-shield-check`, `icon-trophy`, `icon-pencil`, `icon-calendar`, `icon-calendar-lg`, `icon-clock-lg`, `icon-check-circle-lg`, `icon-doc-purple`, `icon-doc-gray`, `icon-download`, `icon-file-lock`, `icon-lock`, `icon-chevron-down`, `icon-bolt`) plus `brand-mark.svg`.
- `watermark-*.svg` — oversized background glyphs inside `.metric` (`watermark-members`, `-check`, `-trophy`, `-calendar`, `-clock`, `-check-circle`).

All 26 are referenced exactly once (nav icons twice, once per dashboard page except `brand-mark` which is in both). Stroke colors are baked into the SVG from Figma; the sidebar's active state uses `filter: brightness(0) invert(1)` rather than recoloring paths. **Do not edit the SVG stroke colors** — recolor via CSS filter or replace the file.

---

## 2. Design-token contract

Any backend-rendered template must reproduce these class names so `styles.css`/`dashboard.css` keep working.

| Token | Value | Notes |
| --- | --- | --- |
| `--obsidian-top` | `#0b0c10` | Page base / `theme-color` |
| `--mid` | `#363262` | Gradient midpoint |
| `--deep-footer` | `#120e22` | Footer gradient end |
| `--sunset-coral` | `#ff6b6b` | Primary accent, borders |
| `--soft-violet` | `#8644a2` | Secondary accent, focus ring |
| `--lavender` | `#c7b8e0` | Subdued accent text |
| `--cream` | `#ffe8d9` | Body text on dark |
| `--cream-muted` | `rgba(255,232,217,.56)` | Metadata text |
| `--card` | `rgba(15,11,26,.8)` | Card background (both home cards and dashboard cards) |
| `--grad` | `linear-gradient(90deg, var(--sunset-coral), var(--soft-violet))` | Active nav pill, buttons, `.metric::before` |

Fonts: body Inter/Poppins, display Pixelify Sans (+ local `Figma *` faces), mono Space Mono / Terminess, headings Montserrat 800, numerals Russo One.

---

## 3. State & data touchpoints (what the backend must own)

| Screen | Hard-coded today | Replace with |
| --- | --- | --- |
| Sign-in | Fake success + `sessionStorage["perkutut-auth"]` | `POST /api/auth/login`, HTTP-only cookie |
| Join | "Formulir siap dihubungkan…" message | `POST /api/auth/register` + server-side password rules |
| Dashboard sidebar | `A`, "Ari Dwi Saputra", "ACTIVE TEAM" | session user + active team |
| Profile metrics | `1 / 1`, `Verified`, `KRIPTOGRAFI` | `GET /api/me`, `GET /api/team` |
| Profile form | all six values | `GET`/`PATCH /api/me` |
| Upload cards | "Uploaded successfully", static jpgs | document list + signed URLs |
| Team card | `# AriHana2112`, leader, receipt | `GET /api/team` |
| Submission metrics | `2026-09-20`, `Overdue`, `0 / 3` | `GET /api/submission` |
| Problem files | two fake filenames, "Closed at 14:00 WIB" | problem-file list + window checks server-side |
| Tabs / closed box | static `PENDING`, static deadline text | per-item status from API |
| Home content | 8 competitions, 6 FAQs, team, sponsors | static template or `GET /api/content` |

Placeholders that must disappear before launch: `href="#whatsapp"` (self-link), `href="#problem-files"`, `data-view-upload` links pointing back to `#profile-form`, and the `href="https://instagram.com/"` generic link.

---

## 4. Editing rules for an agent

1. **Do not move `styles.css`** — local `@font-face` paths are root-relative.
2. **Do not add inline styles.** All dashboard inline styles were removed on purpose; add classes to `dashboard.css`.
3. **Append, don't rewrite** the legacy CSS blocks; later rules win.
4. **Keep relative paths**: pages in `about/`, `timeline/`, `sign-in/`, `join/` use `../`; dashboard pages use `../../`.
5. **Reuse the existing classes** listed in §2 before inventing new ones; new metric colors go through `.metric.is-*` with `--accent`.
6. **Language**: Indonesian for user-facing copy, English for code comments.
7. **Motion**: every new animation must have a `prefers-reduced-motion` counterpart (all three sheets already do this).
8. **Images**: always set intrinsic `width`/`height` on `<img>` (existing pattern) to avoid layout shift.
9. **Auth**: never remove `auth-guard.js` until the server redirect exists; when it does, delete both the guard and the `sessionStorage` write in `script.js:244-251`.
10. **Loading order** matters: `styles.css` → `auth-motion.css` (auth) / `dashboard.css` (dashboard) → `auth-guard.js` in `<head>` → `script.js` deferred.

---

## 5. Quick verification recipe

```bash
# from repo root
python3 -m http.server 8321
# then open
#   http://localhost:8321/            # landing
#   http://localhost:8321/about/      # policy
#   http://localhost:8321/timeline/   # placeholder
#   http://localhost:8321/sign-in/    # login -> dashboard
#   http://localhost:8321/join/       # register
#   http://localhost:8321/dashboard/profile/    # redirects to /404.html when not signed in
#   http://localhost:8321/dashboard/submission/
#   http://localhost:8321/404.html
```

Checks that already pass and must keep passing:

- All routes return 200, no broken `<img>`, no horizontal scroll at 1440 px and 390 px.
- `/dashboard/*` without `sessionStorage["perkutut-auth"]` → `/404.html`.
- Sign-in submit → `/dashboard/profile/`.
- `node --check script.js auth-guard.js`.
