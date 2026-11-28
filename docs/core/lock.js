/* lock.js · CORE · THE LOCK and SYNC between your devices.
   The same lock as the old book and Essentials: your passphrase → PBKDF2-SHA256 (600,000 rounds) → AES-GCM-256,
   a fresh IV for every write. The passphrase is never stored. Only scrambled text ever leaves this device.
   The same place (your project on GitHub, branch "tol-data") and the same vault file (sync/meta.json), so ONE
   passphrase opens all three. Core keeps its OWN sealed files in the folder "core/": the old book's and
   Essentials' files are never read, written or changed from here.
   Each device writes only its own file (core/<device id>.json): its whole book, its part of the record, its
   writing time, and what modules carry (Lock.carry), sealed.
   Reading: every other device's file is opened and merged in. Newest wins per leaf, per link, per bookmark…
   Writing is never lost: when a leaf changed on both devices, this device's version is first kept as a ring; a
   line that a move would have dropped on both sides is put back; the record is united, never replaced.
   Nothing arrives under your fingers: while you're typing, reading waits.
   Only you lock and unlock: nothing here can turn sync on without the passphrase typed by you. */
(function (g) {
"use strict";
const Keep = g.Keep, B = g.Book, Page = g.Page, Log = g.Log;
const OWNER = "obrianwatson", REPO = "tree-of-life", API = "https://api.github.com", BRANCH = "tol-data", DIR = "core", META = "sync/meta.json", ITER = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const normalize = p => (p || "").normalize("NFC").toLowerCase().replace(/[\s\-_.,;:]+/g, " ").trim();      // capitals and spaces don't matter (same as the old book)
const OFF = Keep.NS !== "core" || /\/preview\//.test(location.pathname);                                   // the guided tests and previews never sync
let L = Object.assign({ on: false, deviceId: null, salt: null, mySha: null, seen: {}, synced: {}, clocks: {}, lastSync: 0 }, Keep.lsGet(Keep.K.lock) || {});
if (!L.deviceId) { L.deviceId = Array.from(rand(8), x => x.toString(16).padStart(2, "0")).join(""); Keep.lsSet(Keep.K.lock, L); }
const saveL = () => Keep.lsSet(Keep.K.lock, L);
let key = null, phase = "off", detail = "", running = false, again = false, dirty = false, pushT = null, lastPush = 0; const subs = [], carried = {};
const paint = () => subs.forEach(fn => { try { fn(); } catch (e) {} });

/* ---------- the unlocked key stays in this device's database (it can't be read out, only used) ---------- */
function idb(name, fn, mode) { return new Promise((res, rej) => { let r; try { r = indexedDB.open(name, 1); } catch (e) { return rej(e); }
  r.onupgradeneeded = () => { if (name === "core-lock") r.result.createObjectStore("keys"); else r.transaction.abort(); };
  r.onsuccess = () => { const d = r.result; try { const q = fn(d.transaction("keys", mode || "readonly").objectStore("keys")); q.onsuccess = () => { res(q.result); d.close(); }; q.onerror = () => { rej(q.error); d.close(); }; } catch (e) { d.close(); rej(e); } };
  r.onerror = () => rej(r.error); }); }
const keyGet = () => idb("core-lock", s => s.get("key")).catch(() => null);
const keyPut = v => idb("core-lock", s => s.put(v, "key"), "readwrite").catch(() => {});
const keyDel = () => idb("core-lock", s => s.delete("key"), "readwrite").catch(() => {});
const otherKey = async () => (await idb("bolw-lock", s => s.get("key")).catch(() => null)) || (await idb("tol-vault", s => s.get("key")).catch(() => null));     // Essentials' or the old book's lock, if it's already open here (only read)

async function deriveKey(pass, saltB64, iterations) { const base = await crypto.subtle.importKey("raw", enc.encode(normalize(pass)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
async function sealText(k, text, aad) { const iv = rand(12), ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, k, enc.encode(text)); return { iv: b64(iv), ct: b64(ct) }; }
async function unseal(k, box, aad) { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv), additionalData: enc.encode(aad) }, k, unb64(box.ct)))); }

