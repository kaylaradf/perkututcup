# Plan: Superkutut (god-mode dashboard + live audit log) & Backup/Restore DB

Status: PLANNING — belum implement. Dua fase terpisah, bisa dirilis independen.

---

## Fase A — Superkutut

### A1. Konsep & akses

- **Role baru `superadmin`** (bukan dashboard admin biasa): satu login melihat &
  melakukan SEMUA privilege role (peserta, admin, juri) dalam satu dashboard.
- **Login terpisah**: halaman `/superkutut/sign-in/` sendiri (form + CAPTCHA +
  rate limit + lockout, memakai ulang mekanisme auth existing). Session cookie terpisah
  `perkutut_super_session` sehingga login superkutut tidak bercampur dengan
  session portal biasa; dua-duanya bisa aktif bersamaan di browser yang sama.
- Akun superadmin **tidak bisa dibuat dari UI manapun** (termasuk Kelola
  Pengguna). Pembuatan hanya via env seed (`PERKUTUT_SUPERADMIN_EMAIL/PASSWORD`)
  atau CLI di server. `USER_ROLES` untuk admin users tetap {user, admin, jury};
  API menolak create/update ke role superadmin (defense: endpoint Kelola Pengguna
  tidak bisa eskalasi).
- Guard ganda seperti existing: server (`require_superadmin` + route guard di
  `routers/web.py`) + client router. URL `/superkutut/` → 404 tanpa session super.
- Superadmin boleh memakai SEMUA endpoint existing: `require_admin`/`require_jury`
  diperluas menerima `superadmin` (satu baris per helper di `core.py`).
  Endpoint peserta (`require_user`) otomatis berlaku.

### A2. Audit log — standar & cakupan

Tabel baru `audit_logs` (migrasi 0006):

```sql
CREATE TABLE audit_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id    BIGINT,                -- NULL utk anonim (login gagal, captcha)
    actor_email TEXT,                  -- snapshot email saat kejadian (tahan hapus user)
    actor_role  TEXT,
    session_id  TEXT,                  -- hash token session (korelasi per sesi)
    ip          INET,
    user_agent  TEXT,
    category    TEXT NOT NULL,         -- auth | profile | team | document | verification | competition | submission | jury | admin_users | superkutut | backup
    action      TEXT NOT NULL,         -- login_success, login_failed, logout, upload_document, approve_document, ...
    target_type TEXT,                  -- user | team | document | competition | submission | backup
    target_id   TEXT,
    detail      JSONB NOT NULL DEFAULT '{}',  -- nilai aktivitas: field berubah (before/after utk PATCH), nama file, ukuran, skor, alasan reject, filter query, dsb.
    outcome     TEXT NOT NULL DEFAULT 'ok',   -- ok | denied | error
    request_id  UUID                   -- korelasi satu request → banyak baris log
);
CREATE INDEX ON audit_logs (ts DESC);
CREATE INDEX ON audit_logs (actor_id, ts DESC);
CREATE INDEX ON audit_logs (category, action, ts DESC);
```

**Titik tangkap (choke points, bukan tebar manual di 54 route):**

1. **Middleware FastAPI** (`core.py` / `app.py`): satu middleware mencatat SEMUA
   request API (`/api/*`) otomatis: method, path, status, actor dari session,
   IP (X-Forwarded-For via proxy), UA, request_id, durasi. Ini memenuhi
   "log penggunaan seluruh fitur" tanpa menyentuh tiap router.
2. **Auth events eksplisit** di `routers/auth.py` + superkutut login:
   `login_success`, `login_failed` (dengan email yang dicoba + alasan:
   sandi salah / locked / captcha salah), `logout`, `register`, lockout trigger.
   Nilai sensitif (password, hash, token) TIDAK PERNAH masuk detail.
3. **Mutasi bernilai (value-level)**: helper `audit(conn, ...)` dipanggil di
   handler mutasi penting dengan detail before/after:
   - profile PATCH: field yang berubah + nilai lama/baru (kecuali password)
   - upload/replace dokumen & karya: nama file, ukuran, mime, doc_type, status
   - approve/reject verifikasi: status lama→baru, feedback
   - kompetisi create/update/delete: diff field (termasuk soal)
   - tim join/add/remove/leave/disband: kode tim, anggota terdampak
   - penilaian juri: skor, feedback, team_id
   - admin users: create/update role/reset password (tanpa nilai password)
   - aksi superkutut & backup/restore (fase B)
4. **Retensi**: partisi ringan by-month via index + job purge `> 180 hari`
   ( configurable `PERKUTUT_AUDIT_RETENTION_DAYS`, default 180) jalan di startup
   + timer harian. Volume estimasi kecil (puluhan user), tabel tunggal cukup —
   tidak perlu partitioning fisik.

