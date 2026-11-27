/* lock.js · THE LOCK and SYNC between your devices.
   Same lock as the old book: your passphrase → PBKDF2-SHA256 (600,000 rounds) → AES-GCM-256, a fresh IV for
   every write. The passphrase is never stored. Only scrambled text ever leaves this device.
   Same place: your project on GitHub, branch "tol-data". Same vault file (sync/meta.json), so ONE passphrase
   opens both books. Essentials keeps its OWN sealed files beside the old book's (folder "book/"): the old
   book's files are never read, written or changed from here.
   Each device writes only its own file (book/<device id>.json): its whole book, shelf and writing time, sealed.
   Reading: every other device's file is opened and merged in. Newest wins per note, per chat and per project.
   Writing is never lost: when a note changed on both devices, this device's version is first kept under
   Earlier versions, then the newer one takes its place.
   Only you lock and unlock: nothing here can turn sync on without the passphrase typed by you. */
(function (g) {
"use strict";
const Keep = g.Keep, B = g.Book, Shelf = g.Shelf, Page = g.Page;
const OWNER = "obrianwatson", REPO = "tree-of-life", API = "https://api.github.com", BRANCH = "tol-data", DIR = "book", META = "sync/meta.json", ITER = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const normalize = p => (p || "").normalize("NFC").toLowerCase().replace(/[\s\-_.,;:]+/g, " ").trim();      // capitals and spaces don't matter (same as the old book)
const OFF = Keep.NS !== "bolw" || /\/preview\//.test(location.pathname);                                   // the test page and previews never sync
let L = Object.assign({ on: false, deviceId: null, salt: null, mySha: null, seen: {}, synced: {}, clocks: {}, lastSync: 0 }, Keep.lsGet(Keep.K.lock) || {});
if (!L.deviceId) L.deviceId = Array.from(rand(8), x => x.toString(16).padStart(2, "0")).join("");
const saveL = () => Keep.lsSet(Keep.K.lock, L);
let key = null, phase = "off", detail = "", running = false, again = false, dirty = false, pushT = null, lastPush = 0, subs = [];
const paint = () => subs.forEach(fn => { try { fn(); } catch (e) {} });

/* ---------- the unlocked key stays in this device's database (it can't be read out, only used) ---------- */
function idb(name, fn, mode) { return new Promise((res, rej) => { let r; try { r = indexedDB.open(name, 1); } catch (e) { return rej(e); } let made = false;
  r.onupgradeneeded = () => { made = true; if (name === "bolw-lock") r.result.createObjectStore("keys"); else { r.transaction.abort(); } };
  r.onsuccess = () => { const d = r.result; try { const q = fn(d.transaction("keys", mode || "readonly").objectStore("keys")); q.onsuccess = () => { res(q.result); d.close(); }; q.onerror = () => { rej(q.error); d.close(); }; } catch (e) { d.close(); rej(e); } };
  r.onerror = () => rej(r.error); r.onabort = () => rej(new Error("none")); }); }
const keyGet = () => idb("bolw-lock", s => s.get("key")).catch(() => null);
const keyPut = v => idb("bolw-lock", s => s.put(v, "key"), "readwrite").catch(() => {});
const keyDel = () => idb("bolw-lock", s => s.delete("key"), "readwrite").catch(() => {});
const oldKey = () => idb("tol-vault", s => s.get("key")).catch(() => null);          // the old book's lock on this device, if it's already open (only read)

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
async function mergeBook(R) {
  let changed = false; if (!R || !R.notes) return false;
  for (const id of Object.keys(R.notes)) {
    const rn = R.notes[id], ln = B.D.notes[id];
    const piece = () => { const p = { v: 1, note: rn, boxes: {}, lines: {}, folds: {}, removed: (R.removed || []).filter(x => x.note === id) }, boxes = new Set([id]); p.removed.forEach(x => boxes.add(x.fold.id));
      let more = true; while (more) { more = false; Object.values(R.folds || {}).forEach(f => { if (boxes.has(f.host) && !boxes.has(f.id)) { boxes.add(f.id); more = true; } }); }
      boxes.forEach(b => { const bx = R.boxes[b]; if (!bx) return; p.boxes[b] = bx; bx.lines.forEach(l => { if (R.lines[l]) p.lines[l] = R.lines[l]; }); if (R.folds[b]) p.folds[b] = R.folds[b]; }); return p; };
    if (!ln) { const p = piece(); if (Object.values(p.lines).some(l => l.text.trim())) { B.graft(p); L.synced[id] = rn.updatedAt; changed = true; } continue; }
    if ((rn.updatedAt || 0) <= (ln.updatedAt || 0)) continue;
    const p = piece(), mine = B.cut(id); if (same(p.boxes, mine.boxes) && same(p.lines, mine.lines) && same(p.folds, mine.folds)) { B.D.notes[id].updatedAt = rn.updatedAt; L.synced[id] = rn.updatedAt; continue; }
    if (L.synced[id] !== ln.updatedAt) await Keep.keepVersion(B, id, "before a newer version came from another device", true);       // this device's own changes are kept first
    B.graft(p); L.synced[id] = rn.updatedAt; changed = true;
  }
  return changed;
}
function mergeShelf(R) { if (!R) return false; const S = Shelf.S; let ch = false;
  const rec = (mine, theirs) => { Object.keys(theirs || {}).forEach(id => { if (!mine[id] || (theirs[id].updatedAt || 0) > (mine[id].updatedAt || 0)) { mine[id] = theirs[id]; ch = true; } }); };
  rec(S.projects, R.projects); rec(S.noteProject, R.noteProject); rec(S.chats, R.chats);
  if (R.how && (R.how.updatedAt || 0) > (S.how.updatedAt || 0)) { S.how = R.how; ch = true; }
  if (R.set && (R.set.updatedAt || 0) > (S.set.updatedAt || 0)) { S.set = R.set; ch = true; }
  if (ch) Shelf.save(true); return ch; }

/* ---------- one round: read the others, then write mine if anything is new ---------- */
const canSync = () => !OFF && L.on && !!key && !!token();
const stateNow = () => { const D = Object.assign({}, B.D); delete D.current; const S = Object.assign({}, Shelf.S); delete S.current; return { format: "bolw-state", v: 1, deviceId: L.deviceId, savedAt: Date.now(), book: D, shelf: S, clock: (Page.clock && Page.clock.days) || {} }; };
async function syncNow(pushOnly, keepalive) {
  if (!canSync()) return; if (running) { again = true; return; } running = true; phase = "working"; paint();
  try {
    if (!pushOnly) {
      const list = (await gh(repo(`/contents/${DIR}${q}`), { allow404: true })) || [];
      for (const f of list) { const m = /^([0-9a-f]{16})\.json$/.exec(f.name || ""); if (!m) continue;
        if (m[1] === L.deviceId) { if (Date.now() - lastPush > 30000) L.mySha = f.sha; continue; }
        if (L.seen[m[1]] === f.sha) continue;
        const text = await getListed(f); if (text == null) { again = true; continue; }
        let st; try { const box = JSON.parse(text); st = await unseal(key, box, "bolw-book:" + m[1]); } catch (e) { continue; }             // a file that won't open is skipped, never a reason to stop
        Shelf.flush(); B.flush();
        const a = await mergeBook(st.book), b = mergeShelf(st.shelf); if (st.clock) L.clocks[m[1]] = st.clock;
        L.seen[m[1]] = f.sha; if (a || b) { dirty = true; if (b && g.Breath && g.Breath.isOpen) g.Breath.show("list"); }
      }
    }
    if (dirty || !L.mySha) {
      dirty = false; const st = stateNow(), box = await sealText(key, JSON.stringify(st), "bolw-book:" + L.deviceId), text = JSON.stringify({ format: "tol-sealed", v: 1, kind: "bolw-book", iv: box.iv, ct: box.ct, updatedAt: st.savedAt }), path = `${DIR}/${L.deviceId}.json`;
      let r; try { r = await putFile(path, text, L.mySha, keepalive); } catch (e) { if (e.status !== 409 && e.status !== 422) { dirty = true; throw e; } const cur = await gh(repo(`/contents/${path}${q}`), { allow404: true }); L.mySha = cur && cur.sha; r = await putFile(path, text, L.mySha, keepalive); }
      L.mySha = r && r.content && r.content.sha; lastPush = Date.now(); Object.keys(st.book.notes).forEach(id => { L.synced[id] = st.book.notes[id].updatedAt; });
    }
    L.lastSync = Date.now(); phase = "ok"; detail = "";
  } catch (e) { phase = e.offline ? "offline" : "trouble"; detail = e.offline ? "" : (e.status === 401 ? "GitHub didn't accept the key on this device." : e.message); }
  saveL(); running = false; paint(); if (again) { again = false; setTimeout(() => syncNow(), 3000); }
}
function changed() { if (!canSync()) return; dirty = true; clearTimeout(pushT); pushT = setTimeout(() => syncNow(true), Math.max(5000, 15000 - (Date.now() - lastPush))); }
B.on(ev => { if (ev.type === "action" && ev.name !== "trace_parent" && ev.name !== "open_note") changed(); else if (ev.type === "undo" || ev.type === "putback") changed(); });
Shelf.on(changed);
document.addEventListener("visibilitychange", () => { if (!canSync()) return; if (document.hidden) { if (dirty) { clearTimeout(pushT); B.flush(); Shelf.flush(); syncNow(true, true); } } else syncNow(); });
setInterval(() => { if (canSync() && !document.hidden && navigator.onLine !== false) syncNow(); }, 20000);

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
async function useOldLock() {           // the old book is already unlocked on this device: the same lock opens this one, no typing
  const o = await oldKey(); if (!o || !o.key) return false; const meta = await getMeta(); if (!meta || meta.salt !== o.salt) return false;
  try { if ((await unseal(o.key, meta.check, "tol-check")) !== "tree-of-life") return false; } catch (e) { return false; } await finish(o.key, o.salt); return true; }
async function turnOff() { L.on = false; key = null; phase = "off"; saveL(); await keyDel(); paint(); }
function label() { if (OFF) return "Sync is off on this page."; if (!L.on) return "Sync is off. Your book is only on this device.";
  if (!key) return "Sync is locked on this device. Type your passphrase to unlock it."; if (phase === "working") return "Syncing…"; if (phase === "offline") return "Offline. It will sync when you're back online.";
  if (phase === "trouble") return "Sync trouble: " + detail; return L.lastSync ? "Synced " + new Date(L.lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "." : "Sync is on."; }
const otherToday = () => { const d = Keep.stamp(); return Object.keys(L.clocks || {}).reduce((s, id) => s + ((L.clocks[id] || {})[d] || 0), 0); };
if (!OFF && L.on) keyGet().then(r => { if (r && r.key && r.salt === L.salt) { key = r.key; syncNow(); } paint(); });
g.Lock = { turnOn, turnOff, useOldLock, hasOldLock: () => oldKey().then(o => !!(o && o.key)), syncNow, label, otherToday, on: fn => subs.push(fn), get isOn() { return L.on; }, get unlocked() { return !!key; }, get off() { return OFF; },
  hasToken: () => !!token(), setToken: t => Keep.lsSet("tol-gh-token", String(t).trim()), deviceId: L.deviceId };
})(window);
