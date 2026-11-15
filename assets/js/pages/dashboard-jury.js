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
      window.DashCommon.renderAside("jury") +
      mainMarkup() +
      "</div>";
  }

  function mainMarkup() {
    return (
      '<main class="dash-main">' +
      '  <h1 class="dash-page-title">Penilaian Karya Peserta</h1>' +
      '  <p class="dash-page-sub">Evaluasi submisi karya peserta yang ditugaskan kepada Anda (Format Auto-Assign 1 Juri per Submisi).</p>' +
      '  <div id="jury-submissions-list" style="display:flex; flex-direction:column; gap:1.5rem; margin-top:1.5rem;">' +
      '    <p class="dash-status" style="padding:2rem; text-align:center;">Memuat data karya yang ditugaskan...</p>' +
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
    initJury(container, signal);
  }

  function onLeave() {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = null;
  }

  function initJury(container, signal) {
    var listEl = container.querySelector("#jury-submissions-list");

    function loadSubmissions() {
      if (!listEl) return;
      fetch("/api/jury/submissions", { credentials: "same-origin", signal: signal })
        .then(function (res) {
          if (!res.ok) throw new Error("Gagal memuat karya juri");
          return res.json();
        })
        .then(function (data) {
          renderList(data.submissions || []);
        })
        .catch(function (err) {
          if (signal.aborted) return;
          listEl.innerHTML = '<p class="dash-status" style="padding:2rem; text-align:center; color:#ff6b6b;">' + escapeHtml(err.message) + '</p>';
        });
    }

    function renderList(submissions) {
      if (!listEl) return;
      if (!submissions.length) {
        listEl.innerHTML =
          '<div class="card" style="padding:2.5rem; text-align:center;">' +
          '  <p style="color:var(--dash-text-muted); font-size:0.9rem; margin:0;">Belum ada submisi karya peserta yang ditugaskan kepada Anda saat ini.</p>' +
          '</div>';
        return;
      }

      var html = "";
      submissions.forEach(function (sub) {
        var evalData = sub.evaluation || {};
        var hasEval = evalData.score != null;
        var scoreVal = hasEval ? evalData.score : "";
        var feedbackVal = hasEval ? (evalData.feedback || "") : "";

        var evalBadge = hasEval
          ? '<span style="background:rgba(46,204,113,0.15); color:#2ecc71; border:1px solid rgba(46,204,113,0.3); padding:0.25rem 0.6rem; border-radius:6px; font-size:0.75rem; font-weight:700;">SUDAH DINILAI (SKOR: ' + scoreVal + '/100)</span>'
          : '<span style="background:rgba(241,196,15,0.15); color:#f1c40f; border:1px solid rgba(241,196,15,0.3); padding:0.25rem 0.6rem; border-radius:6px; font-size:0.75rem; font-weight:700;">BELUM DINILAI</span>';

        html +=
          '<section class="card" style="padding:1.6rem;">' +
          '  <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:1rem;">' +
          '    <div>' +
          '      <h3 style="margin:0 0 0.25rem; font-size:1.15rem; color:var(--cream);">' + escapeHtml(sub.team_name || 'Tim') + ' <small style="color:var(--dash-text-muted); font-family:var(--font-mono); font-size:0.8rem;">(' + escapeHtml(sub.team_code) + ')</small></h3>' +
          '      <span style="font-size:0.75rem; color:var(--soft-violet); font-weight:700;">' + escapeHtml(sub.competition_name) + '</span>' +
          '    </div>' +
          '    <div>' + evalBadge + '</div>' +
          '  </div>' +
          '  <div style="background:rgba(255,255,255,0.03); border:1px solid var(--dash-border-mid); border-radius:8px; padding:0.9rem; margin-bottom:1.2rem;">' +
          '    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
          '      <div>' +
          '        <strong style="font-size:0.85rem; color:var(--cream);">' + escapeHtml(sub.original_name) + '</strong>' +
          '        <div style="font-size:0.72rem; color:var(--dash-text-muted); font-family:var(--font-mono);">Ukuran: ' + (sub.file_size ? (sub.file_size / 1024 / 1024).toFixed(2) + ' MB' : '—') + ' • Diunggah: ' + (sub.submitted_at || '—') + '</div>' +
          '      </div>' +
          '      <a class="btn-save" href="' + sub.download_url + '" download style="padding:0.4rem 0.9rem; font-size:0.75rem; text-decoration:none;">UNDUH KARYA ⬇</a>' +
          '    </div>' +
          (sub.notes ? '    <p style="margin:0.6rem 0 0; font-size:0.75rem; color:var(--dash-text-muted); border-top:1px solid rgba(255,255,255,0.05); padding-top:0.5rem;"><strong>Catatan Peserta:</strong> ' + escapeHtml(sub.notes) + '</p>' : '') +
          '  </div>' +
          '  <form data-eval-form data-team-id="' + sub.team_id + '" style="display:flex; flex-direction:column; gap:0.8rem;">' +
          '    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">' +
          '      <label style="font-family:var(--font-mono); font-size:0.75rem; color:var(--dash-text-muted); min-width:140px;">SKOR NILAI (0 - 100):</label>' +
          '      <input type="number" name="score" min="0" max="100" step="0.5" class="input" value="' + scoreVal + '" placeholder="Contoh: 85.5" required style="max-width:160px; font-weight:700;" />' +
          '    </div>' +
          '    <div>' +
          '      <label style="display:block; font-family:var(--font-mono); font-size:0.75rem; color:var(--dash-text-muted); margin-bottom:0.3rem;">CATATAN EVALUASI / FEEDBACK JURI:</label>' +
          '      <textarea name="feedback" class="input" rows="3" placeholder="Tuliskan ulasan, masukan, dan evaluasi teknis karya peserta..." style="resize:vertical;">' + escapeHtml(feedbackVal) + '</textarea>' +
          '    </div>' +
          '    <div style="display:flex; justify-content:flex-end;">' +
          '      <button type="submit" class="btn-save" style="padding:0.6rem 1.4rem;">SIMPAN NILAI</button>' +
          '    </div>' +
          '    <p class="dash-status" data-eval-status role="status" aria-live="polite" style="margin:0;"></p>' +
          '  </form>' +
          '</section>';
      });

      listEl.innerHTML = html;
      bindForms();
    }

    function bindForms() {
      listEl.querySelectorAll("[data-eval-form]").forEach(function (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var teamId = form.getAttribute("data-team-id");
          var scoreInput = form.querySelector("input[name='score']");
          var feedbackInput = form.querySelector("textarea[name='feedback']");
          var statusEl = form.querySelector("[data-eval-status]");
          var btn = form.querySelector("button[type='submit']");

          var score = parseFloat(scoreInput.value);
          if (isNaN(score) || score < 0 || score > 100) {
            if (statusEl) statusEl.textContent = "Skor harus berupa angka antara 0 sampai 100.";
            return;
          }

          btn.disabled = true;
          if (statusEl) statusEl.textContent = "Menyimpan penilaian...";

          fetch("/api/jury/submissions/" + teamId + "/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ score: score, feedback: feedbackInput.value.trim() || null }),
            credentials: "same-origin"
          })
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
            .then(function (r) {
              if (r.ok) {
                if (statusEl) statusEl.textContent = "Penilaian berhasil disimpan!";
                setTimeout(loadSubmissions, 1200);
              } else {
                if (statusEl) statusEl.textContent = r.data.detail || "Gagal menyimpan penilaian.";
              }
            })
            .catch(function () {
              if (statusEl) statusEl.textContent = "Gagal menghubungi server.";
            })
            .finally(function () {
              btn.disabled = false;
            });
        }, { signal: signal });
      });
    }

    loadSubmissions();
  }

  Router.register("/dashboard/jury/", {
    title: "Penilaian Karya · Perkutut Cup 2026",
    render: render,
    onEnter: onEnter,
    onLeave: onLeave
  });
})();
