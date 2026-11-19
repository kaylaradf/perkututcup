(function () {
  "use strict";
  if (!window.Router) return;

  var state = { ac: null, filterType: "mine", statusFilter: "" };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(container) {
    container.innerHTML =
      '<div class="dash">' +
      window.DashCommon.renderAside("verifications") +
      mainMarkup() +
      "</div>";
  }

  function mainMarkup() {
    return (
      '<main class="dash-main">' +
      '  <h1 class="dash-page-title">Verifikasi Berkas Pendaftaran</h1>' +
      '  <p class="dash-page-sub">Tinjau dan verifikasi berkas persyaratan serta bukti pembayaran peserta (Sistem Auto-Assign Round-Robin).</p>' +
      '  <div class="dash-filter-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:1.5rem;">' +
      '    <div class="tabs" role="tablist" style="margin:0;">' +
      '      <button class="tab is-active" type="button" data-filter="mine">Tugas Saya (Auto-Assign)</button>' +
      '      <button class="tab" type="button" data-filter="all">Semua Tim</button>' +
      '    </div>' +
      '    <div style="display:flex; gap:8px; align-items:center;">' +
      '      <label style="font-family:var(--font-mono); font-size:0.75rem; color:var(--dash-text-muted);">Status Tim:</label>' +
      '      <select id="verify-status-select" class="input" style="padding:0.4rem 0.8rem; font-size:0.75rem; width:auto;">' +
      '        <option value="">Semua Status</option>' +
      '        <option value="UNVERIFIED">Belum Terverifikasi</option>' +
      '        <option value="VERIFIED">Terverifikasi (Lengkap)</option>' +
      '      </select>' +
      '    </div>' +
      "  </div>" +
      '  <div id="verifications-list" style="display:flex; flex-direction:column; gap:1.2rem;">' +
      '    <p class="dash-status" style="padding:2rem; text-align:center;">Memuat data antrean verifikasi...</p>' +
      "  </div>" +
      "</main>"
    );
  }

  function onEnter(container) {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = new AbortController();
    var signal = state.ac.signal;
    window.DashCommon.initTheme(container, signal);
    window.DashCommon.initLogout(container, signal);
    initVerifications(container, signal);
  }

  function onLeave() {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = null;
  }

  var DOC_LABELS = {
    ktm: "Kartu Pelajar / KTM",
    pasfoto: "Pasfoto Formal",
    twibbon: "Bukti Twibbon",
    payment_proof: "Bukti Pembayaran Tim"
  };

  function initVerifications(container, signal) {
    var listEl = container.querySelector("#verifications-list");
    var filterBtns = container.querySelectorAll("[data-filter]");
    var statusSelect = container.querySelector("#verify-status-select");

    filterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterBtns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        state.filterType = btn.getAttribute("data-filter") || "mine";
        loadData();
      }, { signal: signal });
    });

    if (statusSelect) {
      statusSelect.addEventListener("change", function () {
        state.statusFilter = statusSelect.value;
        loadData();
      }, { signal: signal });
    }

    function loadData() {
      if (!listEl) return;
      listEl.innerHTML = '<p class="dash-status" style="padding:2rem; text-align:center;">Memuat data antrean verifikasi...</p>';

      var url = "/api/admin/verifications?filter_type=" + encodeURIComponent(state.filterType);
      if (state.statusFilter) url += "&status=" + encodeURIComponent(state.statusFilter);

      fetch(url, { credentials: "same-origin", signal: signal })
        .then(function (res) {
          if (!res.ok) throw new Error("Gagal memuat data verifikasi");
          return res.json();
        })
        .then(function (data) {
          renderTeams(data.teams || []);
        })
        .catch(function (err) {
          if (signal.aborted) return;
          listEl.innerHTML = '<p class="dash-status" style="padding:2rem; text-align:center; color:#ff6b6b;">' + escapeHtml(err.message) + '</p>';
        });
    }

    function renderTeams(teams) {
      if (!listEl) return;
      if (!teams.length) {
        listEl.innerHTML =
          '<div class="card" style="padding:2.5rem; text-align:center;">' +
          '  <p style="color:var(--dash-text-muted); font-size:0.9rem; margin:0;">Tidak ada antrean tim yang sesuai dengan filter.</p>' +
          '</div>';
        return;
      }

      var html = "";
      teams.forEach(function (t) {
        var isVerified = t.verification_status === "VERIFIED";
        var statusBadge = isVerified
          ? '<span style="background:rgba(46,204,113,0.15); color:#2ecc71; border:1px solid rgba(46,204,113,0.3); padding:0.25rem 0.6rem; border-radius:6px; font-size:0.75rem; font-weight:700;">TERVERIFIKASI ✓</span>'
          : '<span style="background:rgba(241,196,15,0.15); color:#f1c40f; border:1px solid rgba(241,196,15,0.3); padding:0.25rem 0.6rem; border-radius:6px; font-size:0.75rem; font-weight:700;">BELUM TERVERIFIKASI</span>';

        var adminBadge = t.assigned_to_me
          ? '<span style="color:#8644a2; font-size:0.7rem; font-family:var(--font-mono);">● Ditugaskan kepada Anda</span>'
          : '<span style="color:var(--dash-text-muted); font-size:0.7rem; font-family:var(--font-mono);">Verifikator: ' + escapeHtml(t.assigned_admin_name || '—') + '</span>';

        // Members info
        var membersList = (t.members || []).map(function (m) {
          return '<span style="font-size:0.75rem; color:var(--dash-text-muted);">' + escapeHtml(m.full_name) + ' (' + (m.role === 'leader' ? 'Ketua' : 'Anggota') + ')</span>';
        }).join(" • ");

        // Documents: compact responsive rows (no overflowing table)
        var docsHtml = "";
        if (!t.documents || !t.documents.length) {
          docsHtml = '<p style="color:var(--dash-text-muted); font-size:0.8rem; font-style:italic; margin:0.8rem 0;">Belum ada berkas yang diunggah oleh peserta.</p>';
        } else {
          docsHtml = '<div class="vdoc-list">';
          t.documents.forEach(function (d) {
            var docLabel = DOC_LABELS[d.document_type] || d.document_type;
            var badge, actions = "";
            if (d.status === "APPROVED") {
              badge = '<span class="vdoc-badge is-approved">✓ Disetujui</span>';
            } else if (d.status === "REJECTED") {
              badge = '<span class="vdoc-badge is-rejected">✗ Ditolak</span>';
              actions = '<button type="button" class="vdoc-btn is-approve" data-action="approve" data-doc-id="' + d.id + '">✓ Setujui</button>';
            } else {
              badge = '<span class="vdoc-badge is-pending">⏳ Menunggu</span>';
              actions =
                '<button type="button" class="vdoc-btn is-approve" data-action="approve" data-doc-id="' + d.id + '">✓ Setujui</button>' +
                '<button type="button" class="vdoc-btn is-reject" data-action="reject" data-doc-id="' + d.id + '">✗ Tolak</button>';
            }
            var feedback = d.feedback ? '<p class="vdoc-feedback">Catatan: ' + escapeHtml(d.feedback) + '</p>' : '';
            docsHtml +=
              '<article class="vdoc-row">' +
              '  <div class="vdoc-main">' +
              '    <strong>' + escapeHtml(docLabel) + '</strong>' +
              '    <span class="vdoc-owner">' + escapeHtml(d.member_name || 'Tim') + ' · <a href="' + d.download_url + '" target="_blank" rel="noopener">' + escapeHtml(d.original_name) + '</a></span>' +
              feedback +
              '  </div>' +
              '  <div class="vdoc-side">' + badge +
              (actions ? '<span class="vdoc-actions">' + actions + '</span>' : '') +
              '  </div>' +
              '</article>';
          });
          docsHtml += '</div>';
        }

        html +=
          '<section class="card" style="padding:1.4rem;">' +
          '  <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">' +
          '    <div>' +
          '      <h3 style="margin:0 0 0.3rem; font-size:1.1rem; color:var(--cream);">' + escapeHtml(t.team_name || t.track) + ' <small style="color:var(--dash-text-muted); font-size:0.8rem; font-family:var(--font-mono);">(' + escapeHtml(t.team_code) + ')</small></h3>' +
          '      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:0.4rem;">' +
          '        <span style="font-size:0.75rem; color:var(--soft-violet); font-weight:700;">' + escapeHtml(t.competition_name || t.track) + '</span> • ' +
                   adminBadge +
          '      </div>' +
          '      <div>' + membersList + '</div>' +
          '    </div>' +
          '    <div style="text-align:right;">' +
          '      <div>' + statusBadge + '</div>' +
          '      <div style="font-family:var(--font-mono); font-size:0.7rem; color:var(--dash-text-muted); margin-top:0.4rem;">Lengkap: ' + t.stats.approved + ' / ' + t.stats.required + ' berkas disetujui</div>' +
          '    </div>' +
          '  </div>' +
             docsHtml +
          '</section>';
      });

      listEl.innerHTML = html;
      bindDocActions();
    }

    function bindDocActions() {
      listEl.querySelectorAll("[data-action='approve']").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var docId = btn.getAttribute("data-doc-id");
          if (!docId) return;
          window.DashCommon.confirmMsg("Setujui berkas ini?", "Berkas akan ditandai disetujui dan dihitung ke kelengkapan tim.", "Setujui").then(function (yes) {
            if (!yes) return;
            btn.disabled = true;
            fetch("/api/admin/verifications/" + docId, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "APPROVED" }),
              credentials: "same-origin"
            })
              .then(function (res) { return res.json(); })
              .then(function (data) {
                if (data.ok) { window.DashCommon.toast("success", "Berkas disetujui."); loadData(); }
                else window.DashCommon.alertMsg("error", "Gagal", data.detail || "Gagal menyetujui dokumen.");
              })
              .catch(function () { window.DashCommon.alertMsg("error", "Koneksi gagal", "Tidak dapat menghubungi server."); })
              .finally(function () { btn.disabled = false; });
          });
        }, { signal: signal });
      });

      listEl.querySelectorAll("[data-action='reject']").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var docId = btn.getAttribute("data-doc-id");
          if (!docId) return;
          Swal.fire({
            title: "Tolak berkas",
            input: "textarea",
            inputLabel: "Alasan penolakan (terlihat oleh peserta)",
            inputPlaceholder: "Contoh: Foto KTM buram, unggah ulang dengan resolusi lebih tinggi.",
            inputValidator: function (v) { if (!v || !v.trim()) return "Alasan penolakan wajib diisi."; },
            showCancelButton: true,
            confirmButtonText: "Tolak berkas",
            cancelButtonText: "Batal",
            confirmButtonColor: "#e74c3c",
            cancelButtonColor: "#4a4458",
            background: "var(--dash-surface, #14161f)",
            color: "var(--dash-text-body, #ffe8d9)",
            reverseButtons: true
          }).then(function (r) {
            if (!r.isConfirmed) return;
            btn.disabled = true;
            fetch("/api/admin/verifications/" + docId, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "REJECTED", feedback: r.value.trim() }),
              credentials: "same-origin"
            })
              .then(function (res) { return res.json(); })
              .then(function (data) {
                if (data.ok) { window.DashCommon.toast("success", "Berkas ditolak, catatan terkirim ke peserta."); loadData(); }
                else window.DashCommon.alertMsg("error", "Gagal", data.detail || "Gagal menolak dokumen.");
              })
              .catch(function () { window.DashCommon.alertMsg("error", "Koneksi gagal", "Tidak dapat menghubungi server."); })
              .finally(function () { btn.disabled = false; });
          });
        }, { signal: signal });
      });
    }
    loadData();
  }

  Router.register("/dashboard/verifications/", {
    title: "Verifikasi Berkas · Perkutut Cup 2026",
    render: render,
    onEnter: onEnter,
    onLeave: onLeave
  });
})();
