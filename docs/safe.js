/* Safety copies, kept on this device only (never sent anywhere).
   - "Not saved" rescue: if this device's small text storage is full or blocked, the whole book is kept in the
     bigger database instead (an emergency copy) and brought back the next time the book opens.
   - A safety copy of the whole book for each of the last 7 days you wrote (the state at the end of that day).
   - Recently deleted: the words of every deleted page or fold, for 30 days, with Restore.
   They protect against mistakes and full storage. They do NOT protect against losing the device or clearing
   the browser's data: for that, turn on sync or export a file.
   Database "bolw-safe": snaps ("m:<key>" = {key, at, n, size}; "j:<key>" = the book as text), trash. */
(() => {
  const T = window.TOL; if (!T) return;
  const $ = id => document.getElementById(id), esc = T.esc, H = T.hooks;
  if (T.SANDBOX || !window.indexedDB) { T.safe = { off: true }; return; }      // previews never touch the real safety copies
  const KEEP_DAYS = 7, TRASH_DAYS = 30, TRASH_MAX = 300, DAY = 86400000;
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("bolw-safe", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("snaps"); r.result.createObjectStore("trash"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("blocked"));
  }).catch(e => { dbp = null; throw e; }));
  const run = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const q = fn(db.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  const get = (s, k) => run(s, "readonly", o => o.get(k)), put = (s, k, v) => run(s, "readwrite", o => o.put(v, k)), del = (s, k) => run(s, "readwrite", o => o.delete(k));
  const keys = s => run(s, "readonly", o => o.getAllKeys());
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const when = t => { const d = new Date(t), today = dayKey(Date.now()) === dayKey(t), y = dayKey(Date.now() - DAY) === dayKey(t);
    return (today ? "Today" : y ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })) + ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
  const liveWithWords = pages => Object.values(pages || {}).filter(p => p && !p.deleted && (p.text || "").trim()).length;
  const bookText = () => { const d = T.data(); return JSON.stringify({ format: "tol-text-export", version: 1, exportedAt: new Date().toISOString(), device: T.DEVICE, pages: d.pages, intervals: d.intervals, memory: d.memory }); };

  /* ---------------- copies of the whole book ---------------- */
  async function keep(key) {
    const n = liveWithWords(T.data().pages); if (!n) return false;            // never keep an empty book over a real one
    const json = bookText(), at = Date.now();
    await put("snaps", "j:" + key, json); await put("snaps", "m:" + key, { key, at, n, size: json.length });
    return true;
  }
  async function list() {
    const out = [];
    for (const k of await keys("snaps")) if (String(k).startsWith("m:")) { const m = await get("snaps", k); if (m) out.push(m); }
    return out.sort((a, b) => b.at - a.at);
  }
  async function read(key) { const j = await get("snaps", "j:" + key); return j ? JSON.parse(j) : null; }
  async function prune() {
    const days = (await list()).filter(m => m.key.startsWith("day:"));
    for (const m of days.slice(KEEP_DAYS)) { await del("snaps", "j:" + m.key); await del("snaps", "m:" + m.key); }
    const cut = Date.now() - TRASH_DAYS * DAY, tk = (await keys("trash")).sort();
    for (let i = 0; i < tk.length; i++) if (+String(tk[i]).split(":")[0] < cut || i < tk.length - TRASH_MAX) await del("trash", tk[i]);
  }
  let dirty = true, busy = false;
  async function daily() {
    if (busy || !dirty || T.store.paused) return; busy = true;
    try { dirty = false; if (!(await keep("day:" + dayKey(Date.now())))) dirty = true; else await prune(); } catch (e) { dirty = true; }
    busy = false;
  }
  document.addEventListener("tol:changed", () => { dirty = true; });
  setInterval(daily, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) daily(); });

  /* ---------------- "Not saved": keep the book in the bigger database until saving works again ---------------- */
  let rescueT = null, rescued = false;
  async function rescue() {
    if (T.store.paused) return;
    try { await put("snaps", "j:emergency", bookText()); await put("snaps", "m:emergency", { key: "emergency", at: Date.now(), n: liveWithWords(T.data().pages) }); rescued = true;
      const m = $("swMore"); if (m) m.textContent = "A safety copy is being kept on this device, so nothing is lost if the book closes. Still, save a copy now."; }
    catch (e) { const m = $("swMore"); if (m) m.textContent = "Keep this page open and save a copy now."; }
  }
  const failing = () => Object.keys(T.store.bad).length > 0;
  document.addEventListener("tol:savefail", () => { clearTimeout(rescueT); rescueT = setTimeout(rescue, 300); });
  document.addEventListener("tol:changed", () => { if (failing()) { clearTimeout(rescueT); rescueT = setTimeout(rescue, 1500); } });
  document.addEventListener("tol:saveok", async () => { clearTimeout(rescueT); if (rescued) { rescued = false; try { await del("snaps", "j:emergency"); await del("snaps", "m:emergency"); } catch (e) {} } });
  window.addEventListener("pagehide", () => { if (failing()) rescue(); });

  /* ---------------- when the book opens: bring back what wasn't saved, or offer a copy if the book is empty ---------------- */
  async function atStart() {
    try {
      const em = await get("snaps", "m:emergency");
      if (em) {
        const d = await read("emergency");
        if (d) { const r = T.mergeData(d); if (r.added || r.updated) T.toast("Brought back words that couldn't be saved last time."); }
        if (!failing()) { await del("snaps", "j:emergency"); await del("snaps", "m:emergency"); } else rescued = true;
      }
      if (!liveWithWords(T.data().pages)) {
        const best = (await list()).filter(m => m.n > 0)[0];
        if (best) T.toast(`This book is empty here, but a safety copy from ${when(best.at)} has ${best.n} page${best.n === 1 ? "" : "s"}.`, "Bring it back", async () => {
          const d = await read(best.key); if (!d) return;
          const r = T.mergeData(d), n = T.revive(r.gone);
          T.toast(`Brought back ${r.added + r.updated + n} page${r.added + r.updated + n === 1 ? "" : "s"}.`);
        });
      }
    } catch (e) {}
    setTimeout(daily, 3000);
  }

  /* ---------------- Recently deleted ---------------- */
  H.onDelete = (node, why) => {
    if (!node || node.ref || node.portal || node.code || !(node.text || "").trim()) return;      // placements and markers hold no words of their own
    const at = Date.now();
    put("trash", at + ":" + node.id, { id: node.id, at, why: why || "you", title: T.titleOf(node), node: JSON.parse(JSON.stringify(node)) }).catch(() => {});
  };
  async function trash() {
    const out = [];
    for (const k of (await keys("trash")).sort().reverse().slice(0, 60)) { const r = await get("trash", k); if (r && !T.live(T.node(r.id))) out.push(Object.assign({ key: k }, r)); }
    return out;
  }

  /* ---------------- Settings → Safety copies ---------------- */
  let msg = "";
  async function paint() {
    let area = $("safeArea");
    if (!area) { const after = $("backupNote"); if (!after) return; area = document.createElement("div"); area.className = "field"; area.id = "safeArea"; after.parentNode.parentNode.insertBefore(area, after.parentNode.nextSibling); }
    let L = [], D = [];
    try { L = (await list()).filter(m => m.key.startsWith("day:")); D = await trash(); } catch (e) { area.innerHTML = `<label><span>Safety copies</span></label><small>This browser doesn't allow safety copies here (${esc(e.message || "blocked")}). Use Export, or turn on sync.</small>`; return; }
    area.innerHTML = `<label><span>Safety copies (this device only)</span></label>
      <small>The book as it was at the end of each of the last ${KEEP_DAYS} days you wrote, and anything deleted in the last ${TRASH_DAYS} days. They guard against mistakes. They don't guard against losing this device: for that, turn on sync or export.</small>
      <div class="qlist">${L.map(m => `<div class="q" style="flex-wrap:wrap"><div style="flex:1 1 150px"><b>${esc(when(m.at))}</b><small>${m.n} page${m.n === 1 ? "" : "s"} and folds with words</small></div>
        <button class="fbtn" data-safe-old="${esc(m.key)}" title="Adds that day's wording of the page you're on as a page inside it. Nothing is replaced.">This page as it was</button>
        <button class="fbtn" data-safe-back="${esc(m.key)}">Bring back what's been deleted since</button><button class="fbtn" data-safe-dl="${esc(m.key)}">Save as a file</button></div>`).join("") || "<small>None yet. The first one is made a few seconds after you write.</small>"}</div>
      <label style="margin-top:8px"><span>Recently deleted</span></label>
      <div class="qlist">${D.slice(0, 30).map(r => `<div class="q"><div><b>${esc((r.title || "Untitled").slice(0, 60))}</b><small>${esc(when(r.at))}${r.why === "sync" ? " · deleted on another device" : ""}</small></div>
        <button class="fbtn" data-safe-restore="${esc(r.key)}">Restore</button></div>`).join("") || "<small>Nothing deleted lately.</small>"}</div>
      <p class="msg">${esc(msg)}</p>`;
  }
  document.addEventListener("tol:settings", () => { msg = ""; paint(); });
  document.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b || !b.closest("#safeArea")) return;
    try {
      if (b.dataset.safeDl) {
        const j = await get("snaps", "j:" + b.dataset.safeDl); if (!j) return;
        const a = document.createElement("a"), url = URL.createObjectURL(new Blob([j], { type: "application/json" }));
        a.href = url; a.download = "BookOfLivingWaters-safety-" + b.dataset.safeDl.replace("day:", "") + ".json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        msg = "Saved as a file. It opens with Import.";
      } else if (b.dataset.safeBack) {
        const d = await read(b.dataset.safeBack); if (!d) return;
        const gone = Object.values(d.pages || {}).filter(p => p && !p.deleted && (p.text || "").trim() && !p.ref && !p.portal && !p.code && !T.live(T.node(p.id)));
        const n = T.revive(gone);
        msg = n ? `Brought back ${n} page${n === 1 ? "" : "s"} or fold${n === 1 ? "" : "s"}.` : "Nothing in that copy has been deleted since.";
      } else if (b.dataset.safeOld) {
        const d = await read(b.dataset.safeOld), cur = T.node(T.current()), m = (await list()).find(x => x.key === b.dataset.safeOld);
        const old = d && cur && d.pages && d.pages[cur.id];
        if (!old || old.deleted) msg = "The page you're on isn't in that copy (it was made later).";
        else if ((old.text || "") === (cur.text || "")) msg = "The page you're on hasn't changed since that copy.";
        else { T.createNode({ parentId: cur.id, text: `Earlier version (${when(m ? m.at : Date.now())})\n\n${old.text || ""}` }); T.refreshList(); msg = "Added that day's wording as a page inside this one. Nothing was replaced."; }
      } else if (b.dataset.safeRestore) {
        const r = await get("trash", b.dataset.safeRestore); if (!r) return;
        const n = T.revive([r.node]);
        msg = n ? `Restored “${(r.title || "Untitled").slice(0, 40)}”.` : "It's already back.";
      }
    } catch (err) { msg = "That didn't work: " + (err.message || err); }
    paint();
  });

  T.safe = { keep, list, read, trash, daily: () => { dirty = true; return daily(); }, rescue, _prune: prune };
  atStart();
})();
