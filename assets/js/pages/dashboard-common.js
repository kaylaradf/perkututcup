/* Shared dashboard helpers for SPA shell modules (wave 1/2).
 * Loaded once by app/index.html, before page modules.
 */
(function () {
  "use strict";
  if (window.DashCommon) return;

  var NAV_ITEMS = [
    { key: "profile", href: "/dashboard/profile/", icon: "/assets/svg/dashboard/nav-profile.svg", label: "PROFILE &amp; TEAM", admin: false },
    { key: "submission", href: "/dashboard/submission/", icon: "/assets/svg/dashboard/nav-submission.svg", label: "PROJECT SUBMISSION", admin: false },
    { key: "competitions", href: "/dashboard/competitions/", icon: "/assets/svg/dashboard/icon-trophy.svg", label: "KELOLA KOMPETISI", admin: true },
    { key: "users", href: "/dashboard/users/", icon: "/assets/svg/dashboard/icon-members.svg", label: "KELOLA PENGGUNA", admin: true }
  ];

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Returns the full <aside>...</aside> HTML string for a dashboard module.
   * active: 'profile' | 'submission' | 'competitions' | 'users' */
  function renderAside(active) {
    var appState = window.__APP_STATE__ || {};
    var user = appState.user || {};
    var name = user.full_name || "User";
    var initial = (name.trim().charAt(0) || "U").toUpperCase();
    var isAdmin = user.role === "admin";
    var nav = "";
    NAV_ITEMS.forEach(function (item) {
      if (item.admin && !isAdmin) return;
      var cls = item.key === active ? ' class="is-active" aria-current="page"' : "";
      nav += '<a' + cls + ' href="' + item.href + '"><img src="' + item.icon + '" width="18" height="18" alt="" /><span>' + item.label + "</span></a>";
    });
    return (
      '<aside class="dash-aside" aria-label="Navigasi akun">' +
      '  <div>' +
      '    <a class="dash-brand" href="/#home" aria-label="Perkutut Cup 2026 home">' +
      '      <span class="dash-brand-mark"><img src="/assets/svg/dashboard/brand-mark.svg" width="22" height="22" alt="" /></span>' +
      "      <strong>User Portal</strong>" +
      "    </a>" +
      '    <div class="dash-team">' +
      '      <span class="dash-avatar">' + escapeHtml(initial) + "</span>" +
      "      <span><small>" + (isAdmin ? "ADMINISTRATOR" : "ACTIVE TEAM") + "</small><strong data-aside-name>" + escapeHtml(name) + "</strong></span>" +
      "    </div>" +
      '    <nav class="dash-nav" aria-label="Menu dashboard">' +
      nav +
      "    </nav>" +
      "  </div>" +
      '  <div class="dash-aside-foot">' +
      '    <a href="/#home"><img src="/assets/svg/dashboard/nav-home.svg" width="18" height="18" alt="" /><span>HOME PAGE</span></a>' +
      '    <a href="/sign-in/" data-logout><img src="/assets/svg/dashboard/nav-logout.svg" width="18" height="18" alt="" /><span>LOGOUT</span></a>' +
      '    <button class="dash-theme-toggle" id="dash-theme-toggle" type="button" aria-label="Toggle light/dark theme" aria-pressed="false"><span class="toggle-icon" aria-hidden="true">🌙</span><span class="toggle-label">DARK MODE</span></button>' +
      "  </div>" +
      "</aside>"
    );
  }

  function initTheme(container, signal) {
    var html = document.documentElement;
    var btn = container.querySelector("#dash-theme-toggle") || document.getElementById("dash-theme-toggle");
    var label = btn ? btn.querySelector(".toggle-label") : null;
    var icon = btn ? btn.querySelector(".toggle-icon") : null;
    var metaTheme = document.getElementById("meta-theme-color");
    function getTheme() {
      return html.getAttribute("data-theme") === "light" ? "light" : "dark";
    }
    function applyTheme(theme) {
      if (theme === "light") html.setAttribute("data-theme", "light");
      else html.removeAttribute("data-theme");
      if (btn) btn.setAttribute("aria-pressed", String(theme === "light"));
      if (label) label.textContent = theme === "light" ? "LIGHT MODE" : "DARK MODE";
      if (icon) icon.textContent = theme === "light" ? "☀️" : "🌙";
      if (metaTheme) metaTheme.setAttribute("content", theme === "light" ? "#f4f1ff" : "#0b0c10");
      try {
        localStorage.setItem("dash-theme", theme);
      } catch (e) {}
    }
    applyTheme(getTheme());
    if (btn)
      btn.addEventListener(
        "click",
        function () {
          applyTheme(getTheme() === "dark" ? "light" : "dark");
        },
        { signal: signal }
      );
  }

  function initLogout(container, signal) {
    var link = container.querySelector("[data-logout]");
    if (!link) return;
    link.addEventListener(
      "click",
      function (e) {
        e.preventDefault();
        fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(function () {
          window.location.href = "/sign-in/";
        });
      },
      { signal: signal }
    );
  }

  window.DashCommon = {
    escapeHtml: escapeHtml,
    renderAside: renderAside,
    initTheme: initTheme,
    initLogout: initLogout,
  };
})();
