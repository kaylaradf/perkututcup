# Perkutut Cup 2026 — Website

## 1. What is this about

Website kompetisi IT **Perkutut Cup 2026** (Politeknik Negeri Cilacap).
Halaman publik (landing, about, timeline, sign-in, join) + SPA dashboard
3 role (peserta, admin, juri) dengan backend FastAPI.

- **Frontend publik:** HTML + CSS + JS murni (tanpa framework/bundler).
- **Dashboard:** SPA shell `app/index.html` + router vanilla (`assets/js/router.js`),
  modul per halaman di `assets/js/pages/`. Library: SweetAlert2 (dialog/toast) dan
  Lucide (ikon), di-vendor lokal di `assets/js/vendor/`. zxcvbn untuk meter password.
- **Backend:** FastAPI + PostgreSQL, modular per fitur (`backend/app.py` entrypoint,
  `backend/core.py` helper bersama, `backend/routers/` per fitur), session cookie HttpOnly,
  CAPTCHA perkalian (HMAC), rate limiting, account lockout. Migrasi bernomor di
  `backend/migrations/` dijalankan otomatis saat startup.
- **Health check:** `GET /health` → `{"status":"ok"}`.
- **Deploy staging:** workflow GitHub Actions via Tailscale+SSH
  ([.github/workflows/staging-deploy.yml](.github/workflows/staging-deploy.yml))
  atau SCP/SSH langsung + `systemctl restart perkututcup`.
  Panduan: [`docs/STAGING-DEPLOY.md`](docs/STAGING-DEPLOY.md).

Menjalankan lokal:

```bash
cp .env.example .env   # isi PERKUTUT_DATABASE_URL, PERKUTUT_ALTCHA_HMAC_KEY, dll.
set -a && . ./.env && set +a
PYTHONPATH=backend .venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
# buka http://localhost:8000/
```

Konfigurasi env (lihat `.env.example`): `PERKUTUT_DATABASE_URL` (wajib),
`PERKUTUT_ALTCHA_HMAC_KEY` (wajib, kunci HMAC CAPTCHA), `PERKUTUT_WHATSAPP_URL`
(opasional; tombol "Join the WhatsApp Group" di dashboard hanya tampil bila diisi),
`PERKUTUT_UPLOAD_DIR` (opsional; default `uploads/`).

## 2. Tree project directory

```
perkututcup/
├── index.html                  # Landing page
├── 404.html                    # Not-found (path aset root-absolute; juga dipakai guard server)
├── styles.css                  # Stylesheet global halaman publik/auth
├── dashboard.css               # Stylesheet dashboard (sidebar, card, vdoc rows, swal, dll.)
├── auth-motion.css             # Animasi halaman auth
├── script.js                   # Interaksi halaman publik + auth (selector-guarded IIFE)
├── .env.example
├── .github/workflows/staging-deploy.yml
│
├── app/
│   └── index.html              # SPA shell dashboard; server inject __APP_STATE__ + cache-bust ?v=mtime
│
├── about/index.html            # Disclaimer / policy
├── timeline/index.html         # Coming soon
├── sign-in/index.html          # Login + CAPTCHA
├── join/index.html             # Registrasi + kebijakan password + CAPTCHA
│
├── assets/
│   ├── fonts/                  # 3 font lokal (Game Paused, I Pixel U, Terminess Mono)
│   ├── images/                 # Logo, maskot, tim, sponsor
│   ├── svg/                    # Ikon publik + auth; svg/dashboard/ untuk sidebar & metric
│   └── js/
│       ├── router.js           # SPA router + guard role client-side
│       ├── pages/
│       │   ├── dashboard-common.js        # Sidebar per role, tema, logout, wrapper Swal/Lucide
│       │   ├── dashboard-profile.js       # Peserta: profil, dokumen, tim
│       │   ├── dashboard-submission.js    # Peserta: kartu soal + unggah karya
│       │   ├── dashboard-verifications.js # Admin: antrean verifikasi berkas
│       │   ├── dashboard-competitions.js  # Admin: CRUD kompetisi + soal
│       │   ├── dashboard-users.js         # Admin: kelola pengguna/role
│       │   └── dashboard-jury.js          # Juri: penilaian karya
│       ├── vendor/             # sweetalert2.all.min.js, lucide.min.js (lokal, tanpa CDN)
│       └── zxcvbn.js           # Meter kekuatan password
│
├── backend/
│   ├── app.py                  # Entrypoint: FastAPI app, rate-limit handler, migrasi startup, wiring router
│   ├── core.py                 # Config/env, db(), limiter, password/captcha/session, helper bersama
│   ├── routers/
│   │   ├── auth.py             # Register/login/logout/session + CAPTCHA
│   │   ├── profile.py          # /api/me
│   │   ├── competitions.py     # Katalog, pendaftaran, admin CRUD kompetisi (+soal)
│   │   ├── teams.py            # Tim: join/member/leave/rename
│   │   ├── documents.py        # Upload dokumen peserta + verifikasi admin
│   │   ├── submissions.py      # Submisi karya peserta
│   │   ├── jury.py             # Penilaian juri + penugasan admin
│   │   ├── admin_users.py      # Manajemen pengguna admin
│   │   └── web.py              # SPA shell, guard role, static catch-all (include TERAKHIR)
│   ├── migrations/             # 0001..0005, auto-run saat startup (tabel schema_migrations)
│   └── requirements.txt
│
├── uploads/                    # (gitignored) berkas dokumen & submisi peserta
└── docs/                       # Lihat §5
```