/* ---------- GitHub ---------- */
const token = () => Keep.lsGet("tol-gh-token") || "";
const repo = p => `/repos/${OWNER}/${REPO}${p}`, q = `?ref=${BRANCH}`;
async function gh(path, o) { o = o || {}; const t = token(); if (!t) throw Object.assign(new Error("There's no GitHub key on this device yet."), { noToken: true });
  const headers = { "Accept": o.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "Authorization": "Bearer " + t, "X-GitHub-Api-Version": "2022-11-28" }; if (o.body) headers["Content-Type"] = "application/json";
  let res; try { res = await fetch(API + path, { method: o.method || "GET", body: o.body, headers, cache: "no-store", keepalive: !!o.keepalive }); } catch (e) { throw Object.assign(new Error("offline"), { offline: true }); }
  if (res.status === 404 && o.allow404) return null;
  if (!res.ok) { const d = await res.json().catch(() => null); throw Object.assign(new Error((d && d.message) || ("GitHub answered " + res.status)), { status: res.status }); }
  try { return await (o.raw ? res.text() : res.json()); } catch (e) { throw Object.assign(new Error("offline"), { offline: true }); } }
async function gitSha(text) { const body = enc.encode(text), head = enc.encode(`blob ${body.length}\0`), all = new Uint8Array(head.length + body.length); all.set(head); all.set(body, head.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", all)), x => x.toString(16).padStart(2, "0")).join(""); }
async function getListed(f) { let text; try { text = await gh(repo(`/git/blobs/${f.sha}`), { raw: true }); } catch (e) { if ([403, 404, 406, 415].indexOf(e.status) < 0) throw e; text = await gh(repo(`/contents/${f.path}${q}`), { raw: true, allow404: true }); }
  if (text == null || (await gitSha(text)) !== f.sha) return null; return text; }             // not what the list named (GitHub hasn't caught up): look again next time
async function putFile(path, text, sha, keepalive) { const body = { message: "Sync (encrypted)", content: b64(enc.encode(text)), branch: BRANCH }; if (sha) body.sha = sha; const json = JSON.stringify(body);
  return gh(repo(`/contents/${path}`), { method: "PUT", body: json, keepalive: !!keepalive && json.length <= 60000 }); }
const getMeta = async () => { const t = await gh(repo(`/contents/${META}${q}`), { raw: true, allow404: true }); return t ? JSON.parse(t) : null; };
async function ensureBranch() { if (await gh(repo(`/git/ref/heads/${BRANCH}`), { allow404: true })) return; const main = await gh(repo(`/git/ref/heads/main`));
  try { await gh(repo(`/git/refs`), { method: "POST", body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: main.object.sha }) }); } catch (e) { if (e.status !== 422) throw e; } }

