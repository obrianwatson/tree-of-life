/* marks.js · MODULE "marks" · BOOKMARKS: where you were, and what you were waiting for.
   🔖 (top row) on any leaf saves where you were (the leaf and line, filled in by itself; tap to jump back) plus
   optional lines: what I was doing, waiting for, why, done looks like, meanwhile.
   ☰ → Bookmarks lists everything left waiting. Done bookmarks stay as a record.
   The same card is used for requests to a coding AI (requests.js): Marks.card(...).
   A bookmark: marks[id] = { id, leaf, line, at, title, doing?, waiting?, why?, doneLooks?, meanwhile?, done?: time, by, updatedAt }
   Actions: mark { line, doing?, … } · markedit { mark, doing?, … } · markdone { mark, done } */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, D = () => B.D, esc = Page.esc, el = Page.el;
Mods.add({ id: "marks", name: "Bookmarks", about: "🔖 saves where you were, and what you were waiting for. Done ones stay as a record." });
const FIELDS = [["doing", "What I was doing"], ["waiting", "Waiting for"], ["why", "Why"], ["doneLooks", "Done looks like"], ["meanwhile", "Meanwhile"]];
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const now = () => Date.now(), when = t => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const pickFields = (needs, into) => { FIELDS.forEach(f => { if (needs[f[0]] != null) { const v = String(needs[f[0]]).trim().slice(0, 600); if (v) into[f[0]] = v; else delete into[f[0]]; } }); return into; };

B.action("mark", function (needs, who, T) {
  const L = D().lines[needs.line]; if (!L) throw B.plain("That line isn't there."); T.table("marks"); const id = B.uid("m");
  D().marks[id] = pickFields(needs, { id, leaf: L.in, line: L.id, at: now(), title: clip(B.where(L.id) + (L.text.trim() ? " · " + L.text.trim() : ""), 80), by: who, updatedAt: now() });
  return { mark: id, title: D().marks[id].title, structural: true, log: { what: "mark", leaf: L.in, line: L.id, n: needs.waiting || needs.doing || "" } };
}, "marks");
B.action("markedit", function (needs, who, T) {
  const M = D().marks[needs.mark]; if (!M) throw B.plain("That bookmark isn't there."); T.table("marks"); D().marks[M.id] = pickFields(needs, Object.assign({}, M, { updatedAt: now() })); return { mark: M.id };
}, "marks");
B.action("markdone", function (needs, who, T) {
  const M = D().marks[needs.mark]; if (!M) throw B.plain("That bookmark isn't there."); T.table("marks"); const N = Object.assign({}, M, { updatedAt: now() }); if (needs.done === false) delete N.done; else N.done = now(); D().marks[M.id] = N;
  return { mark: M.id, done: !!N.done, structural: true, log: { what: "markdone", leaf: M.leaf, n: M.title } };
}, "marks");

const list = () => Object.values(D().marks).sort((a, b) => b.at - a.at);
const waiting = () => list().filter(m => !m.done);
function jump(M) { if (D().leaves[M.leaf] && B.alive(M.leaf)) { const there = D().lines[M.line] && D().lines[M.line].in === M.leaf; Page.go(M.leaf, there ? M.line : null, { flash: true }); if (!there) Page.say("The line this bookmark was on is gone; this is its leaf."); } else { Page.closeSheet(true); Page.say("The leaf this bookmark was in has been deleted (☰ → Deleted)."); } }

