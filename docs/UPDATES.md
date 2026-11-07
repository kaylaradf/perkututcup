# Perkutut Cup 2026 — Changelog

Rekap seluruh update mayor proyek. Setiap entri merujuk ke dokumen detail
di `docs/` dan/atau rentang commit terkait. Perubahan minor tidak dicatat
di sini — lihat `git log` untuk riwayat lengkap.

## Konvensi

- Entri hanya untuk **update mayor** (fitur baru, perubahan arsitektur, perbaikan signifikan).
- Satu entri boleh menggabungkan beberapa commit yang membentuk satu deliverable.
- Detail teknis lengkap ditempatkan di dokumen terpisah di bawah `docs/`; entri di sini berfungsi sebagai indeks.

## Index Update

| Versi | Tanggal | Update | Dokumen | Referensi Commit |
|-------|---------|--------|---------|------------------|
| v1.0 | 2026-10-21 | Asesmen baseline situs statis & kontrak backend | [`docs/ASSESSMENT.md`](ASSESSMENT.md) | `056c00e` |
| v1.1 | 2026-10-21 | Dokumentasi frontend & diagram infrastruktur | [`docs/FRONTEND.md`](FRONTEND.md) · [`docs/Infra/`](Infra/) | `5d2520f`, `f75ef73` |
| v2.0 | 2026-11-05 | Backend autentikasi: PostgreSQL, session, guard dashboard, integrasi API | [`docs/AUTH-UPDATES.md`](AUTH-UPDATES.md) | `1daf95a`..`e9b5ffd` |
| v2.1 | 2026-11-05 | Hardening auth: kebijakan password NIST-style, password meter, CAPTCHA perkalian | [`docs/AUTH-UPDATES.md`](AUTH-UPDATES.md) | `b15cf6b`..`826319b` |
| v2.2 | 2026-11-05 | Hardening input: whitelist kolom UPDATE & rate limiting anti brute-force | [`docs/RATE-LIMITING.md`](RATE-LIMITING.md) | `7440b2c`, `2770d0e` |
| v2.3 | 2026-11-07 | Account lockout (5x salah sandi) & popup error custom | [`docs/ACCOUNT-LOCKOUT.md`](ACCOUNT-LOCKOUT.md) | `7713c53` |
| v2.4 | 2026-11-07 | UX auth (validasi inline + dialog dirapikan), CAPTCHA reset tiap gagal, `/health`, workflow staging | [`docs/ACCOUNT-LOCKOUT.md`](ACCOUNT-LOCKOUT.md) · [`docs/STAGING-DEPLOY.md`](STAGING-DEPLOY.md) | `336e3ec`, working tree |
| v2.5 | 2026-11-08 | Master kompetisi (INDIVIDUAL/TEAM), role user, endpoint pendaftaran terikat slug & anti-duplikasi, integrasi join | [`docs/COMPETITIONS-REGISTRATION.md`](COMPETITIONS-REGISTRATION.md) | working tree |
| v2.6 | 2026-11-08 | Admin kompetisi, manajemen kuota anggota, dan alur tim end-to-end (join code, add/remove member, leave) | [`docs/COMPETITIONS-REGISTRATION.md`](COMPETITIONS-REGISTRATION.md) | working tree |

## Detail

### v2.0 — Backend Autentikasi (2026-11-05)

Implementasi backend fungsional untuk fitur login & register sesuai kontrak
`docs/ASSESSMENT.md` §5.1. Commit: `1daf95a`, `3529cd6`, `e9b5ffd`.

- PostgreSQL 16 + FastAPI; endpoint register, login, logout, session.
- Opaque session token di cookie HttpOnly (bukan JWT) — dapat di-revoke server-side.
- Dashboard guard server-side menggantikan `auth-guard.js`.
- Dashboard mengambil data profil & tim dari API (`GET/PATCH /api/me`, `GET /api/team`).
- Halaman auth me-redirect ke dashboard bila session aktif.

### v2.1 — Hardening Autentikasi (2026-11-05)

