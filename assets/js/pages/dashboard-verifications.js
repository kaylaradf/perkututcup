(function () {
  "use strict";
  if (!window.Router) return;

  var state = {
    ac: null,
    filterType: "mine",
    statusFilter: "",
    teams: [],
    selectedCode: null,
    lightbox: null
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var PAGE_CSS =
    ".vm-grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:1.2rem;align-items:start;}" +
    ".vm-list{position:sticky;top:84px;max-height:calc(100vh - 120px);overflow-y:auto;display:flex;flex-direction:column;gap:0.5rem;padding-right:4px;}" +
    ".vm-item{display:flex;flex-direction:column;gap:0.2rem;text-align:left;width:100%;padding:0.7rem 0.8rem;border-radius:10px;cursor:pointer;" +
    "  background:var(--dash-surface,#14161f);border:1px solid var(--dash-border,rgba(255,255,255,0.08));color:var(--dash-text-body,#ffe8d9);font:inherit;}" +
    ".vm-item:hover{border-color:rgba(134,68,162,0.5);}" +
    ".vm-item.is-active{border-color:var(--soft-violet,#8644a2);background:rgba(134,68,162,0.14);}" +
    ".vm-item-name{font-weight:700;font-size:0.85rem;color:var(--cream,#ffe8d9);}" +
    ".vm-item-code{font-family:var(--font-mono);font-size:0.68rem;color:var(--dash-text-muted);}" +
    ".vm-item-comp{font-size:0.72rem;color:var(--soft-violet,#8644a2);font-weight:600;}" +
    ".vm-item-meta{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:0.2rem;}" +
    ".vm-flag{padding:0.12rem 0.45rem;border-radius:6px;font-size:0.65rem;font-weight:700;white-space:nowrap;}" +
    ".vm-flag.is-ok{background:rgba(46,204,113,0.15);color:#2ecc71;border:1px solid rgba(46,204,113,0.3);}" +
    ".vm-flag.is-wait{background:rgba(241,196,15,0.15);color:#f1c40f;border:1px solid rgba(241,196,15,0.3);}" +
    ".vm-item-count{font-family:var(--font-mono);font-size:0.68rem;color:var(--dash-text-muted);white-space:nowrap;}" +
    ".vm-empty{padding:2rem;text-align:center;color:var(--dash-text-muted);font-size:0.85rem;}" +
    ".vdoc-btn svg{width:14px;height:14px;vertical-align:-2px;}" +
    ".vm-lightbox{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;overflow:auto;}" +
    ".vm-lightbox img{max-width:90vw;max-height:min(85vh,calc(100vh - 150px));object-fit:contain;border-radius:8px;}" +
    ".vm-lb-close{position:absolute;top:16px;right:16px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;" +
    "  background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.25);border-radius:8px;color:#fff;}" +
    ".vm-lb-close svg{width:20px;height:20px;}" +
    ".vm-lb-foot{display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;max-width:90vw;padding:0.7rem 1rem;border-radius:10px;" +
    "  background:var(--dash-surface,#14161f);border:1px solid rgba(255,255,255,0.12);color:var(--dash-text-body,#ffe8d9);}" +
    ".vm-lb-foot .vdoc-owner{display:block;font-size:0.75rem;color:var(--dash-text-muted);}" +
    "@media (max-width:900px){.vm-grid{grid-template-columns:1fr;}" +
    "  .vm-list{position:static;max-height:none;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding-bottom:6px;}" +
    "  .vm-item{flex:0 0 auto;min-width:220px;}}";

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
      '  <div class="vm-grid">' +
      '    <aside id="vm-list" class="vm-list" aria-label="Daftar tim"></aside>' +
      '    <section id="vm-detail" class="vm-detail" aria-label="Detail tim"></section>' +
      "  </div>" +
      "  <style>" + PAGE_CSS + "</style>" +
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
    closeLightbox();
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = null;
  }

  var DOC_LABELS = {
    ktm: "Kartu Pelajar / KTM",
    pasfoto: "Pasfoto Formal",
    twibbon: "Bukti Twibbon",
    payment_proof: "Bukti Pembayaran Tim"
  };

  // Admin list endpoint omits mime_type; fall back to original_name extension.
  function isImage(d) {
    return (d.mime_type && /^image\//.test(d.mime_type)) || /\.(jpe?g|png|webp)$/i.test(d.original_name || "");
  }

  function findTeam(code) {
    for (var i = 0; i < state.teams.length; i++) {
      if (state.teams[i].team_code === code) return state.teams[i];
    }
    return null;
  }

  function findDoc(docId) {
    for (var i = 0; i < state.teams.length; i++) {
      var docs = state.teams[i].documents || [];
      for (var j = 0; j < docs.length; j++) {
        if (String(docs[j].id) === String(docId)) return docs[j];
      }
    }
    return null;
  }

  function docBadge(d) {
    if (d.status === "APPROVED") return '<span class="vdoc-badge is-approved">✓ Disetujui</span>';
    if (d.status === "REJECTED") return '<span class="vdoc-badge is-rejected">✗ Ditolak</span>';
    return '<span class="vdoc-badge is-pending">⏳ Menunggu</span>';
  }

  function docActions(d, noPreview) {
    var html = "";
    if (!noPreview && isImage(d)) {
      html += '<button type="button" class="vdoc-btn" data-action="preview" data-doc-id="' + d.id + '" title="Pratinjau berkas" aria-label="Pratinjau berkas"><i data-lucide="zoom-in"></i></button>';
    }
    if (d.status === "REJECTED" || d.status === "PENDING") {
      html += '<button type="button" class="vdoc-btn is-approve" data-action="approve" data-doc-id="' + d.id + '"><i data-lucide="check"></i> Setujui</button>';
    }
    if (d.status === "PENDING") {
      html += '<button type="button" class="vdoc-btn is-reject" data-action="reject" data-doc-id="' + d.id + '"><i data-lucide="x"></i> Tolak</button>';
    }
    return html;
  }

  function initVerifications(container, signal) {
    var listEl = container.querySelector("#vm-list");
    var detailEl = container.querySelector("#vm-detail");
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

    // Delegated clicks: team selection + document actions (rows survive re-renders).
    container.addEventListener("click", function (e) {
      var item = e.target.closest("[data-team]");
      if (item && listEl.contains(item)) {
        selectTeam(item.getAttribute("data-team"));
        return;
      }
      var act = e.target.closest("[data-action]");
      if (!act || !detailEl.contains(act)) return;
      var action = act.getAttribute("data-action");
      var docId = act.getAttribute("data-doc-id");
      if (action === "preview") {
        e.preventDefault();
        openLightbox(docId, signal);
      } else if (action === "approve" || action === "reject") {
        handleAction(action, docId, act);
      }
    }, { signal: signal });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.lightbox) closeLightbox();
    }, { signal: signal });

    function loadData() {
      listEl.innerHTML = '<p class="vm-empty">Memuat data antrean verifikasi...</p>';
      detailEl.innerHTML = "";

      var url = "/api/admin/verifications?filter_type=" + encodeURIComponent(state.filterType);
      if (state.statusFilter) url += "&status=" + encodeURIComponent(state.statusFilter);

      fetch(url, { credentials: "same-origin", signal: signal })
        .then(function (res) {
          if (!res.ok) throw new Error("Gagal memuat data verifikasi");
          return res.json();
        })
        .then(function (data) {
          state.teams = data.teams || [];
          var sel = findTeam(state.selectedCode) || state.teams[0] || null;
          state.selectedCode = sel ? sel.team_code : null;
          renderList();
          renderDetail();
        })
        .catch(function (err) {
          if (signal.aborted) return;
          listEl.innerHTML = '<p class="vm-empty" style="color:#ff6b6b;">' + escapeHtml(err.message) + "</p>";
          detailEl.innerHTML = "";
        });
    }

    function renderList() {
      if (!state.teams.length) {
        listEl.innerHTML = '<p class="vm-empty">Tidak ada antrean tim yang sesuai dengan filter.</p>';
        return;
      }
      var html = "";
      state.teams.forEach(function (t) {
        var stats = t.stats || { approved: 0, required: 0 };
        var flag = t.verification_status === "VERIFIED"
          ? '<span class="vm-flag is-ok">Terverifikasi</span>'
          : '<span class="vm-flag is-wait">Belum</span>';
        html +=
          '<button type="button" class="vm-item' + (t.team_code === state.selectedCode ? " is-active" : "") + '" data-team="' + escapeHtml(t.team_code) + '">' +
          '  <span class="vm-item-name">' + escapeHtml(t.team_name || t.track) + "</span>" +
          '  <span class="vm-item-code">' + escapeHtml(t.team_code) + "</span>" +
          '  <span class="vm-item-comp">' + escapeHtml(t.competition_name || t.track) + "</span>" +
          '  <span class="vm-item-meta">' + flag + '<span class="vm-item-count">' + stats.approved + "/" + stats.required + " berkas</span></span>" +
          "</button>";
      });
      listEl.innerHTML = html;
      window.DashCommon.refreshIcons();
    }

    function selectTeam(code) {
      state.selectedCode = code;
      listEl.querySelectorAll("[data-team]").forEach(function (el) {
        el.classList.toggle("is-active", el.getAttribute("data-team") === code);
      });
      renderDetail();
    }

    function renderDetail() {
      var t = findTeam(state.selectedCode);
      if (!t) {
        detailEl.innerHTML = '<div class="card"><p class="vm-empty">Tidak ada tim untuk ditampilkan. Pilih tim dari daftar di samping.</p></div>';
        return;
      }
      var stats = t.stats || { approved: 0, required: 0 };
      var statusBadge = t.verification_status === "VERIFIED"
        ? '<span class="vm-flag is-ok"><i data-lucide="shield-check"></i> TERVERIFIKASI</span>'
        : '<span class="vm-flag is-wait">BELUM TERVERIFIKASI</span>';
      var adminBadge = t.assigned_to_me
        ? '<span style="color:#8644a2; font-size:0.7rem; font-family:var(--font-mono);">● Ditugaskan kepada Anda</span>'
        : '<span style="color:var(--dash-text-muted); font-size:0.7rem; font-family:var(--font-mono);">Verifikator: ' + escapeHtml(t.assigned_admin_name || "—") + "</span>";
      var membersList = (t.members || []).map(function (m) {
        return '<span style="font-size:0.75rem; color:var(--dash-text-muted);">' + escapeHtml(m.full_name) + " (" + (m.role === "leader" ? "Ketua" : "Anggota") + ")</span>";
      }).join(" • ");

      var docsHtml;
      if (!t.documents || !t.documents.length) {
        docsHtml = '<p style="color:var(--dash-text-muted); font-size:0.8rem; font-style:italic; margin:0.8rem 0;">Belum ada berkas yang diunggah oleh peserta.</p>';
      } else {
        docsHtml = '<div class="vdoc-list">';
        t.documents.forEach(function (d) {
          var docLabel = DOC_LABELS[d.document_type] || d.document_type;
          var fileLink = isImage(d)
            ? '<a href="' + escapeHtml(d.download_url) + '" data-action="preview" data-doc-id="' + d.id + '">' + escapeHtml(d.original_name) + "</a>"
            : '<a href="' + escapeHtml(d.download_url) + '" target="_blank" rel="noopener">' + escapeHtml(d.original_name) + "</a>";
          var feedback = d.feedback ? '<p class="vdoc-feedback">Catatan: ' + escapeHtml(d.feedback) + "</p>" : "";
          var actions = docActions(d);
          docsHtml +=
            '<article class="vdoc-row">' +
            '  <div class="vdoc-main">' +
            "    <strong>" + escapeHtml(docLabel) + "</strong>" +
            '    <span class="vdoc-owner">' + escapeHtml(d.member_name || "Tim") + " · " + fileLink + "</span>" +
            feedback +
            "  </div>" +
            '  <div class="vdoc-side">' + docBadge(d) +
            (actions ? '<span class="vdoc-actions">' + actions + "</span>" : "") +
            "  </div>" +
            "</article>";
        });
        docsHtml += "</div>";
      }

      detailEl.innerHTML =
        '<section class="card" style="padding:1.4rem;">' +
        '  <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">' +
        "    <div>" +
        '      <h3 style="margin:0 0 0.3rem; font-size:1.1rem; color:var(--dash-text-primary);">' + escapeHtml(t.team_name || t.track) + ' <small style="color:var(--dash-text-muted); font-size:0.8rem; font-family:var(--font-mono);">(' + escapeHtml(t.team_code) + ")</small></h3>" +
        '      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:0.4rem;">' +
        '        <span style="font-size:0.75rem; color:var(--soft-violet); font-weight:700;">' + escapeHtml(t.competition_name || t.track) + "</span> • " +
        adminBadge +
        "      </div>" +
        "      <div>" + membersList + "</div>" +
        "    </div>" +
        '    <div style="text-align:right;">' +
        "      <div>" + statusBadge + "</div>" +
        '      <div style="font-family:var(--font-mono); font-size:0.7rem; color:var(--dash-text-muted); margin-top:0.4rem;">Lengkap: ' + stats.approved + " / " + stats.required + " berkas disetujui</div>" +
        "    </div>" +
        "  </div>" +
        docsHtml +
        "</section>";
      window.DashCommon.refreshIcons();
    }

    function handleAction(action, docId, btn) {
      if (!docId) return;
      if (action === "approve") {
        window.DashCommon.confirmMsg("Setujui berkas ini?", "Berkas akan ditandai disetujui dan dihitung ke kelengkapan tim.", "Setujui").then(function (yes) {
          if (!yes) return;
          patchDoc(docId, { status: "APPROVED" }, btn, "Berkas disetujui.", "Gagal menyetujui dokumen.");
        });
      } else {
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
          background: "var(--dash-swal-bg, #171226)",
          color: "var(--dash-swal-text, #ffe8d9)",
          reverseButtons: true
        }).then(function (r) {
          if (!r.isConfirmed) return;
          patchDoc(docId, { status: "REJECTED", feedback: r.value.trim() }, btn, "Berkas ditolak, catatan terkirim ke peserta.", "Gagal menolak dokumen.");
        });
      }
    }

    function patchDoc(docId, body, btn, okMsg, failMsg) {
      btn.disabled = true;
      fetch("/api/admin/verifications/" + encodeURIComponent(docId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin"
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.ok) {
            window.DashCommon.toast("success", okMsg);
            closeLightbox();
            loadData();
          } else {
            window.DashCommon.alertMsg("error", "Gagal", data.detail || failMsg);
          }
        })
        .catch(function () { window.DashCommon.alertMsg("error", "Koneksi gagal", "Tidak dapat menghubungi server."); })
        .finally(function () { btn.disabled = false; });
    }

    function openLightbox(docId, sig) {
      var d = findDoc(docId);
      if (!d) return;
      closeLightbox();
      var docLabel = DOC_LABELS[d.document_type] || d.document_type;
      var media = isImage(d)
        ? '<img src="' + escapeHtml(d.download_url) + '" alt="' + escapeHtml(docLabel) + '">'
        : '<a class="vdoc-btn" href="' + escapeHtml(d.download_url) + '" target="_blank" rel="noopener">Buka di tab baru</a>';
      var actions = docActions(d, true);
      var overlay = document.createElement("div");
      overlay.className = "vm-lightbox";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Pratinjau " + docLabel);
      overlay.innerHTML =
        '<button type="button" class="vm-lb-close" data-lb-close aria-label="Tutup pratinjau"><i data-lucide="x"></i></button>' +
        media +
        '<div class="vm-lb-foot">' +
        "  <div><strong>" + escapeHtml(docLabel) + '</strong><span class="vdoc-owner">' + escapeHtml(d.member_name || "Tim") + " · " + escapeHtml(d.original_name) + "</span></div>" +
        (actions ? '  <span class="vdoc-actions">' + actions + "</span>" : "") +
        "</div>";
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay || e.target.closest("[data-lb-close]")) { closeLightbox(); return; }
        var act = e.target.closest("[data-action]");
        if (!act) return;
        handleAction(act.getAttribute("data-action"), act.getAttribute("data-doc-id"), act);
      }, { signal: sig });
      document.body.appendChild(overlay);
      state.lightbox = overlay;
      window.DashCommon.refreshIcons();
      overlay.querySelector(".vm-lb-close").focus();
    }

    loadData();
  }

  function closeLightbox() {
    if (state.lightbox) {
      state.lightbox.remove();
      state.lightbox = null;
    }
  }

  Router.register("/dashboard/verifications/", {
    title: "Verifikasi Berkas · Perkutut Cup 2026",
    render: render,
    onEnter: onEnter,
    onLeave: onLeave
  });
})();
