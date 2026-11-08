(function () {
  "use strict";

  var routes = [];
  var current = null;
  var viewEl = null;

  function norm(path) {
    if (!path) return "/";
    var p = String(path);
    try { p = new URL(p, window.location.origin).pathname; } catch (e) {}
    if (!p.startsWith("/")) p = "/" + p;
    if (p.length > 1 && !p.endsWith("/")) p += "/";
    return p;
  }

  function match(path) {
    var p = norm(path);
    for (var i = 0; i < routes.length; i++) {
      var pat = routes[i].pattern;
      var np = norm(pat);
      if (np === p) return routes[i];
      if (np !== "/" && p.indexOf(np) === 0) return routes[i];
    }
    return null;
  }

  var Router = {
    register: function (pattern, route) {
      var np = norm(pattern);
      for (var i = 0; i < routes.length; i++) {
        if (norm(routes[i].pattern) === np) return; // dedupe
      }
      routes.push({
        pattern: pattern,
        title: route && route.title,
        render: route && route.render,
        onEnter: route && route.onEnter,
        onLeave: route && route.onLeave,
      });
    },
    navigate: function (path, opts) {
      opts = opts || {};
      var route = match(path);
      if (!route) {
        window.location.href = path;
        return;
      }
      var target = norm(path);
      if (current && current.route === route && norm(current.path) === target && !opts.force) return;
      if (current && current.route && current.route.onLeave) {
        try { current.route.onLeave(viewEl); } catch (e) {}
      }
      if (!viewEl) viewEl = document.getElementById("view");
      if (viewEl) viewEl.innerHTML = "";
      if (route.title) document.title = route.title;
      if (route.render && viewEl) route.render(viewEl);
      if (route.onEnter) route.onEnter(viewEl);
      if (!opts.replace) {
        try { history.pushState({ path: target }, "", target); } catch (e) {}
      } else {
        try { history.replaceState({ path: target }, "", target); } catch (e) {}
      }
      current = { route: route, path: target };
      updateActiveNav(target);
      window.scrollTo(0, 0);
    },
  };

  function updateActiveNav(path) {
    var p = norm(path);
    var links = document.querySelectorAll(".dash-nav a[href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute("href") || "";
      if (href.indexOf("#") === 0 || /^(https?:|mailto:)/.test(href)) continue;
      var hp = norm(href);
      var active = hp === p;
      a.classList.toggle("is-active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }

  function shouldIntercept(a, e) {
    if (!a || e.defaultPrevented) return false;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (a.target && a.target !== "_self") return false;
    if (a.hasAttribute("download")) return false;
    var href = a.getAttribute("href");
    if (!href || href.indexOf("#") === 0) return false;
    var url;
    try { url = new URL(href, window.location.origin); } catch (err) { return false; }
    if (url.origin !== window.location.origin) return false;
    return !!match(url.pathname);
  }

  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!shouldIntercept(a, e)) return;
    e.preventDefault();
    var url = new URL(a.getAttribute("href"), window.location.origin);
    Router.navigate(url.pathname);
  });

  window.addEventListener("popstate", function () {
    var path = (window.__APP_STATE__ && window.__APP_STATE__.path) ? window.location.pathname : window.location.pathname;
    if (match(path)) Router.navigate(path, { replace: true, force: true });
    else window.location.reload();
  });

  function boot() {
    viewEl = document.getElementById("view");
    var state = window.__APP_STATE__ || {};
    var path = state.path || window.location.pathname;
    if (match(path)) Router.navigate(path, { replace: true, force: true });
    else if (match(window.location.pathname)) Router.navigate(window.location.pathname, { replace: true, force: true });
  }

  // All shell scripts are <script defer>, which run in document order
  // BEFORE DOMContentLoaded. If we boot here (readyState already
  // "interactive"), the sibling page modules haven't registered their
  // routes yet and the initial view stays blank. So only boot
  // immediately when readyState is already "complete"; otherwise wait
  // for DOMContentLoaded, which fires after every defer module has run.
  if (document.readyState === "complete") {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot);
  }

  window.Router = Router;
})();
