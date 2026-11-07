# Dokumentasi Master Kompetisi, Manajemen Tim, & Admin Portal (v2.6)

Dokumentasi implementasi master kompetisi, migrasi basis data peran pengguna (RBAC), alur manajemen tim peserta, endpoint pendaftaran terikat slug, antarmuka Admin Portal, dan panduan deployment bagi operator.

---

## 1. Skema Basis Data & Migrasi (`0002_competitions_and_roles.sql`)

Migrasi kedua menambahkan master kompetisi dan fondasi role pengguna dengan backward-compatibility penuh terhadap skema v1 (`0001_initial_schema.sql`):

### 1.1 Tabel `competitions`
- `id`: `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `slug`: `TEXT NOT NULL UNIQUE` (contoh: `kriptografi`, `itnsa`, `ui-ux-design`, dll.)
- `name`: `TEXT NOT NULL`
- `audience`: `TEXT NOT NULL DEFAULT 'SEMUA JENJANG'` (`PERGURUAN TINGGI`, `SMA/SMK`, `SEMUA JENJANG`)
- `description`: `TEXT`
- `participation_type`: `TEXT NOT NULL DEFAULT 'TEAM'` (`INDIVIDUAL` atau `TEAM`)
- `min_team_members`: `INT NOT NULL DEFAULT 1 CHECK (min_team_members >= 1)`
- `max_team_members`: `INT NOT NULL DEFAULT 1 CHECK (max_team_members >= min_team_members)`
- `status`: `TEXT NOT NULL DEFAULT 'OPEN'` (`OPEN`, `UPCOMING`, `CLOSED`)
- `registration_start`: `TIMESTAMPTZ` (opsional)
- `registration_end`: `TIMESTAMPTZ` (opsional)
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

> [!IMPORTANT]
> **Catatan Baseline Seed Kompetisi:**
> Nilai `participation_type: 'TEAM'` dan kuota `1–3` anggota pada seed migrasi 0002 merupakan **nilai awal operasional teknis (provisional baseline)** agar sistem dapat langsung berjalan, **BUKAN keputusan mutlak panitia/pengguna**.
> Setiap parameter cabang lomba (tipe Individu/Tim, kuota min/max, status buka/tutup, dan rentang tanggal registrasi) dapat disesuaikan sewaktu-waktu oleh Administrator melalui antarmuka **Admin Portal** atau API backend tanpa perlu migrasi ulang basis data.

### 1.2 Perubahan Tabel `users`
- `role`: `TEXT NOT NULL DEFAULT 'user'`
- Fondasi peran: akun publik otomatis berstatus `'user'`. Privilege `'admin'` hanya diberikan secara eksplisit di level database atau oleh operator/superadmin.

### 1.3 Perubahan Tabel `teams` & `team_members`
- `teams.competition_id`: `BIGINT REFERENCES competitions(id) ON DELETE SET NULL`
- `teams.name`: `TEXT` (nama tim opsional, default "Tim [Nama Kompetisi]" atau "Peserta [Nama Kompetisi]")
- `team_members.competition_id`: `BIGINT REFERENCES competitions(id) ON DELETE CASCADE`
- Index unik anti duplikasi pendaftaran:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS team_members_user_competition_idx
  ON team_members(user_id, competition_id)
  WHERE competition_id IS NOT NULL;
  ```
  Menjamin satu user hanya dapat terdaftar 1 kali dalam kompetisi yang sama di level database (baik sebagai ketua tim, anggota tim, maupun peserta individu).
- **Backfill otomatis:** data tim lama dengan `track = 'KRIPTOGRAFI'` langsung di-backfill terhubung ke kompetisi `kriptografi`.

---

## 2. API Endpoints

### 2.1 Endpoint Publik & Pendaftaran

