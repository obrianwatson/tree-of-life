/* keep.js · STORAGE and the way back.
   - The book lives on this device (localStorage, so it opens at once and is saved the moment you leave).
   - If that save ever fails, a rescue copy goes to this device's database and the page says so.
   - Earlier versions: before a note is changed (at most once every 10 minutes of writing), the note as it was is
     kept in this device's database (IndexedDB "bolw-keep"). An earlier version comes back as a NEW note:
     nothing is ever written over.
   - Export: your whole book as words you can read anywhere (.txt), or everything (.json).
   Nothing in this file talks to the internet. */
(function (g) {
"use strict";
const NS = g.BOLW_NS || "bolw";                                  // (the guided test page uses its own drawer: "bolw-test")
const K = { book: NS + "-book", at: NS + "-book-at", ui: NS + "-ui", clock: NS + "-clock", shelf: NS + "-shelf", lock: NS + "-lock" };
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/* ---------- this device's database ---------- */
let dbp = null;
function db() { if (dbp) return dbp; dbp = new Promise((res, rej) => { let r; try { r = indexedDB.open(NS + "-keep", 1); } catch (e) { return rej(e); }
  r.onupgradeneeded = () => { const d = r.result; const v = d.createObjectStore("versions", { keyPath: "k", autoIncrement: true }); v.createIndex("note", "note"); d.createObjectStore("rescue"); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); dbp.catch(() => { dbp = null; }); return dbp; }
function tx(store, mode, fn) { return db().then(d => new Promise((res, rej) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); })); }

/* ---------- the book's drawer ---------- */
const store = {
  load() { return lsGet(K.book); },
  save(D) { const ok = lsSet(K.book, D); if (ok) lsSet(K.at, Date.now()); else tx("rescue", "readwrite", s => s.put({ at: Date.now(), D: JSON.parse(JSON.stringify(D)) }, "book")).catch(() => {}); return ok; }
};
/* a rescue copy newer than what the drawer holds? (the last save didn't fit) */
function rescue() { return tx("rescue", "readonly", s => s.get("book")).then(r => (r && r.at > (lsGet(K.at) || 0)) ? r.D : null).catch(() => null); }

/* ---------- earlier versions ---------- */
const lastKept = {}, GAP = 10 * 60000;
function keepVersion(B, note, why, force) {
  const now = Date.now(); if (!force && lastKept[note] && now - lastKept[note] < GAP) return Promise.resolve(false);
  const piece = B.cut(note); if (!piece) return Promise.resolve(false);
  const has = Object.values(piece.lines).some(l => l.text.trim()); if (!has) { lastKept[note] = now; return Promise.resolve(false); }
  lastKept[note] = now;
  return tx("versions", "readwrite", s => s.add({ note, at: now, title: B.title(note), why: why || "before a change", piece })).then(() => true).catch(() => false);
}
const versions = note => tx("versions", "readonly", s => note ? s.index("note").getAll(note) : s.getAll()).then(a => (a || []).sort((x, y) => y.at - x.at)).catch(() => []);
function attach(B) { B.before = note => { keepVersion(B, note); }; }

/* ---------- export: take your book with you ---------- */
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
function asText(B, shelf) {
  const out = ["THE BOOK OF LIVING WATERS", "Taken out " + new Date().toLocaleString(), "Folds are shown indented under the line they hang from.", ""];
  B.notes().forEach(n => { out.push("=".repeat(60), B.textOf(n.id), ""); });
  const removed = B.D.removed.filter(r => B.D.boxes[r.fold.id]);
  if (removed.length) { out.push("=".repeat(60), "FOLDS YOU REMOVED (their writing is kept)", ""); removed.forEach(r => { out.push("From “" + r.name + "”:", B.textOf(r.fold.id, "    "), ""); }); }
  if (shelf) { const chats = Object.values(shelf.chats || {}).filter(c => !c.deleted && c.msgs && c.msgs.length);
    if (chats.length) { out.push("=".repeat(60), "CHATS", ""); chats.sort((a, b) => b.updatedAt - a.updatedAt).forEach(c => { out.push("--- " + (c.title || "Chat") + " (" + new Date(c.updatedAt).toLocaleDateString() + ")"); c.msgs.forEach(m => { out.push(m.role === "user" ? "You: " + (m.text || "") : "AI: " + (m.parts || []).map(p => p.t === "text" ? p.text : p.t === "act" ? "[" + p.label + "]" : "").filter(Boolean).join("\n")); }); out.push(""); }); } }
  return out.join("\n");
}
function asJSON(B, shelf, clock) { return JSON.stringify({ format: "bolw-book", v: 1, takenOut: new Date().toISOString(), about: "The Book of Living Waters. notes: each note's id. boxes: a note's or fold's lines in order. lines: the words and who wrote them (me or ai). folds: which lines a fold hangs from (host box, from line, to line).", book: B.D, shelf: shelf || null, clock: clock || null }, null, 1); }
function download(name, text, type) {
  const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" }), a = document.createElement("a"), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}
g.Keep = { NS, K, lsGet, lsSet, store, rescue, attach, keepVersion, versions, asText, asJSON, download, stamp };
})(window);