/* ---------- merging another device's book into this one ---------- */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pieceFrom = (R, id) => { const lf = R.leaves[id], p = { leaf: lf, lines: {}, folds: {} }; lf.lines.forEach(l => { if (R.lines[l]) p.lines[l] = R.lines[l]; }); (lf.folds || []).forEach(f => { if (R.folds && R.folds[f]) p.folds[f] = R.folds[f]; }); return p; };
function lww(mine, theirs) { let ch = false; Object.keys(theirs || {}).forEach(id => { const t = theirs[id], m = mine[id]; if (!m || (t.updatedAt || t.at || 0) > (m.updatedAt || m.at || 0)) { mine[id] = t; ch = true; } }); return ch; }
async function mergeBook(R) {
  if (!R || !R.leaves || !R.trunk || !R.leaves[R.trunk]) return false; const D = B.D; let changed = false;
  if (R.trunk !== D.trunk) {                                   // two devices each began their own book: the older trunk is the trunk, and the other's lines move onto it
    const mine = D.leaves[D.trunk], theirs = R.leaves[R.trunk], iWin = mine.at < theirs.at || (mine.at === theirs.at && mine.id < theirs.id);
    if (iWin) return false;                                     // (that device will move onto this trunk itself; until then its book isn't read)
    await Keep.keepRing(B, D.trunk, "before joining another device's book", true);
    B.graft(pieceFrom(R, R.trunk)); const old = D.leaves[D.trunk], now = Date.now(), tr = D.leaves[R.trunk];
    const carry = old.lines.filter(l => D.lines[l] && (D.lines[l].text.trim() || D.lines[l].leaf));
    carry.forEach(l => { D.lines[l].in = tr.id; tr.lines.push(l); }); (old.folds || []).forEach(f => delete D.folds[f]); old.lines.forEach(l => { if (carry.indexOf(l) < 0) delete D.lines[l]; });
    delete D.leaves[old.id]; D.trunk = R.trunk; if (carry.length) tr.updatedAt = now; changed = true;
  }
  const localLosing = {}, remoteLosing = {};
  for (const id of Object.keys(R.leaves)) {
    const rl = R.leaves[id], ll = D.leaves[id];
    if (!ll) { B.graft(pieceFrom(R, id)); L.synced[id] = rl.updatedAt; changed = true; continue; }
    if ((rl.updatedAt || 0) <= (ll.updatedAt || 0)) { if ((rl.updatedAt || 0) < (ll.updatedAt || 0)) rl.lines.forEach(l => { if (ll.lines.indexOf(l) < 0) remoteLosing[l] = id; }); continue; }
    const p = pieceFrom(R, id), mine = B.cut(id);
    if (same(p.leaf.lines, mine.leaf.lines) && same(p.lines, mine.lines) && same(p.folds, mine.folds)) { ll.updatedAt = rl.updatedAt; L.synced[id] = rl.updatedAt; continue; }
    if (L.synced[id] !== ll.updatedAt) await Keep.keepRing(B, id, "before a newer version came from another device", true);       // this device's own changes are kept first
    ll.lines.forEach(l => { if (rl.lines.indexOf(l) < 0) localLosing[l] = id; });
    B.graft(p); L.synced[id] = rl.updatedAt; changed = true;
  }
  /* a line moved between two leaves, where each device's newer leaf is the one without it: put it back (in the same leaf on every device) */
  const placed = {}; Object.values(D.leaves).forEach(lf => lf.lines.forEach(l => { placed[l] = 1; }));
  Object.keys(localLosing).forEach(l => { if (placed[l] || !remoteLosing[l]) return; const a = localLosing[l], b = remoteLosing[l], dest = D.leaves[a < b ? a : b], rec = R.lines[l]; if (!dest || !rec || !rec.text.trim()) return;
    D.lines[l] = Object.assign({}, rec, { in: dest.id, d: 0 }); dest.lines.push(l); dest.updatedAt = Date.now(); changed = true; });
  ["names", "links", "marks"].forEach(k => { D[k] = D[k] || {}; if (lww(D[k], R[k])) changed = true; });
  Object.keys(R.more || {}).forEach(k => { if (k === "unpruned") return; D.more[k] = D.more[k] || {}; if (R.more[k] && typeof R.more[k] === "object" && lww(D.more[k], R.more[k])) changed = true; });
  const un = D.more.unpruned = D.more.unpruned || {}; Object.keys((R.more && R.more.unpruned) || {}).forEach(id => { if (!un[id]) { un[id] = R.more.unpruned[id]; changed = true; } });
  const have = {}; D.pruned.forEach(p => { have[p.id] = 1; }); (R.pruned || []).forEach(p => { if (!have[p.id] && !un[p.id]) { D.pruned.push(p); changed = true; } });
  const n = D.pruned.length; D.pruned = D.pruned.filter(p => !un[p.id]).sort((a, b) => a.at - b.at); if (D.pruned.length !== n) changed = true;
  return changed;
}

/* ---------- one round: read the others, then write mine if anything is new ---------- */
const canSync = () => !OFF && L.on && !!key && !!token();
async function stateNow() { const st = { format: "bolw-core-state", v: 1, deviceId: L.deviceId, savedAt: Date.now(), book: B.D, clock: (g.Clock && g.Clock.days) || {}, record: await Log.mine(Date.now() - 60 * 86400000), carry: {} };
  Object.keys(carried).forEach(k => { try { st.carry[k] = carried[k].get(); } catch (e) {} }); return st; }
