# Perkutut Cup 2026 — Website

## 1. What is this about

Website statis untuk kompetisi IT **Perkutut Cup 2026** (Politeknik Negeri Cilacap).
Berisi halaman publik (landing, about, timeline, sign-in, join) dan user portal
(dashboard profile & team, project submission) plus halaman 404 kustom.

- **Stack:** HTML + CSS + JavaScript murni. Tanpa framework, tanpa bundler, tanpa `package.json`.
- **Build:** tidak ada. File di-deploy apa adanya.
- **Path:** semua relatif (`../`, `../../`), jadi bisa jalan dari subfolder mana pun.
- **Status:** frontend selesai, backend belum terintegrasi. Data di dashboard masih hard-coded.

Menjalankan lokal:

```bash
python3 -m http.server 8321
# buka http://localhost:8321/
```

## 2. Tree project directory

```
perkututcup/
├── index.html                  # Landing page
├── 404.html                    # Halaman not-found
├── styles.css                  # Stylesheet global semua halaman
├── dashboard.css               # Stylesheet khusus dashboard
├── auth-motion.css             # Animasi halaman auth (sign-in, join)
├── script.js                   # Semua interaksi frontend
├── auth-guard.js               # Cek sesi sebelum dashboard dirender
├── .gitignore
├── README.md
│
├── about/
│   └── index.html              # Disclaimer / policy
├── timeline/
│   └── index.html              # Placeholder "Coming Soon"
├── sign-in/
│   └── index.html              # Login
├── join/
│   └── index.html              # Registrasi
│
├── dashboard/
│   ├── profile/
│   │   └── index.html          # Profile & Team
│   └── submission/
│       └── index.html          # Project Submission
│
├── assets/
│   ├── fonts/                  # 3 font lokal (Game Paused, I Pixel U, Terminess Mono)
│   ├── images/
│   │   ├── logo-navbar-final.png, mascot-figma.png, team-photo.png,
│   │   ├── sponsor-final-1..6.png
│   │   └── dashboard/          # Thumbnail upload + avatar tim
│   └── svg/
│       ├── favicon.svg, mascot-halo.svg, sparkle*.svg, chevron-down.svg
│       ├── arrow-up-right.svg, icon-*.svg
│       └── dashboard/          # 26 ikon sidebar, metric, watermark
│
└── docs/
    ├── ASSESSMENT.md           # Asesmen project + kontrak backend
    └── FRONTEND.md             # Dokumentasi frontend per file
```

## 3. Penjelasan file

### Halaman HTML

| File | Isi |
| --- | --- |
| `index.html` | Landing: hero `#home`, tema `#theme-introduction`, langkah daftar `#get-started`, tim, 8 kartu kompetisi `#competition`, FAQ `#faq`, footer. |
| `about/index.html` | Teks disclaimer dalam `.policy-stage`. Tidak ada data dinamis. |
| `timeline/index.html` | Placeholder berisi `.coming-soon-title`. |
| `sign-in/index.html` | Form login `[data-auth-form="sign-in"]`. Submit sekarang menulis flag sesi lalu redirect ke dashboard. |
| `join/index.html` | Form registrasi `[data-auth-form="join"]` dengan aturan password live. Belum ada redirect. |
| `dashboard/profile/index.html` | Figma `308:2`. Sidebar, 3 metric, form data pribadi, 4 kartu upload, kartu My Team + bukti pembayaran. |
| `dashboard/submission/index.html` | Figma `308:255`. Metric deadline, guide, deskripsi kompetisi, problem files, tab pengumpulan. |
| `404.html` | Shell sama dengan timeline, judul "404" + subtitle Terminess Mono. Target redirect `auth-guard.js`. |

### CSS

| File | Baris | Isi |
| --- | --- | --- |
| `styles.css` | ~3.100 | Dimuat semua halaman. `:root` token warna/font, base, header/nav, hero, theme, steps, team, competition, FAQ, footer, decor, `@font-face` lokal, responsive. **Jangan dipindah** — path font relatif ke root. |
| `dashboard.css` | ~1.250 | Khusus dashboard. Grid `288px | 1fr`, sidebar, metric, card, form, upload, team card, submission (guide, file list, tabs), responsive. Dimuat setelah `styles.css`. |
| `auth-motion.css` | ~108 | View Transitions API, entrance card, stagger, shimmer, reduced-motion. Sign-in/join saja. |

