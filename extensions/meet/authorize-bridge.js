// Corre SOLO en /extension-authorize (ver manifest.json). Esa página, cuando la persona pulsa «Conectar la extensión»,
// deja el token en un elemento oculto (#mext-token-bridge); aquí se lee y se guarda en chrome.storage.local.
// El elemento aparece DESPUÉS del clic, así que se espera a que exista (hasta 10 minutos).
(function () {
  "use strict";

  function read() {
    const el = document.getElementById("mext-token-bridge");
    if (!el) return false;
    const token = el.dataset.token;
    const userName = el.dataset.name || null;
    if (!token) return false;
    chrome.storage.local.set({ token, userName, apiBase: "https://scrum.proshop.lat" });
    return true;
  }

  if (read()) return;
  const observer = new MutationObserver(() => {
    if (read()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10 * 60 * 1000);
})();
