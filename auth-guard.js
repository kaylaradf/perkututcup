// Client-side gate for the dashboard. Placeholder until the backend owns sessions.
(() => {
  const KEY = "perkutut-auth";
  const target = document.currentScript?.dataset.redirect || "../../404.html";
  let authed = false;
  try {
    authed = sessionStorage.getItem(KEY) === "1" || localStorage.getItem(KEY) === "1";
  } catch (error) {
    authed = false;
  }
  if (!authed) window.location.replace(target);
})();
