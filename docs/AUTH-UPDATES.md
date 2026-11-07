# 🔐 Update Autentikasi — Password Policy Baru & CAPTCHA Perkalian

> Dokumen interaktif — bisa dibuka langsung di browser (`docs/AUTH-UPDATES.md`).
> Mencakup semua perubahan mulai commit `b15cf6b` sampai `826319b`.

---

## Daftar Isi

0. [Linetime Dokumentasi (urut tanggal)](#linetime-dokumentasi-urut-tanggal)
1. [Ringkasan Cepat](#ringkasan-cepat)
2. [Kebijakan Password Baru](#kebijakan-password-baru)
3. [Password Strength Meter (Floating Window)](#password-strength-meter)
4. [CAPTCHA Perkalian](#captcha-perkalian)
5. [Lupa Password](#lupa-password)
6. [Riwayat Commit](#riwayat-commit)
7. [Referensi API](#referensi-api)
8. [FAQ / Troubleshooting](#faq--troubleshooting)

---

## Linetime Dokumentasi (urut tanggal)

Seluruh dokumen di `docs/`, urut dari yang paling awal:

| Tanggal | Dokumen | Isi |
|---|---|---|
| **2026-10-21** | [`Infra.txt`](Infra/Infra.txt) | Diagram infrastruktur awal (router → reverse-proxy → dns/web/database) |
| **2026-10-21** | [`ASSESSMENT.md`](ASSESSMENT.md) | Asesmen baseline situs statis sebelum integrasi backend; kontrak API §5.1 |
| **2026-10-21** | [`FRONTEND.md`](FRONTEND.md) | Dokumentasi tiap file frontend + aturan yang tidak boleh dilanggar agent |
| **2026-11-05** | [`Infra/Infra.txt`](Infra/Infra.txt) & [`Infra/dns-server.txt`](Infra/dns-server.txt) | Infra diperluas: IP VM + catatan DNS server |
| **2026-11-05** | [`AUTH-UPDATES.md`](AUTH-UPDATES.md) | *(dokumen ini)* — backend + auth: password policy baru, meter, captcha perkalian |

Kontribusi baru harus menambah baris di tabel ini dan menandai tanggalnya.

---

## Ringkasan Cepat

| Sebelum | Sesudah |
|---|---|
| Min 8 karakter + WAJIB huruf besar, kecil, angka, simbol | Min **15**, maks **64** karakter, **tanpa** kewajiban kombinasi |
| Password lemah panjang (mis. `aaaaaaaaaaaaaaaaa`) lolos | Dicek via **zxcvbn** — password umum/mudah ditebak ditolak |
| Hanya karakter ASCII tanpa spasi | Terima **printable ASCII + spasi + Unicode** (emoji pun bisa) |
| Tidak ada CAPTCHA | **CAPTCHA perkalian** di login & register |
| ALTCHA (proof-of-work) — dibatalkan | Terlalu kompleks; diganti soal matematika sederhana |
| "Pemulihan kata sandi belum tersedia" | Pesan jelas: **lapor admin** |
| Password meter menutupi field lain | Meter **expand inline**, tidak menutupi apapun |

<details>
<summary>💡 Kenapa kebijakan panjang > kombinasi?</summary>

Ini mengikuti **NIST SP 800-63B** dan rekomendasi OWASP modern. Memaksa
`P@ssw0rd1` (kombinasi lengkap tapi lemah) lebih berbahaya daripada
`kuda hijau makan rumput 42` (tanpa simbol tapi panjang dan tak terduga).
Attacker dictionary mengenal semua pola kombinasi klasik; panjang adalah
penebal entropi yang paling efektif per karakter tambahan.
</details>

---

## Kebijakan Password Baru

### Aturan Lengkap

| # | Aturan | Detail |
|---|---|---|
| 1 | Panjang minimum | **15 karakter** |
| 2 | Panjang maksimum | **64 karakter** |
| 3 | Kombinasi karakter | ❌ Tidak diwajibkan (huruf besar/kecil/angka/simbol bebas) |
| 4 | Password umum | ❌ Ditolak — dicek zxcvbn, score minimal **3 dari 5** |
| 5 | Rotasi berkala | ❌ Tidak diwajibkan |
| 6 | Charset | ✅ Printable ASCII, spasi, dan Unicode |
| 7 | Lupa password | Lapor admin (lihat [bagian 5](#lupa-password)) |

### Contoh Password yang Diterima / Ditolak

```text
✅ "kuda hijau makan rumput 42"     → 28 char, passphrase, score 4
✅ "KucingOrenNeptune2026!"          → kombinasi bebas, panjang, unik
✅ "🌸bintangtimur123"                → Unicode diterima
❌ "Kuat#123"                        → kurang dari 15 karakter
❌ "passwordpassword12345"           → umum, ditolak zxcvbn
❌ "aaaaaaaaaaaaaaaaaaaaaa"          → umum (repetitif), ditolak zxcvbn
```

### Di Mana Diimplementasikan?

Kebijakan dipakai di **dua lapis** — keduanya harus lolos:

1. **Server** (`backend/app.py` → `validate_password_policy`)
   - Sumber kebenaran; validasi ulang saat `POST /api/auth/register`.
   - Gagal → `422` dengan daftar rule yang dilanggar, mis:
     ```json
     {"detail": {"password": ["Minimal 15 karakter"]}}
     {"detail": {"password": ["Kata sandi terlalu mudah ditebak atau umum digunakan. Add another word or two..."]}}
     ```
2. **Client** (`script.js` → `validatePassword`)
   - Real-time saat mengetik; blok submit sebelum kirim (hemat round-trip).
   - `minlength="15" maxlength="64"` juga diset di HTML `<input>`.

<details>
<summary>🔧 Detail teknis zxcvbn</summary>

- **Backend**: library Python `zxcvbn` (di `requirements.txt`). Dipanggil
  dengan password hasil trim + fallback aman jika library gagal load.
- **Frontend**: `assets/js/zxcvbn.js` di-vendor (self-hosted, 820KB) —
  bukan CDN agar tetap jalan offline/inside network sekolah.
- Threshold: `score >= 3` di kedua sisi. Score dihitung dari pola kamus,
  urutan keyboard, tanggal, repetisi — bukan sekadar cek klas karakter.
</details>

---

## Password Strength Meter

Floating window lama dirework karena dua masalah: **menutupi field di
bawahnya** (absolute overlay) dan **muncul menggantung** saat fokus pindah.

### Perilaku Baru

| Kondisi | Tampilan |
|---|---|
| Fokus di field password, mulai mengetik | Meter **expand inline** di bawah field (mendorong konten, bukan menimpa) |
| Fokus keluar dari field | Meter **collapse** otomatis |
| Field dikosongkan | Meter hilang |
| Password < 15 char | Label menampilkan sisa: *"Sangat lemah — 5 karakter lagi"* |
| Password >= 15 char | Label skor penuh: *"Cukup" / "Kuat" / "Sangat kuat"* |

### Visual

```text
┌──────────────────────────────────────────┐
│ 🔒 kuda hijau makan rumput 42            │  ← field password
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  (hijau)       │  ← bar berwarna sesuai skor
│ Sangat kuat                               │  ← label real-time
│ ✓ 15–64 karakter                          │
│ ✓ Tidak mudah ditebak / umum              │
│ ✓ Huruf, angka, spasi, atau simbol bebas  │
└──────────────────────────────────────────┘
```

- Warna bar: merah → oranye → kuning → hijau → hijau tua (1 skala skor zxcvbn)
- Animasi masuk 160ms (fade + slide), transisi width 180ms
- Checklist 3 rule di bawah bar — centang ✅ real-time saat terpenuhi

### Selaras dengan Policy Baru

Checklist lama (huruf besar/kecil/angka/simbol) **dihapus** dan diganti:
1. `15–64 karakter`
2. `Tidak mudah ditebak / umum`
3. `Huruf, angka, spasi, atau simbol bebas` (charset bebas — hanya info)

---

## CAPTCHA Perkalian

> Catatan: awalnya pakai [ALTCHA](https://altcha.org/) (self-hosted
> proof-of-work). Sudah diimplementasi & tested, tapi dihapus karena
> terlalu kompleks untuk kebutuhan ini — diganti soal perkalian sederhana
> dengan tingkat keamanan memadai untuk mencegah bot spam.

### Alur

```text
Browser                                Server
   │                                     │
   │── GET /api/auth/captcha ──────────►│
   │                                     │  a,b = random 2..10
   │                                     │  expires = now + 10 min
   │                                     │  payload = "axb.expires"
   │                                     │  sig = HMAC-SHA256(payload, key)[:16]
   │◄── {id: "7x9.1699...sig", ─────────│
   │     question: "Berapa hasil 7×9?"}  │
   │                                     │
   │  user isi: 63                       │
   │                                     │
   │── POST /api/auth/login ───────────►│
   │   {captcha_id, captcha_answer: 63}  │  verifikasi HMAC + expiry + jawaban
   │                                     │  → 200 atau 400
```

### Kenapa Aman (meski sederhana)?

| Ancaman | Mitigasi |
|---|---|
| Bot hitung otomatis dari HTML | Jawaban **tidak pernah dikirim** ke browser — hanya soal |
| Token dipalsukan | `sig` = HMAC-SHA256 dengan secret env `PERKUTUT_ALTCHA_HMAC_KEY`; token palsu → 400 |
| Jawaban diubah jadi benar | Merubah `id`/`sig` akan merusak HMAC (constant-time compare) |
| Replay token lama | `expires` tertanam di payload + diverifikasi server (TTL 10 menit) |
| Brute force jawaban | Payload HMAC tak bisa dimodifikasi; jawaban salah tetap 400 tanpa hint |
| Bypass langsung ke API | `captcha_id` + `captcha_answer` wajib di schema Pydantic; tanpa itu → 422 |

<details>
<summary>🔧 Detail teknis</summary>

- **Stateless** — tidak ada state disimpan di DB/session. Semua info
  (soal + expiry + HMAC) terkandung di token itu sendiri. Server restart
  tidak membatalkan soal yang sedang berjalan.
- Secret key di `.env` (`PERKUTUT_ALTCHA_HMAC_KEY`, 32-byte hex acak).
  Nama variabel dipertahankan dari implementasi ALTCHA lama agar
  migration mulus, tapi sekarang dipakai untuk HMAC captcha.
- Jawaban diverifikasi via `hmac.compare_digest` (constant-time).
- Format token: `"axb.expires.sig"` — contoh: `"7x9.1699123456.a1b2c3d4e5f6a7b8"`.
</details>

### UX di Form

```text
┌──────────────────────────────────────────┐
│ Berapa hasil dari 7 × 9?                 │  ← kotak dashed, latar lembut
├──────────────────────────────────────────┤
│ [ 63 ]                          [ ↻ ]    │  ← jawaban + refresh sejajar
└──────────────────────────────────────────┘
```

- Soal **gagal termuat** → kotak jadi merah + pesan *"klik ikon ↻ untuk coba lagi"*
- Setelah **setiap percobaan autentikasi gagal** (validasi/422, captcha salah, kredensial salah, lockout, rate limit, error server/jaringan), soal **baru otomatis dimuat** dan field jawaban dikosongkan (token lama tidak dipakai ulang).
- Tombol ↻ = soal baru kapan saja (mis. user tidak bisa hitung soal ini)

---

## Lupa Password

```text
User klik "Lupa kata sandi?" di halaman sign-in
        │
        ▼
Pesan tampil: "Lupa kata sandi? Silakan lapor admin untuk reset."
```

- Endpoint `POST /api/auth/forgot-password` tetap disediakan (kontrak
  `docs/ASSESSMENT.md` §5.1) dan mengembalikan pesan yang sama —
  **tidak ada reset mandiri** (tanpa email reset, tanpa link).
- Alasan: infrastruktur email belum ada; arah reset manual via admin.

---

## Riwayat Commit

Semua perubahan di-commit per-perubahan agar flow-nya terlacak:

| Commit | Pesan | Isi |
|---|---|---|
| `5c45ca1` | chore: ignore Python bytecode cache | `.gitignore` + `backend/__pycache__/` |
| `b15cf6b` | feat(backend): new password policy (NIST-style) + forgot-password endpoint | `backend/app.py`, `backend/requirements.txt` |
| `e9f2836` | chore(assets): vendor zxcvbn untuk cek kekuatan password client-side | `assets/js/zxcvbn.js` |
| `9dc754b` | feat(auth): floating password strength meter + new policy client-side | `script.js` |
| `0a6ab67` | feat(join): password meter UI + rule text sesuai kebijakan baru | `styles.css`, `join/index.html` |
| `2fa6290` | feat(auth): ganti ALTCHA dengan captcha perkalian sederhana | `backend/app.py`, semua form, `script.js`, `styles.css` |
| `826319b` | fix(auth): rapikan tampilan captcha perkalian | `styles.css`, semua form |

Perintah untuk lihat detail tiap commit:

```bash
git show <sha>           # diff lengkap
git log --stat -7        # file yang berubah per commit
```

---

## Referensi API

### `GET /api/auth/captcha`

Ambil soal captcha baru.

**Response 200:**
```json
{
  "id": "7x9.1699123456.a1b2c3d4e5f6a7b8",
  "question": "Berapa hasil dari 7 × 9?"
}
```

### `POST /api/auth/register`

**Body:**
```json
{
  "full_name": "Nama Lengkap",
  "email": "user@example.com",
  "password": "kuda hijau makan rumput 42",
  "confirm_password": "kuda hijau makan rumput 42",
  "captcha_id": "7x9.1699123456.a1b2c3d4e5f6a7b8",
  "captcha_answer": "63"
}
```

**Response 201** → cookie `perkutut_session` diset, langsung login.
**Response 400** → captcha salah: `{"detail": {"captcha": "Jawaban captcha salah atau kedaluwarsa."}}`
**Response 409** → email terdaftar.
**Response 422** → policy password / data tidak valid.

### `POST /api/auth/login`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "kuda hijau makan rumput 42",
  "captcha_id": "3x5.1699123400.c2d3e4f5a6b7c8d9",
  "captcha_answer": "15"
}
```

**Response 200** → cookie session. **401** → kredensial salah. **400** → captcha.

### `POST /api/auth/forgot-password`

**Response 200:**
```json
{"message": "Lupa kata sandi? Silakan lapor admin untuk reset."}
```

---

## FAQ / Troubleshooting

<details>
<summary>❓ Kenapa password saya ditolak padahal sudah 15 karakter?</summary>

Kemungkinan besar terdeteksi **umum / mudah ditebak** oleh zxcvbn
(mis. `aaaaaaaaaaaaaaa`, `passwordpassword123`, `123456789012345`).
Tambahkan kata yang tidak berhubungan / tidak terduga — passphrase
beberapa kata acak paling mudah lolos sekaligus mudah diingat.
</details>

<details>
<summary>❓ Apakah password boleh pakai emoji / karakter non-Latin?</summary>

Ya. Semua karakter Unicode diterima (dan spasi). Hanya batasan
panjang 15–64 yang berlaku. Catatan: beberapa keyboard/manager password
mempermudah emoji, jadi pastikan bisa diketik ulang konsisten saat login.
</details>

<details>
<summary>❓ Saya salah jawab captcha — harus refresh halaman?</summary>

Tidak. Saat submit dengan jawaban salah, soal baru **otomatis dimuat**
dan field jawaban dikosongkan. Atau klik tombol ↻ kapan saja.
</details>

<details>
<summary>❓ Soal captcha terus "Memuat soal verifikasi…"</summary>

Backend tidak terjangkau. Kotak akan berubah merah dengan pesan
*"klik ikon ↻ untuk coba lagi"*. Pastikan server jalan:

```bash
cd ~/perkututcup && set -a && . ./.env && set +a && \
.venv/bin/uvicorn backend.app:app --host 0.0.0.0 --port 8000
```
</details>

<details>
<summary>❓ ALTCHA hilang ke mana? File-nya masih ada?</summary>

Implementasi ALTCHA dihapus dari form (kompleksitas tidak sebanding).
File `assets/js/altcha.js` masih ter-commit di `e9f2836` tapi **tidak
lagi direferensikan** oleh halaman manapun — aman dihapus jika mau:
`git rm assets/js/altcha.js`.
</details>

<details>
<summary>❓ Bagaimana cara admin reset password user?</summary>

Saat ini manual via SQL (belum ada panel admin):

```bash
sudo -u postgres psql perkututcup
# generate hash bcrypt baru:
#   .venv/bin/python -c "from backend.app import hash_password; print(hash_password('password_baru_15_karakter'))"
UPDATE users SET password_hash = '<hash_bcrypt>' WHERE email = 'user@example.com';
```

Session lama tidak otomatis invalid — putuskan dengan:
```sql
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');
```
</details>

<details>
<summary>❓ Bagaimana cara test cepat semua fitur ini?</summary>

```bash
# 1. Server jalan?
curl -s http://127.0.0.1:8000/api/auth/captcha

# 2. Password lemah ditolak?
curl -s -X POST http://127.0.0.1:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"T","email":"t@x.com","password":"Kuat#123","confirm_password":"Kuat#123","captcha_id":"x","captcha_answer":"0"}'
# → 422 dengan pesan "Minimal 15 karakter"

# 3. Browser: buka http://<ip-server>:8000/join/ — meter + captcha tampil
```
</details>

---

*Dibuat otomatis dari session kerja — Perkutut Cup 2026 backend.*
