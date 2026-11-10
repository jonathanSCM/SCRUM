// Service worker de SCRUM ProShop: recibe los push del servidor y abre el
// ticket/proyecto al tocar la notificación. No guarda páginas en caché (la app
// es autenticada y siempre tiene que mostrar datos frescos).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Navegaciones: red directa; sin conexión, un aviso simple en vez de la pantalla de error del navegador.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Sin conexión</title><body style='font-family:system-ui;padding:2rem;color:#1b1730'><h1>Sin conexión</h1><p>SCRUM ProShop necesita internet. Probá de nuevo en un momento.</p>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
          status: 503,
        })
    )
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "SCRUM ProShop", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "SCRUM ProShop";
  // Insignia con el número de avisos sin leer sobre el icono de la app instalada (Badging API).
  const badgeJob =
    typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator
      ? (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {})
      : Promise.resolve();
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag || undefined,
        data: { url: data.url || "/home" },
      }),
      badgeJob,
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/home", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