#### `GET /api/competitions`
- **Akses:** Publik
- **Query Parameter:**
  - `active_only`: `bool` (opsional, `true` untuk hanya mengambil kompetisi dengan registrasi terbuka)
  - `status`: `str` (opsional: `OPEN`, `UPCOMING`, `CLOSED`)
- **Respons (200 OK):**
```json
{
  "competitions": [
    {
      "id": 1,
      "slug": "kriptografi",
      "name": "Kriptografi",
      "audience": "PERGURUAN TINGGI",
      "description": "Uji kemampuan Anda dalam memecahkan dan merancang tantangan kriptografi.",
      "participation_type": "TEAM",
      "min_team_members": 1,
      "max_team_members": 3,
      "status": "OPEN",
      "registration_start": null,
      "registration_end": null,
      "is_open": true
    }
  ]
}
```

#### `GET /api/competitions/{slug}`
- **Akses:** Publik
- **Respons (200 OK):** Objek kompetisi tunggal
- **Respons (404 Not Found):** Jika slug tidak ditemukan

#### `POST /api/auth/register` (Registrasi Akun Publik)
- **Akses:** Publik (Rate limit 5/menit)
- **Payload:** `full_name`, `email`, `password`, `confirm_password`, `captcha_id`, `captcha_answer`, `competition` (slug opsional)
- **Perilaku:**
  - Akun dibuat dengan `role: "user"`.
  - Bila `competition` diberikan, divalidasi ke database (harus ada dan status registrasi aktif).
  - Otomatis dibuatkan entitas `teams` baru (kode unik `PC26-XXXX`) dan entri `team_members` (`role: "leader"`).
  - Cookie sesi `perkutut_session` diterbitkan otomatis.

#### `POST /api/competitions/{slug}/register` (Pendaftaran Kompetisi oleh User Terotentikasi)
- **Akses:** Terautentikasi (Cookie session, Rate limit 10/menit)
- **Payload:** `{ "team_name": "Nama Tim Opsional" }`
- **Validasi Server-Side:**
  - Memverifikasi keberadaan kompetisi `{slug}`.
  - Memverifikasi kompetisi berstatus `OPEN` dan dalam periode waktu registrasi.
  - Memeriksa apakah user sudah terdaftar di kompetisi ini (`409 Conflict` jika sudah terdaftar).
- **Respons (201 Created):**
```json
{
  "ok": true,
  "message": "Berhasil mendaftar kompetisi Kriptografi.",
  "team": {
    "id": 12,
    "code": "PC26-K9P2X7",
    "track": "Kriptografi",
    "payment_status": "PENDING",
    "competition_id": 1,
    "name": "Tim Kriptografi"
  },
  "competition": {
    "slug": "kriptografi",
    "name": "Kriptografi",
    "participation_type": "TEAM"
  }
}
```

---

### 2.2 Endpoint Alur Manajemen Tim (Peserta)

#### `GET /api/team`
- **Akses:** Terautentikasi
- **Query Parameter:** `competition_slug` (opsional)
- **Respons (200 OK):**
```json
{
  "team": {
    "id": 12,
    "code": "PC26-K9P2X7",
    "team_name": "Tim Kriptografi",
    "track": "Kriptografi",
    "payment_status": "PENDING",
    "role": "leader",
    "competition_id": 1,
    "competition_slug": "kriptografi",
    "competition_name": "Kriptografi",
    "audience": "PERGURUAN TINGGI",
    "participation_type": "TEAM",
    "min_team_members": 1,
    "max_team_members": 3,
    "competition_status": "OPEN",
    "is_open": true,
    "member_count": 2,
    "members": [
      {
        "user_id": 1,
        "full_name": "Ari Dwi Saputra",
        "email": "aridspc@gmail.com",
        "institution": "Politeknik Negeri Cilacap",
        "role": "leader"
      },
      {
        "user_id": 2,
        "full_name": "Budi Santoso",
        "email": "budi@example.com",
        "institution": "Universitas Gadjah Mada",
        "role": "member"
      }
    ]
  }
}
```

