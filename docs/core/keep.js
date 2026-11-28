/* keep.js · CORE · STORAGE and the way back.
   - The book lives on this device (localStorage: it opens at once and is saved the moment you leave).
   - If that save ever fails, a rescue copy goes to this device's database and the page says so.
   - RINGS (earlier versions): before a leaf changes (at most once every 10 minutes of writing, and always before
     a newer version arrives from another device) the leaf as it was is kept in this device's database.
     A ring comes back as a NEW leaf beside the one you have: nothing is ever written over.
   - EXPORT: the whole book as words you can read anywhere (.txt), or everything (.json).
   Nothing in this file talks to the internet. */
(function (g) {
"use strict";
const NS = g.BOLW_NS || "core";                       // (the guided test uses its own drawer: "core-test")
const K = {}; ["book", "at", "ui", "clock", "mods", "lock", "logtail", "chats", "prefs", "spend"].forEach(k => { K[k] = NS + "-" + k; });
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/* ---------- this device's database ---------- */
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => { let r; try { r = indexedDB.open(NS + "-keep", 1); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("rings", { keyPath: "k", autoIncrement: true }).createIndex("leaf", "leaf"); d.createObjectStore("rescue"); d.createObjectStore("log", { keyPath: "id" }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  dbp.catch(() => { dbp = null; }); return dbp;
}
function tx(store, mode, fn) { return db().then(d => new Promise((res, rej) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); })); }

/* ---------- the book's drawer ---------- */
const store = {
  load() { return lsGet(K.book); },
  save(D) { const ok = lsSet(K.book, D); if (ok) lsSet(K.at, Date.now()); else tx("rescue", "readwrite", s => s.put({ at: Date.now(), D: JSON.parse(JSON.stringify(D)) }, "book")).catch(() => {}); return ok; }
};
const rescue = () => tx("rescue", "readonly", s => s.get("book")).then(r => (r && r.at > (lsGet(K.at) || 0)) ? r.D : null).catch(() => null);

/* ---------- rings ---------- */
const lastKept = {}, GAP = 10 * 60000;
function keepRing(B, leaf, why, force) {
  const now = Date.now(); if (!force && lastKept[leaf] && now - lastKept[leaf] < GAP) return Promise.resolve(false);
  if (!B.hasWriting(leaf)) return Promise.resolve(false); lastKept[leaf] = now;
  const piece = B.cut(leaf); if (!piece) return Promise.resolve(false);
  return tx("rings", "readwrite", s => s.add({ leaf, at: now, title: piece.title, why: why || "before a change", piece })).then(() => true).catch(() => false);
}
const rings = leaf => tx("rings", "readonly", s => leaf ? s.index("leaf").getAll(leaf) : s.getAll()).then(a => (a || []).sort((x, y) => y.at - x.at)).catch(() => []);
function attach(B) { B.before = leaf => { keepRing(B, leaf); }; }

/* ---------- export: take your book with you ---------- */
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
function asText(B) {
  const D = B.D, out = ["THE BOOK OF LIVING WATERS", "Taken out " + new Date().toLocaleString(), "What is within a line is indented under it. A page lifted from a line is shown under its line.", "", B.textOf(D.trunk, "", true)];
  const folds = Object.values(D.folds || {}).filter(f => B.alive(f.leaf) && D.lines[f.from] && (f.name || f.place || !f.within));      // (a line's fold with no name is just its indent, already in the words above)
  if (folds.length) { out.push("", "=".repeat(60), "FOLDS", ""); folds.forEach(f => { const a = D.lines[f.from], b = D.lines[f.to]; out.push("- " + (f.name ? "“" + f.name + "”" : "(no name)") + " in “" + B.title(f.leaf) + "”: " + (f.within ? "what's within “" + a.text + "”" : f.place ? "shared: what's within “" + (D.lines[f.place] ? D.lines[f.place].text : "") + "”, placed within “" + a.text + "”" : "from “" + (a ? a.text : "") + "” to “" + (b ? b.text : "") + "”") + (f.details && Object.keys(f.details).length ? "  [" + Object.keys(f.details).map(k => k + ": " + f.details[k]).join(", ") + "]" : "")); }); }
  const links = Object.values(D.links || {}).filter(l => !l.gone && D.lines[l.a] && D.lines[l.b]);
  if (links.length) { out.push("", "=".repeat(60), "LINKS", ""); links.forEach(l => out.push("- “" + D.lines[l.a].text + "” <-> “" + D.lines[l.b].text + "”" + (l.label ? "  (" + l.label + ")" : ""))); }
  const marks = Object.values(D.marks || {});
  if (marks.length) { out.push("", "=".repeat(60), "BOOKMARKS", ""); marks.forEach(m => out.push("- " + (m.done ? "[done] " : "") + (m.title || "") + ["doing", "waiting", "why", "doneLooks", "meanwhile"].filter(k => m[k]).map(k => "\n    " + k + ": " + m[k]).join(""))); }
  if (D.pruned.length) { out.push("", "=".repeat(60), "DELETED (kept so it can be brought back)", ""); D.pruned.forEach(p => { p.lines.forEach(r => out.push("    ".repeat(r.d + 1) + r.text)); out.push(""); }); }
  return out.join("\n");
}
function asJSON(B, extra) { return JSON.stringify(Object.assign({ format: "bolw-core", v: 1, takenOut: new Date().toISOString(),
  about: "The Book of Living Waters. leaves: each leaf's lines in order, and the line it is within (parent). lines: the words, how far each is indented (d: a line is within the nearest line above it that is indented less), who wrote it (by) and the page lifted from what's within it (leaf). folds: within (what's within the line from: open or closed, name, details), place (that line's fold, shared within the line from), or neither (the lines from…to behind a gate), with an optional name and details. links: two lines and an optional label. pruned: what was deleted.", book: B.D }, extra || {}), null, 1); }
function download(name, text, type) {
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}
g.Keep = { NS, K, lsGet, lsSet, tx, store, rescue, attach, keepRing, rings, asText, asJSON, download, stamp };
})(window);
