/* Service worker de Calepin : reçoit les notifications push (onglet fermé ou en arrière-plan) et ouvre le bon CCTP au clic. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Calepin", body: event.data ? event.data.text() : "" }; }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Calepin est déjà affiché et au premier plan : l'application montre elle-même la notification (cloche, pastilles, bulles).
    if (windows.some((client) => client.visibilityState === "visible" && client.focused) && data.tag !== "calepin-test") return;
    await self.registration.showNotification(data.title || "Calepin", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: data.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        client.postMessage({ type: "open-url", url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
