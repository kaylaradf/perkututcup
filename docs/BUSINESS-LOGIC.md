# Rancangan Logika Bisnis (Business Logic) Perkutut Cup 2026

Dokumen ini merangkum logika bisnis, alur verifikasi, pembagian peran, dan aturan sistem Perkutut Cup 2026 yang telah diselaraskan.

---

## 1. Tiga Peran Utama (Roles) & Pemisahan Dashboard

Sistem memiliki **3 peran resmi**:

| Peran (Role) | Deskripsi | Akses Dashboard |
|---|---|---|
| **`peserta`** | Peserta lomba (baik individu maupun anggota/ketua tim). | `/dashboard/profile/` (profil, berkas, tim), `/dashboard/submission/` (soal & unggah karya — terkunci hingga terverifikasi). |
| **`admin`** | Pengelola platform, verifikator berkas & pembayaran, pengatur lomba & akun. | `/dashboard/admin/` atau `/dashboard/competitions/`, `/dashboard/users/`, `/dashboard/verifications/` (antrean berkas auto-assign). |
| **`juri`** | Penilai karya/submisi peserta lomba. | `/dashboard/jury/` (antrean submisi peserta auto-assign, formulir penilaian & feedback). |

Setiap peran diarahkan ke antarmuka dashboard masing-masing yang terisolasi sesuai hak aksesnya.

---

## 2. Alur Pendaftaran & Verifikasi Berkas

```
[Peserta Daftar Akun & Lomba]
             │
             ▼
[Status Pendaftaran: BELUM TERVERIFIKASI]
             │
             ├─ Anggota Tim 1: Upload KTM, Pasfoto, Twibbon
             ├─ Anggota Tim 2: Upload KTM, Pasfoto, Twibbon
             └─ Ketua Tim: Upload Bukti Pembayaran Tim
             │
             ▼
[Sistem Auto-Assign ke Admin (Round-Robin)]
             │
             ▼
[Admin Meninjau Berkas Per-Item di Dashboard Admin]
             ├── Berkas Benar  ──> Centang / Disetujui (APPROVED)
             └── Berkas Kurang ──> Ditolak + Catatan Feedback
                                           │
                                           ▼
                                [Peserta Resubmit Berkas]
             │
             ▼ (Jika SEMUA berkas wajib telah APPROVED)
[Status Pendaftaran: TERVERIFIKASI OTOMATIS]
             │
             ▼
[Akses Tab Submission Terbuka]
```

### 2.1 Jenis Berkas Persyaratan
1. **Berkas Individu (Wajib diunggah oleh setiap anggota tim)**:
   - Kartu Pelajar / Kartu Tanda Mahasiswa (KTM).
   - Pasfoto Formal.
   - Bukti Unggah Twibbon.
2. **Berkas Tim (Wajib diunggah 1 kali untuk seluruh tim, oleh ketua tim)**:
   - Bukti Pembayaran / Struk Transfer Pendaftaran.

### 2.2 Penugasan Verifikasi Admin (Auto-Assign Round-Robin)
- Ketika peserta/tim mendaftar dan mulai mengunggah berkas, berkas pendaftaran tersebut dialokasikan secara adil ke akun-akun `admin` yang aktif menggunakan algoritma **Round-Robin**.
- Admin yang ditugaskan melihat antrean pendaftaran tersebut pada dashboard verifikasi miliknya.

### 2.3 Status Berkas & Fitur Feedback Resubmit
- Setiap berkas memiliki status mandiri:
  - `PENDING`: Menunggu verifikasi admin.
  - `APPROVED` (Centang Hijau): Berkas sah dan disetujui.
  - `REJECTED`: Berkas ditolak/kurang lengkap.
- **Fitur Feedback**:
  - Saat menolak berkas, admin wajib memberikan catatan/komentar koreksi (misal: "KTM buram, mohon unggah ulang scan yang jelas").
  - Peserta melihat pesan catatan tersebut secara *real-time* di dashboard profil dan dapat melakukan **unggah ulang (*resubmit*)** untuk berkas yang ditolak tersebut.
- **Verifikasi Otomatis**:
  - Sistem secara otomatis memantau seluruh berkas dalam tim (seluruh berkas individu tiap anggota + bukti bayar tim).
  - Begitu **semua berkas = `APPROVED`**, status pendaftaran tim/peserta otomatis berubah menjadi **`TERVERIFIKASI`** (*Verified*).