async function syncNow(pushOnly, keepalive) {
  if (!canSync()) return; if (running) { again = true; return; } running = true; phase = "working"; paint();
  try {
    if (!pushOnly && !(Page.typing && !document.hidden)) {
      const list = (await gh(repo(`/contents/${DIR}${q}`), { allow404: true })) || [];
      for (const f of list) { const m = /^([0-9a-f]{16})\.json$/.exec(f.name || ""); if (!m) continue;
        if (m[1] === L.deviceId) { if (Date.now() - lastPush > 30000) L.mySha = f.sha; continue; }
        if (L.seen[m[1]] === f.sha) continue;
        const text = await getListed(f); if (text == null) { again = true; continue; }
        let st; try { st = await unseal(key, JSON.parse(text), "bolw-core:" + m[1]); } catch (e) { continue; }             // a file that won't open is skipped, never a reason to stop
        if (Page.typing && !document.hidden) { again = true; break; }                                                       // you started typing while it was read: it waits
        B.flush(); const a = await mergeBook(st.book); if (st.clock) L.clocks[m[1]] = st.clock; await Log.mergeIn(st.record);
        let c = false; Object.keys(st.carry || {}).forEach(k => { try { if (carried[k] && carried[k].merge(st.carry[k])) c = true; } catch (e) {} });
        L.seen[m[1]] = f.sha; if (a) B.changed(); if (a || c) dirty = true;
      }
    }
    if (dirty || !L.mySha) {
      dirty = false; const st = await stateNow(), box = await sealText(key, JSON.stringify(st), "bolw-core:" + L.deviceId), text = JSON.stringify({ format: "tol-sealed", v: 1, kind: "bolw-core", iv: box.iv, ct: box.ct, updatedAt: st.savedAt }), path = `${DIR}/${L.deviceId}.json`;
      let r; try { r = await putFile(path, text, L.mySha, keepalive); } catch (e) { if (e.status !== 409 && e.status !== 422) { dirty = true; throw e; } const cur = await gh(repo(`/contents/${path}${q}`), { allow404: true }); L.mySha = cur && cur.sha; r = await putFile(path, text, L.mySha, keepalive); }
      L.mySha = r && r.content && r.content.sha; lastPush = Date.now(); Object.keys(st.book.leaves).forEach(id => { L.synced[id] = st.book.leaves[id].updatedAt; });
    }
    L.lastSync = Date.now(); phase = "ok"; detail = "";
  } catch (e) { phase = e.offline ? "offline" : "trouble"; detail = e.offline ? "" : (e.status === 401 ? "GitHub didn't accept the key on this device." : e.message); }
  saveL(); running = false; paint(); if (again) { again = false; setTimeout(() => syncNow(), 4000); }
}
function changed() { if (!canSync()) return; dirty = true; clearTimeout(pushT); pushT = setTimeout(() => syncNow(true), Math.max(5000, 15000 - (Date.now() - lastPush))); }
B.on(ev => { if (ev.dry) return; if ((ev.type === "action" && !ev.result.look) || ev.type === "undo") changed(); });
document.addEventListener("visibilitychange", () => { if (!canSync()) return; if (document.hidden) { if (dirty) { clearTimeout(pushT); B.flush(); syncNow(true, true); } } else syncNow(); });
setInterval(() => { if (canSync() && !document.hidden && navigator.onLine !== false && !Page.typing) syncNow(); }, 20000);

/* ---------- turning it on and off (only you: it takes your passphrase) ---------- */
async function finish(k, salt) { key = k; await keyPut({ salt, key: k }); if (L.salt !== salt) { L.seen = {}; L.mySha = null; L.synced = {}; } L.on = true; L.salt = salt; saveL(); dirty = true; await syncNow(); }
async function turnOn(pass) {
  if (OFF) throw new Error("Sync is off on this page."); if (!token()) throw new Error("Add your GitHub key first.");
  await ensureBranch(); let meta = await getMeta();
  if (!meta) { if (!pass || normalize(pass).length < 8) throw new Error("Choose a passphrase of at least 8 letters (a few words is best)."); const salt = b64(rand(16)), k = await deriveKey(pass, salt, ITER);
    meta = { format: "tol-vault", version: 1, kdf: "PBKDF2-SHA256", iterations: ITER, salt, check: await sealText(k, JSON.stringify("tree-of-life"), "tol-check") };
    await putFile(META, JSON.stringify(meta, null, 1), null); await finish(k, salt); return "new"; }
  const k = await deriveKey(pass, meta.salt, meta.iterations || ITER);
  try { if ((await unseal(k, meta.check, "tol-check")) !== "tree-of-life") throw 0; } catch (e) { throw new Error("That passphrase doesn't match the one your book is locked with. Nothing was changed."); }
  await finish(k, meta.salt); return "joined";
}
async function useOtherLock() {          // the old book or Essentials is already unlocked on this device: the same lock opens this one, no typing
  const o = await otherKey(); if (!o || !o.key) return false; const meta = await getMeta(); if (!meta || meta.salt !== o.salt) return false;
  try { if ((await unseal(o.key, meta.check, "tol-check")) !== "tree-of-life") return false; } catch (e) { return false; } await finish(o.key, o.salt); return true; }
