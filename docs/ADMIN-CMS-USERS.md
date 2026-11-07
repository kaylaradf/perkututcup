# Admin CMS & User Management

Dokumen operasional untuk fitur admin yang ditambahkan: CMS kompetisi (termasuk hapus aman), manajemen pengguna, dan seed admin awal.

## RBAC
- Semua endpoint `/api/admin/*` memerlukan sesi login dengan `users.role = 'admin'` (`require_admin`).
- Respons gagal: `401` tanpa sesi, `403` bukan admin.

## Admin Kompetisi
- `GET /api/admin/competitions` — daftar kompetisi + statistik.
- `POST /api/admin/competitions` — tambah kompetisi.
- `GET /api/admin/competitions/{id_or_slug}` — detail.
- `PATCH /api/admin/competitions/{id_or_slug}` — ubah metadata/status/tipe/kuota/periode.
- `DELETE /api/admin/competitions/{id_or_slug}` — **hapus aman**:
  - Jika masih ada tim/peserta terkait (`teams`/`team_members` untuk kompetisi itu), API menolak dengan **409** dan pesan jelas agar admin mengubah status ke `CLOSED` atau mengarsipkan data terkait.
  - Backend **tidak** cascade-hapus peserta/tim secara diam-diam.
  - Jika tidak ada data terkait, kompetisi dihapus dan API mengembalikan `{ok,message,competition}`.

## Admin Pengguna
Respons user **tidak pernah** menyertakan `password_hash` atau password.

- `GET /api/admin/users?q=&limit=&offset=` — list user (pencarian nama/email, default limit 50, max 200).
- `GET /api/admin/users/{user_id}` — detail user aman.
- `POST /api/admin/users` — buat user: `{full_name,email,password,role}`. Role allowlist: `user`, `admin`, `jury`, `committee`. Email unik → 409.
- `PATCH /api/admin/users/{user_id}` — `{role?, password?}`. Password diisi = reset password (di-hash). Admin tidak boleh menurunkan role akunnya sendiri dari `admin`.

## Seed Admin Awal (aman/idempotent)
Env vars opsional saat startup:
- `PERKUTUT_SEED_ADMIN_EMAIL`
- `PERKUTUT_SEED_ADMIN_PASSWORD`
- `PERKUTUT_SEED_ADMIN_NAME` (opsional)

Perilaku:
- Seed hanya berjalan bila `EMAIL` dan `PASSWORD` diset.
- Jika email belum ada, aplikasi membuat user baru dengan `role='admin'` dan password ter-hash.
- Jika email sudah ada, aplikasi **tidak** membuat duplikat dan **tidak** meng-overwrite password yang ada. (Operator dapat mengubah role/password lewat SQL atau endpoint admin setelah login.)
- Password tidak dicatat ke log. Jangan hardcode rahasia di repo.

## Frontend Admin
- `dashboard/competitions/` — CMS kompetisi, termasuk tombol Hapus dengan konfirmasi; error 409 ditampilkan apa adanya.
- `dashboard/users/` — daftar/info pengguna, tambah pengguna, ubah role, reset password.
- Nav admin “KELOLA KOMPETISI” dan “KELOLA PENGGUNA” muncul untuk user role admin.

## Homepage CMS
- `index.html` + `script.js` merender katalog kompetisi dari `GET /api/competitions`. CTA daftar hanya aktif saat `is_open`/pendaftaran terbuka; status lain ditampilkan non-link.

## Deployment Notes
- Migrasi dijalankan otomatis saat startup (`backend/migrations/*.sql`, advisory lock). Termasuk `0002_competitions_and_roles.sql`.
- Untuk staging deploy manual SCP+SSH: salin kode ke release/checkout target, pastikan env/config server dipakai proses baru (jangan commit rahasia), restart service persisten, dan verifikasi `/health` serta alur login/admin. Password seed admin hanya untuk bootstrap awal bila belum ada admin.
- `python -m py_compile backend/app.py` lolos pada perubahan backend ini. Verifikasi runtime DB/endpoint memerlukan database yang terkonfigurasi.
