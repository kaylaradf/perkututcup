(function () {
  "use strict";
  if (!window.Router) return;

  var state = { ac: null };

  function pageCss() {
    return `    .admin-table-wrap {
      overflow-x: auto;
      margin-top: 1.2rem;
      border: 1px solid var(--dash-border-mid);
      border-radius: 12px;
      background: var(--dash-card);
    }
    .admin-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
      text-align: left;
    }
    .admin-table th,
    .admin-table td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--dash-border-subtle);
    }
    .admin-table th {
      background: rgba(255, 232, 217, 0.04);
      color: var(--dash-text-muted);
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .admin-table tr:last-child td {
      border-bottom: none;
    }
    .admin-table tr:hover td {
      background: rgba(255, 232, 217, 0.02);
    }
    .comp-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      font-size: 0.65rem;
      font-weight: 700;
      font-family: var(--font-mono);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .comp-badge--open {
      background: rgba(46, 204, 113, 0.16);
      color: #2ecc71;
      border: 1px solid rgba(46, 204, 113, 0.3);
    }
    .comp-badge--upcoming {
      background: rgba(241, 196, 15, 0.16);
      color: #f1c40f;
      border: 1px solid rgba(241, 196, 15, 0.3);
    }
    .comp-badge--closed {
      background: rgba(231, 76, 60, 0.16);
      color: #e74c3c;
      border: 1px solid rgba(231, 76, 60, 0.3);
    }
    .comp-badge--type {
      background: rgba(134, 68, 162, 0.16);
      color: #bf8fee;
      border: 1px solid rgba(134, 68, 162, 0.3);
    }
    .btn-edit-comp {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--dash-border-mid);
      border-radius: 8px;
      background: rgba(255, 232, 217, 0.06);
      color: var(--dash-text-body);
      font-family: var(--font-mono);
      font-size: 0.7rem;
      cursor: pointer;
      transition: background 150ms ease, color 150ms ease;
    }
    .btn-delete-comp{display:inline-flex;align-items:center;gap:5px;padding:.35rem .75rem;border:1px solid rgba(231,76,60,.35);border-radius:8px;background:rgba(231,76,60,.08);color:#e74c3c;font-family:var(--font-mono);font-size:.7rem;cursor:pointer}.btn-delete-comp:hover{background:rgba(231,76,60,.16)} .btn-edit-comp:hover {
      background: var(--dash-nav-hover);
      color: var(--dash-text-primary);
    }
    .admin-modal {
      position: fixed;
      inset: 0;
      background: rgba(11, 12, 16, 0.75);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 200ms ease;
    }
    .admin-modal.is-open {
      opacity: 1;
      pointer-events: auto;
    }
    .admin-modal-card {
      width: 100%;
      max-width: 640px;
      max-height: 90vh;
      overflow-y: auto;
      background: var(--dash-surface);
      border: 1px solid var(--dash-border-mid);
      border-radius: 18px;
      padding: 1.8rem;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5);
    }
    .admin-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.2rem;
      padding-bottom: 0.8rem;
      border-bottom: 1px solid var(--dash-border-subtle);
    }
    .admin-modal-head h3 {
      margin: 0;
      font-size: 1.1rem;
      color: var(--dash-text-primary);
    }
    .btn-close-modal {
      background: none;
      border: none;
      color: var(--dash-text-muted);
      font-size: 1.4rem;
      cursor: pointer;
      line-height: 1;
      padding: 0 0.3rem;
    }
    .btn-close-modal:hover {
      color: var(--dash-text-primary);
    }
    .form-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 640px) {
      .form-grid-2 {
        grid-template-columns: 1fr;
      }
    }
    .field select.input {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
      padding-right: 36px;
      cursor: pointer;
    }
    .unauthorized-card {
      padding: 2.5rem;
      text-align: center;
      border: 1px solid rgba(231, 76, 60, 0.3);
      border-radius: 16px;
      background: rgba(231, 76, 60, 0.08);
      margin-top: 2rem;
    }
    .unauthorized-card h2 {
      color: #e74c3c;
      margin-bottom: 0.8rem;
    }
    .unauthorized-card p {
      color: var(--dash-text-body);
      max-width: 480px;
      margin: 0 auto 1.5rem;
      line-height: 1.6;
    }`;
  }

  function mainMarkup() {
    return `    <main class="dash-main">
      <div id="admin-view" hidden>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
          <div>
            <h1 class="dash-page-title" style="margin-bottom:0.25rem;">Admin · Manajemen Kompetisi</h1>
            <p class="dash-page-sub">Kelola cabang lomba, jenis partisipasi (individu/tim), kuota anggota, dan periode registrasi.</p>
          </div>
          <button class="btn-save" id="btn-add-comp" type="button" style="padding:0.6rem 1.1rem; font-size:0.75rem;">+ TAMBAH KOMPETISI</button>
        </div>

        <section class="dash-metrics" aria-label="Ringkasan kompetisi">
          <article class="metric is-violet">
            <img class="metric-watermark" src="/assets/svg/dashboard/watermark-trophy.svg" width="72" height="72" alt="" />
            <span class="metric-icon"><img src="/assets/svg/dashboard/icon-trophy.svg" width="23" height="23" alt="" /></span>
            <div>
              <p class="metric-label">TOTAL CABANG LOMBA</p>
              <p class="metric-value" id="metric-total-comps">0</p>
            </div>
          </article>

          <article class="metric is-green">
            <img class="metric-watermark" src="/assets/svg/dashboard/watermark-check.svg" width="72" height="72" alt="" />
            <span class="metric-icon"><img src="/assets/svg/dashboard/icon-shield-check.svg" width="23" height="23" alt="" /></span>
            <div>
              <p class="metric-label">PENDAFTARAN BUKA</p>
              <p class="metric-value" id="metric-open-comps">0</p>
            </div>
          </article>

          <article class="metric is-amber">
            <img class="metric-watermark" src="/assets/svg/dashboard/watermark-members.svg" width="72" height="72" alt="" />
            <span class="metric-icon"><img src="/assets/svg/dashboard/icon-members.svg" width="23" height="23" alt="" /></span>
            <div>
              <p class="metric-label">TOTAL TIM TERDAFTAR</p>
              <p class="metric-value" id="metric-total-teams">0</p>
            </div>
          </article>
        </section>

        <section class="card" style="margin-top:1.5rem;">
          <div class="card-head">
            <h2>KATALOG &amp; ATURAN KOMPETISI</h2>
          </div>
          <p class="proof-hint" style="margin-top:0.4rem;">
            Aturan jenis partisipasi (Individu vs Tim) dan batasan kuota anggota dievaluasi secara ketat di sisi server saat pendaftaran maupun penambahan anggota tim.
          </p>

          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Nama &amp; Slug</th>
                  <th>Jenjang</th>
                  <th>Tipe Partisipasi</th>
                  <th>Kuota Anggota</th>
                  <th>Status</th>
                  <th>Statistik</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody id="competitions-tbody">
                <tr>
                  <td colspan="7" style="text-align:center; padding:2rem; color:var(--dash-text-muted);">Memuat data kompetisi…</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div id="unauthorized-view" class="unauthorized-card" hidden>
        <h2>Akses Ditolak (403 Forbidden)</h2>
        <p>Halaman ini dikhususkan untuk Administrator Perkutut Cup 2026. Akun Anda saat ini memiliki peran publik (User).</p>
        <a class="btn-save" href="../profile/" style="display:inline-block; text-decoration:none; padding:0.6rem 1.2rem;">Kembali ke Dashboard Profil</a>
      </div>
    </main>`;
  }

  function modalMarkup() {
    return `  <!-- Modal Edit / Tambah Kompetisi -->
  <div class="admin-modal" id="comp-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="admin-modal-card">
      <div class="admin-modal-head">
        <h3 id="modal-title">Konfigurasi Kompetisi</h3>
        <button class="btn-close-modal" id="modal-close" type="button" aria-label="Tutup">&times;</button>
      </div>

      <form id="comp-form" class="dash-form" novalidate>
        <div class="form-grid-2">
          <label class="field">
            <span>SLUG KOMPETISI</span>
            <input class="input" type="text" name="slug" id="field-slug" required pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" placeholder="contoh: kriptografi" />
            <small style="color:var(--dash-text-faint); font-size:0.65rem; margin-top:2px;">Huruf kecil, angka, dan tanda hubung (-).</small>
          </label>

          <label class="field">
            <span>NAMA KOMPETISI</span>
            <input class="input" type="text" name="name" id="field-name" required placeholder="contoh: Kriptografi" />
          </label>
        </div>

        <div class="form-grid-2">
          <label class="field">
            <span>TARGET AUDIENCE / JENJANG</span>
            <select class="input" name="audience" id="field-audience">
              <option value="SEMUA JENJANG">SEMUA JENJANG</option>
              <option value="PERGURUAN TINGGI">PERGURUAN TINGGI</option>
              <option value="SMA/SMK">SMA/SMK</option>
            </select>
          </label>

          <label class="field">
            <span>STATUS PENDAFTARAN</span>
            <select class="input" name="status" id="field-status">
              <option value="OPEN">OPEN (Pendaftaran Dibuka)</option>
              <option value="UPCOMING">UPCOMING (Segera Hadir)</option>
              <option value="CLOSED">CLOSED (Pendaftaran Ditutup)</option>
            </select>
          </label>
        </div>

        <label class="field">
          <span>DESKRIPSI SINGKAT</span>
          <textarea class="input" name="description" id="field-description" rows="2" style="height:auto; padding:0.6rem 0.8rem; font-family:inherit;" placeholder="Penjelasan singkat mengenai cabang lomba ini"></textarea>
        </label>

        <span class="form-divider" style="margin:1rem 0;"></span>

        <h4 style="margin:0 0 0.8rem; font-size:0.82rem; font-family:var(--font-mono); color:var(--soft-violet);">ATURAN PARTISIPASI &amp; KUOTA</h4>

        <div class="form-grid-2">
          <label class="field">
            <span>TIPE PARTISIPASI</span>
            <select class="input" name="participation_type" id="field-type">
              <option value="TEAM">TEAM (Kelompok / Tim)</option>
              <option value="INDIVIDUAL">INDIVIDUAL (Perorangan)</option>
            </select>
          </label>

          <div class="form-grid-2" id="quota-fields">
            <label class="field">
              <span>MIN ANGGOTA</span>
              <input class="input" type="number" name="min_team_members" id="field-min" min="1" max="10" value="1" required />
            </label>
            <label class="field">
              <span>MAKS ANGGOTA</span>
              <input class="input" type="number" name="max_team_members" id="field-max" min="1" max="10" value="3" required />
            </label>
          </div>
        </div>
        <p class="proof-hint" id="quota-hint" style="margin:0.2rem 0 1rem;"></p>

        <span class="form-divider" style="margin:1rem 0;"></span>

        <h4 style="margin:0 0 0.8rem; font-size:0.82rem; font-family:var(--font-mono); color:var(--soft-violet);">PERIODE PENDAFTARAN (OPSIONAL)</h4>
        <div class="form-grid-2">
          <label class="field">
            <span>WAKTU MULAI (REGISTRATION START)</span>
            <input class="input" type="datetime-local" name="registration_start" id="field-start" />
          </label>
          <label class="field">
            <span>WAKTU BERAKHIR (REGISTRATION END)</span>
            <input class="input" type="datetime-local" name="registration_end" id="field-end" />
          </label>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:0.8rem; margin-top:1.5rem;">
          <button class="btn-upload" type="button" id="btn-cancel-modal">BATAL</button>
          <button class="btn-save" type="submit" id="btn-submit-modal">SIMPAN KONFIGURASI</button>
        </div>
        <p class="dash-status" id="modal-status" role="status" aria-live="polite" style="margin-top:0.8rem; text-align:right;"></p>
      </form>
    </div>
  </div>`;
  }

  function render(container) {
    container.innerHTML =
      '<style>' + pageCss() + '</style>' +
      '<div class="dash">' +
      window.DashCommon.renderAside('competitions') +
      mainMarkup() +
      '</div>' +
      modalMarkup();
  }

  async function onEnter(container) {
    if (state.ac) { try { state.ac.abort(); } catch (_e) {} }
    state.ac = new AbortController();
    var signal = state.ac.signal;
    window.DashCommon.initTheme(container, signal);
    window.DashCommon.initLogout(container, signal);

    /* Admin competitions manager */
    // Admin competitions manager (ported from inline; markup already in DOM)
      const adminView = document.getElementById("admin-view");
      const unauthView = document.getElementById("unauthorized-view");
      const tbody = document.getElementById("competitions-tbody");
      const userNameEl = container.querySelector("[data-user-name]");

      const metricTotalComps = document.getElementById("metric-total-comps");
      const metricOpenComps = document.getElementById("metric-open-comps");
      const metricTotalTeams = document.getElementById("metric-total-teams");

      const modal = document.getElementById("comp-modal");
      const modalTitle = document.getElementById("modal-title");
      const modalClose = document.getElementById("modal-close");
      const btnCancel = document.getElementById("btn-cancel-modal");
      const compForm = document.getElementById("comp-form");
      const modalStatus = document.getElementById("modal-status");

      const fSlug = document.getElementById("field-slug");
      const fName = document.getElementById("field-name");
      const fAudience = document.getElementById("field-audience");
      const fStatus = document.getElementById("field-status");
      const fDescription = document.getElementById("field-description");
      const fType = document.getElementById("field-type");
      const fMin = document.getElementById("field-min");
      const fMax = document.getElementById("field-max");
      const quotaHint = document.getElementById("quota-hint");
      const fStart = document.getElementById("field-start");
      const fEnd = document.getElementById("field-end");

      let isEditing = false;
      let editingCompId = null;
      let competitionsData = [];

      // Periksa RBAC pengguna
      try {
        const sessionRes = await fetch("/api/auth/session", { credentials: "same-origin", signal: signal });
        const sessionData = await sessionRes.json();
        if (!sessionData.authenticated || sessionData.user?.role !== "admin") {
          adminView.hidden = true;
          unauthView.hidden = false;
          return;
        }
        if (userNameEl && sessionData.user.full_name) {
          userNameEl.textContent = sessionData.user.full_name;
        }
        adminView.hidden = false;
        unauthView.hidden = true;
      } catch (e) {
        if (e && e.name === "AbortError") return;
        adminView.hidden = true;
        unauthView.hidden = false;
        return;
      }

      const syncTypeUI = () => {
        if (fType.value === "INDIVIDUAL") {
          fMin.value = "1";
          fMax.value = "1";
          fMin.disabled = true;
          fMax.disabled = true;
          quotaHint.textContent = "Kompetisi Individu: kuota otomatis terkunci pada 1 peserta per pendaftar.";
        } else {
          fMin.disabled = false;
          fMax.disabled = false;
          if (parseInt(fMin.value, 10) < 1) fMin.value = "1";
          if (parseInt(fMax.value, 10) < parseInt(fMin.value, 10)) fMax.value = fMin.value;
          quotaHint.textContent = "Kompetisi Tim: tentukan batas minimum dan maksimum anggota per tim.";
        }
      };

      fType.addEventListener("change", syncTypeUI, { signal: signal });

      const openModal = (comp = null) => {
        modalStatus.textContent = "";
        if (comp) {
          isEditing = true;
          editingCompId = comp.slug;
          modalTitle.textContent = `Konfigurasi Kompetisi: ${comp.name}`;
          fSlug.value = comp.slug;
          fSlug.disabled = true;
          fName.value = comp.name;
          fAudience.value = comp.audience || "SEMUA JENJANG";
          fStatus.value = comp.status;
          fDescription.value = comp.description || "";
          fType.value = comp.participation_type;
          fMin.value = comp.min_team_members;
          fMax.value = comp.max_team_members;

          fStart.value = comp.registration_start ? comp.registration_start.substring(0, 16) : "";
          fEnd.value = comp.registration_end ? comp.registration_end.substring(0, 16) : "";
        } else {
          isEditing = false;
          editingCompId = null;
          modalTitle.textContent = "Tambah Cabang Kompetisi Baru";
          fSlug.value = "";
          fSlug.disabled = false;
          fName.value = "";
          fAudience.value = "SEMUA JENJANG";
          fStatus.value = "OPEN";
          fDescription.value = "";
          fType.value = "TEAM";
          fMin.value = "1";
          fMax.value = "3";
          fStart.value = "";
          fEnd.value = "";
        }
        syncTypeUI();
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
      };

      const closeModal = () => {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
      };

      modalClose.addEventListener("click", closeModal, { signal: signal });
      btnCancel.addEventListener("click", closeModal, { signal: signal });
      container.querySelector("#btn-add-comp").addEventListener("click", function () { openModal(null); }, { signal: signal });

      const loadAdminCompetitions = async () => {
        try {
          const res = await fetch("/api/admin/competitions", { credentials: "same-origin", signal: signal });
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.json();
          competitionsData = data.competitions || [];

          metricTotalComps.textContent = competitionsData.length;
          metricOpenComps.textContent = competitionsData.filter((c) => c.status === "OPEN").length;
          const totalTeams = competitionsData.reduce((acc, c) => acc + (c.teams_count || 0), 0);
          metricTotalTeams.textContent = totalTeams;

          tbody.innerHTML = "";
          if (competitionsData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--dash-text-muted);">Belum ada data kompetisi.</td></tr>';
            return;
          }

          competitionsData.forEach((c) => {
            const tr = document.createElement("tr");

            const statusClass = c.status === "OPEN" ? "comp-badge--open" : (c.status === "UPCOMING" ? "comp-badge--upcoming" : "comp-badge--closed");
            const typeLabel = c.participation_type === "TEAM" ? "TIM" : "INDIVIDU";
            const quotaLabel = c.participation_type === "TEAM" ? `${c.min_team_members}–${c.max_team_members} Orang` : "1 Orang";

            tr.innerHTML = `
              <td>
                <strong style="color:var(--dash-text-primary);">${c.name}</strong><br/>
                <code style="font-size:0.68rem; color:var(--dash-text-muted); font-family:var(--font-mono);">${c.slug}</code>
              </td>
              <td><span style="font-size:0.75rem;">${c.audience}</span></td>
              <td><span class="comp-badge comp-badge--type">${typeLabel}</span></td>
              <td><span style="font-family:var(--font-mono); font-size:0.75rem;">${quotaLabel}</span></td>
              <td><span class="comp-badge ${statusClass}">${c.status}</span></td>
              <td><span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--dash-text-muted);">${c.teams_count || 0} Tim · ${c.participants_count || 0} Peserta</span></td>
              <td>
                <div style="display:flex;gap:.45rem;flex-wrap:wrap;">
                  <button class="btn-edit-comp" type="button" data-edit-slug="${c.slug}">
                    <img src="/assets/svg/dashboard/icon-pencil.svg" width="12" height="12" alt="" />
                    Edit
                  </button>
                  <button class="btn-delete-comp" type="button" data-delete-slug="${c.slug}" data-delete-name="${c.name}">Hapus</button>
                </div>
              </td>
            `;
            tbody.appendChild(tr);
          });

          tbody.querySelectorAll("[data-edit-slug]").forEach((btn) => {
            btn.addEventListener("click", function () {
              var slug = btn.getAttribute("data-edit-slug");
              var target = competitionsData.find(function (c) { return c.slug === slug; });
              if (target) openModal(target);
            }, { signal: signal });
          });

          tbody.querySelectorAll("[data-delete-slug]").forEach((btn) => {
            btn.addEventListener("click", async function () {
              const slug = btn.getAttribute("data-delete-slug");
              const name = btn.getAttribute("data-delete-name") || slug;
              if (!confirm(`Hapus kompetisi "${name}"? Tindakan ini permanen. Jika masih ada tim/peserta terkait, backend akan menolak penghapusan.`)) return;
              btn.disabled = true;
              try {
                const res = await fetch(`/api/admin/competitions/${encodeURIComponent(slug)}`, { method: "DELETE", credentials: "same-origin", signal: signal });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { alert(data.detail || `Gagal menghapus kompetisi (${res.status}).`); btn.disabled = false; return; }
                loadAdminCompetitions();
              } catch (err) { if (err && err.name === "AbortError") return; alert("Tidak dapat menghubungi server."); btn.disabled = false; }
            }, { signal: signal });
          });
        } catch (err) {
          if (err && err.name === "AbortError") return;
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:#e74c3c;">Gagal memuat data kompetisi: ${err.message}</td></tr>`;
        }
      };

      compForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        modalStatus.textContent = "Menyimpan konfigurasi…";
        modalStatus.style.color = "var(--dash-text-muted)";

        const minVal = parseInt(fMin.value, 10);
        const maxVal = parseInt(fMax.value, 10);
        if (fType.value === "TEAM" && minVal > maxVal) {
          modalStatus.textContent = "Jumlah minimum anggota tidak boleh lebih besar dari batas maksimum.";
          modalStatus.style.color = "#e74c3c";
          return;
        }

        const bodyData = {
          name: fName.value.trim(),
          audience: fAudience.value,
          description: fDescription.value.trim() || null,
          participation_type: fType.value,
          min_team_members: fType.value === "INDIVIDUAL" ? 1 : minVal,
          max_team_members: fType.value === "INDIVIDUAL" ? 1 : maxVal,
          status: fStatus.value,
          registration_start: fStart.value ? new Date(fStart.value).toISOString() : null,
          registration_end: fEnd.value ? new Date(fEnd.value).toISOString() : null,
        };

        try {
          let res;
          if (isEditing) {
            res = await fetch(`/api/admin/competitions/${editingCompId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify(bodyData),
              signal: signal,
            });
          } else {
            bodyData.slug = fSlug.value.trim().toLowerCase();
            res = await fetch("/api/admin/competitions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify(bodyData),
              signal: signal,
            });
          }

          const resData = await res.json().catch(() => ({}));
          if (res.ok) {
            modalStatus.textContent = "Konfigurasi berhasil disimpan.";
            modalStatus.style.color = "#2ecc71";
            setTimeout(() => {
              closeModal();
              loadAdminCompetitions();
            }, 600);
          } else {
            modalStatus.textContent = resData.detail || "Gagal menyimpan konfigurasi.";
            modalStatus.style.color = "#e74c3c";
          }
        } catch (err) {
          modalStatus.textContent = "Terjadi kesalahan koneksi ke server.";
          if (err && err.name === "AbortError") return;
          modalStatus.style.color = "#e74c3c";
        }
      }, { signal: signal });

      loadAdminCompetitions();

  }

  function onLeave() {
    if (state.ac) { try { state.ac.abort(); } catch (_e) {} }
    state.ac = null;
  }

  Router.register('/dashboard/competitions/', {
    title: 'Admin · Manajemen Kompetisi · Perkutut Cup 2026',
    render: render,
    onEnter: onEnter,
    onLeave: onLeave
  });
})();