#### `POST /api/team/join` (Bergabung ke Tim dengan Kode)
- **Akses:** Terautentikasi
- **Payload:** `{ "code": "PC26-XXXX" }`
- **Validasi Server-Side:**
  - Kode tim harus valid dan terikat pada kompetisi.
  - Registrasi kompetisi harus sedang dibuka (`is_open`).
  - Cabang lomba bukan cabang individu (`max_team_members > 1`).
  - Pemohon belum terdaftar di tim target.
  - Jika pemohon sebelumnya terdaftar pada tim solo otomatis tanpa pembayaran/submission, tim solo tersebut dibersihkan secara aman (migrasi tim atomik). Bila berada di tim non-solo, ditolak (`409 Conflict`).
  - Jumlah anggota tidak boleh melampaui `max_team_members` (`400 Bad Request`).
- **Respons (200 OK):** `{ "ok": true, "message": "Berhasil bergabung dengan tim ...", "team_id": 12 }`

#### `POST /api/team/members` (Ketua Tim Menambah Anggota via Email)
- **Akses:** Terautentikasi (Ketua Tim / `role === 'leader'`)
- **Payload:** `{ "email": "calon.anggota@example.com", "competition_slug": "kriptografi" }`
- **Validasi Server-Side:**
  - Pemohon harus merupakan ketua tim (`403 Forbidden` jika bukan ketua).
  - Pendaftaran kompetisi harus dibuka.
  - Kompetisi mendukung tim kelompok (`participation_type == 'TEAM'`).
  - Kuota tim belum penuh (`current_count < max_team_members`).
  - Target email harus terdaftar di sistem (`404 Not Found` jika akun belum ada).
  - Target email belum terdaftar di tim target maupun tim lain pada cabang yang sama (`409 Conflict`).
- **Respons (201 Created):** Objek anggota yang ditambahkan.

#### `DELETE /api/team/members/{member_user_id}` (Ketua Mengeluarkan Anggota)
- **Akses:** Terautentikasi (Ketua Tim)
- **Validasi Server-Side:**
  - Hanya ketua tim yang berhak mengeluarkan anggota lain.
  - Ketua tim tidak dapat mengeluarkan dirinya sendiri lewat endpoint ini.
  - Periode pendaftaran kompetisi harus masih dibuka.
  - Anggota harus benar-benar terdaftar di tim bersangkutan.
- **Respons (200 OK):** `{ "ok": true, "message": "Anggota berhasil dikeluarkan dari tim." }`

#### `POST /api/team/leave` (Peserta Keluar atau Membubarkan Tim Solo)
- **Akses:** Terautentikasi
- **Validasi Server-Side:**
  - Jika pemohon adalah anggota biasa: keluar dari tim secara aman.
  - Jika pemohon adalah ketua tim: jika tim masih memiliki anggota lain, aksi ditolak (`400 Bad Request` — ketua harus mengeluarkan anggota terlebih dahulu); jika hanya tersisa ketua sendiri (tim solo), tim dibubarkan secara aman.
- **Respons (200 OK):** `{ "ok": true, "message": "Berhasil keluar dari tim." }`

#### `PATCH /api/team` (Mengubah Nama Tim)
- **Akses:** Terautentikasi (Ketua Tim)
- **Payload:** `{ "name": "Nama Tim Baru" }`
- **Respons (200 OK):** `{ "ok": true, "name": "Nama Tim Baru" }`

---

### 2.3 Endpoint Administrator (RBAC Server-Side)

Seluruh endpoint pada sub-bagian ini dilindungi dengan validasi RBAC server-side `require_admin(request)`. Klien tanpa sesi atau dengan `role != 'admin'` akan menerima respons `403 Forbidden`.