### 2.4 Akses Gerbang (Gatekeeper)
- Peserta **wajib berstatus Terverifikasi** terlebih dahulu sebelum dapat mengakses tab lain, terutama tab **Submisi Proyek (`/dashboard/submission/`)**.
- Jika belum terverifikasi, tab submisi dalam status terkunci (*locked*) dengan indikator status berkas yang masih menunggu verifikasi/perbaikan.

---

## 3. Alur Penilaian Karya oleh Juri (Auto-Assign Round-Robin)

```
[Peserta Terverifikasi Mengunggah Submisi Karya]
             │
             ▼
[Sistem Auto-Assign ke 1 Juri (Round-Robin)]
             │
             ▼
[Juri Menilai di Dashboard Juri]
             ├── Evaluasi Dokumen / Kode / File Karya
             ├── Input Skor / Nilai
             └── Input Catatan Feedback Penilaian
```

1. **Auto-Assign Juri Spesifik Cabang**:
   - Akun Juri ditugaskan spesifik untuk **cabang lomba tertentu** (contoh: Juri A & Juri B khusus *Kriptografi*).
   - Setiap submisi karya peserta dialokasikan ke juri menggunakan format **Round-Robin per Cabang Lomba**.
   - Setiap submisi dinilai oleh tepat **1 Juri**.
2. **Dashboard Juri & Format Penilaian**:
   - Juri melihat antrean submisi karya yang ditugaskan kepadanya sesuai cabang lombanya.
   - Penilaian terdiri dari dua komponen:
     - **Skor Nilai**: Angka bulat / desimal dalam rentang **0–100**.
     - **Catatan Evaluasi / Feedback**: Komentar tertulis juri untuk peserta.

---

## 4. Penyimpanan Berkas (Local Storage)

- Seluruh file berkas identitas (KTM, foto, twibbon), bukti transfer, dan file karya peserta disimpan di **folder lokal server** (misalnya `backend/uploads/` yang terstruktur).
- **Keamanan Penyimpanan**: File tidak disajikan secara terbuka via direct static link, melainkan diakses melalui endpoint API yang memvalidasi izin akses sesi login (peserta hanya bisa melihat berkasnya/timnya; admin & juri yang ditugaskan berhak mengakses berkas terkait).

---

## 5. Model Partisipasi Tim & Kuota

1. **Abstraksi Tim**:
   - Cabang **Individu**: Tim berkuota 1 orang (`min = 1, max = 1`).
   - Cabang **Kelompok**: Tim berkuota dinamis (misal 1–3 orang).
2. **Kode Tim & Undangan**:
   - Kode unik `PC26-XXXX` digunakan anggota untuk bergabung ke tim kelompok (`POST /api/team/join`).
   - Ketua tim dapat mengundang via email anggota terdaftar (`POST /api/team/members`).
3. **Pembersihan Tim Solo Otomatis**:
   - Jika peserta mendaftar awal dan dibuatkan tim solo PENDING, saat ia bergabung ke tim kelompok rekannya via kode tim, tim solo sementaranya dihapus otomatis.
4. **Kunci Susunan Tim**:
   - Ketika pendaftaran ditutup (`CLOSED`) atau tim sudah dinyatakan `TERVERIFIKASI`, susunan anggota tim dikunci agar integritas peserta lomba tetap terjaga.

---

## 6. Keputusan Operasional yang Telah Disepakati

1. **Penugasan Juri per Cabang**:
   - **Terkonfirmasi**: Penugasan juri terikat pada cabang lomba tertentu (`competition_id`), dan pembagian karya peserta menggunakan algoritma round-robin di lingkup cabang lomba tersebut.
2. **Komponen Penilaian Juri**:
   - **Terkonfirmasi**: Menggunakan skor angka **0–100** ditambah catatan evaluasi/feedback juri.
3. **Manajemen Akun Juri & Admin**:
   - **Terkonfirmasi**: Akun Juri dan Admin dibuat atau diubah perannya oleh Administrator melalui menu Kelola Pengguna (`/dashboard/users/`). Untuk akun Juri, Admin juga menentukan cabang lomba yang diampunya.
