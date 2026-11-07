# Rate Limiting — Perlindungan Brute-Force

> Bagian dari hardening autentikasi (lihat [`UPDATES.md`](UPDATES.md), [`AUTH-UPDATES.md`](AUTH-UPDATES.md)).
> Terakhir diperbarui: 2026-11-05.

---

## Daftar Isi

1. [Tujuan](#tujuan)
2. [Konfigurasi Aktif](#konfigurasi-aktif)
3. [Cara Kerja](#cara-kerja)
4. [Perilaku Saat Limit Terlampaui](#perilaku-saat-limit-terlampaui)
5. [Pertimbangan Desain](#pertimbangan-desain)
6. [Deploy: Multi-Worker / Multi-Instance](#deploy-multi-worker--multi-instance)
7. [Referensi API — Kode Error](#referensi-api--kode-error)
8. [Testing](#testing)

---

## Tujuan

Endpoint autentikasi adalah target brute-force: percobaan password berulang,
flooding register untuk membuat akun sampah, dan enumerasi email. Rate limiting
membatasi laju permintaan **per alamat IP** sehingga serangan otomatis menjadi
tidak praktis, tanpa mengganggu pengguna sah (batas jauh di atas kebutuhan
manusia normal).

## Konfigurasi Aktif

Implementasi: [`slowapi`](https://slowapi.readthedocs.io/) (pembungkus `limits`
untuk Starlette/FastAPI), dideklarasikan di `backend/app.py`.

| Endpoint | Batas | Alasan |
|---|---|---|
| `GET /api/auth/captcha` | 10 / menit / IP | Mengambil soal; login normal hanya butuh 1–2 kali per sesi |
| `POST /api/auth/register` | 5 / menit / IP | Membuat akun adalah operasi langkah; 5/menit lebih dari cukup untuk manusia |
| `POST /api/auth/login` | 10 / menit / IP | Brute-force 10 percobaan/menit = maksimal 600/hari/IP, tidak praktis untuk tebak password 15+ karakter |

Endpoint lain (profil, tim, logout) tidak dibatasi — semuanya memerlukan
session valid dan bukan permukaan serangan brute-force.

## Cara Kerja

1. Setiap request masuk, `slowapi` mengambil **kunci** = IP klien
   (`get_remote_address`; otomatis membaca `X-Forwarded-For` bila di-deploy
   di belakang reverse proxy — sesuai topologi `docs/Infra/`).
2. Counter disimpan **in-memory** per proses, dengan window 1 menit
   (fixed-window).
3. Permintaan ke-N+1 yang melewati batas ditolak **sebelum** menyentuh
   endpoint — tidak ada query database, tidak ada bcrypt (menghemat CPU).

Deklarasi (cuplikan `backend/app.py`):

```python
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/auth/login")
@limiter.limit("10/minute")
def login(request: Request, payload: LoginIn, response: Response):
    ...
```

Catatan: decorator `@limiter.limit` mewajibkan parameter `request: Request`
pada signature handler — itulah alasan parameter tersebut ditambahkan.

## Perilaku Saat Limit Terlampaui

**Response `429 Too Many Requests`:**

```json
{"detail": "Terlalu banyak percobaan. Coba lagi sebentar lagi."}
```

- Header `Retry-After: <detik>` disertakan agar klien tahu kapan boleh mencoba lagi.
- Frontend (`script.js`) menampilkan isi `detail` sebagai pesan error form
  (sudah ditangani blok `else` pada handler submit).

## Pertimbangan Desain

| Keputusan | Alasan |
|---|---|
| `slowapi`, bukan middleware custom | Standar ekosistem FastAPI, deklaratif, minim kode; menambah dependensi kecil teruji |
| In-memory storage | Proses uvicorn saat ini single-worker; tanpa dependensi infrastruktur tambahan (Redis). Lihat bagian deploy untuk skala berikutnya |
| Per-IP, bukan per-akun | Tidak membocorkan keberadaan akun (tidak ada pesan "akun terkunci"); penyera IP cocok dengan jaringan kampus |
| Limit longgar (5–10/menit) | Prioritas: tidak mengganggu pengguna sah saat demo/kompetisi; captcha sudah menahan bot kasar, rate limit menahan volume |
| Bukan per-endpoint global | Setiap endpoint punya batas sendiri; ambil captcha tidak memakan kuota login |

**Limitasi yang diterima:** fixed-window in-memory per proses. Cukup untuk
topologi saat ini (1 proses uvicorn + reverse proxy). Untuk skala di bawah.

## Deploy: Multi-Worker / Multi-Instance

Counter in-memory hanya hidup di satu proses. Bila arsitektur berubah:

```bash
# uvicorn multi-worker ATAU beberapa instance di belakang load balancer:
# ganti storage ke Redis agar counter dibagi antar proses.

# 1. Set env di .env
RATELIMIT_STORAGE_URI=redis://localhost:6379/0

# 2. Di backend/app.py
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.environ.get("RATELIMIT_STORAGE_URI", "memory://"),
)
```

Catatan lain untuk produksi:

- **Reverse proxy** (`nginx`/Traefik sesuai `docs/Infra/`): pastikan meneruskan
  `X-Forwarded-For` dan FastAPI mempercayainya (`--proxy-headers` + `--forwarded-allow-ips`)
  agar kunci rate limit = IP asli klien, bukan IP proxy. Bila tidak, semua
  klien berbagi satu kuota dari IP proxy.
- **Batas nginx tambahan** (lapis kedua, opsional): `limit_req_zone` pada
  `/api/auth/` memberi proteksi sebelum request menyentuh Python.

## Referensi API — Kode Error

| Kode | Kondisi | Body |
|---|---|---|
| 200/201 | Normal | — |
| 400 | Captcha salah/kedaluwarsa | `{"detail": {"captcha": "..."}}` |
| 401 | Kredensial salah (login) | `{"detail": "Email atau kata sandi salah"}` |
| 409 | Email terdaftar (register) | `{"detail": {"email": ["Email sudah terdaftar"]}}` |
| 422 | Validasi input gagal | `{"detail": {"password": [...]}}` |
| **429** | **Rate limit terlampaui** | `{"detail": "Terlalu banyak percobaan. Coba lagi sebentar lagi."}` + `Retry-After` |

Urutan pemeriksaan di endpoint auth: **rate limit → captcha → validasi →
kredensial**. Request yang di-limit tidak sampai memverifikasi captcha,
dan sebagainya — lapisan luar lebih murah dulu.

## Testing

Verifikasi cepat (server harus berjalan):

```bash
# 12 permintaan beruntun ke captcha — 10x 200 lalu 2x 429
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:8000/api/auth/captcha
done; echo
# → 200 200 200 200 200 200 200 200 200 200 429 429
```

Uji 429 pada login (harus menunggu window reset atau restart server):

```bash
seq 1 11 | xargs -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' -d '{}'
# request ke-11 → 429
```

Catatan: window fixed 1 menit; restart server mengosongkan counter (in-memory).
