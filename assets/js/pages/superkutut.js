/* Superkutut dashboard: console-style live audit log (SSE) + filters.
 * Route: /mampir-dulu-loh-mas/cok-gateli/ — hanya role superadmin (guard server+client). */
(function () {
  "use strict";
  if (!window.Router) return;

  var SUPER_PATH = "/mampir-dulu-loh-mas/cok-gateli/";
  var state = { ac: null, es: null, paused: false, rows: [], maxRows: 800, filters: {} };
  var esc = window.DashCommon.escapeHtml;

  var LEVEL_COLORS = { INFO: "#7ee787", WARN: "#f9f1a5", ERROR: "#ffa657", CRITICAL: "#ff7b72" };
  var STATUS_COLORS = { SUCCESS: "#7ee787", DENIED: "#ff7b72", ERROR: "#ffa657", FAILED: "#ffa657" };
  var EVENT_COLORS = {
    auth: "#f9f1a5", superkutut: "#ff7b72", profile: "#7ee787", team: "#7ee787",
    document: "#d2a8ff", verification: "#d2a8ff", competition: "#ffa657",
    submission: "#ffa657", jury: "#f9f1a5", admin_users: "#ff7b72", api: "#79c0ff"
  };

  function render(container) {
    container.innerHTML =
      '<div class="dash">' +
      window.DashCommon.renderAside("superkutut") +
      '<main class="dash-main">' +
      '  <h1 class="dash-page-title">SUPERKUTUT</h1>' +
      '  <p class="dash-page-sub">Console log aktivitas Perkutut Cup — live.</p>' +
      '  <div class="su-console-wrap">' +
      '    <div class="su-console-bar">' +
      '      <span class="su-live-dot" data-live-dot title="Status stream"></span>' +
      '      <select class="su-cfilter" data-f="category" aria-label="Filter kategori"><option value="">category: all</option><option>auth</option><option>superkutut</option><option>profile</option><option>team</option><option>document</option><option>verification</option><option>competition</option><option>submission</option><option>jury</option><option>admin_users</option><option>api</option></select>' +
      '      <select class="su-cfilter" data-f="action" aria-label="Filter aksi"><option value="">action: all</option></select>' +
      '      <select class="su-cfilter" data-f="outcome" aria-label="Filter outcome"><option value="">outcome: all</option><option>ok</option><option>denied</option><option>error</option></select>' +
      '      <input class="su-cfilter su-csearch" data-f="q" type="search" placeholder="grep…" aria-label="Cari log" />' +
      '      <button class="su-cbtn" type="button" data-pause>Pause</button>' +
      '      <button class="su-cbtn" type="button" data-export>Export</button>' +
      '      <button class="su-cbtn" type="button" data-clear>Clear</button>' +
      '    </div>' +
      '    <div class="su-console" data-console role="log" aria-live="off" tabindex="0"></div>' +
      '  </div>' +
      '</main>' +
      '</div>';
  }

  // Application Logging Standard — Hybrid Format (bracketed header + logfmt body),
  // satu baris. Mirip core.format_log_line (backend) untuk export .log.
  function fmtValue(v) {
    var s = String(v).replace(/[\r\n\t]/g, " ");
    if (s.length > 200) s = s.slice(0, 200) + "…";
    if (s === "" || /[ "=\\,]/.test(s)) s = '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    return s;
  }

  function logLine(r) {
    var d = r.ts ? new Date(r.ts) : new Date();
    var stamp = d.toISOString().replace(/\.\d+Z$/, "Z");
    var level = r.outcome === "ok" ? "INFO" : (r.outcome === "denied" ? "WARN" : "ERROR");
    var status = r.outcome === "ok" ? "SUCCESS" : (r.outcome === "denied" ? "DENIED" : "ERROR");
    var actor = r.actor_id != null ? "user_id=" + r.actor_id : "user_id=-";
    var event = String(r.action || "unknown").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    var body = [];
    if (r.actor_email) body.push(["username", r.actor_email]);
    if (r.actor_role) body.push(["role", r.actor_role]);
    if (r.category) body.push(["category", r.category]);
    if (r.target_type) body.push(["target", r.target_type + "#" + (r.target_id || "?")]);
    if (r.method) body.push(["method", r.method]);
    if (r.path) body.push(["path", r.path]);
    if (r.status != null) body.push(["http_status", r.status]);
    if (r.duration_ms != null) body.push(["duration_ms", r.duration_ms]);
    var det = r.detail || {};
    Object.keys(det).forEach(function (k) {
      var v = det[k];
      if (v === null || v === undefined) return;
      if (typeof v === "object") v = JSON.stringify(v);
      body.push([k, v]);
    });
    var kv = body.map(function (p) { return p[0] + "=" + fmtValue(p[1]); }).join(" ");
    var brackets = [
      [stamp, "#3fb950"], [level, LEVEL_COLORS[level]], [r.ip || "system", "#79c0ff"],
      [actor, "#8b949e"], [event, EVENT_COLORS[r.category] || "#8b949e"], [status, STATUS_COLORS[status]]
    ];
    var html = brackets.map(function (b) {
      return '<span style="color:' + b[1] + '">[' + esc(b[0]) + "]</span>";
    }).join(" ");
    if (kv) html += ' <span class="su-m">' + esc(kv) + "</span>";
    return {
      text: brackets.map(function (b) { return "[" + b[0] + "]"; }).join(" ") + (kv ? " " + kv : ""),
      html: '<div class="su-line" data-id="' + r.id + '" title="' + esc(r.user_agent || "") + '">' + html + "</div>"
    };
  }

  function lineHtml(r) { return logLine(r).html; }

  function matchesFilters(r) {
    var f = state.filters;
    if (f.category && r.category !== f.category) return false;
    if (f.action && r.action !== f.action) return false;
    if (f.outcome && r.outcome !== f.outcome) return false;
    if (f.q) {
      var hay = (r.actor_email || "") + " " + r.action + " " + (r.target_id || "") + " " + (r.path || "") + " " + JSON.stringify(r.detail || {});
      if (hay.toLowerCase().indexOf(f.q.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function atBottom(el) { return el.scrollHeight - el.scrollTop - el.clientHeight < 40; }

  function paintAll(container) {
    var con = container.querySelector("[data-console]");
    var visible = state.rows.filter(matchesFilters);
    // console: lama di atas, baru di bawah (append-style)
    con.innerHTML = visible.length
      ? visible.slice().reverse().map(lineHtml).join("")
      : '<div class="su-line su-dim">— tidak ada event yang cocok —</div>';
    con.scrollTop = con.scrollHeight;
    refreshActionFilter(container);
  }

  function append(container, r) {
    state.rows.push(r);
    if (state.rows.length > state.maxRows) state.rows.splice(0, state.rows.length - state.maxRows);
    refreshActionFilter(container, r.action);
    if (state.paused || !matchesFilters(r)) return;
    var con = container.querySelector("[data-console]");
    var dim = con.querySelector(".su-dim");
    if (dim) dim.remove();
    var stick = atBottom(con);
    con.insertAdjacentHTML("beforeend", lineHtml(r));
    while (con.children.length > state.maxRows) con.firstElementChild.remove();
    if (stick) con.scrollTop = con.scrollHeight;
  }

  function refreshActionFilter(container, newAction) {
    var sel = container.querySelector('[data-f="action"]');
    if (!sel) return;
    if (newAction && !sel.querySelector('option[value="' + CSS.escape(newAction) + '"]')) {
      var opt = document.createElement("option");
      opt.value = newAction;
      opt.textContent = newAction;
      sel.appendChild(opt);
    } else if (!newAction) {
      var seen = {};
      state.rows.forEach(function (r) { seen[r.action] = 1; });
      Object.keys(seen).sort().forEach(function (a) {
        if (!sel.querySelector('option[value="' + CSS.escape(a) + '"]')) {
          var o = document.createElement("option");
          o.value = a; o.textContent = a;
          sel.appendChild(o);
        }
      });
    }
  }

  function loadHistory(container) {
    var con = container.querySelector("[data-console]");
    con.innerHTML = '<div class="su-line su-dim">Memuat riwayat…</div>';
    fetch("/api/superkutut/logs?limit=200", { credentials: "same-origin" })
      .then(function (r) { if (r.status === 401) { window.location.replace("/mampir-dulu-loh-mas/loh-ya-boleh-wong-ditawari-kok/"); return null; } return r.json(); })
      .then(function (d) {
        if (!d) return;
        state.rows = (d.logs || []).slice().reverse(); // API DESC -> console ASC
        paintAll(container);
        openStream(container);
      })
      .catch(function () { con.innerHTML = '<div class="su-line" style="color:#ff7b72">Gagal memuat log.</div>'; });
  }

  function openStream(container) {
    if (state.es) { try { state.es.close(); } catch (e) {} }
    var dot = container.querySelector("[data-live-dot]");
    var lastId = state.rows.length ? state.rows[state.rows.length - 1].id : 0;
    var es = new EventSource("/api/superkutut/logs/stream?after_id=" + lastId);
    state.es = es;
    es.onopen = function () { if (dot) dot.classList.add("is-on"); };
    es.onerror = function () { if (dot) dot.classList.remove("is-on"); };
    es.addEventListener("log", function (ev) {
      try { append(container, JSON.parse(ev.data)); } catch (e) {}
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
      this.textContent = state.paused ? "Resume" : "Pause";
      if (!state.paused) paintAll(container);
    }, { signal: signal });

    container.querySelector("[data-clear]").addEventListener("click", function () {
      state.rows = [];
      paintAll(container);
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

    loadHistory(container);
  }

  function onLeave() {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    if (state.es) { try { state.es.close(); } catch (e) {} state.es = null; }
    state.ac = null;
  }

  Router.register(SUPER_PATH, {
    title: "SUPERKUTUT · Console",
    render: render,
    onEnter: onEnter,
    onLeave: onLeave,
  });
})();