Token utama ada di `styles.css` `:root`: `--obsidian-top`, `--mid`, `--deep-footer`,
`--sunset-coral`, `--soft-violet`, `--cream`, `--lavender`, `--card`, `--grad`.
Warna baru harus pakai token yang sudah ada.

### JavaScript

| File | Baris | Isi |
| --- | --- | --- |
| `script.js` | ~292 | Satu IIFE, tiap blok dibatasi selector. Isi: split judul per huruf, scroll reveal, toggle nav mobile, accordion FAQ, glow kartu, parallax maskot, toggle password, validasi form auth, tab dashboard, submit form dashboard, forgot-password placeholder. |
| `auth-guard.js` | ~12 | Dimuat sinkron di `<head>` dashboard. Kalau `sessionStorage`/`localStorage["perkutut-auth"]` tidak ada → `location.replace("../../404.html")`. Ini **bukan keamanan**, hanya UX. |

### Assets

- `assets/fonts/` — 3 file (~2.7 MB). Hanya dideklarasikan di `styles.css`.
- `assets/images/` — logo, maskot, sponsor, foto tim, plus `dashboard/` thumbnail upload.
- `assets/svg/` — ikon halaman publik.
- `assets/svg/dashboard/` — 26 file, konvensi nama: `nav-*` (sidebar), `icon-*` (metric/aksi), `watermark-*` (glyph besar di metric).

### Docs

- `docs/ASSESSMENT.md` — snapshot project, inventaris halaman, token desain, kontrak backend (endpoint + model data), aksesibilitas, risiko, urutan implementasi.
- `docs/FRONTEND.md` — peta per file, peta baris CSS, daftar blok JS, aturan edit untuk agent backend.

## 4. Struktur web

```
Perkutut Cup 2026
│
├── Publik
│   ├── /                    Landing
│   ├── /about/              Disclaimer
│   ├── /timeline/           Coming soon
│   ├── /join/               Registrasi
│   └── /404.html            Not found
│
├── Auth
│   └── /sign-in/  ──────►  submit → /dashboard/profile/
│
└── User Portal  (dijaga auth-guard.js)
    ├── /dashboard/profile/      Profile & Team
    └── /dashboard/submission/   Project Submission
```

Alur:

1. User buka landing → klik "DAFTAR" → `/join/`.
2. User login di `/sign-in/` → flag sesi ditulis → redirect ke `/dashboard/profile/`.
3. `/dashboard/*` tanpa flag → `/404.html`.
4. Sidebar: PROFILE & TEAM ↔ PROJECT SUBMISSION, HOME PAGE, LOGOUT (ke `/sign-in/`).

Urutan muat aset:

- Halaman publik: `styles.css` → `script.js` (defer).
- Auth: `styles.css` → `auth-motion.css` → `script.js` (defer).
- Dashboard: `styles.css` → `dashboard.css` → `auth-guard.js` (head, sinkron) → `script.js` (defer).

## 5. Todolist

**Backend & auth**

- [ ] Endpoint auth: `POST /api/auth/login`, `register`, `logout`, `GET /api/auth/session`, `forgot-password`.
- [ ] Ganti flag `sessionStorage` dengan cookie HTTP-only + guard sisi server.
- [ ] Hapus `auth-guard.js` setelah guard server ada.

**Dashboard**

- [ ] `GET /api/me` + `PATCH /api/me` untuk form profile.
- [ ] `GET /api/team` untuk kode tim, anggota, bukti pembayaran.
- [ ] Upload dokumen: `<input type="file">` + multipart ke object storage, signed URL untuk preview.
- [ ] `GET /api/submission` untuk deadline, status, dan jumlah file.
- [ ] Download problem file dengan validasi window di server.
- [ ] Isi konten tab per item (sekarang satu panel dipakai bersama).

**Konten & kualitas**

- [ ] Ganti link placeholder: `#whatsapp`, `#problem-files`, `data-view-upload`, `https://instagram.com/`.
- [ ] Samakan bahasa copy (sekarang campur ID/EN).
- [ ] Tambah meta description + Open Graph.
- [ ] Kompres aset (font 2.7 MB, gambar 2.5 MB → WebP/AVIF, subset font).
- [ ] Pecah `styles.css` yang punya blok duplikat (`.site-header`, `.timeline-page`, `.site-footer`).
- [ ] Ekstrak sidebar dashboard yang diduplikasi di dua halaman.
- [ ] Tambah validasi HTML + Lighthouse CI.
- [ ] Daftarkan `404.html` sebagai error document di server (nginx `error_page 404 /404.html;`, Netlify `/* /404.html 404`).
