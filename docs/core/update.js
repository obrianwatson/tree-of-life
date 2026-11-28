/* update.js · CORE · NEW VERSIONS, WITHOUT INTERRUPTING.
   BOLW never reloads while you're typing. When a newer version has been published it waits until your hands have
   rested (20 seconds without a key) or the app is in the background, saves everything, updates, and takes you
   back to the leaf and line you were on. */
(function (g) {
"use strict";
const Page = g.Page, B = g.Book, V = String(g.CORE_VERSION || "");
let waiting = false, newer = null;
async function check() {
  if (waiting || !V || navigator.onLine === false) return;
  try { const r = await fetch("version.txt?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) return; const v = (await r.text()).trim(); if (!v || v === V || !/^[\w.\-]{1,20}$/.test(v)) return;
    let tried = null; try { tried = JSON.parse(sessionStorage.getItem("core-update-tried") || "null"); } catch (e) {}
    if (tried && tried.v === v && Date.now() - tried.at < 30 * 60000) return;            // it was tried and the new files didn't arrive (a slow connection): not again for a while
    newer = v; waiting = true; tick(); } catch (e) {}
}
function tick() {
  if (!waiting) return;
  const busy = Page.typing || Page.idle < 20000 || (g.AI && g.AI.busy) || (g.Clock && g.Clock.holding) || Page.demo;
  if (busy && !document.hidden) return void setTimeout(tick, 4000);
  try { B.flush(); Page.saveSpot(); if (g.Log) g.Log.saveTail(); sessionStorage.setItem("core-updated", newer); sessionStorage.setItem("core-update-tried", JSON.stringify({ v: newer, at: Date.now() })); } catch (e) {}
  location.reload();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (waiting) tick(); } else check(); });
setTimeout(check, 30000); setInterval(check, 10 * 60000);
try { if (sessionStorage.getItem("core-updated")) { const v = sessionStorage.getItem("core-updated"); sessionStorage.removeItem("core-updated"); setTimeout(() => Page.toast(v === V ? "BOLW was updated to version " + V + ". You're back where you were." : "BOLW reloaded. You're back where you were."), 400); } } catch (e) {}
g.Update = { check, get waiting() { return waiting; } };
})(window);