Penguatan keamanan alur autentikasi. Commit: `b15cf6b`..`826319b`.
Detail lengkap di [`docs/AUTH-UPDATES.md`](AUTH-UPDATES.md).

- Kebijakan password bergaya NIST SP 800-63B: panjang 15–64 karakter, tanpa
  kewajiban kombinasi, pemeriksaan password umum via zxcvbn, dukungan Unicode.
- Password strength meter interaktif pada form pendaftaran.
- CAPTCHA perkalian (HMAC-signed, stateless) pada login & register.
- Alur pemulihan kata sandi melalui admin.

### v2.2 — Hardening Input & Rate Limiting (2026-11-05)

Penguatan permukaan input terhadap CWE-89/CWE-20 dan brute-force.
Commit: `7440b2c`, `2770d0e`. Detail lengkap di [`docs/RATE-LIMITING.md`](RATE-LIMITING.md).

- Whitelist eksplisit kolom pada `PATCH /api/me` (defense-in-depth di atas
  prepared statement psycopg yang sudah dipakai di seluruh query).
- Rate limiting per IP via slowapi: captcha 10/menit, register 5/menit,
  login 10/menit; pelanggaran → 429 + header `Retry-After`.
- Petunjuk migrasi ke storage Redis untuk skala multi-worker.

### v2.3 — Account Lockout & Popup Error (2026-11-07)

Kebijakan penguncian akun dan perbaikan UX pelaporan error.
Commit: `7713c53`. Detail lengkap di [`docs/ACCOUNT-LOCKOUT.md`](ACCOUNT-LOCKOUT.md).

- Akun terkunci otomatis setelah 5 kali gagal login (HTTP 423);
  pembukaan hanya melalui admin, tanpa reset mandiri.
- Counter kegagalan di-reset saat login berhasil.
- Error kredensial, lockout, dan rate limit tampil sebagai dialog modal;
  pola diperhalus pada v2.4 (validasi/CAPTCHA tertentu menjadi inline).

### v2.4 — UX Auth, CAPTCHA Refresh & Deploy Staging (2026-11-07)

Perbaikan pengalaman error autentikasi dan persiapan deploy staging.
Commit: `336e3ec` (+ perubahan kerja: refresh CAPTCHA pada semua kegagalan).

- **Validasi inline:** kesalahan format/field (`422`) dan email terdaftar (`409`) ditampilkan di bawah field terkait; submit diblok bila validasi client gagal.
- **CAPTCHA:** jawaban salah/kedaluwarsa (`400`, `detail.captcha`) tampil inline. CAPTCHA **dimuat ulang dan jawaban dikosongkan** setelah setiap percobaan gagal (422/400/401/409/423/429/error server/jaringan) agar token/soal lama tidak dipakai ulang.
- **Dialog modal:** kegagalan kredensial (`401`), lockout (`423`), dan rate limit (`429`) tetap memakai dialog, dengan tampilan dirapikan.
- **Health check:** `GET /health` → `{"status":"ok"}`.
- **Staging deploy:** workflow [`.github/workflows/staging-deploy.yml`](../.github/workflows/staging-deploy.yml) (Tailscale+SSH, release dir + rollback) dan panduan [`docs/STAGING-DEPLOY.md`](STAGING-DEPLOY.md). Deploy langsung SCP/SSH dapat dipakai bila secrets GitHub Actions belum tersedia.

### v2.5 — Master Kompetisi & Integrasi Pendaftaran (2026-11-08)

Fondasi data master kompetisi, peran akun, endpoint pendaftaran, dan integrasi pendaftaran dari beranda ke formulir pendaftaran. Detail lengkap di [`docs/COMPETITIONS-REGISTRATION.md`](COMPETITIONS-REGISTRATION.md).

