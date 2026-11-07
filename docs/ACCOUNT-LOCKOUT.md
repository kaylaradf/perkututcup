# Account Lockout & Popup Error Autentikasi

> Bagian dari hardening autentikasi (lihat [`UPDATES.md`](UPDATES.md)).
> Terakhir diperbarui: 2026-11-07.

---

## Daftar Isi

1. [Kebijakan Account Lockout](#kebijakan-account-lockout)
2. [Cara Kerja Teknis](#cara-kerja-teknis)
3. [Prosedur Admin: Unlock Akun](#prosedur-admin-unlock-akun)
4. [Popup Error Autentikasi](#popup-error-autentikasi)
5. [Referensi API](#referensi-api)
6. [Testing](#testing)

---

## Kebijakan Account Lockout

| Aspek | Aturan |
|---|---|
| Pemicu | 5 kali gagal login (email benar, password salah) **berturut-turut** |
| Efek | Akun terkunci — login ditolak **meski password benar** (HTTP 423) |
| Durasi | Tanpa auto-unlock — tidak ada batas waktu |
| Pembukaan | **Hanya admin** (lihat [prosedur](#prosedur-admin-unlock-akun)) |
| Reset counter | Setiap login berhasil → counter kembali 0, lock dibuka bila ada |
| Pesan ke pengguna | "Akun dikunci … Hubungi admin untuk membuka kembali." |

Catatan: kegagalan dengan **email tidak terdaftar** tidak dihitung (tidak ada
akun yang bisa dikunci) — tetap 401 generik tanpa membocorkan keberadaan akun.
Rate limiting per-IP ([`RATE-LIMITING.md`](RATE-LIMITING.md)) tetap berlaku
sebelum mekanisme ini.

## Cara Kerja Teknis

Skema (migrasi idempoten di `backend/app.py` → `SCHEMA`, dieksekusi saat startup):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
```

Alur di `POST /api/auth/login`:

```text
captcha valid?
  └─ email terdaftar?
       └─ locked_at terisi?  ── ya → 423 (ditolak, tanpa verifikasi password)
       └─ password cocok?
            ├─ ya  → reset failed_login_count=0, locked_at=NULL → 200 + session
            └─ tidak
                 → failed_login_count += 1 (di-commit sebelum response)
                 → jika >= 5 → locked_at=now() → 423
                 → selain itu → 401 "Email atau kata sandi salah"
```

Detail penting: update counter di-`commit()` **sebelum** `HTTPException` di-raise.
Tanpa itu, context manager `with db()` akan me-rollback transaksi dan kegagalan
tidak pernah tercatat (bug yang ditemukan & diperbaiki saat implementasi).

## Prosedur Admin: Unlock Akun

Belum ada panel admin — unlock dilakukan manual via SQL:

```bash
sudo -u postgres psql perkututcup -c \
  "UPDATE users SET failed_login_count = 0, locked_at = NULL WHERE email = 'user@example.com';"
```

Verifikasi:

```bash
sudo -u postgres psql perkututcup -c \
  "SELECT email, failed_login_count, locked_at FROM users WHERE email = 'user@example.com';"
```

Kebijakan terkait: permintaan unlock datang melalui jalur yang sama dengan
"lupa password" (lihat [`AUTH-UPDATES.md`](AUTH-UPDATES.md#lupa-password)) —
pengguna menghubungi admin; admin memverifikasi identitas di luar sistem
sebelum menjalankan perintah di atas.

## Popup Error Autentikasi

Semua error di form login & register kini ditampilkan sebagai **modal popup
custom** (menggantikan pesan inline yang mudah terlewat):

- **Tema menyatu dengan situs**: kartu gelap `--card`, border violet
  `--soft-violet`, teks `--cream`, judul coral `--sunset-coral`.
- **Font sesuai token situs**: judul `Pixelify Sans` (`--font-display`),
  isi `Inter` (`--font-body`).
- **Judul adaptif**: error biasa → "Terjadi Kesalahan"; lockout → "Akun Dikunci".
- **Interaksi tutup**: tombol ×, tombol "Mengerti", klik backdrop, atau `Escape`.
- **Aksesibilitas**: `role="alertdialog"`, `aria-modal`, fokus pindah ke tombol
  "Mengerti" saat muncul; animasi dimatikan bila `prefers-reduced-motion`.

Implementasi: `script.js` (`showAuthError` / `ensureAuthModal` — modal dibuat
sekali dan dipakai ulang) + blok `.auth-modal-*` di `styles.css`.
Pesan teks tetap berasal dari server (field `detail`), sehingga perubahan
pesan tidak perlu sentuh frontend.

## Referensi API

| Kode | Kondisi | `detail` |
|---|---|---|
| 200 | Login sukses | `{user: {...}}` |
| 401 | Email tidak terdaftar / password salah (belum lockout) | `"Email atau kata sandi salah"` |
| **423** | **Akun terkunci** | `{"lockout": "Akun dikunci ... Hubungi admin ..."}` |
| 400 | Captcha salah/kedaluwarsa | `{"captcha": "..."}` |
| 429 | Rate limit | `"Terlalu banyak percobaan. ..."` |

Urutan pemeriksaan login: **rate limit → captcha → lockout → password**.

## Testing

```bash
# 5x salah -> percobaan ke-5 = 423, percobaan berikutnya 423 juga
# (meski password benar). Server harus berjalan.
for i in $(seq 1 6); do
  cid=$(curl -s http://127.0.0.1:8000/api/auth/captcha)
  # ... pasangkan dengan jawaban captcha, POST ke /api/auth/login
done
```

Skrip Python siap pakai pernah dijalankan; hasil terverifikasi:

```text
percobaan 1..4 : 401 (counter naik)
percobaan 5    : 423 Akun dikunci setelah 5 kali salah kata sandi...
percobaan 6,7  : 423 Akun dikunci karena terlalu banyak percobaan gagal...
password benar : 423 (tetap ditolak selama terkunci)
```

Unlock via SQL (bagian [prosedur admin](#prosedur-admin-unlock-akun)) →
login kembali normal.