Kegagalan menulis audit TIDAK boleh menggagalkan request bisnis (try/except +
log stderr), kecuali untuk aksi superadmin sendiri (fail-closed, keamanan).

### A3. API superkutut (`routers/superkutut.py`)

Semua `require_superadmin`:

- `POST /api/superkutut/auth/login|logout`, `GET /api/superkutut/auth/session`
  (CAPTCHA + limiter + lockout reuse; session cookie terpisah).
- `GET /api/superkutut/logs` — filter: `category`, `action`, `actor_id`,
  `outcome`, `q` (cari email/target/detail), `from`, `to`, cursor pagination
  (`before_id`), limit ≤ 200.
- `GET /api/superkutut/logs/stream` — **SSE** (Server-Sent Events) live tail:
  poll tabel per 2 detik `WHERE id > last_id`, kirim batch JSON per event.
  SSE dipilih daripada WebSocket: cukup HTTP biasa, lolos Cloudflare tunnel,
  tanpa dependensi baru, reconnect otomatis oleh EventSource browser.
- `GET /api/superkutut/stats` — ringkasan: login sukses/gagal 24 jam, user
  aktif, upload terbaru, antrean verifikasi, submisi menunggu juri.
- `GET /api/superkutut/logs/export` — unduh `.log` sesuai filter, format
  Application Logging Standard (Hybrid: `[TS_UTC] [LEVEL] [IP] [user_id=…]
  [EVENT] [STATUS] key=value …`, satu baris per event, tanpa emoticon;
  nilai user-supplied di-strip CR/LF/TAB — CWE-117). Console UI memakai
  format yang sama, bracket diwarnai per level/status.
- Impersonation TIDAK dibuat (superadmin cukup punya semua privilege langsung;
  impersonasi menambah risiko & kompleksitas audit — YAGNI).

### A4. UI (`/superkutut/` — bagian dari SPA shell yang sama)

- `app/index.html` memuat modul baru `assets/js/pages/superkutut-*.js`;
  route `/superkutut/` di-guard server (shell inject state role superadmin).
- Layout: sidebar superkutut sendiri dengan tab:
  1. **Live Log** (default): tabel streaming SSE — waktu, actor+role, kategori,
     aksi, target, outcome, detail (expandable JSON); filter bar + pause/resume
     + auto-scroll; badge warna per kategori.
  2. **Overview**: kartu stats (login 24h, gagal login, upload hari ini,
     antrean verifikasi, submisi belum dinilai) + grafik sederhana per jam
     (render CSS/canvas kecil, tanpa library chart baru).
  3. **Semua Fitur**: tab tertanam men-deep-link ke halaman existing
     (verifikasi/kompetisi/users/jury/profile/submission) — karena role
     superadmin diterima semua guard, halaman existing langsung berfungsi
     penuh; sidebar halaman tsb menampilkan menu gabungan saat role superadmin.
- Login `/superkutut/sign-in/`: halaman statis terpisah (pola sign-in existing),
  branding "SUPERKUTUT", tanpa link dari halaman publik manapun.

### A5. Keamanan khusus superkutut

- Rate limit login lebih ketat (5/menit), lockout 5x (reuse), CAPTCHA wajib.
- Cookie `perkutut_super_session`: HttpOnly, SameSite=Strict (lebih ketat dari
  portal), Secure mengikuti env, TTL 8 jam (lebih pendek dari 24h portal).
- Semua aksi superadmin tercatat fail-closed dengan `category=superkutut`.
- Header `X-Robots-Tag: noindex` + robots meta di halaman superkutut.
- Endpoint logs/stream menolak role lain (403) dan tidak bocor lewat catch-all.
- SSE dibatasi 1 koneksi per session (server-side guard sederhana).

### A6. Urutan kerja & estimasi berkas

1. Migrasi 0006 (`audit_logs` + role check update) + helper `audit()` + middleware.
2. Auth events di routers/auth.py; value-level detail di handler mutasi.
3. `routers/superkutut.py` (login/session/logs/stats/stream/export) + seed env.
4. Frontend: sign-in page + modul SPA superkutut (live log SSE, overview).
5. Perluasan require_admin/require_jury + sidebar gabungan + guard web.py.
6. Uji E2E di staging via browser (login super, lihat live log saat user lain
   beraktivitas, filter, export, akses semua fitur dari satu session).