- **Migrasi DB (`0002_competitions_and_roles.sql`):** tabel master `competitions` (dukungan `INDIVIDUAL`/`TEAM`, min/max anggota tim, status/periode registrasi), penambahan kolom `users.role` (default `'user'`), relasi `teams.competition_id` dan `team_members.competition_id`, serta index unik anti duplikasi pendaftaran per kompetisi. Data tim lama otomatis di-backfill.
- **Endpoint Kompetisi:** `GET /api/competitions` dan `GET /api/competitions/{slug}` untuk daftar dan detail kompetisi aktif.
- **Endpoint Registrasi Terikat Slug & Anti Duplikasi:**
  - `POST /api/competitions/{slug}/register`: mendaftarkan user/tim ke kompetisi tertentu dengan validasi status/waktu dan pencegahan duplikasi (409 Conflict).
  - `POST /api/auth/register`: diperluas dengan field `competition` (slug) untuk mengikat akun baru ke kompetisi yang dipilih secara atomik.
- **Integrasi Frontend:**
  - `index.html`: kartu kompetisi Kriptografi diarahkan ke `join/?competition=kriptografi`, navigasi global tetap `join/`.
  - `join/index.html`: penambahan field seleksi kompetisi dan kartu preview kompetisi terpilih.
  - `script.js`: pemuatan kompetisi aktif, seleksi otomatis dari URL, validasi formulir dan pengiriman slug kompetisi ke API backend.
- **Keamanan & Kompatibilitas:** Mempertahankan seluruh mekanisme session, CAPTCHA, dan rate limit yang ada. Tidak memberikan privilege admin otomatis ke publik. Skema basis data sepenuhnya backward-compatible.

### v2.6 — Admin Kompetisi & Manajemen Tim End-to-End (2026-11-08)

Penyelesaian fitur administrasi kompetisi berbasis RBAC server-side, manajemen anggota tim, dan penegakan kuota partisipasi secara menyeluruh. Detail di [`docs/COMPETITIONS-REGISTRATION.md`](COMPETITIONS-REGISTRATION.md).

- **Admin Portal Kompetisi (`dashboard/competitions/index.html`):** antarmuka visual khusus admin untuk mengelola cabang kompetisi, mengubah status (`OPEN`/`UPCOMING`/`CLOSED`), menetapkan jenis partisipasi (`INDIVIDUAL` vs `TEAM`), mengatur kuota anggota (`min_team_members` dan `max_team_members`), serta menentukan rentang tanggal registrasi.
- **RBAC Server-side & Endpoint Admin:**
  - `GET /api/admin/competitions`: daftar kompetisi dan statistik real-time (jumlah tim dan peserta terdaftar).
  - `POST /api/admin/competitions`: penambahan cabang kompetisi baru dengan validasi integritas aturan.
  - `GET /api/admin/competitions/{id_or_slug}` & `PATCH /api/admin/competitions/{id_or_slug}`: konfigurasi dinamis kompetisi tanpa perlu migrasi ulang basis data.
- **Alur Manajemen Tim Peserta (`/api/team/*`):**
  - `POST /api/team/join`: peserta dapat bergabung ke tim menggunakan kode tim (`PC26-XXXX`). Server memvalidasi kuota maksimal, status kompetisi terbuka, serta membatasi kompetisi bertipe individu.
  - `POST /api/team/members`: ketua tim dapat mengundang/menambahkan anggota berdasarkan email terdaftar dengan validasi anti-duplikasi lintas tim pada cabang yang sama.
  - `DELETE /api/team/members/{user_id}`: ketua tim dapat mengeluarkan anggota tim selama masa registrasi terbuka.
  - `POST /api/team/leave`: anggota dapat meninggalkan tim, atau ketua dapat membubarkan tim solo secara aman.
  - `PATCH /api/team`: ketua tim dapat memperbarui nama tim.
- **Integrasi UI Dashboard:** Kartu *MY TEAM* pada `dashboard/profile/index.html` kini interaktif: tombol salin kode tim, indikator kuota, badge jenis kompetisi, formulir tambah anggota via email, formulir gabung tim dengan kode, dan aksi hapus/keluar tim. Menu *MANAGE COMPETITIONS* otomatis terbuka untuk pengguna dengan role `'admin'`.
- **Kompatibilitas:** Tidak mengubah kontrak awal; seluruh endpoint dan skema v1/v2 tetap aman dan berjalan normal.
