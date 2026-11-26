/* Offline support for the Book of Living Waters.
   - The network comes first, so updates arrive whenever you're online; the copy saved on this device is
     used when the network fails, answers with an error, or hangs for more than a few seconds.
   - The app's own code is fetched by the bootloader with the header "x-bolw-boot": those requests are
     never answered from here, so the app's files are always one complete set (fresh from the network, or
     the last complete set the bootloader saved on this device), never a mix of old and new.
   If you add a file the app needs, add it to SHELL and bump CACHE. */
const CACHE = "tol-v13";
const SHELL = ["./", "./index.html", "./app.html", "./manifest.webmanifest", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png",
               "./claude.js", "./memory.js", "./safe.js", "./ai.js", "./agent.js", "./addons.js", "./drill.js", "./code.js", "./codefolds.js", "./sync.js", "./check.js"];
const WAIT = 4000;   // how long the network gets before the saved copy is used
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("tol-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin || req.headers.has("x-bolw-boot")) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE), nav = req.mode === "navigate";
    const saved = (await cache.match(req)) || (nav ? await cache.match("./index.html") : undefined);   // any page address opens the book
    const net = fetch(req).then(res => { if (res && res.ok && res.type === "basic" && !res.redirected) cache.put(req, res.clone()).catch(() => {}); return res; });
    if (!saved) return net;
    try { e.waitUntil(net.catch(() => {})); } catch (err) {}   // (if the saved copy is used, the fresh one still gets saved for next time)
    let timer;
    const slow = new Promise(res => { timer = setTimeout(() => res(null), WAIT); });
    try { const res = await Promise.race([net, slow]); return res && res.ok ? res : saved; }
    catch (err) { return saved; }
    finally { clearTimeout(timer); }
  })());
});