#### `GET /api/admin/competitions`
- **Akses:** Admin
- **Respons (200 OK):** Daftar seluruh kompetisi beserta statistik real-time:
```json
{
  "competitions": [
    {
      "id": 1,
      "slug": "kriptografi",
      "name": "Kriptografi",
      "audience": "PERGURUAN TINGGI",
      "description": "...",
      "participation_type": "TEAM",
      "min_team_members": 1,
      "max_team_members": 3,
      "status": "OPEN",
      "registration_start": null,
      "registration_end": null,
      "is_open": true,
      "teams_count": 8,
      "participants_count": 19,
      "created_at": "2026-11-08T04:00:00Z"
    }
  ]
}
```

#### `POST /api/admin/competitions` (Membuat Kompetisi Baru)
- **Akses:** Admin
- **Payload:**
```json
{
  "slug": "ctf-kompetisi",
  "name": "Capture The Flag",
  "audience": "PERGURUAN TINGGI",
  "description": "Tantangan keamanan siber bergaya CTF.",
  "participation_type": "TEAM",
  "min_team_members": 1,
  "max_team_members": 3,
  "status": "OPEN",
  "registration_start": "2026-11-01T00:00:00Z",
  "registration_end": "2026-12-01T23:59:59Z"
}
```
- **Validasi Server-Side:**
  - Slug unik (huruf kecil, angka, tanda hubung).
  - Tipe `INDIVIDUAL` otomatis mengunci `min_team_members = 1` dan `max_team_members = 1`.
  - Tipe `TEAM` memvalidasi `min_team_members <= max_team_members`.
  - Tanggal akhir tidak boleh mendahului tanggal mulai.

#### `GET /api/admin/competitions/{comp_id_or_slug}`
- **Akses:** Admin
- Mengambil detail satu kompetisi berdasarkan ID numerik atau string slug.

#### `PATCH /api/admin/competitions/{comp_id_or_slug}` (Memperbarui Konfigurasi Kompetisi)
- **Akses:** Admin
- **Payload:** (seluruh field opsional)
  - `name`: string
  - `audience`: string (`SEMUA JENJANG`, `PERGURUAN TINGGI`, `SMA/SMK`)
  - `description`: string
  - `participation_type`: `'INDIVIDUAL'` atau `'TEAM'`
  - `min_team_members`: integer (>= 1)
  - `max_team_members`: integer (>= min)
  - `status`: `'OPEN'`, `'UPCOMING'`, atau `'CLOSED'`
  - `registration_start`: ISO-8601 string / null
  - `registration_end`: ISO-8601 string / null
- **Respons (200 OK):** Objek kompetisi yang telah diperbarui.

---

## 3. Integrasi Frontend

### 3.1 Beranda (`index.html`)
- Kartu kompetisi **Kriptografi** memiliki tombol **DAFTAR** yang mengarah langsung ke:
  `join/?competition=kriptografi`
- Navigasi global tetap mengarah ke: `join/`

### 3.2 Halaman Pendaftaran (`join/index.html` & `script.js`)
- Field seleksi kompetisi memuat cabang lomba yang sedang `OPEN` secara asinkron dari `/api/competitions`.
- Parameter `?competition=<slug>` di URL otomatis memilih cabang terkait dan menampilkan kartu detail interaktif (Jenjang, Tipe Individu/Tim, dan deskripsi).
- Submit dicegah dan divalidasi jika kompetisi belum dipilih.

### 3.3 Dashboard Profil & Tim (`dashboard/profile/index.html` & `script.js`)
- **Kartu MY TEAM Interaktif:**
  - Tombol **Salin** kode tim (`PC26-XXXX`).
  - Badge tipe kompetisi: `INDIVIDU (1 Peserta)` atau `TIM (X–Y Orang)`.
  - Indikator kuota: `Kuota: X / Y anggota terisi`.
  - **Cabang Individu:** Penambahan anggota dinonaktifkan dengan pemberitahuan ramah.
  - **Cabang Tim (Ketua):** Formulir undang anggota via email (dinonaktifkan jika tim sudah penuh) dan tombol **Hapus** pada tiap anggota kelompok.
  - **Cabang Tim (Anggota):** Tombol **Keluar dari Tim**.
  - **Belum Ada Tim:** Formulir gabung tim dengan kode.
