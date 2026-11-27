/* Offline for BOLW Essentials (only this folder: /bolw/). The network comes first, so updates arrive whenever
   you're online; the copy saved on this device is used when the network fails or hangs. Safe mode (./safe/) is
   saved too, so the way back works offline. If you add a file the app needs, add it to SHELL and bump CACHE. */
const CACHE = "bolw-e2";
const SHELL = ["./", "./index.html", "./bolw.css", "./keep.js", "./joints.js", "./shelf.js", "./page.js", "./commands.js", "./socket.js", "./banks.js", "./breath.js", "./lock.js", "./settings.js", "./manifest.webmanifest", "./safe/", "./safe/index.html"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("bolw-e") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE), saved = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok && res.type === "basic" && !res.redirected) cache.put(req, res.clone()).catch(() => {}); return res; });
    if (!saved) return net;
    try { e.waitUntil(net.catch(() => {})); } catch (err) {}
    let timer; const slow = new Promise(r => { timer = setTimeout(() => r(null), 3000); });
    try { const res = await Promise.race([net, slow]); return res && res.ok ? res : saved; } catch (err) { return saved; } finally { clearTimeout(timer); }
  })());
});
