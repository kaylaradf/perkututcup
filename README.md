# Perkutut Cup 2026 — Website

## 1. What is this about

Website kompetisi IT **Perkutut Cup 2026** (Politeknik Negeri Cilacap).
Berisi halaman publik (landing, about, timeline, sign-in, join) dan dashboard
(profil/tim, submission) dengan backend autentikasi.

- **Frontend:** HTML + CSS + JavaScript murni (tanpa framework/bundler). Path aset relatif.
- **Backend:** FastAPI + PostgreSQL (`backend/app.py`), session cookie HttpOnly, CAPTCHA perkalian (HMAC), rate limiting, account lockout. Migrasi: `backend/migrations/0001_initial_schema.sql`.
- **Health check:** `GET /health` → `{"status":"ok"}`.
- **Deploy staging:** workflow GitHub Actions via Tailscale+SSH ([.github/workflows/staging-deploy.yml](.github/workflows/staging-deploy.yml), butuh GitHub Secrets) atau deploy langsung SCP/SSH. Panduan: [`docs/STAGING-DEPLOY.md`](docs/STAGING-DEPLOY.md).

Menjalankan lokal (env backend terpasang):

```bash
cd ~/perkututcup
set -a && . ./.env && set +a
.venv/bin/uvicorn backend.app:app --host 0.0.0.0 --port 8000
# buka http://localhost:8000/
```

## 2. Tree project directory

```
perkututcup/
├── index.html                  # Landing page
├── 404.html                    # Halaman not-found
├── styles.css                  # Stylesheet global semua halaman
├── dashboard.css               # Stylesheet khusus dashboard
├── auth-motion.css             # Animasi halaman auth (sign-in, join)
├── script.js                   # Semua interaksi frontend
├── .github/workflows/          # staging-deploy.yml
├── backend/
│   ├── app.py                  # FastAPI: auth/session/CAPTCHA/health
│   └── migrations/0001_initial_schema.sql
├── .gitignore
├── README.md
│
├── about/
│   └── index.html              # Disclaimer / policy
├── timeline/
│   └── index.html              # Placeholder "Coming Soon"
├── sign-in/
│   └── index.html              # Login
├── join/
│   └── index.html              # Registrasi
│
├── dashboard/
│   ├── profile/
│   │   └── index.html          # Profile & Team
│   └── submission/
│       └── index.html          # Project Submission
│
├── assets/
│   ├── fonts/                  # 3 font lokal (Game Paused, I Pixel U, Terminess Mono)
│   ├── images/
│   │   ├── logo-navbar-final.png, mascot-figma.png, team-photo.png,
│   │   ├── sponsor-final-1..6.png
│   │   └── dashboard/          # Thumbnail upload + avatar tim
│   └── svg/
│       ├── favicon.svg, mascot-halo.svg, sparkle*.svg, chevron-down.svg
│       ├── arrow-up-right.svg, icon-*.svg
│       └── dashboard/          # 26 ikon sidebar, metric, watermark
│
└── docs/
    ├── UPDATES.md              # Changelog update mayor
    ├── ASSESSMENT.md           # Asesmen & kontrak backend
    ├── FRONTEND.md             # Dokumentasi frontend
    ├── AUTH-UPDATES.md         # Auth/password/CAPTCHA
    ├── ACCOUNT-LOCKOUT.md      # Lockout & pelaporan error
    ├── RATE-LIMITING.md        # Rate limiting
    └── STAGING-DEPLOY.md       # Deploy staging
```

## 3. Penjelasan file

### Halaman HTML

| File | Isi |
| --- | --- |
| `index.html` | Landing: hero `#home`, tema `#theme-introduction`, langkah daftar `#get-started`, tim, 8 kartu kompetisi `#competition`, FAQ `#faq`, footer. |
| `about/index.html` | Teks disclaimer dalam `.policy-stage`. Tidak ada data dinamis. |
| `timeline/index.html` | Placeholder berisi `.coming-soon-title`. |
| `sign-in/index.html` | Form login `[data-auth-form="sign-in"]`. Submit memanggil API auth; CAPTCHA diperlukan; redirect ke dashboard saat sukses. |
| `join/index.html` | Form registrasi `[data-auth-form="join"]` dengan kebijakan password + meter + CAPTCHA; redirect ke dashboard saat sukses. |
| `dashboard/profile/index.html` | Figma `308:2`. Sidebar, 3 metric, form data pribadi, 4 kartu upload, kartu My Team + bukti pembayaran. |
| `dashboard/submission/index.html` | Figma `308:255`. Metric deadline, guide, deskripsi kompetisi, problem files, tab pengumpulan. |
| `404.html` | Halaman not-found (judul "404" + subtitle). |

### CSS

