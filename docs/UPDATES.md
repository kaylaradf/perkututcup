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
| v1.0 | 2026-10-21 | Asesmen baseline situs statis & kontrak backend | [`docs/ASSESSMENT.md`](docs/ASSESSMENT.md) | `056c00e` |
| v1.1 | 2026-10-21 | Dokumentasi frontend & diagram infrastruktur | [`docs/FRONTEND.md`](docs/FRONTEND.md) · [`docs/Infra/`](docs/Infra/) | `5d2520f`, `f75ef73` |
| v2.0 | 2026-11-05 | Backend autentikasi: PostgreSQL, session, guard dashboard, integrasi API | [`docs/AUTH-UPDATES.md`](docs/AUTH-UPDATES.md) | `1daf95a`..`e9b5ffd` |
| v2.1 | 2026-11-05 | Hardening auth: kebijakan password NIST-style, password meter, CAPTCHA perkalian | [`docs/AUTH-UPDATES.md`](docs/AUTH-UPDATES.md) | `b15cf6b`..`826319b` |
| v2.2 | 2026-11-05 | Hardening input: whitelist kolom UPDATE & rate limiting anti brute-force | [`docs/RATE-LIMITING.md`](docs/RATE-LIMITING.md) | `7440b2c`, `2770d0e` |

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
Detail lengkap di [`docs/AUTH-UPDATES.md`](docs/AUTH-UPDATES.md).

- Kebijakan password bergaya NIST SP 800-63B: panjang 15–64 karakter, tanpa
  kewajiban kombinasi, pemeriksaan password umum via zxcvbn, dukungan Unicode.
- Password strength meter interaktif pada form pendaftaran.
- CAPTCHA perkalian (HMAC-signed, stateless) pada login & register.
- Alur pemulihan kata sandi melalui admin.

### v2.2 — Hardening Input & Rate Limiting (2026-11-05)

Penguatan permukaan input terhadap CWE-89/CWE-20 dan brute-force.
Commit: `7440b2c`, `2770d0e`. Detail lengkap di [`docs/RATE-LIMITING.md`](docs/RATE-LIMITING.md).

- Whitelist eksplisit kolom pada `PATCH /api/me` (defense-in-depth di atas
  prepared statement psycopg yang sudah dipakai di seluruh query).
- Rate limiting per IP via slowapi: captcha 10/menit, register 5/menit,
  login 10/menit; pelanggaran → 429 + header `Retry-After`.
- Petunjuk migrasi ke storage Redis untuk skala multi-worker.
