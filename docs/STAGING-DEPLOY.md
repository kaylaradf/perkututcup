# Staging deployment (CI/CD)

Push ke branch `staging` → GitHub Actions otomatis deploy ke server staging.
Manual trigger: tab Actions → "Deploy staging" → Run workflow.
Tidak perlu SSH manual lagi.

## Cara kerja (`.github/workflows/staging-deploy.yml`)

1. Validasi secrets/variables environment `staging`.
2. Runner join tailnet via `tailscale/github-action` (server hanya ber-IP privat `100.120.68.54`).
3. `git archive HEAD` → rsync in-place ke `/root/something/perkututcup`,
   `--exclude` melindungi state server: `.env`, `.venv`, `uploads/`.
4. Di server: `pip install -r backend/requirements.txt` (venv existing),
   `systemctl restart perkututcup`, health-check `http://127.0.0.1:8000/health`
   (12 percobaan × 5 detik). Gagal → run merah + `systemctl status` di log.

Migrasi DB jalan otomatis saat startup app. Rollback kode = revert commit lalu
push (migrasi harus tetap backward-compatible).

## Konfigurasi (environment GitHub `staging`)

Secrets:

| Secret | Isi |
| --- | --- |
| `TS_AUTHKEY` | Tailscale auth key reusable (expiry 90 hari — perbarui sebelum kedaluwarsa). |
| `STAGING_SSH_PRIVATE_KEY` | Private key ed25519 khusus CI; pubkey-nya ada di `authorized_keys` root server. |

Variables (bukan rahasia):

| Variable | Nilai |
| --- | --- |
| `STAGING_HOST` | `100.120.68.54` |
| `STAGING_USER` | `root` |
| `STAGING_DEPLOY_DIR` | `/root/something/perkututcup` |
| `STAGING_SERVICE` | `perkututcup` |
| `STAGING_HEALTH_URL` | `http://127.0.0.1:8000/health` |

## Catatan operasional

- Deploy bersifat in-place (bukan releases/symlink): file yang dihapus dari repo
  tidak otomatis terhapus di server; hapus manual bila perlu.
- Dependensi Python baru cukup ditambahkan ke `backend/requirements.txt` —
  workflow meng-install tiap deploy.
- `TS_AUTHKEY` kedaluwarsa → step Tailscale gagal; generate key baru di
  Tailscale admin → Settings → Keys, update secret.
- Node CI ephemeral muncul di daftar mesin tailnet saat run; otomatis hilang
  setelah runner selesai (bisa dibersihkan manual di admin console).