- **Navigasi Administrator Dinamis:**
  - Jika sesi login memiliki `role === 'admin'`, menu **MANAGE COMPETITIONS** akan otomatis muncul pada bilah navigasi kiri di semua halaman dashboard.

### 3.4 Antarmuka Admin Kompetisi (`dashboard/competitions/index.html`)
- Halaman dedicated bagi operator untuk memantau dan mengelola seluruh cabang kompetisi.
- Dilindungi oleh guard server-side `serve_static` (mengembalikan `404.html` jika bukan admin) serta verifikasi API sisi klien.
- Metrik ringkasan: Total Cabang, Pendaftaran Aktif, dan Total Tim Terdaftar.
- Tabel daftar kompetisi lengkap dengan tombol konfigurasi/edit modal.
- Form modal yang mendukung penyesuaian status, tipe individu/tim, batas kuota min/max, dan rentang tanggal registrasi.

---

## 4. Panduan Operator & Langkah Deployment

### 4.1 Persyaratan Lingkungan
- Python 3.11+
- PostgreSQL 14+
- Variabel lingkungan:
  ```env
  PERKUTUT_DATABASE_URL=postgresql://user:password@host:5432/perkututcup
  PERKUTUT_COOKIE_SECURE=1   # Wajib 1 pada staging/production HTTPS
  ```

### 4.2 Langkah Migrasi Basis Data
File migrasi: `backend/migrations/0002_competitions_and_roles.sql`

Aplikasi FastAPI menjalankan migrasi otomatis saat inisialisasi (`startup` hook pada `backend/app.py`) menggunakan advisory lock PostgreSQL:
```bash
# Bila menjalankan aplikasi:
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

Bila ingin menjalankan migrasi secara manual via `psql`:
```bash
psql "$PERKUTUT_DATABASE_URL" -f backend/migrations/0002_competitions_and_roles.sql
```

### 4.3 Menetapkan Akun Administrator
Secara default, seluruh pendaftaran publik menghasilkan akun berstatus `role = 'user'`. Untuk menjadikan salah satu akun sebagai Administrator:
```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

### 4.4 Verifikasi Endpoint & Sintaks

```bash
# 1. Validasi sintaks Python
python -m py_compile backend/app.py

# 2. Validasi sintaks JavaScript
node --check script.js

# 3. Uji endpoint daftar kompetisi publik
curl -s http://127.0.0.1:8000/api/competitions | jq .

# 4. Uji endpoint admin (harus 403 jika tanpa sesi admin)
curl -i http://127.0.0.1:8000/api/admin/competitions
# Ekspektasi: HTTP 401 (tanpa session) atau HTTP 403 (bukan role admin)
```

---

## 5. Ringkasan Status & Informasi Tambahan (Handoff Note)

1. **Kompatibilitas Penuh:** Seluruh endpoint lama (`/api/auth/*`, `/api/me`, `/api/team`) tetap berfungsi dengan backward-compatibility 100%.
2. **Fleksibilitas Konfigurasi:** Panitia tidak terkunci pada seed baseline `TEAM 1-3`. Setiap cabang dapat diubah menjadi `INDIVIDUAL` atau kuota tim yang berbeda melalui Dashboard Admin.
3. **Penyampaian Informasi Belum Lengkap:**
   - Buku panduan (juklak) resmi yang memuat batas kuota pasti untuk 7 kompetisi `UPCOMING` (ITNSA, UI/UX, Web Dev SMK/Univ, IoT, DevOps, Keamanan Siber) belum dipublikasikan dalam repositori. Konfigurasi awal diset aman pada status `UPCOMING` agar dapat diaktifkan oleh operator setelah aturan resmi ditetapkan.
