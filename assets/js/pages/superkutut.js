/* Superkutut dashboard: live audit log (SSE) + overview stats.
 * Route: /mampir-dulu-loh-mas/cok-gateli/ — hanya role superadmin (guard server+client). */
(function () {
  "use strict";
  if (!window.Router) return;

  var SUPER_PATH = "/mampir-dulu-loh-mas/cok-gateli/";
  var state = { ac: null, es: null, paused: false, rows: [], maxRows: 500, filters: {} };
  var esc = window.DashCommon.escapeHtml;

  var CAT_COLORS = {
    auth: "#f1c40f", superkutut: "#e74c3c", profile: "#6ee7b7", team: "#6ee7b7",
    document: "#bf8fee", verification: "#bf8fee", competition: "#ff9f68",
    submission: "#ff9f68", jury: "#ffd166", admin_users: "#e74c3c", api: "#8a86a0"
  };

  function render(container) {
    container.innerHTML =
      '<div class="dash">' +
      window.DashCommon.renderAside("superkutut") +
      '<main class="dash-main">' +
      '  <h1 class="dash-page-title">SUPERKUTUT</h1>' +
      '  <p class="dash-page-sub">Seluruh privilege dalam satu tempat. Live log aktivitas Perkutut Cup.</p>' +
      '  <section class="dash-metrics" aria-label="Ringkasan 24 jam">' +
      '    <article class="metric is-green"><div><p class="metric-label">LOGIN SUKSES (24J)</p><p class="metric-value" data-stat="logins_24h">—</p></div></article>' +
      '    <article class="metric is-amber"><div><p class="metric-label">LOGIN GAGAL (24J)</p><p class="metric-value" data-stat="login_failures_24h">—</p></div></article>' +
      '    <article class="metric is-violet"><div><p class="metric-label">TOTAL EVENT (24J)</p><p class="metric-value" data-stat="events_24h">—</p></div></article>' +
      '    <article class="metric is-green"><div><p class="metric-label">UPLOAD (24J)</p><p class="metric-value" data-stat="uploads_24h">—</p></div></article>' +
      '  </section>' +
      '  <section class="card" style="margin-bottom:1rem;">' +
      '    <div class="card-head"><h2>LIVE LOG</h2>' +
      '      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">' +
      '        <span class="su-live-dot" data-live-dot title="Status stream"></span>' +
      '        <button class="vdoc-btn" type="button" data-pause>Jeda</button>' +
      '        <button class="vdoc-btn" type="button" data-export>Export CSV</button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="su-filter-bar">' +
      '      <select class="input" data-f="category"><option value="">Semua kategori</option><option>auth</option><option>superkutut</option><option>profile</option><option>team</option><option>document</option><option>verification</option><option>competition</option><option>submission</option><option>jury</option><option>admin_users</option><option>api</option></select>' +
      '      <select class="input" data-f="outcome"><option value="">Semua outcome</option><option>ok</option><option>denied</option><option>error</option></select>' +
      '      <input class="input" data-f="q" type="search" placeholder="Cari email / aksi / target / path…" />' +
      '    </div>' +
      '    <div class="su-log" data-log role="log" aria-live="off"></div>' +
      '  </section>' +
      '</main>' +
      '</div>';
  }

  function rowHtml(r) {
    var color = CAT_COLORS[r.category] || "#8a86a0";
    var outcomeCls = r.outcome === "ok" ? "is-approved" : (r.outcome === "denied" ? "is-rejected" : "is-pending");
    var actor = r.actor_email || "(anonim)";
    var what = r.action + (r.path && r.category === "api" ? "" : "");
    var target = r.target_type ? " → " + r.target_type + "#" + (r.target_id || "?") : "";
    var detail = r.detail && Object.keys(r.detail).length ? JSON.stringify(r.detail, null, 1) : "";
    var ts = r.ts ? new Date(r.ts).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" }) : "";
    return (
      '<article class="su-row" data-id="' + r.id + '">' +
      '  <div class="su-row-main">' +
      '    <span class="su-time">' + esc(ts) + '</span>' +
      '    <span class="su-cat" style="color:' + color + ';border-color:' + color + '55">' + esc(r.category) + '</span>' +
      '    <strong>' + esc(what) + '</strong>' +
      '    <span class="vdoc-badge ' + outcomeCls + '">' + esc(r.outcome) + '</span>' +
      '    <span class="su-actor">' + esc(actor) + (r.actor_role ? ' <small>(' + esc(r.actor_role) + ')</small>' : '') + esc(target) + '</span>' +
      (r.status ? ' <small class="su-meta">' + esc(r.method || "") + " " + r.status + (r.duration_ms != null ? " · " + r.duration_ms + "ms" : "") + '</small>' : '') +
      (r.ip ? ' <small class="su-meta">' + esc(r.ip) + '</small>' : '') +
      '  </div>' +
      (detail ? '<details class="su-detail"><summary>detail</summary><pre>' + esc(detail) + '</pre></details>' : '') +
      '</article>'
    );
  }

  function matchesFilters(r) {
    var f = state.filters;
    if (f.category && r.category !== f.category) return false;
    if (f.outcome && r.outcome !== f.outcome) return false;
    if (f.q) {
      var hay = (r.actor_email || "") + " " + r.action + " " + (r.target_id || "") + " " + (r.path || "") + " " + JSON.stringify(r.detail || {});
      if (hay.toLowerCase().indexOf(f.q.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function paintAll(container) {
    var log = container.querySelector("[data-log]");
    var visible = state.rows.filter(matchesFilters).slice(0, state.maxRows);
    log.innerHTML = visible.length ? visible.map(rowHtml).join("") : '<p class="dash-status" style="padding:1.5rem;text-align:center;">Belum ada event yang cocok.</p>';
  }

  function prepend(container, r) {
    state.rows.unshift(r);
    if (state.rows.length > state.maxRows) state.rows.length = state.maxRows;
    if (state.paused || !matchesFilters(r)) return;
    var log = container.querySelector("[data-log]");
    var empty = log.querySelector(".dash-status");
    if (empty) empty.remove();
    log.insertAdjacentHTML("afterbegin", rowHtml(r));
    while (log.children.length > state.maxRows) log.lastElementChild.remove();
  }

  function loadStats(container) {
    fetch("/api/superkutut/stats", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        ["logins_24h", "login_failures_24h", "events_24h", "uploads_24h"].forEach(function (k) {
          var el = container.querySelector('[data-stat="' + k + '"]');
          if (el) el.textContent = s[k];
        });
      }).catch(function () {});
  }

  function loadHistory(container) {
    var log = container.querySelector("[data-log]");
    log.innerHTML = '<p class="dash-status" style="padding:1.5rem;text-align:center;">Memuat riwayat…</p>';
    fetch("/api/superkutut/logs?limit=200", { credentials: "same-origin" })
      .then(function (r) { if (r.status === 401) { window.location.replace("/mampir-dulu-loh-mas/loh-ya-boleh-wong-ditawari-kok/"); return null; } return r.json(); })
      .then(function (d) {
        if (!d) return;
        state.rows = d.logs || [];
        paintAll(container);
        openStream(container);
      })
      .catch(function () { log.innerHTML = '<p class="dash-status" style="padding:1.5rem;text-align:center;color:#ff6b6b;">Gagal memuat log.</p>'; });
  }

  function openStream(container) {
    if (state.es) { try { state.es.close(); } catch (e) {} }
    var dot = container.querySelector("[data-live-dot]");
    var lastId = state.rows.length ? state.rows[0].id : 0;
    var es = new EventSource("/api/superkutut/logs/stream?after_id=" + lastId);
    state.es = es;
    es.onopen = function () { if (dot) dot.classList.add("is-on"); };
    es.onerror = function () { if (dot) dot.classList.remove("is-on"); };
    es.addEventListener("log", function (ev) {
      try { prepend(container, JSON.parse(ev.data)); } catch (e) {}
    });
  }

  function onEnter(container) {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = new AbortController();
    var signal = state.ac.signal;
    state.paused = false;
    state.filters = {};
    window.DashCommon.initTheme(container, signal);
    window.DashCommon.initLogout(container, signal);
    window.DashCommon.refreshIcons();

    container.querySelector("[data-pause]").addEventListener("click", function () {
      state.paused = !state.paused;
      this.textContent = state.paused ? "Lanjutkan" : "Jeda";
      if (!state.paused) paintAll(container);
    }, { signal: signal });

    container.querySelector("[data-export]").addEventListener("click", function () {
      var f = state.filters;
      var qs = Object.keys(f).filter(function (k) { return f[k]; }).map(function (k) { return k + "=" + encodeURIComponent(f[k]); }).join("&");
      window.open("/api/superkutut/logs/export" + (qs ? "?" + qs : ""), "_blank", "noopener");
    }, { signal: signal });

    container.querySelectorAll("[data-f]").forEach(function (el) {
      var evt = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, function () {
        state.filters[el.getAttribute("data-f")] = el.value.trim();
        paintAll(container);
      }, { signal: signal });
    });

    loadStats(container);
    loadHistory(container);
    state.statsTimer = setInterval(function () { loadStats(container); }, 30000);
  }

  function onLeave() {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    if (state.es) { try { state.es.close(); } catch (e) {} state.es = null; }
    if (state.statsTimer) { clearInterval(state.statsTimer); state.statsTimer = null; }
    state.ac = null;
  }

  Router.register(SUPER_PATH, {
    title: "SUPERKUTUT",
    render: render,
    onEnter: onEnter,
    onLeave: onLeave,
  });
})();
