/* log.js · CORE · THE RECORD OF EVERY MOVE.
   Every action that goes through the book's one door is noted here: what was done (written, folded in, lifted, folded,
   named, linked, moved, deleted, brought back…), in which leaf, WHO did it (you, the fast AI, a command, an
   automation) and when; and how long was spent writing (from the writing clock).
   - It never changes your writing: it only listens.
   - Steady writing in one leaf is one entry (how many letters, how long), not one per key.
   - Kept with the book on this device (recent entries in the drawer, older ones in the database) and synced.
   Read it as a timeline: ☰ → The record. The harvest reads it too. */
(function (g) {
"use strict";
const Keep = g.Keep, B = g.Book;
const dev = () => (g.Lock && g.Lock.deviceId) || "local";
let tail = Keep.lsGet(Keep.K.logtail) || [], dirty = false, moving = false;
const open = {};                              // entries still growing: "write|who|leaf", "time|leaf"
const uid = () => "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const saveTail = () => { if (dirty) { dirty = false; Keep.lsSet(Keep.K.logtail, tail); } };
setInterval(saveTail, 2500); addEventListener("pagehide", saveTail); document.addEventListener("visibilitychange", () => { if (document.hidden) saveTail(); });
function settle() {                           // older entries move from the drawer to the database, a batch at a time
  if (moving || tail.length < 160) return; const cut = Date.now() - 5 * 60000, batch = tail.filter(e => (e.t2 || e.t) < cut).slice(0, 120); if (batch.length < 60) return;
  moving = true; Keep.tx("log", "readwrite", s => { batch.forEach(e => s.put(e)); }).then(() => { const ids = {}; batch.forEach(e => { ids[e.id] = 1; }); tail = tail.filter(e => !ids[e.id]); dirty = true; moving = false; }).catch(() => { moving = false; });
}
function add(e) {
  const now = Date.now(); e.id = uid(); e.t = now; e.dev = dev(); if (e.leaf && !e.lt) e.lt = B.title(e.leaf).slice(0, 60);
  if (e.line && !e.wt && B.D.lines[e.line]) { const tr = B.trail(e.line); if (tr.length) e.wt = B.D.lines[tr[tr.length - 1]].text.slice(0, 40); }
  tail.push(e); dirty = true; settle(); return e;
}
function wrote(who, leaf, n, r, line) {       // steady writing in one leaf is one entry
  const k = "write|" + who + "|" + leaf, now = Date.now(), o = open[k];
  if (o && now - (o.t2 || o.t) < 120000) { o.t2 = now; o.c = (o.c || 0) + n; o.r = (o.r || 0) + (r || 0); dirty = true; return o; }
  return (open[k] = add({ who, what: "write", leaf, line, c: n, r: r || 0 }));
}
function time(leaf, ms, kind) {               // from the writing clock: typing time and Hold time, per leaf
  if (!(ms > 0) || !leaf) return; const k = "time|" + kind + "|" + leaf, now = Date.now(), o = open[k];
  if (o && now - (o.t2 || o.t) < 300000) { o.t2 = now; o.ms += ms; dirty = true; return; }
  open[k] = add({ who: "me", what: kind === "hold" ? "held" : "time", leaf, ms });
}
B.on(ev => {
  if (ev.dry) return;
  if (ev.type === "action" && ev.log) { const L = ev.log; if (L.what === "write") wrote(ev.who, L.leaf, L.n || 0, L.r, L.line); else add(Object.assign({ who: ev.who }, L)); }
  else if (ev.type === "undo") add({ who: "me", what: "undo", leaf: g.Page && g.Page.leaf, n: ev.name === "group" ? "a whole reply or command" : ev.name });
});
const all = () => Keep.tx("log", "readonly", s => s.getAll()).catch(() => []).then(a => { const seen = {}; tail.forEach(e => { seen[e.id] = 1; }); return (a || []).filter(e => !seen[e.id]).concat(tail).sort((x, y) => x.t - y.t); });
function mergeIn(entries) {                   // another device's record: united by id, never replaced
  if (!entries || !entries.length) return Promise.resolve(0);
  return Keep.tx("log", "readwrite", s => { entries.forEach(e => { if (e && e.id && e.dev !== dev()) s.put(e); }); }).then(() => entries.length).catch(() => 0);
}
function forget(since) { const n = tail.length; tail = tail.filter(e => e.t < since); Object.keys(open).forEach(k => { delete open[k]; }); if (tail.length !== n) { dirty = true; saveTail(); } }      // (only the guided test uses this: a Show me puts the record back as it was, like the book)
const mine = since => all().then(a => a.filter(e => e.dev === dev() && (e.t2 || e.t) >= (since || 0)));

/* ---------- saying an entry in plain words ---------- */
const WHO = w => w === "me" ? "You" : w === "ai" ? "The AI" : w === "book" ? "The book" : w.indexOf("cmd:") === 0 ? "Command " + w.slice(4) : w.indexOf("auto:") === 0 ? "Automation “" + w.slice(5) + "”" : w;
const mins = ms => ms < 60000 ? Math.max(1, Math.round(ms / 1000)) + " sec" : Math.round(ms / 60000) + " min";
const q = s => "“" + String(s == null ? "" : s).slice(0, 50) + "”";
const inn = e => q(e.lt) + (e.wt ? " › " + q(e.wt) : "");      // where: the page, and the fold it happened within
const SAY = {
  write: e => "wrote in " + inn(e) + " (" + (e.c || 0) + " letters" + (e.r ? ", " + e.r + " taken away" : "") + (e.t2 ? ", over " + mins(e.t2 - e.t) : "") + ")",
  time: e => "spent " + mins(e.ms) + " writing in " + q(e.lt), held: e => "held the clock for " + mins(e.ms) + " in " + q(e.lt),
  grow: e => (e.n === "back" ? "took a line out of its fold" : "folded a line into the one above") + " in " + q(e.lt),
  foldin: e => (e.n === "out" ? "took " + q(e.tx) + " out of " + (e.p ? q(e.p) : "its fold") : "folded " + q(e.tx) + " into " + q(e.p)) + " in " + q(e.lt),
  lift: e => "lifted what's within " + q(e.n) + " onto its own page", putback: e => "put the page of " + q(e.n) + " back within it" + (e.k ? " (" + e.k + " lines)" : ""), place: e => "placed " + q(e.n) + " within " + q(e.tx) + " too (shared)", newleaf: e => "made a new leaf" + (e.n ? " " + q(e.n) : "") + " in " + q(e.lt),
  move: e => "moved a line (and what's within it) " + (e.n === "up" || e.n === "down" ? e.n + " in " + inn(e) : "to " + q(e.n)), prune: e => "deleted " + q(e.n) + " from " + q(e.lt), restore: e => "brought back " + q(e.n),
  fold: e => (e.w ? "folded " + q(e.tx) + " in " + q(e.lt) : "folded " + (e.k || 1) + " line" + (e.k > 1 ? "s" : "") + " together in " + q(e.lt)) + (e.n ? " as " + q(e.n) : ""),
  unfold: e => (e.s === 1 ? "took the shared fold " + q(e.tx) + " out of a line" : e.s === 2 ? "unfolded " + q(e.tx) + " (what was within it came out)" : "removed a fold") + " in " + q(e.lt),
  gate: e => (e.n === "open" ? "opened" : "closed") + " " + (e.tx ? q(e.tx) : "a fold") + " in " + q(e.lt),
  name: e => "named a fold " + q(e.n), detail: e => "set " + q(e.n) + " on a fold", link: e => "linked two lines" + (e.n ? " (" + e.n + ")" : ""), unlink: e => "removed a link",
  mark: e => "left a bookmark in " + inn(e), markdone: e => "finished a bookmark", command: e => "ran the command " + e.n, automation: e => "ran: " + e.n, request: e => "wrote a request: " + q(e.n),
  ask: e => "asked the AI: " + q(e.n), harvest: e => "started the harvest of " + q(e.lt), facts: e => "wrote what the record shows in " + q(e.lt) + " (" + (e.k || 0) + " lines)", lesson: e => "kept a line in “Ways of mine”: " + q(e.n),
  undo: e => "undid " + (e.n || "a move") + (e.lt ? " in " + q(e.lt) : "")
};
const say = e => WHO(e.who || "me") + " " + (SAY[e.what] ? SAY[e.what](e) : e.what + (e.lt ? " in " + q(e.lt) : ""));
/* every leaf within a leaf (itself too): a project, and every page lifted from within it */
function under(id) { const out = {}; const walk = x => { const lf = B.D.leaves[x]; if (!lf || out[x]) return; out[x] = 1; lf.lines.forEach(l => { const L = B.D.lines[l]; if (L && L.leaf) walk(L.leaf); }); }; walk(id); return out; }
const forBranch = id => { const set = under(id); return all().then(a => a.filter(e => e.leaf && set[e.leaf])); };

/* ---------- the timeline: ☰ → The record ---------- */
const Page = g.Page;
function openRecord(scope) {
  Page.sheet("The record", body => {
    let mode = scope || (Page.leaf === B.D.trunk ? "book" : "leaf"), shown = 300;
    const draw = () => { body.innerHTML = `<div class="chips"><button class="chip${mode === "leaf" ? " on" : ""}" data-m="leaf">This leaf and what's within it</button><button class="chip${mode === "book" ? " on" : ""}" data-m="book">The whole book</button></div><p class="nt">Every move, who made it, and when. It only listens: it never changes your writing.</p><div id="tlBox"><p class="nt">Loading…</p></div>`;
      body.querySelectorAll("[data-m]").forEach(b => { b.onclick = () => { mode = b.dataset.m; draw(); }; });
      (mode === "leaf" ? forBranch(Page.leaf) : all()).then(list => { const box = body.querySelector("#tlBox"); if (!box) return; list = list.slice().reverse(); let day = "", h = "";
        list.slice(0, shown).forEach(e => { const d = new Date(e.t), ds = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }); if (ds !== day) { day = ds; h += `<h2>${Page.esc(ds)}</h2>`; }
          h += `<div class="tl${e.who === "ai" ? " by-ai" : e.who === "book" ? " by-book" : ""}"><small>${Page.esc(d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</small>${Page.esc(say(e))}</div>`; });
        box.innerHTML = h || `<div class="none">Nothing here yet. The record starts with your first move.</div>`;
        if (list.length > shown) { const b = Page.el("button", "", "Show earlier"); b.onclick = () => { shown += 300; draw(); }; box.appendChild(b); } }); };
    draw(); });
}
Page.view({ order: 70, label: "The record (every move)", open: () => openRecord() });
g.Log = { add, time, all, mine, mergeIn, forget, say, WHO, saveTail, under, forBranch, open: openRecord, get tail() { return tail; } };
})(window);