async function turnOff() { L.on = false; key = null; phase = "off"; saveL(); await keyDel(); paint(); }
function label() { if (OFF) return "Sync is off on this page."; if (!L.on) return "Sync is off. Your book is only on this device.";
  if (!key) return "Sync is locked on this device. Type your passphrase to unlock it."; if (phase === "working") return "Syncing…"; if (phase === "offline") return "Offline. It will sync when you're back online.";
  if (phase === "trouble") return "Sync trouble: " + detail; return L.lastSync ? "Synced " + new Date(L.lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "." : "Sync is on."; }
const otherToday = () => { const d = Keep.stamp(); return Object.keys(L.clocks || {}).reduce((s, id) => s + ((L.clocks[id] || {})[d] || 0), 0); };
if (!OFF && L.on) keyGet().then(r => { if (r && r.key && r.salt === L.salt) { key = r.key; syncNow(); } paint(); });
const Lock = { turnOn, turnOff, useOtherLock, hasOtherLock: () => otherKey().then(o => !!(o && o.key)), syncNow, changed, label, otherToday, on: fn => subs.push(fn), carry: (name, c) => { carried[name] = c; },
  get isOn() { return L.on; }, get unlocked() { return !!key; }, get off() { return OFF; }, hasToken: () => !!token(), setToken: t => Keep.lsSet("tol-gh-token", String(t).trim()), deviceId: L.deviceId };
g.Lock = Lock;

/* ---------- its part of Settings ---------- */
if (g.Settings) g.Settings.add({ order: 20, title: "Sync between your devices", id: "sync", build(box) {
  const draw = async () => {
    if (!box.isConnected) return; box.innerHTML = `<p class="nt" id="sSync"></p><div id="sSyncBox"></div>`; box.querySelector("#sSync").textContent = label(); const bx = box.querySelector("#sSyncBox"); if (OFF) return;
    if (L.on && key) { bx.innerHTML = `<div class="row"><button id="sNow">Sync now</button><button id="sStop">Turn off on this device</button></div>`;
      bx.querySelector("#sNow").onclick = () => syncNow(); bx.querySelector("#sStop").onclick = () => { if (confirm("Turn sync off on this device? Your book stays here; it just stops syncing.")) turnOff().then(draw); }; return; }
    const other = await Lock.hasOtherLock().catch(() => false);
    bx.innerHTML = (token() ? "" : `<input id="sTok" type="password" placeholder="Paste your GitHub key (kept on this device)" autocomplete="off">`) + `<input id="sPass" type="password" placeholder="Your sync passphrase" autocomplete="off"><div class="row"><button id="sOn">Turn on sync</button>${other && token() ? `<button id="sOther">Use the lock already open on this device</button>` : ""}</div>
      <p class="nt" id="sMsg">One passphrase opens the old book, Essentials and this one. If you've never set one, the one you type here becomes it: write it down, because nobody can recover it.</p>`;
    const run = async fn => { const m = bx.querySelector("#sMsg"); m.textContent = "Working…"; try { const r = await fn(); if (r === false) { m.textContent = "That lock doesn't fit. Type your passphrase instead."; return; } draw(); } catch (e) { m.textContent = e.offline ? "You're offline. Try again when you're online." : (e.message || String(e)); } };
    bx.querySelector("#sOn").onclick = () => run(async () => { const t = bx.querySelector("#sTok"); if (t && t.value.trim()) Lock.setToken(t.value); const p = bx.querySelector("#sPass").value; bx.querySelector("#sPass").value = ""; return turnOn(p); });
    const o = bx.querySelector("#sOther"); if (o) o.onclick = () => run(() => useOtherLock());
  };
  draw(); subs.push(() => { const e = box.querySelector("#sSync"); if (e && box.isConnected) e.textContent = label(); }); } });
})(window);
