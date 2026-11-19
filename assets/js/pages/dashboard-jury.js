(function () {
  "use strict";
  if (!window.Router) return;

  var state = { ac: null, subs: [], selectedCode: null, lightbox: null };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var PAGE_CSS =
    ".jm-grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:1.2rem;align-items:start;}" +
    ".jm-list{position:sticky;top:84px;max-height:calc(100vh - 120px);overflow-y:auto;display:flex;flex-direction:column;gap:0.5rem;padding-right:4px;}" +
    ".jm-item{display:flex;flex-direction:column;gap:0.2rem;text-align:left;width:100%;padding:0.7rem 0.8rem;border-radius:10px;cursor:pointer;" +
    "  background:var(--dash-card);border:1px solid var(--dash-border-mid);color:var(--dash-text-body);font:inherit;}" +
    ".jm-item:hover{border-color:var(--soft-violet);}" +
    ".jm-item.is-active{border-color:var(--soft-violet);background:var(--dash-upload-item-bg);box-shadow:inset 3px 0 0 var(--soft-violet);}" +
    ".jm-item-name{font-weight:700;font-size:0.85rem;color:var(--dash-text-primary);}" +
    ".jm-item-code{font-family:var(--font-mono);font-size:0.68rem;color:var(--dash-text-muted);}" +
    ".jm-item-comp{font-size:0.72rem;color:var(--soft-violet);font-weight:600;}" +
    ".jm-item-file{font-size:0.68rem;color:var(--dash-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".jm-flag{display:inline-block;padding:0.12rem 0.45rem;border-radius:6px;font-size:0.65rem;font-weight:700;white-space:nowrap;}" +
    ".jm-flag.is-ok{background:rgba(46,204,113,0.15);color:#2ecc71;border:1px solid rgba(46,204,113,0.3);}" +
    ".jm-flag.is-wait{background:rgba(241,196,15,0.15);color:#f1c40f;border:1px solid rgba(241,196,15,0.3);}" +
    ".jm-empty{padding:2rem;text-align:center;color:var(--dash-text-muted);font-size:0.85rem;}" +
    ".jm-file-panel{background:var(--dash-upload-item-bg);border:1px solid var(--dash-border-mid);border-radius:8px;padding:0.9rem;margin:1rem 0 1.2rem;}" +
    ".jm-file-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}" +
    ".jm-file-btn{background:none;border:none;padding:0;font:inherit;font-weight:700;font-size:0.85rem;color:var(--dash-text-primary);cursor:pointer;text-align:left;word-break:break-all;}" +
    ".jm-file-btn:hover{text-decoration:underline;}" +
    ".jm-file-meta{font-size:0.72rem;color:var(--dash-text-muted);font-family:var(--font-mono);margin-top:0.2rem;}" +
    ".jm-file-actions{display:flex;align-items:center;gap:8px;}" +
    ".jm-preview-btn{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;" +
    "  background:var(--dash-card);border:1px solid var(--dash-border-mid);border-radius:8px;color:var(--dash-text-body);}" +
    ".jm-preview-btn:hover{border-color:var(--soft-violet);color:var(--soft-violet);}" +
    ".jm-preview-btn svg{width:16px;height:16px;}" +
    ".jm-notes{margin:0.6rem 0 0;font-size:0.75rem;color:var(--dash-text-muted);border-top:1px solid var(--dash-border-mid);padding-top:0.5rem;}" +
    ".jm-form{display:flex;flex-direction:column;gap:0.8rem;}" +
    ".jm-label{display:flex;flex-direction:column;gap:0.3rem;font-family:var(--font-mono);font-size:0.72rem;color:var(--dash-text-muted);}" +
    ".jm-form-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}" +
    ".jm-form-foot .dash-status{margin:0;flex:1;min-width:160px;}" +
    ".jm-lightbox{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;overflow:auto;}" +
    ".jm-lightbox img{max-width:90vw;max-height:min(85vh,calc(100vh - 300px));object-fit:contain;border-radius:8px;}" +
    ".jm-lb-pdf{display:flex;flex-direction:column;align-items:center;gap:8px;}" +
    ".jm-lb-pdf iframe{width:min(90vw,1000px);height:min(70vh,calc(100vh - 320px));border:none;border-radius:8px;background:var(--dash-card);}" +
    ".jm-lb-close{position:absolute;top:16px;right:16px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;" +
    "  background:rgba(0,0,0,0.5);border:1px solid var(--dash-border-mid);border-radius:8px;color:#fff;}" +
    ".jm-lb-close svg{width:20px;height:20px;}" +
    ".jm-lb-file{display:flex;flex-direction:column;align-items:center;gap:0.6rem;text-align:center;padding:1.5rem 2rem;border-radius:10px;" +
    "  background:var(--dash-card);border:1px solid var(--dash-border-mid);color:var(--dash-text-body);max-width:90vw;}" +
    ".jm-lb-file svg{width:48px;height:48px;color:var(--soft-violet);}" +
    ".jm-lb-file strong{color:var(--dash-text-primary);word-break:break-all;}" +
    ".jm-lb-file-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}" +
    ".jm-lb-foot{width:min(90vw,720px);padding:0.9rem 1rem;border-radius:10px;background:var(--dash-card);border:1px solid var(--dash-border-mid);color:var(--dash-text-body);}" +
    ".jm-lb-team{font-size:0.8rem;margin-bottom:0.6rem;color:var(--dash-text-primary);}" +
    ".jm-lb-team span{font-family:var(--font-mono);font-size:0.7rem;color:var(--dash-text-muted);}" +
    "@media (max-width:900px){.jm-grid{grid-template-columns:1fr;}" +
    "  .jm-list{position:static;max-height:none;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding-bottom:6px;}" +
    "  .jm-item{flex:0 0 auto;min-width:220px;}}";

  function render(container) {
    container.innerHTML =
      '<div class="dash">' +
      window.DashCommon.renderAside("jury") +
      mainMarkup() +
      "</div>";
  }

  function mainMarkup() {
    return (
      '<main class="dash-main">' +
      '  <h1 class="dash-page-title">Penilaian Karya Peserta</h1>' +
      '  <p class="dash-page-sub">Evaluasi submisi karya peserta yang ditugaskan kepada Anda (Format Auto-Assign 1 Juri per Submisi).</p>' +
      '  <div class="jm-grid">' +
      '    <aside id="jm-list" class="jm-list" aria-label="Daftar submisi karya"></aside>' +
      '    <section id="jm-detail" aria-label="Detail submisi karya"></section>' +
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
    initJury(container, signal);
  }

  function onLeave() {
    closeLightbox();
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = null;
  }

  function findSub(code) {
    for (var i = 0; i < state.subs.length; i++) {
      if (state.subs[i].team_code === code) return state.subs[i];
    }
    return null;
  }

  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";
  }

  function fmtSize(bytes) {
    return bytes ? (bytes / 1048576).toFixed(2) + " MB" : "—";
  }

  function evalBadge(sub) {
    var ev = sub.evaluation;
    return ev && ev.score != null
      ? '<span class="jm-flag is-ok">SUDAH DINILAI (' + escapeHtml(ev.score) + ")</span>"
      : '<span class="jm-flag is-wait">BELUM DINILAI</span>';
  }

  // Shared by detail panel and lightbox footer so both submit through one handler.
  function evalFormHtml(sub, rows) {
    var ev = sub.evaluation || {};
    var score = ev.score != null ? ev.score : "";
    return (
      '<form data-eval-form data-team-id="' + sub.team_id + '" class="jm-form">' +
      '  <label class="jm-label">SKOR NILAI (0 - 100)' +
      '    <input type="number" name="score" class="input" min="0" max="100" step="0.5" required value="' + score + '" placeholder="Contoh: 85.5" style="max-width:160px;font-weight:700;">' +
      "  </label>" +
      '  <label class="jm-label">CATATAN EVALUASI / FEEDBACK JURI' +
      '    <textarea name="feedback" class="input" rows="' + rows + '" placeholder="Tuliskan ulasan, masukan, dan evaluasi teknis karya peserta..." style="resize:vertical;">' + escapeHtml(ev.feedback || "") + "</textarea>" +
      "  </label>" +
      '  <div class="jm-form-foot">' +
      '    <p class="dash-status" data-eval-status role="status" aria-live="polite"></p>' +
      '    <button type="submit" class="btn-save" style="padding:0.6rem 1.4rem;">SIMPAN NILAI</button>' +
      "  </div>" +
      "</form>"
    );
  }

  function initJury(container, signal) {
    var listEl = container.querySelector("#jm-list");
    var detailEl = container.querySelector("#jm-detail");

    // Delegated clicks: team selection + preview (rows survive re-renders).
    container.addEventListener("click", function (e) {
      var item = e.target.closest("[data-team]");
      if (item && listEl.contains(item)) {
        selectTeam(item.getAttribute("data-team"));
        return;
      }
      var act = e.target.closest('[data-action="preview"]');
      if (act && detailEl.contains(act)) {
        e.preventDefault();
        openLightbox(state.selectedCode, signal);
      }
    }, { signal: signal });

    // One submit handler covers both the detail form and the lightbox footer form.
    document.addEventListener("submit", function (e) {
      if (!e.target.matches || !e.target.matches("[data-eval-form]")) return;
      e.preventDefault();
      saveEvaluation(e.target, signal);
    }, { signal: signal });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.lightbox) closeLightbox();
    }, { signal: signal });

    function loadData() {
      listEl.innerHTML = '<p class="jm-empty">Memuat data karya yang ditugaskan...</p>';
      fetch("/api/jury/submissions", { credentials: "same-origin", signal: signal })
        .then(function (res) {
          if (!res.ok) throw new Error("Gagal memuat karya juri");
          return res.json();
        })
        .then(function (data) {
          state.subs = data.submissions || [];
          var sel = findSub(state.selectedCode) || state.subs[0] || null;
          state.selectedCode = sel ? sel.team_code : null;
          renderList();
          renderDetail();
        })
        .catch(function (err) {
          if (signal.aborted) return;
          listEl.innerHTML = '<p class="jm-empty" style="color:#ff6b6b;">' + escapeHtml(err.message) + "</p>";
          detailEl.innerHTML = "";
        });
    }

    function renderList() {
      if (!state.subs.length) {
        listEl.innerHTML = '<p class="jm-empty">Belum ada submisi karya peserta yang ditugaskan kepada Anda saat ini.</p>';
        return;
      }
      var html = "";
      state.subs.forEach(function (sub) {
        html +=
          '<button type="button" class="jm-item' + (sub.team_code === state.selectedCode ? " is-active" : "") + '" data-team="' + escapeHtml(sub.team_code) + '">' +
          '  <span class="jm-item-name">' + escapeHtml(sub.team_name || "Tim") + "</span>" +
          '  <span class="jm-item-code">' + escapeHtml(sub.team_code) + "</span>" +
          '  <span class="jm-item-comp">' + escapeHtml(sub.competition_name) + "</span>" +
          "  <span>" + evalBadge(sub) + "</span>" +
          '  <span class="jm-item-file">' + escapeHtml(sub.original_name) + "</span>" +
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
      var sub = findSub(state.selectedCode);
      if (!sub) {
        detailEl.innerHTML = '<div class="card"><p class="jm-empty">Tidak ada submisi untuk ditampilkan. Pilih tim dari daftar di samping.</p></div>';
        return;
      }
      var ev = sub.evaluation;
      var juryInfo = sub.assigned_jury_name
        ? '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--dash-text-muted);margin-top:0.3rem;">Juri: ' + escapeHtml(sub.assigned_jury_name) + "</div>"
        : "";
      var evalInfo = ev && ev.evaluated_at
        ? '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--dash-text-muted);margin-top:0.4rem;">Dinilai: ' + escapeHtml(fmtDate(ev.evaluated_at)) + "</div>"
        : "";

      detailEl.innerHTML =
        '<section class="card" style="padding:1.4rem;">' +
        '  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">' +
        "    <div>" +
        '      <h3 style="margin:0 0 0.3rem;font-size:1.1rem;color:var(--dash-text-primary);">' + escapeHtml(sub.team_name || "Tim") + ' <small style="color:var(--dash-text-muted);font-size:0.8rem;font-family:var(--font-mono);">(' + escapeHtml(sub.team_code) + ")</small></h3>" +
        '      <span style="font-size:0.75rem;color:var(--soft-violet);font-weight:700;">' + escapeHtml(sub.competition_name) + "</span>" +
        juryInfo +
        "    </div>" +
        '    <div style="text-align:right;">' + evalBadge(sub) + evalInfo + "</div>" +
        "  </div>" +
        '  <div class="jm-file-panel">' +
        '    <div class="jm-file-row">' +
        "      <div>" +
        '        <button type="button" class="jm-file-btn" data-action="preview" title="Pratinjau karya">' + escapeHtml(sub.original_name) + "</button>" +
        '        <div class="jm-file-meta">Ukuran: ' + fmtSize(sub.file_size) + " • Diunggah: " + escapeHtml(fmtDate(sub.submitted_at)) + "</div>" +
        "      </div>" +
        '      <div class="jm-file-actions">' +
        '        <button type="button" class="jm-preview-btn" data-action="preview" title="Pratinjau karya" aria-label="Pratinjau karya"><i data-lucide="eye"></i></button>' +
        '        <a class="btn-save" href="' + escapeHtml(sub.download_url) + '" download style="padding:0.4rem 0.9rem;font-size:0.75rem;text-decoration:none;">UNDUH KARYA ⬇</a>' +
        "      </div>" +
        "    </div>" +
        (sub.notes ? '    <p class="jm-notes"><strong>Catatan Peserta:</strong> ' + escapeHtml(sub.notes) + "</p>" : "") +
        "  </div>" +
        evalFormHtml(sub, 3) +
        "</section>";
      window.DashCommon.refreshIcons();
    }

    function saveEvaluation(form, sig) {
      var teamId = form.getAttribute("data-team-id");
      var scoreInput = form.querySelector("[name='score']");
      var feedbackInput = form.querySelector("[name='feedback']");
      var statusEl = form.querySelector("[data-eval-status]");
      var btn = form.querySelector("button[type='submit']");

      var score = parseFloat(scoreInput.value);
      if (isNaN(score) || score < 0 || score > 100) {
        if (statusEl) statusEl.textContent = "Skor harus berupa angka antara 0 sampai 100.";
        return;
      }

      btn.disabled = true;
      if (statusEl) statusEl.textContent = "Menyimpan penilaian...";

      fetch("/api/jury/submissions/" + encodeURIComponent(teamId) + "/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: score, feedback: feedbackInput.value.trim() || null }),
        credentials: "same-origin",
        signal: sig
      })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
        .then(function (r) {
          if (r.ok) {
            window.DashCommon.toast("success", r.data.message || "Penilaian berhasil disimpan.");
            closeLightbox();
            loadData();
          } else if (statusEl) {
            statusEl.textContent = r.data.detail || "Gagal menyimpan penilaian.";
          }
        })
        .catch(function () {
          if (sig.aborted) return;
          if (statusEl) statusEl.textContent = "Gagal menghubungi server.";
        })
        .finally(function () { btn.disabled = false; });
    }

    function openLightbox(code, sig) {
      var sub = findSub(code);
      if (!sub) return;
      closeLightbox();
      var name = sub.original_name || "";
      var url = escapeHtml(sub.download_url);
      var media;
      if (/\.(jpe?g|png|webp)$/i.test(name)) {
        media = '<img src="' + url + '" alt="' + escapeHtml(name) + '">';
      } else if (/\.pdf$/i.test(name)) {
        media =
          '<div class="jm-lb-pdf">' +
          '  <iframe src="' + url + '" type="application/pdf" title="Pratinjau ' + escapeHtml(name) + '"></iframe>' +
          '  <a class="btn-save" href="' + url + '" target="_blank" rel="noopener" style="padding:0.4rem 0.9rem;font-size:0.75rem;text-decoration:none;">Buka di tab baru</a>' +
          "</div>";
      } else {
        media =
          '<div class="jm-lb-file">' +
          '  <i data-lucide="file-archive"></i>' +
          "  <strong>" + escapeHtml(name) + "</strong>" +
          '  <span class="jm-file-meta">Ukuran: ' + fmtSize(sub.file_size) + "</span>" +
          '  <div class="jm-lb-file-actions">' +
          '    <a class="btn-save" href="' + url + '" download style="padding:0.4rem 0.9rem;font-size:0.75rem;text-decoration:none;">Unduh</a>' +
          '    <button type="button" class="btn-save" data-lb-open style="padding:0.4rem 0.9rem;font-size:0.75rem;">Buka di tab baru</button>' +
          "  </div>" +
          "</div>";
      }

      var overlay = document.createElement("div");
      overlay.className = "jm-lightbox";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Pratinjau karya " + name);
      overlay.innerHTML =
        '<button type="button" class="jm-lb-close" data-lb-close aria-label="Tutup pratinjau"><i data-lucide="x"></i></button>' +
        media +
        '<div class="jm-lb-foot">' +
        '  <div class="jm-lb-team"><strong>' + escapeHtml(sub.team_name || "Tim") + "</strong> <span>(" + escapeHtml(sub.team_code) + ")</span></div>" +
        evalFormHtml(sub, 2) +
        "</div>";
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay || e.target.closest("[data-lb-close]")) { closeLightbox(); return; }
        if (e.target.closest("[data-lb-open]")) window.open(sub.download_url, "_blank", "noopener");
      }, { signal: sig });
      document.body.appendChild(overlay);
      state.lightbox = overlay;
      window.DashCommon.refreshIcons();
      overlay.querySelector(".jm-lb-close").focus();
    }

    loadData();
  }

  function closeLightbox() {
    if (state.lightbox) {
      state.lightbox.remove();
      state.lightbox = null;
    }
  }

  Router.register("/dashboard/jury/", {
    title: "Penilaian Karya · Perkutut Cup 2026",
    render: render,
    onEnter: onEnter,
    onLeave: onLeave
  });
})();