## 3. Role & halaman dashboard

Sidebar dirender per role oleh `dashboard-common.js`; guard ganda:
server (redirect/404 di `routers/web.py`) + client (`router.js`).

| Role | Tab | Landing setelah login |
| --- | --- | --- |
| `user` (peserta) | PROFILE & TEAM, PROJECT SUBMISSION | `/dashboard/profile/` |
| `admin` | VERIFIKASI BERKAS, KELOLA KOMPETISI, KELOLA PENGGUNA | `/dashboard/verifications/` |
| `jury` | PENILAIAN KARYA | `/dashboard/jury/` |

Tidak ada role `committee` (dihapus di migrasi 0005).

### Superkutut (superadmin)

Satu login dengan SEMUA privilege role, plus live audit log seluruh aktivitas.

- Login: `/mampir-dulu-loh-mas/loh-ya-boleh-wong-ditawari-kok/`
  (username + kata sandi + captcha perkalian + **TOTP 6 digit**).
- Dashboard: `/mampir-dulu-loh-mas/cok-gateli/` — live log SSE (filter kategori/
  outcome/pencarian, jeda, export CSV), stats 24 jam, dan akses penuh ke semua
  halaman dashboard lain dari sidebar yang sama.
- Kredensial **murni env** (tidak di DB, tidak bisa dibuat via Kelola Pengguna):
  `PERKUTUT_SUPERADMIN_USER`, `PERKUTUT_SUPERADMIN_PASSWORD`,
  `PERKUTUT_SUPERADMIN_TOTP_SECRET` (base32 A-Z2-7, kelipatan 8, min 16 char;
  contoh mudah diingat: `GILAKAMUKAMUYANGGILAAKUSALAHAPA` (padding base32 ditambah otomatis) — masukkan
  manual/QR di https://totp.danhersam.com/#/ lalu scan ke authenticator).
  TOTP kosong = login super ditolak (fail-closed). Ganti semua nilai via `.env`.
- Session cookie terpisah `perkutut_super_session` (HttpOnly, SameSite=Strict,
  8 jam); tanpa session super, seluruh path `mampir-dulu-loh-mas` = 404.
- Audit: tabel `audit_logs` (migrasi 0006) — middleware mencatat semua request
  API; event auth lengkap (login gagal + alasan, lockout); detail value-level
  (before/after) di setiap mutasi. Retensi `PERKUTUT_AUDIT_RETENTION_DAYS`
  (default 180) via `POST /api/superkutut/logs/purge`. Aksi superadmin diaudit
  fail-closed. Password/hash/token tidak pernah masuk log.

Alur inti:

1. Daftar (`/join/`) / masuk (`/sign-in/`) dengan CAPTCHA → session cookie HttpOnly.
2. Peserta: lengkapi profil + unggah KTM/pasfoto/twibbon per anggota + bukti bayar
   (ketua tim) → admin verifikasi per berkas (setujui/tolak dengan catatan Swal).
3. Tim berstatus VERIFIED → tab submission terbuka: kartu **SOAL KOMPETISI**
   (diisi admin via Kelola Kompetisi → field "Soal / Problem Statement") + unggah
   karya (maks 50MB) → auto-assign round-robin ke 1 juri.
4. Juri menilai (skor + feedback) → hasil tampil di halaman submission peserta.

Kredensial default staging ada di `backend/migrations/0004_default_credentials.sql`
(admin/juri/peserta `@perkutut.web.id`) — ganti sebelum produksi.

## 4. Catatan teknis

- **Cache Cloudflare:** edge men-cache `/assets` 4 jam. Shell SPA men-cache-bust
  URL JS/CSS dengan `?v=<mtime>` agar deploy langsung terlihat tanpa purge.
- **404:** `404.html` memakai path root-absolute karena file yang sama disajikan
  sebagai respons guard di URL dashboard (tanpa session → 404).
- **Dialog:** semua konfirmasi/alert dashboard memakai SweetAlert2 via
  `DashCommon.alertMsg/toast/confirmMsg` (tema mengikuti token dashboard).
- **Migrasi:** hanya tambah file `NNNN_nama.sql` berikutnya; jangan edit yang
  sudah diterapkan. Migrasi harus backward-compatible (rollback kode tidak
  membalik skema).
- **Upload:** disimpan di `uploads/` (di luar git), disajikan lewat
  `/api/documents/{id}/file` dengan cek kepemilikan/role, bukan path publik.

## 5. Docs

| File | Isi |
| --- | --- |
| `docs/UPDATES.md` | Changelog update mayor |
| `docs/BUSINESS-LOGIC.md` | Aturan bisnis 3 role, verifikasi, penilaian |
| `docs/ASSESSMENT.md` | Asesmen & kontrak backend |
| `docs/FRONTEND.md` | Dokumentasi frontend |
| `docs/AUTH-UPDATES.md` | Auth/password/CAPTCHA |
| `docs/ACCOUNT-LOCKOUT.md` | Lockout & pelaporan error |
| `docs/RATE-LIMITING.md` | Rate limiting |
| `docs/COMPETITIONS-REGISTRATION.md` | Kompetisi & pendaftaran |
| `docs/ADMIN-CMS-USERS.md` | Manajemen pengguna admin |
| `docs/STAGING-DEPLOY.md` | Konfigurasi deploy staging (GitHub Actions) |
| `docs/DEPLOY-PIPELINE.md` | Mekanisme deploy lengkap (CI + manual, runbook) |
| `docs/Infra/` | Catatan infrastruktur server |
