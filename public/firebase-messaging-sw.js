/* eslint-disable no-undef */
// WearWise — FCM web-push service worker (Module D).
// Registered as /firebase-messaging-sw.js?config=<urlencoded JSON> — the
// client passes the public Firebase config in the query string because a
// service worker cannot read NEXT_PUBLIC_* env vars.
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

try {
  var params = new URL(self.location.href).searchParams;
  var raw = params.get("config");
  if (raw) {
    firebase.initializeApp(JSON.parse(raw));
    var messaging = firebase.messaging();
    messaging.onBackgroundMessage(function (payload) {
      var n = (payload && payload.notification) || {};
      self.registration.showNotification(n.title || "WearWise", {
        body: n.body || "Your outfit is ready.",
        icon: "/icon-192.png",
        data: { url: (payload && payload.data && payload.data.url) || "/dashboard" },
      });
    });
  }
} catch (e) {
  // Never crash the SW — push simply won't fire without valid config.
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) { list[i].navigate(url); return list[i].focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
