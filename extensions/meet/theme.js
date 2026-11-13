// Tema claro / oscuro de la extensión. Sin elegir, sigue al sistema; el botón (#themeBtn) lo fija y se recuerda
// (localStorage vale para todas las páginas de la extensión). Se carga en el <head> para no parpadear.
(function () {
  "use strict";
  var root = document.documentElement;
  function saved() {
    try {
      var t = localStorage.getItem("theme");
      return t === "light" || t === "dark" ? t : null;
    } catch (e) {
      return null;
    }
  }
  function effective() {
    return saved() || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function apply() {
    var t = saved();
    if (t) root.setAttribute("data-theme", t);
    else root.removeAttribute("data-theme");
    var b = document.getElementById("themeBtn");
    if (b) {
      var dark = effective() === "dark";
      b.setAttribute("aria-label", dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
      b.title = dark ? "Tema claro" : "Tema oscuro";
      b.setAttribute("data-mode", dark ? "dark" : "light");
    }
  }
  function toggle() {
    var next = effective() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
    apply();
  }
  apply();
  document.addEventListener("DOMContentLoaded", function () {
    apply();
    var b = document.getElementById("themeBtn");
    if (b) b.addEventListener("click", toggle);
  });
  // Si cambia en otra página de la extensión (panel y ventana emergente), se actualiza sola.
  window.addEventListener("storage", function (e) {
    if (e.key === "theme") apply();
  });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
})();