Berkas baru: `backend/routers/superkutut.py`, `backend/migrations/0006_audit_logs.sql`,
`superkutut/sign-in/index.html`, `assets/js/pages/superkutut.js`.
Berkas berubah: `core.py`, `app.py` (middleware), `routers/auth.py` + handler
mutasi (panggilan audit), `routers/web.py` (guard+shell), `dashboard-common.js`
(sidebar superadmin), `router.js` (guard client), `app/index.html`, `.env.example`, docs.

---

## Fase B — Backup & Restore DB (setelah Fase A rilis)

### B1. Backup

- **Format**: `pg_dump --format=plain --clean --if-exists --no-owner
  --no-privileges` → **file `.sql`** (portabel: bisa dibaca/diedit, restore
  lewat `psql` di server mana pun). Dikompresi gzip saat download (`.sql.gz`)
  bila perlu hemat; di disk tetap `.sql` polos agar gampang diinspeksi.
  Manifest JSON (waktu, ukuran, sha256, schema_migrations terbaru, jumlah
  baris per tabel). Toggle ikutkan `uploads/` sebagai **tar.gz terpisah**
  (file fisik tidak ada di DB, hanya path-nya).
- **Lokasi**: `/root/perkutut-backups/` (di LUAR deploy dir supaya rsync CI
  tidak menyentuhnya), retensi N hari (default 14, env).
- **Jadwal**: systemd timer `perkutut-backup.timer` harian 02:00 + trigger
  manual dari dashboard. Timer lebih andal daripada cron di dalam app.
- **Integritas**: sha256 di manifest; verifikasi pasca-dump: ukuran > 0 dan
  baris penutup `-- PostgreSQL database dump complete` ada; gagal = status
  error, file ditandai.
- Tabel `backups` (migrasi 0007): id, created_at, created_by (NULL=timer),
  filename, size_bytes, sha256, includes_uploads, uploads_filename, status,
  note, source (`local`/`upload`).

### B2. Restore (operasi berbahaya — pagar berlapis)

- Hanya superadmin. Sumber: backup terdaftar ATAU **upload file `.sql`
  eksternal** (max 100MB; divalidasi: header `-- PostgreSQL database dump`,
  marker penutup, sha256 dicatat, disimpan sebagai backup `source=upload`
  sebelum bisa di-restore — tidak pernah langsung dieksekusi dari stream).
- Alur wajib:
  1. Pilih backup → tampilkan manifest + warning.
  2. **Auto-backup pre-restore** (snapshot kondisi sekarang dulu, selalu).
  3. Konfirmasi ketik-ulang frasa (mis. nama DB) via Swal input — bukan sekadar
     klik OK.
  4. App masuk mode maintenance (flag file; middleware balas 503 untuk semua
     non-superadmin), putus koneksi DB lain (`pg_terminate_backend`),
     `psql --single-transaction --set ON_ERROR_STOP=1 -f backup.sql`
     (dump sudah berisi DROP/CREATE berkat `--clean --if-exists`; atomik:
     gagal = rollback penuh, tidak setengah jadi).
  5. Lepas maintenance, health-check, catat audit `backup.restore` fail-closed
     dengan sha256 sumber + pre-restore snapshot.
- Restore `uploads/` opsional terpisah (extract tar.gz ke uploads/, folder
  lama dipindah ke `.pre-restore-<ts>` dulu — tidak pernah hapus langsung).

### B3. API & UI

- `GET /api/superkutut/backups`, `POST .../backups` (buat sekarang, toggle
  uploads), `POST .../backups/upload` (terima `.sql`), `POST .../backups/{id}/restore`,
  `GET .../backups/{id}/download` (stream `.sql`), `DELETE .../backups/{id}` —
  semua audit fail-closed.
- Tab **Backup** di dashboard superkutut: daftar backup (waktu, ukuran, sha256
  pendek, includes_uploads, source), tombol Backup Sekarang, Upload .sql,
  Restore (alur konfirmasi), Unduh, Hapus; status timer berikutnya.
- Restore panjang → jalankan sebagai background task dengan progress via SSE
  channel yang sama dengan live log.

### B4. Yang eksplisit TIDAK dibuat (YAGNI)

- Off-site/S3 sync (bisa ditambah belakangan: rclone ke object storage via timer).
- PITR/WAL archiving (butuh infra terpisah; dump harian cukup untuk skala ini).
- Impersonation user, multi-tenant, RBAC granular per-permission.

---

## Keputusan terbuka (jawab sebelum implement Fase A)

1. Akun superadmin pertama: email apa? (password dibuat via env di server,
   tidak lewat chat/repo)
2. Retensi audit 180 hari OK? Retensi backup 14 hari OK?
3. Backup ikutkan folder uploads secara default? (rekomendasi: ya)
4. Nama brand tampilan: "SUPERKUTUT" saja, atau ada subtitle khusus?
