# 📋 UPDATES — Index Semua Update Proyek

> Daftar isi seluruh update yang pernah dilakukan. Setiap entri mengarah
> ke detail update-nya (dokumen di `docs/` atau commit di riwayat git).
> Update baru: tambah entri di tabel + tulis detail di bagian bawah dokumen ini.

---

## Daftar Isi Update

| # | Tanggal | Update | Detail |
|---|---------|--------|--------|
| 1 | 2026-10-21 | Asesmen baseline situs statis | [`ASSESSMENT.md`](docs/ASSESSMENT.md) |
| 2 | 2026-10-21 | Dokumentasi frontend | [`FRONTEND.md`](docs/FRONTEND.md) |
| 3 | 2026-10-21 | Diagram infrastruktur awal | [`Infra/Infra.txt`](docs/Infra/Infra.txt) |
| 4 | 2026-11-05 | Infra: IP VM + DNS server | [`Infra/Infra.txt`](docs/Infra/Infra.txt) · [`Infra/dns-server.txt`](docs/Infra/dns-server.txt) |
| 5 | 2026-11-05 | Backend + database PostgreSQL (login & register) | [Detail #5](#5-backend--database-postgresql) |
| 6 | 2026-11-05 | Form login/register terhubung ke API asli | [Detail #6](#6-form-loginregister-terhubung-ke-api-asli) |
| 7 | 2026-11-05 | Server-side dashboard guard (pengganti auth-guard.js) | [Detail #7](#7-server-side-dashboard-guard) |
| 8 | 2026-11-05 | Dashboard ditarik dari API (profil & tim) | [Detail #8](#8-dashboard-ditarik-dari-api) |
| 9 | 2026-11-05 | Session management: cookie HttpOnly (bukan JWT) | [Detail #9](#9-session-management) |
| 10 | 2026-11-05 | Redirect halaman auth kalau sudah login | [Detail #10](#10-redirect-halaman-auth) |
| 11 | 2026-11-05 | Password policy baru (NIST-style) | [Detail #11](#11-password-policy-baru) · [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#kebijakan-password-baru) |
| 12 | 2026-11-05 | Floating password strength meter | [Detail #12](#12-floating-password-strength-meter) · [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#password-strength-meter) |
| 13 | 2026-11-05 | CAPTCHA perkalian (pengganti ALTCHA) | [Detail #13](#13-captcha-perkalian) · [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#captcha-perkalian) |
| 14 | 2026-11-05 | Lupa password → lapor admin | [Detail #14](#14-lupa-password) · [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#lupa-password) |
| 15 | 2026-11-05 | Perbaikan tampilan captcha | [Detail #15](#15-perbaikan-tampilan-captcha) |

> Link `docs/` mengarah ke dokumen spesifik; link `Detail #n` mengarah ke
> ringkasan di bawah. Commit SHA ada di tiap detail.

---

## Detail Update

### 5. Backend + Database PostgreSQL

**Tanggal:** 2026-11-05 · **Commit:** `1daf95a`

- PostgreSQL 16 di server, database `perkututcup`, user aplikasi khusus `perkutut_app` (scram-sha-256).
- PostgreSQL listen `0.0.0.0:5432` agar bisa diakses dari luar.
- FastAPI + psycopg 3 + bcrypt di `backend/app.py`.
- Endpoint: register, login, logout, session.
- Kredensial via `.env` (tidak di-hardcode), `.env.example` sebagai template.

### 6. Form Login/Register Terhubung ke API Asli

**Tanggal:** 2026-11-05 · **Commit:** `3529cd6`

- `script.js` submit → `fetch` ke `POST /api/auth/register` / `login`.
- Pesan error spesifik per kasus: 422 (validasi), 409 (email duplikat), 401 (kredensial salah), server mati.
- Tombol disable saat proses submit.
- Logout di dashboard terhubung ke `POST /api/auth/logout`.

### 7. Server-side Dashboard Guard

**Tanggal:** 2026-11-05 · **Commit:** `e9b5ffd`

- `auth-guard.js` (client-side, bisa dibobol via console) dihapus.
- `/dashboard/*` tanpa session valid → server balas `404.html` (dashboard "tersembunyi").
- Header `Cache-Control: no-store` agar keputusan login/logout selalu fresh.

### 8. Dashboard Ditarik dari API

**Tanggal:** 2026-11-05 · **Commit:** via `git log --oneline` (bagian commit awal backend)

- `GET /api/me` — profil lengkap (nama, institusi, email, phone, tanggal lahir, instagram).
- `PATCH /api/me` — edit profil (validasi tanggal, email duplikat → 409).
- `GET /api/team` — tim (kode, track, status pembayaran, role, anggota).
- Dashboard `profile/` menampilkan data via data-hook; field kosong → placeholder.
- Edit profil tersimpan ke DB dan persisten setelah reload.

### 9. Session Management

**Tanggal:** 2026-11-05 · **Commit:** bagian `1daf95a` + `e9b5ffd`

- Opaque session token (bukan JWT — bisa di-revoke, sesuai kontrak ASSESSMENT.md §5.1).
- Token 32-byte acak; hash SHA-256 disimpan di tabel `sessions` (TTL 24 jam).
- Cookie `perkutut_session`: HttpOnly, SameSite=Lax, `Secure` via env `PERKUTUT_COOKIE_SECURE`.
- Logout menghapus baris DB → akses benar-benar putus.
- JS tidak pernah membaca token.

### 10. Redirect Halaman Auth

**Tanggal:** 2026-11-05 · **Commit:** bagian `e9b5ffd`

- `/sign-in/` & `/join/` dengan session valid → 303 ke `/dashboard/profile/`.
- Tidak ada lagi "sudah login tapi diarahkan ke form lagi".

### 11. Password Policy Baru

**Tanggal:** 2026-11-05 · **Commit:** `b15cf6b` · **Dokumen:** [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#kebijakan-password-baru)

- Min 15, maks 64 karakter; tanpa kewajiban kombinasi.
- Denylist password umum via zxcvbn (score >= 3).
- Terima printable ASCII + spasi + Unicode; tanpa rotasi berkala.
- Gagal → 422 dengan daftar rule yang dilanggar.

### 12. Floating Password Strength Meter

**Tanggal:** 2026-11-05 · **Commit:** `9dc754b`, `0a6ab67` · **Dokumen:** [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#password-strength-meter)

- Meter expand inline saat mengetik — tidak lagi menutupi field lain.
- Bar berwarna + label skor ("Sangat lemah" → "Sangat kuat") + sisa karakter.
- Checklist rule real-time; zxcvbn self-hosted di `assets/js/zxcvbn.js`.

### 13. CAPTCHA Perkalian

**Tanggal:** 2026-11-05 · **Commit:** `2fa6290` · **Dokumen:** [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#captcha-perkalian)

- ALTCHA (proof-of-work) dihapus — terlalu kompleks.
- `GET /api/auth/captcha`: soal "Berapa hasil dari a × b?" (a,b = 2–10).
- Stateless HMAC-signed token, TTL 10 menit, anti-tamper & anti-replay.
- Terpasang di login DAN register; jawaban salah → soal baru otomatis.

### 14. Lupa Password

**Tanggal:** 2026-11-05 · **Commit:** `b15cf6b` · **Dokumen:** [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#lupa-password)

- Klik "Lupa kata sandi?" → pesan: *"Silakan lapor admin untuk reset."*
- Endpoint `POST /api/auth/forgot-password` tersedia (kontrak §5.1), tanpa reset mandiri.

### 15. Perbaikan Tampilan Captcha

**Tanggal:** 2026-11-05 · **Commit:** `826319b`

- Soal dalam kotak dashed rapi (bukan teks mentah).
- Tombol refresh ↻ di dalam field jawaban (kanan), tidak jatuh sendiri.
- Gagal muat → pesan error merah + instruksi retry.

---

### Cara Menambah Update Baru

1. Lakukan perubahan + commit per-perubahan (agar flow terlacak).
2. Tambah baris di tabel Daftar Isi Update dengan nomor berikutnya + tanggal.
3. Tulis ringkasan detail di bagian "Detail Update" dengan anchor `#n-slug-ringkas`.
4. Kalau perlu dokumen panjang, buat file di `docs/` dan link dari dua-duanya.
5. Perbarui juga tabel linetime di [`AUTH-UPDATES.md`](docs/AUTH-UPDATES.md#linetime-dokumentasi-urut-tanggal) jika menambah dokumen baru.
