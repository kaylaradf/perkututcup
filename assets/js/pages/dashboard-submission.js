(function () {
  "use strict";
  if (!window.Router) return;

  var state = { ac: null };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(container) {
    container.innerHTML =
      '<div class="dash">' +
      window.DashCommon.renderAside("submission") +
      '<main class="dash-main">' +
      '  <h1 class="dash-page-title">Project Submission</h1>' +
      '  <p class="dash-page-sub">Kelola pengumpulan karya tim Anda dan pantau progres penilaian dewan juri.</p>' +
      '  <div id="sub-content-area" style="margin-top:1.5rem;">' +
      '    <p class="dash-status" style="padding:2rem; text-align:center;">Memeriksa status pendaftaran tim...</p>' +
      '  </div>' +
      '</main>' +
      '</div>';
  }

  function onEnter(container) {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = new AbortController();
    var signal = state.ac.signal;
    window.DashCommon.initTheme(container, signal);
    window.DashCommon.initLogout(container, signal);
    initSubmission(container, signal);
  }

  function onLeave() {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = null;
  }

  function initSubmission(container, signal) {
    var area = container.querySelector("#sub-content-area");
    if (!area) return;

    fetch("/api/submissions", { credentials: "same-origin", signal: signal })
      .then(function (res) {
        if (!res.ok) throw new Error("Gagal memeriksa status submisi");
        return res.json();
      })
      .then(function (data) {
        if (!data.is_verified) {
          renderLockedView(area, data);
        } else {
          renderVerifiedView(area, data, signal);
        }
      })
      .catch(function (err) {
        if (signal.aborted) return;
        area.innerHTML =
          '<div class="card" style="padding:2rem; text-align:center; color:#ff6b6b;">' +
          '  <p>' + escapeHtml(err.message) + '</p>' +
          '</div>';
      });
  }

  function renderLockedView(area, data) {
    area.innerHTML =
      '<div class="card" style="background:rgba(231,76,60,0.06); border:1px solid rgba(231,76,60,0.3); border-radius:14px; padding:2.5rem 1.5rem; text-align:center; margin:1rem 0;">' +
      '  <div style="font-size:3rem; margin-bottom:1rem;">🔒</div>' +
      '  <h2 style="color:#ff6b6b; margin:0 0 0.8rem; font-size:1.4rem;">Submisi Karya Masih Terkunci</h2>' +
      '  <p style="color:var(--dash-text-muted); max-width:600px; margin:0 auto 1.8rem; font-size:0.9rem; line-height:1.6;">' +
      '    Pendaftaran tim Anda saat ini berstatus <strong>BELUM TERVERIFIKASI</strong>. Sesuai ketentuan kompetisi, peserta wajib melengkapi seluruh berkas persyaratan (KTM, Pasfoto, Twibbon tiap anggota) dan Bukti Pembayaran Tim, serta menunggu verifikasi admin sebelum dapat mengakses materi soal dan mengunggah karya.' +
      '  </p>' +
      '  <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">' +
      '    <a href="/dashboard/profile/" class="btn-save" style="display:inline-block; text-decoration:none; padding:0.75rem 1.8rem; font-size:0.8rem;">LENGKAPI BERKAS DI TAB PROFILE →</a>' +
      '  </div>' +
      '</div>';
  }

  function soalBox(comp) {
    var body = comp.problem_statement
      ? '<p style="margin:0; white-space:pre-wrap; font-size:0.85rem; line-height:1.7; color:var(--dash-text-body);">' + escapeHtml(comp.problem_statement) + '</p>'
      : '<p style="margin:0; font-size:0.85rem; color:var(--dash-text-muted); font-style:italic;">Soal belum dirilis oleh panitia. Cek kembali secara berkala.</p>';
    return (
      '<section class="card card--flush" style="margin-bottom:1.5rem;">' +
      '  <span class="card-top-bar" aria-hidden="true"></span>' +
      '  <h2 class="card-title" style="display:flex; align-items:center; gap:8px;"><i data-lucide="file-text" style="width:18px;height:18px;"></i> SOAL KOMPETISI' + (comp.name ? ' — ' + escapeHtml(comp.name) : '') + '</h2>' +
      body +
      '</section>'
    );
  }

  function renderVerifiedView(area, data, signal) {
    var comp = data.competition || {};
    var sub = data.submission;
    var evalData = sub && sub.evaluation;

    var evalBox = "";
    if (evalData) {
      evalBox =
        '<div class="card" style="background:rgba(46,204,113,0.08); border:1px solid rgba(46,204,113,0.3); border-radius:12px; padding:1.5rem; margin-bottom:1.5rem;">' +
        '  <span class="card-top-bar" style="background:#2ecc71;" aria-hidden="true"></span>' +
        '  <h3 style="margin:0 0 0.5rem; color:#2ecc71; font-size:1.1rem; display:flex; align-items:center; gap:8px;">' +
        '    <span>HASIL PENILAIAN DEWAN JURI</span>' +
        '  </h3>' +
        '  <div style="display:flex; align-items:baseline; gap:10px; margin:0.8rem 0;">' +
        '    <span style="font-size:2.8rem; font-weight:800; font-family:var(--font-heading); color:var(--cream);">' + evalData.score + '</span>' +
        '    <span style="font-size:1.1rem; color:var(--dash-text-muted); font-family:var(--font-mono);">/ 100</span>' +
        '  </div>' +
        (evalData.feedback ? '  <p style="margin:0.8rem 0 0; font-size:0.85rem; color:var(--cream-muted); border-top:1px solid rgba(255,255,255,0.08); padding-top:0.8rem;"><strong>Catatan Evaluasi Juri:</strong><br />' + escapeHtml(evalData.feedback) + '</p>' : '') +
        '</div>';
    } else if (sub) {
      evalBox =
        '<div class="card" style="background:rgba(241,196,15,0.08); border:1px solid rgba(241,196,15,0.3); border-radius:12px; padding:1.2rem; margin-bottom:1.5rem;">' +
        '  <h4 style="margin:0 0 0.3rem; color:#f1c40f; font-size:0.95rem;">⏳ Sedang Dalam Proses Penilaian</h4>' +
        '  <p style="margin:0; font-size:0.8rem; color:var(--dash-text-muted);">Karya Anda telah dialokasikan ke dewan juri untuk dinilai (sistem 1 juri per submisi). Nilai dan evaluasi akan tampil di sini setelah juri selesai menilai.</p>' +
        '</div>';
    }

    var subInfoBox = "";
    if (sub) {
      subInfoBox =
        '<div style="background:rgba(255,255,255,0.03); border:1px solid var(--dash-border-mid); border-radius:10px; padding:1.2rem; margin-bottom:1.5rem;">' +
        '  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">' +
        '    <div>' +
        '      <span style="font-size:0.7rem; color:var(--soft-violet); font-family:var(--font-mono); font-weight:700;">KARYA YANG SUDAH DIUNGGAH</span>' +
        '      <h4 style="margin:0.2rem 0; font-size:1rem; color:var(--cream);">' + escapeHtml(sub.original_name) + '</h4>' +
        '      <span style="font-size:0.72rem; color:var(--dash-text-muted); font-family:var(--font-mono);">Ukuran: ' + (sub.file_size ? (sub.file_size / 1024 / 1024).toFixed(2) + ' MB' : '—') + ' • Diunggah: ' + (sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—') + '</span>' +
        '    </div>' +
        '    <a class="btn-save" href="' + sub.download_url + '" download style="padding:0.45rem 1rem; font-size:0.75rem; text-decoration:none;">UNDUH SUBMISI ⬇</a>' +
        '  </div>' +
        (sub.notes ? '  <p style="margin:0.8rem 0 0; font-size:0.78rem; color:var(--dash-text-muted); border-top:1px solid rgba(255,255,255,0.05); padding-top:0.6rem;"><strong>Catatan:</strong> ' + escapeHtml(sub.notes) + '</p>' : '') +
        '</div>';
    }

    area.innerHTML =
      '<section class="dash-metrics" aria-label="Ringkasan pengumpulan">' +
      '  <article class="metric is-green">' +
      '    <img class="metric-watermark" src="/assets/svg/dashboard/watermark-check.svg" width="72" height="72" alt="" />' +
'    <span class="metric-icon"><i data-lucide="shield-check"></i></span>' +
      '    <div>' +
      '      <p class="metric-label">STATUS TIM</p>' +
      '      <p class="metric-value" style="color:#2ecc71;">TERVERIFIKASI ✓</p>' +
      '    </div>' +
      '  </article>' +
      '  <article class="metric is-amber">' +
      '    <img class="metric-watermark" src="/assets/svg/dashboard/watermark-trophy.svg" width="72" height="72" alt="" />' +
'    <span class="metric-icon"><i data-lucide="trophy"></i></span>' +
      '    <div>' +
      '      <p class="metric-label">CABANG KOMPETISI</p>' +
      '      <p class="metric-value">' + escapeHtml(comp.name || 'Kompetisi') + '</p>' +
      '    </div>' +
      '  </article>' +
      '  <article class="metric is-violet">' +
      '    <img class="metric-watermark" src="/assets/svg/dashboard/watermark-check-circle.svg" width="72" height="72" alt="" />' +
'    <span class="metric-icon"><i data-lucide="check-circle"></i></span>' +
      '    <div>' +
      '      <p class="metric-label">STATUS PENGUMPULAN</p>' +
      '      <p class="metric-value">' + (sub ? 'SUDAH DISUBMIT' : 'BELUM DISUBMIT') + '</p>' +
      '    </div>' +
      '  </article>' +
      '</section>' +
      evalBox +
      soalBox(comp) +
      '<div class="dash-grid dash-grid--even">' +
      '  <div class="dash-col">' +
      '    <section class="card card--flush">' +
      '      <span class="card-top-bar" aria-hidden="true"></span>' +
      '      <h2 class="card-title">PANDUAN SUBMISI KARYA</h2>' +
      '      <p class="card-lead">Pastikan berkas karya Anda telah memenuhi seluruh format resmi sebelum batas pengumpulan berakhir.</p>' +
      '      <div class="guide-steps">' +
      '        <article class="guide-step">' +
      '          <h3>1. FORMAT FILE</h3>' +
      '          <p>Karya dapat berupa file arsip (.zip, .tar.gz), dokumen PDF (.pdf), atau konfigurasi Packet Tracer (.pkt, .pka) dengan ukuran maksimal 50MB.</p>' +
      '        </article>' +
      '        <article class="guide-step">' +
      '          <h3>2. PENILAIAN JURI</h3>' +
      '          <p>Setelah diunggah, karya Anda akan langsung dialokasikan ke 1 dewan juri penilai melalui sistem auto-assign round-robin.</p>' +
      '        </article>' +
      '      </div>' +
      '    </section>' +
      '  </div>' +
      '  <div class="dash-col">' +
      '    <section class="card card--flush">' +
      '      <span class="card-top-bar is-rainbow" aria-hidden="true"></span>' +
      '      <h2 class="card-title">' + (sub ? 'UNGGAH ULANG / PERBARUI KARYA' : 'UNGGAH KARYA KOMPETISI') + '</h2>' +
      '      <p class="card-lead">Pilih file karya akhir Anda untuk dinilai oleh dewan juri.</p>' +
      '      <form id="submission-form" style="display:flex; flex-direction:column; gap:1rem;">' +
             subInfoBox +
      '        <div class="field">' +
      '          <span>PILIH FILE KARYA (MAKSIMAL 50MB)</span>' +
      '          <input type="file" id="sub-file-input" accept=".zip,.tar.gz,.tgz,.pdf,.pkt,.pka,.docx,.txt" required hidden />' +
      '          <button type="button" class="file-drop" id="sub-file-drop"><i data-lucide="upload-cloud"></i><span data-file-label>Klik untuk pilih file karya (.zip, .pdf, .pkt, …)</span></button>' +
      '        </div>' +
      '        <label class="field">' +
      '          <span>CATATAN TAMBAHAN UNTUK JURI (OPSIONAL)</span>' +
      '          <textarea id="sub-notes-input" class="input" rows="3" placeholder="Tuliskan catatan teknis atau tautan pendukung (opsional)...">' + (sub && sub.notes ? escapeHtml(sub.notes) : '') + '</textarea>' +
      '        </label>' +
      '        <div style="display:flex; justify-content:flex-end;">' +
      '          <button type="submit" id="btn-submit-work" class="btn-save" style="padding:0.7rem 1.6rem;">' + (sub ? 'PERBARUI KARYA' : 'SUBMIT KARYA SEKARANG') + '</button>' +
      '        </div>' +
      '        <p class="dash-status" id="sub-form-status" role="status" aria-live="polite" style="margin:0;"></p>' +
      '      </form>' +
      '    </section>' +
      '  </div>' +
      '</div>';

    window.DashCommon.refreshIcons();

    var fileDrop = area.querySelector("#sub-file-drop");
    var fileInputEl = area.querySelector("#sub-file-input");
    var fileLabel = area.querySelector("[data-file-label]");
    if (fileDrop && fileInputEl) {
      fileDrop.addEventListener("click", function () { fileInputEl.click(); }, { signal: signal });
      fileInputEl.addEventListener("change", function () {
        var f = fileInputEl.files && fileInputEl.files[0];
        if (fileLabel) fileLabel.textContent = f ? f.name + " (" + (f.size / 1024 / 1024).toFixed(2) + " MB)" : "Klik untuk pilih file karya (.zip, .pdf, .pkt, …)";
        fileDrop.classList.toggle("has-file", !!f);
      }, { signal: signal });
    }
    var subForm = area.querySelector("#submission-form");
    if (!subForm) return;

    subForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var fileInput = subForm.querySelector("#sub-file-input");
      var notesInput = subForm.querySelector("#sub-notes-input");
      var statusEl = subForm.querySelector("#sub-form-status");
      var btn = subForm.querySelector("#btn-submit-work");

      if (!fileInput.files || !fileInput.files[0]) {
        if (statusEl) statusEl.textContent = "Silakan pilih file karya terlebih dahulu.";
        return;
      }

      var file = fileInput.files[0];
      if (file.size > 50 * 1024 * 1024) {
        if (statusEl) statusEl.textContent = "Ukuran file melebihi batas maksimal 50MB.";
        return;
      }

      var fd = new FormData();
      fd.append("file", file);
      if (notesInput.value.trim()) fd.append("notes", notesInput.value.trim());

      btn.disabled = true;
      if (statusEl) statusEl.textContent = "Mengunggah karya...";

      fetch("/api/submissions/upload", {
        method: "POST",
        body: fd,
        credentials: "same-origin"
      })
        .then(function (res) {
          return res.json().then(function (d) { return { ok: res.ok, data: d }; });
        })
        .then(function (r) {
          if (r.ok) {
            window.DashCommon.alertMsg("success", "Karya terkirim!", "Karya Anda berhasil diunggah dan dialokasikan ke dewan juri.").then(function () { initSubmission(area.parentElement, signal); });
          } else {
            window.DashCommon.alertMsg("error", "Gagal mengunggah", typeof r.data.detail === "string" ? r.data.detail : "Gagal mengunggah karya.");
          }
        })
        .catch(function () {
          window.DashCommon.alertMsg("error", "Koneksi gagal", "Tidak dapat menghubungi server.");
        })
        .finally(function () {
          btn.disabled = false;
        });
    }, { signal: signal });
  }

  Router.register("/dashboard/submission/", {
    title: "Project Submission · Perkutut Cup 2026",
    render: render,
    onEnter: onEnter,
    onLeave: onLeave
  });
})();