/* THE CARD: where you were (filled in), and a few optional lines. Used by bookmarks and by requests. */
function card(o) {
  Page.sheet(o.title, body => {
    body.innerHTML = `<p class="nt">${esc(o.intro || "")}</p>` + (o.where ? `<div class="rows"><button class="rowi" id="cdWhere"><b>${esc(o.where)}</b><small>${esc(o.whereNote || "where you were · tap to go back there")}</small></button></div>` : "") +
      o.fields.map(f => `<label class="fld">${esc(f[1])}<textarea rows="${f[2] || 2}" data-f="${f[0]}" placeholder="${esc(f[3] || "optional")}">${esc(o.values[f[0]] || "")}</textarea></label>`).join("") + `<div class="row" id="cdRow"></div><p class="nt" id="cdMsg"></p>`;
    const w = body.querySelector("#cdWhere"); if (w) w.onclick = o.go;
    body.querySelectorAll("[data-f]").forEach(t => { t.onchange = () => o.change(t.dataset.f, t.value); });
    const row = body.querySelector("#cdRow"); (o.buttons || []).forEach(b => { const e = el("button", b[2] || "", b[0]); e.onclick = () => { body.querySelectorAll("[data-f]").forEach(t => { if (t.value !== (o.values[t.dataset.f] || "")) o.change(t.dataset.f, t.value); }); b[1](body.querySelector("#cdMsg")); }; row.appendChild(e); });
  });
}
function openCard(id, fresh) { const M = D().marks[id]; if (!M) return;
  card({ title: "Bookmark", intro: fresh ? "Saved. Add a few lines if they'd help you pick this up later (all optional)." : (M.done ? "Finished " + when(M.done) + ". Kept as a record." : "Left " + when(M.at) + "."), where: M.title, go: () => jump(M), fields: FIELDS, values: M,
    change: (k, v) => { const n = { mark: id }; n[k] = v; B.act("markedit", n); },
    buttons: [[M.done ? "Not done after all" : "Done", () => { B.act("markdone", { mark: id, done: !M.done }); Page.closeSheet(false); if (!fresh) openList(); else Page.render(); }, M.done ? "" : "go"], ["Close", () => { Page.closeSheet(false); }]] });
}
function markHere() { const c = Page.ctx(), line = c.has ? c.line : D().leaves[Page.leaf].lines[0]; const r = B.act("mark", { line }); if (!r.ok) return Page.say(r.why); Page.render(); openCard(r.mark, true); }
function openList() {
  Page.sheet("Bookmarks", body => { const w = waiting(), d = list().filter(m => m.done), first = m => { const f = FIELDS.find(f => m[f[0]]); return f ? f[1] + ": " + m[f[0]] : ""; };
    const row = m => `<div class="rowi"><button class="go" data-j="${m.id}"><b>${esc(m.title)}</b><small>${esc(when(m.at))}${first(m) ? " · " + esc(clip(first(m), 70)) : ""}</small></button><button class="mini" data-c="${m.id}">Card</button>${m.done ? "" : `<button class="mini put" data-d="${m.id}">Done</button>`}</div>`;
    body.innerHTML = `<h2>Left waiting</h2><div class="rows">${w.map(row).join("") || `<div class="none">Nothing is waiting. Tap 🔖 at the top of any leaf to leave a bookmark.</div>`}</div>` + (d.length ? `<h2>Done (kept as a record)</h2><div class="rows">${d.map(row).join("")}</div>` : "");
    body.querySelectorAll("[data-j]").forEach(b => { b.onclick = () => jump(D().marks[b.dataset.j]); });
    body.querySelectorAll("[data-c]").forEach(b => { b.onclick = () => openCard(b.dataset.c); });
    body.querySelectorAll("[data-d]").forEach(b => { b.onclick = () => { B.act("markdone", { mark: b.dataset.d }); Page.closeSheet(false); openList(); }; }); });
}
const btn = el("button", "", "🔖"); btn.id = "tMark"; btn.setAttribute("aria-label", "Bookmark where I am"); Page.press(btn, markHere); Page.top(btn, "marks", 3);
let idx = null; B.on(() => { idx = null; });
const onLine = id => { if (!idx) { idx = {}; Object.values(D().marks).forEach(m => { if (!m.done) (idx[m.line] = idx[m.line] || []).push(m); }); } return idx[id]; };
Page.marker({ order: 40, mod: "marks", glyph: "⚑", has: L => !!onLine(L.id), tap: L => openCard(onLine(L.id)[0].id) });
Page.view({ mod: "marks", order: 40, label: "Bookmarks", open: openList });
Page.menu(c => c.has ? [["Bookmark this line", markHere]] : [], "marks", 37);
g.Marks = { card, list, waiting, openList, openCard, markHere, jump, FIELDS };
})(window);