| File | Isi |
| --- | --- |
| `styles.css` | Stylesheet global (token `:root`, layout komponen publik/auth, dekor, responsive). **Jangan dipindah** — path font relatif ke root. |
| `dashboard.css` | Khusus dashboard (sidebar, metric, card, form, upload, team, submission). Dimuat setelah `styles.css`. |
| `auth-motion.css` | Animasi halaman auth (sign-in, join). |

Token utama (`styles.css` `:root`): `--obsidian-top`, `--mid`, `--deep-footer`,
`--sunset-coral`, `--soft-violet`, `--cream`, `--lavender`, `--card`, `--grad`.

### JavaScript & Backend

| File | Isi |
| --- | --- |
| `script.js` | Satu IIFE (selector-guarded). UI publik + auth: validasi inline, submit ke API, CAPTCHA load/refresh (reset tiap gagal), dialog error (`showAuthError`), interaksi dashboard. |
| `auth-guard.js` | Legacy guard client-side (jika masih dimuat). Akses dashboard seharusnya dikendalikan session server. |
| `backend/app.py` | FastAPI: auth/session, CAPTCHA, rate limiting, lockout, profil/tim, `/health`. |

### Assets & Docs

- `assets/fonts/` — 3 font lokal. `assets/images/` — logo/maskot/sponsor/tim + thumbnail dashboard. `assets/svg/` — ikon publik dan dashboard.
- `docs/` — changelog (`UPDATES.md`), asesmen/kontrak (`ASSESSMENT.md`), frontend (`FRONTEND.md`), auth/CAPTCHA (`AUTH-UPDATES.md`), lockout/error (`ACCOUNT-LOCKOUT.md`), rate limit (`RATE-LIMITING.md`), deploy staging (`STAGING-DEPLOY.md`).

## 4. Struktur web

```
Perkutut Cup 2026
│
├── Publik
│   ├── /                    Landing
│   ├── /about/              Disclaimer
│   ├── /timeline/           Coming soon
│   ├── /join/               Registrasi
│   └── /404.html            Not found
│
├── Auth (FastAPI)
│   ├── /sign-in/  ──────►  login + CAPTCHA → session → /dashboard/profile/
│   └── /join/     ──────►  register + CAPTCHA → session → /dashboard/profile/
│
└── User Portal (session server)
    ├── /dashboard/profile/      Profile & Team
    └── /dashboard/submission/   Project Submission
```

Alur ringkas:

1. User daftar (`/join/`) atau masuk (`/sign-in/`) dengan CAPTCHA.
2. Backend memvalidasi (kebijakan password/rate limit/lockout) dan membuat session cookie HttpOnly.
3. Dashboard memakai session server; logout menghapus session.
4. Error auth: validasi/CAPTCHA tertentu inline, kredensial/lockout/rate limit via dialog. CAPTCHA di-reset tiap percobaan gagal.

Aset: publik `styles.css` → `script.js`; auth tambah `auth-motion.css`; dashboard `styles.css` → `dashboard.css` → `script.js` (+ guard client-side bila masih ada).

## 5. Todolist

**Backend & auth**

- [x] Endpoint auth inti: login/register/logout/session (`backend/app.py`, kontrak `docs/ASSESSMENT.md`).
- [x] Session cookie HttpOnly + CAPTCHA/rate limiting/account lockout.
- [x] `GET /health` untuk pemeriksaan layanan.
- [ ] Guard dashboard sepenuhnya server-side pada semua route sensitif + hapus `auth-guard.js` bila sudah tidak dipakai.
- [ ] Alur reset password self-service (saat ini via admin).

**Dashboard & submission**

- [ ] `GET /api/me` + `PATCH /api/me` dan `GET /api/team` terhubung penuh ke UI/data nyata.
- [ ] Upload dokumen: multipart ke object storage, signed URL untuk preview.
- [ ] `GET /api/submission`, download problem file dengan validasi window server-side.
- [ ] Isi konten tab per item (saat ini panel dapat dipakai bersama).

**Deploy & kualitas**

- [ ] Aktifkan CI/CD staging: set GitHub Secrets (Tailscale/SSH) atau pasang service persisten di server; lihat [`docs/STAGING-DEPLOY.md`](docs/STAGING-DEPLOY.md).
- [ ] Ganti link placeholder: `#whatsapp`, `#problem-files`, `data-view-upload`, `https://instagram.com/`.
- [ ] Samakan bahasa copy (campur ID/EN), tambah meta description/Open Graph.
- [ ] Kompres aset (font/gambar → WebP/AVIF/subset), rapikan duplikasi CSS, ekstrak sidebar dashboard.
- [ ] Validasi HTML + Lighthouse CI. Pastikan 404 konsisten di server/reverse proxy.
