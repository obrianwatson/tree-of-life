/* fold.js · MODULE "fold" · FOLD: what's within (claude/folds-within.md).
   A fold is how BOLW shows that one thing always has another thing within it.
   - WITHIN: every line can hold lines within it. Tab (or ⇥) folds a line into the line above; Shift-Tab (⇤) takes it
     out. The mark before a line (▾ open, ▸ closed) opens and closes what's within it. Folds within folds, without end.
     Fold on a line with nothing within it opens a space within it, to write in.
   - BRANCHES are how folds look as a tree, seen from above: the path at the top traces back from the line you're on,
     fold by fold, to the trunk, and the Map draws the tree.
   - A LEAF is a fold given its own page. Lift puts what's within a line onto its own page (still within its line:
     tap ›). Put back folds the page back into its line.
   - SHARED: the same fold can be placed within more than one line. It is one fold, shown in each place (marked ↻);
     editing it anywhere edits it everywhere. It lives within the line it began in.
   - SEVERAL LINES can still be folded together behind a gate, and those folds can overlap.
   - NAMING a fold (when you want) makes it gather across the book: ☰ → Folds. Named folds carry details (Status, Key),
     a gathering can also gather by a search, and can carry instructions the fast AI follows within it.
   A fold record: { id, leaf, from: line id, to: line id, open, name?, details?, by, at, updatedAt } and one of
     within: true   what's within the line `from` (`to` is `from`): it keeps whether it's open, and its name
     place: line    that line's fold, placed (shared) within the line `from`
     (neither)      several lines, `from` to `to`, behind a gate
   Writing from before carries over: lines indented under a line ARE within it; a gate fold that held exactly a line
   and what's within it becomes that line's fold (Book heal). Nothing is lost.
   Actions: foldin { line, to?, dir } · lift { line } · putback { line } · fold { from, to?, name?, open? } · gate { fold | line, open }
            place { from, into } · unfold { fold } · name { fold, name } · detail { fold, key, value } · stretch · gather · teach */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, D = () => B.D, esc = Page.esc, el = Page.el;
Mods.add({ id: "fold", name: "Fold", about: "What's within a line: fold lines into lines, open and close them, lift a fold onto its own page and put it back, share one fold in several places, name folds to gather them." });
const COLORS = ["#2f6fb5", "#1d9e75", "#c9892b", "#b5482f", "#8a55b5", "#3d8f8f"];
const key = n => String(n || "").trim().toLowerCase();
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const q = s => "“" + clip(String(s || "").trim() || "(empty line)", 40) + "”";
const now = () => Date.now();
const foldsOf = leaf => ((D().leaves[leaf] || {}).folds || []).map(f => D().folds[f]).filter(Boolean);
const dAt = (lf, i) => D().lines[lf.lines[i]].d;
const hasKids = (lf, i) => i >= 0 && i + 1 < lf.lines.length && dAt(lf, i + 1) > dAt(lf, i);
const withinOf = line => { const L = D().lines[line]; return L ? foldsOf(L.in).find(F => F.within && F.from === line) || null : null; };
const placesIn = line => { const L = D().lines[line]; return L ? foldsOf(L.in).filter(F => F.place && F.from === line && D().lines[F.place]) : []; };
const placesOf = src => Object.values(D().folds).filter(F => F.place === src && D().lines[F.from] && D().leaves[F.leaf] && B.alive(F.leaf));
const holds = line => { const L = D().lines[line]; if (!L) return false; const lf = D().leaves[L.in]; return hasKids(lf, lf.lines.indexOf(line)) || placesIn(line).length > 0; };      // something is within this line, on this page
function rangeOf(F) {                                   // the lines a fold hides when it's closed
  const lf = D().leaves[F.leaf]; if (!lf || F.place) return null; const a = lf.lines.indexOf(F.from); if (a < 0) return null;
  if (F.within) { const e = B.branchEnd(lf, a); return e - 1 > a ? { a: a + 1, b: e - 1 } : null; }
  const b = lf.lines.indexOf(F.to); return b < a ? null : { a, b };
}
function reach(F) {                                     // the lines a fold is about, its own line included
  if (!F.within) return rangeOf(F); const lf = D().leaves[F.leaf], a = lf ? lf.lines.indexOf(F.from) : -1; return a < 0 ? null : { a, b: B.branchEnd(lf, a) - 1 };
}
const label = F => F.name || clip(((D().lines[F.place || F.from] || { text: "" }).text.trim()) || "fold", 34);
/* is line a within line b (anywhere: on b's page, or on a page lifted from within it)? */
function isWithin(a, b) {
  const Bl = D().lines[b]; if (!Bl) return false; let c = a, n = 0;
  while (c && n++ < 300) { const C = D().lines[c]; if (!C) return false; const lf = D().leaves[C.in]; if (!lf) return false;
    if (C.in === Bl.in) { const i = lf.lines.indexOf(b), j = lf.lines.indexOf(c); if (i >= 0 && j > i && j < B.branchEnd(lf, i)) return true; }
    if (lf.parent === b) return true; c = lf.parent; }
  return false;
}
/* the lines of a shared fold, as they are where it lives: what's within its line (or, when that is on its own page, the page) */
function sharedLines(src) {
  const L = D().lines[src]; if (!L) return []; const lf = D().leaves[L.in], i = lf.lines.indexOf(src);
  const out = i < 0 ? [] : lf.lines.slice(i + 1, B.branchEnd(lf, i)).map(id => ({ id, d: D().lines[id].d - L.d - 1 }));
  if (!out.length && L.leaf && D().leaves[L.leaf]) D().leaves[L.leaf].lines.forEach(id => out.push({ id, d: D().lines[id].d }));
  return out;
}
function newWithin(lf, L, who, open) { const id = B.uid("o"); D().folds[id] = { id, leaf: lf.id, from: L.id, to: L.id, within: true, open: !!open, by: who, at: now(), updatedAt: now() }; lf.folds = (lf.folds || []).concat(id); return D().folds[id]; }
function meta(T, name) { const k = key(name), N = D().names[k]; if (N && N.name) return N; T.table("names"); return (D().names[k] = Object.assign({ name: name.trim(), keys: [] }, N || {}, { updatedAt: now() })); }
const parentText = (lf, i) => { const p = B.parentLine(lf, i); return p >= 0 ? D().lines[lf.lines[p]].text.slice(0, 60) : ""; };

/* ================= the actions ================= */
/* FOLD IN: a line (or a run of lines, `line` to `to`) and what's within it go into the line above (dir 1), or come out of the line they're within (dir -1). */
B.action("foldin", function (needs, who, T) {
  const L = D().lines[needs.line]; if (!L) throw B.plain("That line isn't there.");
  const lf = D().leaves[L.in], i = lf.lines.indexOf(L.id), j0 = needs.to && D().lines[needs.to] && D().lines[needs.to].in === lf.id ? lf.lines.indexOf(needs.to) : i, j = Math.max(i, j0), e = B.branchEnd(lf, j);
  let dir = (needs.dir | 0) || 1; const was = parentText(lf, i);
  if (dir > 0) { if (i === 0) throw B.plain("The first line has no line above it to fold into."); dir = Math.min(dir, D().lines[lf.lines[i - 1]].d + 1 - L.d); if (dir <= 0) throw B.plain("It's already within the line above."); }
  else { let min = L.d; for (let k = i; k <= j; k++) min = Math.min(min, D().lines[lf.lines[k]].d); dir = Math.max(dir, -min); if (dir >= 0) throw B.plain("It isn't within any line."); }
  T.leaf(lf.id); for (let k = i; k < e; k++) D().lines[lf.lines[k]].d += dir; B.fixDepths(lf);
  const p = B.parentLine(lf, i), host = p >= 0 ? withinOf(lf.lines[p]) : null; if (dir > 0 && host && !host.open) D().folds[host.id] = Object.assign({}, host, { open: true });      // folded into a closed line: it opens, so you see where it went
  return { line: L.id, depth: L.d, structural: true, log: { what: "foldin", leaf: lf.id, line: L.id, n: dir < 0 ? "out" : "in", tx: L.text.slice(0, 60), p: dir < 0 ? was : parentText(lf, i) } };
}, "fold");
/* LIFT: what's within a line goes onto its own page (a leaf), still within that line. A line with nothing within it gets an empty page. */
B.action("lift", function (needs, who, T) {
  const L = D().lines[needs.line]; if (!L) throw B.plain("That line isn't there.");
  const lf = D().leaves[L.in], i = lf.lines.indexOf(L.id), e = B.branchEnd(lf, i), kids = lf.lines.slice(i + 1, e), t = now();
  let leaf = L.leaf && D().leaves[L.leaf];
  if (leaf && !kids.length) throw B.plain("What's within this line is already on its own page. Tap › to open it.");
  T.leaf(lf.id);
  if (leaf) T.leaf(leaf.id); else { const id = B.uid("f"); T.leaf(id); leaf = D().leaves[id] = { id, lines: [], folds: [], parent: L.id, at: t, updatedAt: t, name: L.text }; L.leaf = id; }
  const old = lf.lines.slice(), gone = {}; kids.forEach(k => { gone[k] = true; });
  B.refold(lf, old, gone, leaf); lf.lines.splice(i + 1, kids.length);
  kids.forEach(k => { const R = D().lines[k]; R.d -= L.d + 1; R.in = leaf.id; });
  if (kids.length && leaf.lines.length === 1 && !D().lines[leaf.lines[0]].text && !D().lines[leaf.lines[0]].leaf) { delete D().lines[leaf.lines[0]]; leaf.lines = []; }
  leaf.lines.push(...kids); B.fixDepths(leaf);
  return { leaf: leaf.id, line: L.id, moved: kids.length, structural: true, log: { what: "lift", leaf: lf.id, line: L.id, n: L.text.slice(0, 60), k: kids.length } };
}, "fold");
/* PUT BACK: a line's page is folded back into the line: its lines go back within it, after anything already within it.
   Every line keeps its id, so links, bookmarks and folds go with it. The empty page is kept (nothing is deleted). */
B.action("putback", function (needs, who, T) {
  const L = D().lines[needs.line]; if (!L || !L.leaf || !D().leaves[L.leaf]) throw B.plain("This line has no page of its own to put back.");
  const host = T.leaf(L.in), leaf = T.leaf(L.leaf), i = host.lines.indexOf(L.id), e = B.branchEnd(host, i);
  const lone = leaf.lines.length === 1 && !D().lines[leaf.lines[0]].text && !D().lines[leaf.lines[0]].leaf, moving = lone ? [] : leaf.lines.slice();
  moving.forEach(l => { const R = D().lines[l]; R.d += L.d + 1; R.in = host.id; });
  host.lines.splice(e, 0, ...moving);
  (leaf.folds || []).forEach(f => { const F = D().folds[f]; if (F) { F.leaf = host.id; host.folds = (host.folds || []).concat(f); } });
  const W = withinOf(L.id); if (W && !W.open) D().folds[W.id] = Object.assign({}, W, { open: true });
  leaf.lines = [B.newLine(leaf.id, "", 0, who)]; leaf.folds = []; leaf.back = now(); delete L.leaf; B.fixDepths(host);
  return { line: L.id, leaf: host.id, moved: moving.length, structural: true, log: { what: "putback", leaf: host.id, line: L.id, n: L.text.slice(0, 60), k: moving.length } };
}, "fold");
/* FOLD: one line: its fold (made if it has none; a space opens within it when nothing is within it yet), closed unless open: true.
         several lines (from … to): behind a gate, as one fold; if they are exactly a line and what's within it, that line's fold. */
B.action("fold", function (needs, who, T) {
  const A = D().lines[needs.from], Z = D().lines[needs.to || needs.from]; if (!A || !Z || A.in !== Z.in) throw B.plain("Those lines aren't in one leaf.");
  const lf = T.leaf(A.in); let a = lf.lines.indexOf(A.id), b = lf.lines.indexOf(Z.id); if (b < a) { const t = a; a = b; b = t; }
  const H = D().lines[lf.lines[a]], nm = String(needs.name || "").trim();
  if (a === b || (b === B.branchEnd(lf, a) - 1 && b > a)) {
    let made = null; if (!hasKids(lf, a) && !placesIn(H.id).length) { made = B.newLine(lf.id, "", H.d + 1, who); lf.lines.splice(a + 1, 0, made); }
    let F = withinOf(H.id); const open = made ? true : needs.open === true;
    if (!F) F = newWithin(lf, H, who, open); else D().folds[F.id] = F = Object.assign({}, F, { open, updatedAt: now() });
    if (nm) { D().folds[F.id] = F = Object.assign({}, F, { name: nm }); meta(T, nm); }
    const r = rangeOf(F);
    return { fold: F.id, within: true, line: made, open, lines: r ? r.b - r.a + 1 : 0, structural: true, log: { what: "fold", leaf: lf.id, line: H.id, n: nm, k: r ? r.b - r.a + 1 : 0, w: 1, tx: H.text.slice(0, 60) } };
  }
  if (foldsOf(lf.id).some(F => !F.within && !F.place && F.from === lf.lines[a] && F.to === lf.lines[b])) throw B.plain("Those lines are already folded just like that.");
  const id = B.uid("o");
  D().folds[id] = { id, leaf: lf.id, from: lf.lines[a], to: lf.lines[b], open: needs.open === true, by: who, at: now(), updatedAt: now() }; lf.folds = (lf.folds || []).concat(id);
  if (nm) { D().folds[id].name = nm; meta(T, nm); }
  return { fold: id, lines: b - a + 1, structural: true, log: { what: "fold", leaf: lf.id, line: lf.lines[a], n: nm, k: b - a + 1 } };
}, "fold");
/* GATE: open or close (say the end state). A fold, or a line: what's within it. */
B.action("gate", function (needs, who, T) {
  const open = !!needs.open; let F = needs.fold && D().folds[needs.fold];
  if (!F && needs.line) { const L = D().lines[needs.line]; if (!L) throw B.plain("That line isn't there."); F = withinOf(L.id);
    if (!F) { if (!holds(L.id)) throw B.plain("Nothing is within this line yet."); if (open) return { line: L.id, open, look: true }; const lf = T.leaf(L.in); F = newWithin(lf, L, who, false); return { fold: F.id, open, structural: true, log: { what: "gate", leaf: lf.id, line: L.id, n: "closed", tx: L.text.slice(0, 60) } }; } }
  if (!F) throw B.plain("That fold isn't there.");
  if (F.open === open) return { fold: F.id, open, look: true };
  T.rec("folds", F.id); D().folds[F.id] = Object.assign({}, F, { open });
  return { fold: F.id, open, structural: true, log: { what: "gate", leaf: F.leaf, line: F.from, n: open ? "open" : "closed", tx: label(F) } };
}, "fold");
/* PLACE: the fold of line `from` (what's within it) is placed within line `into` as well: one fold, shown in both places. */
B.action("place", function (needs, who, T) {
  const X = D().lines[needs.from], Y = D().lines[needs.into]; if (!X || !Y) throw B.plain("That line isn't there.");
  if (X.id === Y.id) throw B.plain("A fold is already within its own line.");
  const xl = D().leaves[X.in], xi = xl.lines.indexOf(X.id); if (!hasKids(xl, xi) && !(X.leaf && D().leaves[X.leaf])) throw B.plain("Nothing is within " + q(X.text) + " yet, so there's nothing to share.");
  if (isWithin(Y.id, X.id)) throw B.plain(q(Y.text) + " is within " + q(X.text) + ": a fold can't be placed within itself.");
  if (isWithin(X.id, Y.id)) throw B.plain(q(X.text) + " is already within " + q(Y.text) + ".");
  if (placesIn(Y.id).some(F => F.place === X.id)) throw B.plain("It's already placed there.");
  const lf = T.leaf(Y.in), id = B.uid("o"); D().folds[id] = { id, leaf: lf.id, from: Y.id, to: Y.id, place: X.id, open: true, by: who, at: now(), updatedAt: now() }; lf.folds = (lf.folds || []).concat(id);
  const W = withinOf(Y.id); if (W && !W.open) D().folds[W.id] = Object.assign({}, W, { open: true });
  return { fold: id, structural: true, log: { what: "place", leaf: lf.id, line: Y.id, n: X.text.slice(0, 60), tx: Y.text.slice(0, 60) } };
}, "fold");
/* UNFOLD: a gate fold goes and its lines stay exactly as they are · a shared fold is taken out of this place (it stays where it lives)
           · a line's fold: what was within it comes out of it, one step, and nothing is lost */
B.action("unfold", function (needs, who, T) {
  const F = D().folds[needs.fold]; if (!F) throw B.plain("That fold isn't there.");
  const lf = T.leaf(F.leaf); lf.folds = lf.folds.filter(x => x !== F.id); delete D().folds[F.id];
  if (F.within) { const r = rangeOf(F); if (r) { for (let k = r.a; k <= r.b; k++) D().lines[lf.lines[k]].d -= 1; B.fixDepths(lf); } }
  return { line: F.from, structural: true, log: { what: "unfold", leaf: lf.id, line: F.from, n: F.name || "", s: F.place ? 1 : F.within ? 2 : 0, tx: label(F) } };
}, "fold");
B.action("name", function (needs, who, T) {
  const F = D().folds[needs.fold]; if (!F) throw B.plain("That fold isn't there."); if (F.place) throw B.plain("Name it where it lives: a shared fold has one name.");
  const nm = String(needs.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  T.leaf(F.leaf); const N = Object.assign({}, F, { updatedAt: now() }); if (nm) { N.name = nm; meta(T, nm); } else { delete N.name; delete N.details; } D().folds[F.id] = N;
  return { fold: F.id, name: nm, pieces: nm ? pieces(nm).length : 0, structural: true, log: { what: "name", leaf: F.leaf, n: nm || "(no name)" } };
}, "fold");
B.action("detail", function (needs, who, T) {
  const F = D().folds[needs.fold]; if (!F) throw B.plain("That fold isn't there."); if (!F.name) throw B.plain("Name the fold first: details belong to named folds.");
  const k = String(needs.key || "").trim().slice(0, 30), v = String(needs.value == null ? "" : needs.value).trim().slice(0, 200); if (!k) throw B.plain("A detail needs a name, like Status or Key.");
  T.leaf(F.leaf); const det = Object.assign({}, F.details || {}); if (v) det[k] = v; else delete det[k]; D().folds[F.id] = Object.assign({}, F, { details: det, updatedAt: now() });
  const N = meta(T, F.name); if (N.keys.indexOf(k) < 0) { T.table("names");      /* a new kind of detail is remembered for every piece of this gathering, even before it has a value */ D().names[key(F.name)] = Object.assign({}, N, { keys: N.keys.concat(k), updatedAt: now() }); }
  return { fold: F.id, details: det, structural: true, log: { what: "detail", leaf: F.leaf, n: k + ": " + v } };
}, "fold");
B.action("stretch", function (needs, who, T) {                       // a gate fold reaches further, or less far
  const F = D().folds[needs.fold]; if (!F) throw B.plain("That fold isn't there."); if (F.within || F.place) throw B.plain("A line's fold holds what's within it: fold lines into it instead."); const lf = T.leaf(F.leaf);
  const a = lf.lines.indexOf(needs.from || F.from), b = lf.lines.indexOf(needs.to || F.to); if (a < 0 || b < a) throw B.plain("A fold can't reach there.");
  D().folds[F.id] = Object.assign({}, F, { from: lf.lines[a], to: lf.lines[b], updatedAt: now() });
  return { fold: F.id, lines: b - a + 1, structural: true };
}, "fold");
B.action("gather", function (needs, who, T) {                        // "gather by rule": a search you save as a fold
  const nm = String(needs.name || "").trim(); if (!nm) throw B.plain("A gathering needs a name."); const N = meta(T, nm); T.table("names");
  const rule = String(needs.search || "").trim(); D().names[key(nm)] = Object.assign({}, N, { rule: rule || undefined, updatedAt: now() });
  return { name: nm, found: rule ? B.search(rule, 500).length : 0, log: { what: "name", n: nm + (rule ? " (gathers “" + rule + "”)" : "") } };
}, "fold");
B.action("teach", function (needs, who, T) {                         // instructions the fast AI follows inside this named fold
  const nm = String(needs.name || "").trim(); if (!nm) throw B.plain("Which fold?"); const N = meta(T, nm); T.table("names");
  D().names[key(nm)] = Object.assign({}, N, { instructions: String(needs.words || "").trim() || undefined, updatedAt: now() }); return { name: nm };
}, "fold");

/* ================= reading folds ================= */
function pieces(name) { const k = key(name), live = {}; B.leaves().forEach(id => { live[id] = 1; }); return Object.values(D().folds).filter(F => F.name && !F.place && key(F.name) === k && live[F.leaf] && reach(F)).sort((x, y) => x.at - y.at); }
function names() { const out = {}, live = {}; B.leaves().forEach(id => { live[id] = 1; });
  Object.values(D().folds).forEach(F => { if (!F.name || F.place || !live[F.leaf]) return; const k = key(F.name); (out[k] = out[k] || { key: k, name: (D().names[k] && D().names[k].name) || F.name, n: 0 }).n++; });
  Object.keys(D().names).forEach(k => { const N = D().names[k]; if (N && N.name && (N.rule || out[k])) out[k] = Object.assign(out[k] || { key: k, name: N.name, n: 0 }, { rule: N.rule }); });
  return Object.values(out).sort((a, b) => a.name.localeCompare(b.name)); }
const textOfFold = F => { if (F.place) return textOfFold({ within: true, leaf: D().lines[F.place] && D().lines[F.place].in, from: F.place });
  const lf = D().leaves[F.leaf], r = reach(F); if (!r) return ""; const base = D().lines[lf.lines[r.a]].d, H = D().lines[lf.lines[r.a]];
  let t = lf.lines.slice(r.a, r.b + 1).map(l => "    ".repeat(Math.max(0, D().lines[l].d - base)) + D().lines[l].text).join("\n");
  if (F.within && r.a === r.b && H.leaf && D().leaves[H.leaf]) t += "\n" + B.textOf(H.leaf, "    ", true); return t; };
const covering = (leaf, line) => { const lf = D().leaves[leaf], i = lf.lines.indexOf(line); return foldsOf(leaf).filter(F => { const r = reach(F); return r && r.a <= i && i <= r.b; }).sort((x, y) => { const p = reach(x), q2 = reach(y); return (p.b - p.a) - (q2.b - q2.a); }); };

/* ================= how a leaf is drawn: what's within (▾ ▸), the gates and their lanes, the shared folds ================= */
Page.layout = function (lf) {
  const fs = foldsOf(lf.id), n = lf.lines.length, hidden = {}, gates = {}, lanes = [], after = {}, twist = {}, shut = {}, places = {};
  fs.forEach(F => { if (!F.within || F.open) return; const i = lf.lines.indexOf(F.from); if (i < 0) return; shut[i] = 1; const r = rangeOf(F); if (r) for (let k = r.a; k <= r.b; k++) hidden[k] = 1; });
  const inShut = Object.assign({}, hidden);
  const gs = fs.filter(F => !F.within && !F.place).map(F => ({ F, r: rangeOf(F) })).filter(x => x.r).sort((x, y) => x.r.a - y.r.a || (y.r.b - y.r.a) - (x.r.b - x.r.a) || (x.F.id < y.F.id ? -1 : 1));
  let max = 0;
  gs.forEach(x => { let lane = 0; while (gs.some(y => y !== x && y.lane === lane && y.r.a <= x.r.b && x.r.a <= y.r.b)) lane++; x.lane = lane; max = Math.max(max, lane + 1); if (!x.F.open) for (let k = x.r.a; k <= x.r.b; k++) hidden[k] = 1; });
  gs.forEach(x => {                      // a gate shows unless its fold sits wholly inside another closed fold
    const inside = inShut[x.r.a] || gs.some(y => y !== x && !y.F.open && y.r.a <= x.r.a && x.r.b <= y.r.b && (y.r.a < x.r.a || x.r.b < y.r.b || gs.indexOf(y) < gs.indexOf(x)));
    if (!inside) (gates[x.r.a] = gates[x.r.a] || []).push(x.F); x.F._lane = x.lane; x.F._n = x.r.b - x.r.a + 1;
    if (x.F.open) for (let k = x.r.a; k <= x.r.b; k++) (lanes[k] = lanes[k] || []).push(x.lane); });
  fs.forEach(F => { if (!F.place || !D().lines[F.place]) return; const i = lf.lines.indexOf(F.from); if (i >= 0) (places[i] = places[i] || []).push(F); });
  let any = false;
  for (let i = 0; i < n; i++) { if (hidden[i]) continue; const kids = hasKids(lf, i); if (!kids && !places[i]) continue; any = true; twist[i] = shut[i] ? "▸" : "▾";
    if (places[i] && !shut[i]) { const e = B.branchEnd(lf, i) - 1; (after[e] = after[e] || []).push(...places[i]); } }
  return { hidden, gates, after, twist, gut: (any ? 22 : 14) + max * 7,
    decor: i => { const L = lanes[i]; if (!L) return ""; return "background-image:" + L.map(n => "linear-gradient(" + COLORS[n % 6] + "," + COLORS[n % 6] + ")").join(",") + ";background-size:" + L.map(() => "2px 100%").join(",") + ";background-position:" + L.map(n => (5 + n * 7) + "px 0").join(","); },
    paintGate(e, F) { const k = (F.open ? 1 : 0) + "|" + F._lane + "|" + F._n + "|" + label(F) + "|" + JSON.stringify(F.details || ""); if (e._k === k) return; e._k = k;
      const det = F.details ? Object.keys(F.details).map(d => d + ": " + F.details[d]).join(" · ") : "";
      e.className = "gate" + (F.open ? " open" : "") + (F.name ? " named" : ""); e.style.cssText = "--c:" + COLORS[F._lane % 6] + ";margin-left:" + (2 + F._lane * 7) + "px";
      e.innerHTML = `<span class="gl"><i>${F.open ? "▾" : "▸"}</i> ${esc(label(F))}</span><span class="gn">${F.open ? "" : F._n + (F._n > 1 ? " lines" : " line")}${det ? (F.open ? "" : " · ") + esc(clip(det, 40)) : ""}</span><span class="gm" role="button" aria-label="More for this fold">⋯</span>`; },
    paintShare, wireShare };
};

/* ---------- a shared fold, drawn where it's placed: its lines can be written in right there ---------- */
function paintShare(e, F) {
  const src = D().lines[F.place], ls = sharedLines(F.place), H = D().lines[F.from], step = H ? H.d + 1 : 1;
  const sig = ls.map(x => x.id + ":" + x.d).join(",") + "|" + src.text + "|" + B.title(src.in) + "|" + step;
  e.style.cssText = "margin-left:calc(var(--gut) + " + step + " * var(--step) - 6px)";
  if (e._sig !== sig) { e._sig = sig; e.textContent = ""; e._ls = new Map();
    const h = el("div", "sh"); h.innerHTML = `<span class="gl"><i>↻</i> ${esc(clip(src.text.trim() || "fold", 34))}</span><span class="gn">shared · lives in ${esc(clip(B.title(src.in), 22))}</span><span class="gm" role="button" aria-label="More for this shared fold">⋯</span>`; e.appendChild(h);
    if (!ls.length) e.appendChild(el("div", "nt", "Nothing is within it now."));
    ls.forEach(x => { const s = el("div", "sl"); s.contentEditable = "true"; s.spellcheck = true; s.dataset.id = x.id; s.style.paddingLeft = (6 + x.d * 18) + "px"; if (D().lines[x.id].by === "ai" || /^outside/.test(D().lines[x.id].by || "")) s.classList.add("by-ai"); e.appendChild(s); e._ls.set(x.id, s); }); }
  ls.forEach(x => { const s = e._ls.get(x.id), t = D().lines[x.id].text; if (s && document.activeElement !== s && s.textContent !== t) s.textContent = t; });
}
function caretIn(s) { const sel = getSelection(); if (!sel.rangeCount) return 0; const r = sel.getRangeAt(0), pre = document.createRange(); pre.selectNodeContents(s); try { pre.setEnd(r.startContainer, r.startOffset); } catch (x) { return 0; } return pre.toString().length; }
function focusShared(fid, line, at) {
  const s = document.querySelector('.share[data-f="' + fid + '"] .sl[data-id="' + line + '"]'); if (!s) return; s.focus();
  const t = s.firstChild, r = document.createRange(); if (t && t.nodeType === 3) r.setStart(t, Math.min(at || 0, t.length)); else r.setStart(s, 0); r.collapse(true); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
function wireShare(box) {
  const lineOfEl = n => { while (n && n !== box) { if (n.classList && n.classList.contains("sl")) return n; n = n.parentNode; } return null; };
  const done = (r, fid, caret) => { if (!r.ok) { Page.say(r.why); Page.render(); return; } Page.render(); if (caret) focusShared(fid, caret.line, caret.at); Page.fire("typed", Page.leaf); };
  box.addEventListener("keydown", e => { e.stopPropagation(); const s = lineOfEl(e.target); if (!s) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); Page.doUndo(); return; }
    if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); const at = caretIn(s); done(B.act("foldin", { line: s.dataset.id, dir: e.shiftKey ? -1 : 1 }), box.dataset.f, { line: s.dataset.id, at }); } });
  box.addEventListener("beforeinput", e => { e.stopPropagation(); const s = lineOfEl(e.target); if (!s) return e.preventDefault(); const id = s.dataset.id, L = D().lines[id]; if (!L) return e.preventDefault();
    const t = e.inputType || "", sel = getSelection(), at = caretIn(s), len = sel.isCollapsed ? 0 : sel.toString().length, fid = box.dataset.f;
    if (t === "insertParagraph" || t === "insertLineBreak") { e.preventDefault(); B.sealUndo(); const r = B.act("write", { line: id, at, remove: len, words: "\n" }); done(r, fid, r.caret); return; }
    if (t === "deleteContentBackward" && !len && at === 0) { e.preventDefault(); const F = D().folds[fid], ls = sharedLines(F.place), k = ls.findIndex(x => x.id === id); if (k <= 0) return; const P = D().lines[ls[k - 1].id], n0 = P.text.length;
      done(B.act("write", { line: P.id, at: n0, remove: 1, words: "" }), fid, { line: P.id, at: n0 }); return; }
    if (t === "historyUndo") { e.preventDefault(); Page.doUndo(); }
    if (t.indexOf("format") === 0 || t === "insertFromDrop") e.preventDefault(); });
  box.addEventListener("input", e => { e.stopPropagation(); const s = lineOfEl(e.target); if (!s) return; const id = s.dataset.id, L = D().lines[id]; if (!L) return;
    const now2 = s.textContent.replace(/[\n\r]/g, " "), old = L.text; if (now2 === old) return;
    let p = 0; const m = Math.min(old.length, now2.length); while (p < m && old.charCodeAt(p) === now2.charCodeAt(p)) p++; let k = 0; while (k < m - p && old.charCodeAt(old.length - 1 - k) === now2.charCodeAt(now2.length - 1 - k)) k++;
    const r = B.act("write", { line: id, at: p, remove: old.length - p - k, words: now2.slice(p, now2.length - k) }); if (!r.ok) { Page.say(r.why); s.textContent = old; return; }
    if (D().lines[id].in === Page.leaf) Page.render(); Page.fire("typed", Page.leaf); });
  box.addEventListener("paste", e => { e.stopPropagation(); e.preventDefault(); const s = lineOfEl(e.target); if (!s) return; const t = (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\r\n?/g, "\n"); if (!t) return;
    const sel = getSelection(), at = caretIn(s); B.sealUndo(); const r = B.act("write", { line: s.dataset.id, at, remove: sel.isCollapsed ? 0 : sel.toString().length, words: t }); B.sealUndo(); done(r, box.dataset.f, r.caret); });
  ["drop", "dragstart"].forEach(k => box.addEventListener(k, e => { e.preventDefault(); e.stopPropagation(); }));
}

/* ================= doing it from the page ================= */
function after(r) { if (!r.ok) { Page.say(r.why); return false; } Page.render(); return true; }
function foldIn(dir) { const c = Page.ctx(); if (!c.has) return; const r = B.act("foldin", { line: c.lines[0] || c.line, to: c.lines[c.lines.length - 1], dir }); if (!r.ok) return Page.say(r.why); Page.render(); if (c.collapsed) Page.setCaret({ line: c.line, at: c.at }); }
function lift() { const c = Page.ctx(); if (!c.has) return; const r = B.act("lift", { line: c.line }); if (!r.ok) return Page.say(r.why); Page.render(); Page.setCaret({ line: c.line }, true);
  Page.toast(r.moved ? "Lifted what's within " + q(D().lines[c.line].text) + " onto its own page (" + r.moved + " line" + (r.moved > 1 ? "s" : "") + "). It's still within its line: tap › to open it." : "This line has its own page now. Tap › to open it.", "Open", () => Page.go(r.leaf)); }
function putBack(line) { const L = D().lines[line]; if (!L) return; const r = B.act("putback", { line }); if (!r.ok) return Page.say(r.why); if (Page.leaf !== r.leaf) Page.go(r.leaf, line); else Page.render(); Page.setCaret({ line }, true);
  Page.toast("Put back: " + (r.moved ? r.moved + " line" + (r.moved > 1 ? "s are" : " is") + " within " + q(L.text) + " again." : "the empty page is gone."), "Undo", Page.doUndo); }
function toggleLine(line, open) {
  const keep = Page.pos, focus = document.activeElement === Page.$("#pg"); const r = B.act("gate", { line, open }); if (!after(r)) return;
  if (focus && keep) { if (Page.lineOf(keep.line)) Page.setCaret(keep, true); else Page.setCaret({ line, at: D().lines[line].text.length }, true); }
}
function nameLine(line) { let F = withinOf(line); if (!F) { const r = B.act("fold", { from: line, open: true }); if (!r.ok) return Page.say(r.why); F = D().folds[r.fold]; Page.render(); } askName(F.id); }
function foldHere() {
  const c = Page.ctx(); if (!c.has) return; const multi = c.lines.length > 1 && !c.collapsed;
  if (!multi && holds(c.line)) { const W = withinOf(c.line), shut = !!(W && !W.open); toggleLine(c.line, shut);
    if (!shut) Page.toast("Folded what's within " + q(D().lines[c.line].text) + ". Tap ▸ to open it.", "Name it", () => nameLine(c.line)); return; }
  const r = B.act("fold", multi ? { from: c.lines[0], to: c.lines[c.lines.length - 1] } : { from: c.line }); if (!after(r)) return;
  if (r.within && r.line) { Page.setCaret({ line: r.line, at: 0 }); return; }                                  // a space opened within the line: write in it
  if (r.within) { Page.setCaret({ line: c.lines[0], at: 0 }, true); Page.toast("Folded what's within " + q(D().lines[c.lines[0]].text) + ". Tap ▸ to open it.", "Name it", () => askName(r.fold)); return; }
  const lf = D().leaves[c.leaf], F = D().folds[r.fold], b = lf.lines.indexOf(F.to), a = lf.lines.indexOf(F.from), next = lf.lines[b + 1] || lf.lines[a - 1];
  if (next && !Page.TOUCH) Page.setCaret({ line: next, at: 0 }, true); else if (document.activeElement && document.activeElement.blur && Page.TOUCH) document.activeElement.blur();
  Page.toast("Folded " + r.lines + " lines behind a gate. Tap the gate to open it.", "Name it", () => askName(r.fold));
}
function toggle(fid, open) { const F = D().folds[fid]; if (!F) return; const want = open == null ? !F.open : open, keep = Page.pos; const r = B.act("gate", { fold: fid, open: want }); if (!after(r)) return;
  if (keep && Page.lineOf(keep.line) && document.activeElement === Page.$("#pg")) Page.setCaret(keep, true); }
/* sharing: choose the fold, then go to the line it should also be within (on any page) and place it there */
let sharing = null;
function startShare(line) { sharing = line; Page.toast("Now put the cursor on the line it should also be within (on any page), then ⌄ → Place " + q(D().lines[line].text) + " here.", "Cancel", () => { sharing = null; }); }
function placeHere(line) { const src = sharing; const r = B.act("place", { from: src, into: line }); if (!r.ok) return Page.say(r.why); sharing = null; Page.render();
  Page.toast(q(D().lines[src].text) + " is within this line too now. It's one fold: write in it anywhere and it changes everywhere.", "Undo", Page.doUndo); }
function unplace(fid) { const r = B.act("unfold", { fold: fid }); if (after(r)) Page.toast("Taken out of here. It's still where it lives.", "Undo", Page.doUndo); }
function shareMenu(fid, at) { const F = D().folds[fid]; if (!F || !D().lines[F.place]) return; const src = D().lines[F.place];
  Page.openMenu(at, [["Go to where it lives (" + clip(B.title(src.in), 18) + ")", () => Page.go(src.in, src.id, { flash: true })], ["Everywhere it's placed", () => openShared(src.id)], null, ["Take it out of here", () => unplace(fid)]]); }
function openShared(src) { const S = D().lines[src]; Page.sheet("Shared: " + clip(S.text.trim() || "fold", 30), body => {
  const ps = placesOf(src); body.innerHTML = `<p class="nt">One fold, within more than one line. Writing in it anywhere changes it everywhere.</p><div class="rows"><button class="rowi" data-l="${S.id}"><b>${esc(S.text)}</b><small>where it lives · ${esc(B.where(S.id))}</small></button>` + ps.map(F => `<button class="rowi" data-l="${F.from}"><b>${esc(D().lines[F.from].text)}</b><small>also within · ${esc(B.where(F.from))}</small></button>`).join("") + `</div>`;
  body.querySelectorAll("[data-l]").forEach(b => { b.onclick = () => { const L = D().lines[b.dataset.l]; Page.go(L.in, L.id, { flash: true }); }; }); }); }
function askName(fid) { const F = D().folds[fid]; if (!F) return; const have = names().map(n => n.name);
  Page.sheet(F.name ? "Rename this fold" : "Name this fold", body => {
    body.innerHTML = `<p class="nt">A name makes the fold gather across the book: every fold with the same name is one gathering.</p><input id="fnName" type="text" value="${esc(F.name || "")}" placeholder="Chorus, Idea, Promise…" autocapitalize="sentences"><div class="chips">${have.map(n => `<button class="chip" data-n="${esc(n)}">${esc(n)}</button>`).join("")}</div><div class="row"><button class="go" id="fnOk">Save</button>${F.name ? '<button id="fnNo">Take the name off</button>' : ""}</div>`;
    const inp = body.querySelector("#fnName"), save = v => { const r = B.act("name", { fold: fid, name: v }); if (!r.ok) return Page.say(r.why); Page.closeSheet(true); if (v) Page.toast("“" + v + "” now gathers " + r.pieces + " piece" + (r.pieces === 1 ? "" : "s") + ".", "See them", () => openName(v)); };
    body.querySelector("#fnOk").onclick = () => save(inp.value.trim()); inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); save(inp.value.trim()); } };
    body.querySelectorAll("[data-n]").forEach(b => { b.onclick = () => save(b.dataset.n); }); const no = body.querySelector("#fnNo"); if (no) no.onclick = () => save("");
    if (!Page.TOUCH) setTimeout(() => inp.focus(), 50); });
}
function editDetails(fid) { const F0 = D().folds[fid]; if (!F0) return; if (!F0.name) return askName(fid);
  Page.sheet("Details of “" + F0.name + "”", body => { const draw = () => { const F = D().folds[fid], N = D().names[key(F.name)] || { keys: [] }, det = F.details || {}, ks = N.keys.concat(Object.keys(det).filter(k => N.keys.indexOf(k) < 0));
      body.innerHTML = `<p class="nt">In “${esc(B.title(F.leaf))}”: ${esc(clip(label({ from: F.from }), 40))}. A few details for this piece (like Status or Key). Every piece of “${esc(F.name)}” can have the same kinds.</p>` + ks.map(k => `<label class="fld">${esc(k)}<input type="text" data-k="${esc(k)}" value="${esc(det[k] || "")}"></label>`).join("") + `<div class="row"><input type="text" id="fdNew" placeholder="A new detail (Status, Key, Date…)" style="flex:1"><button id="fdAdd">Add</button></div>`;
      body.querySelectorAll("[data-k]").forEach(i => { i.onchange = () => { const r = B.act("detail", { fold: fid, key: i.dataset.k, value: i.value }); if (!r.ok) Page.say(r.why); }; });
      body.querySelector("#fdAdd").onclick = () => { const k = body.querySelector("#fdNew").value.trim(); if (!k) return; const r = B.act("detail", { fold: fid, key: k, value: "" }); if (!r.ok) return Page.say(r.why); draw(); const i = [...body.querySelectorAll("[data-k]")].find(x => x.dataset.k === k); if (i) i.focus(); }; };
    draw(); });
}
function foldMenu(fid, at) { const F = D().folds[fid]; if (!F) return; if (F.place) return shareMenu(fid, at); const items = [[F.open ? "Close" : "Open", () => toggle(fid)], [F.name ? "Rename…" : "Name this fold…", () => askName(fid)]];
  if (F.name) { items.push(["Details…", () => editDetails(fid)]); items.push(["Everything in “" + clip(F.name, 18) + "”", () => openName(F.name)]); }
  items.push(null); items.push(["Remove the gate (its lines stay)", () => { const r = B.act("unfold", { fold: fid }); if (after(r)) Page.toast("The gate is gone; its lines are all there.", "Undo", Page.doUndo); }]);
  Page.openMenu(at, items); }
Page.on("gate", (fid, target) => { const F = D().folds[fid]; if (!F) return; const gm = target && target.closest && target.closest(".gm");
  if (F.place) { const r = (gm || target.closest(".sh") || target).getBoundingClientRect(); return shareMenu(fid, { left: r.right - 220, top: r.top, bottom: r.bottom }); }
  if (gm) { const r = gm.getBoundingClientRect(); foldMenu(fid, { left: r.left - 180, top: r.top, bottom: r.bottom }); } else toggle(fid); });
Page.on("twist", line => { if (!Mods.on("fold")) return; const W = withinOf(line); toggleLine(line, !!(W && !W.open)); });
Page.on("reveal", line => { const L = D().lines[line]; if (!L || !Mods.on("fold")) return; covering(L.in, line).forEach(F => { if (!F.open && !(F.within && F.from === line)) B.act("gate", { fold: F.id, open: true }); }); });
/* Return: at the end of a gate fold's last line you stay inside the gate; on its empty last line you step out of it.
   On an empty line that is the last within its line, Return takes it out of that fold (like Shift-Tab). */
Page.on("enter", (L, a) => { if (!Mods.on("fold") || !L || a.at !== L.text.length) return; const lf = D().leaves[L.in], i = lf.lines.indexOf(L.id);
  const ends = foldsOf(L.in).filter(F => !F.within && !F.place && F.open && F.to === L.id);
  if (ends.length) {
    if (!L.text && ends.every(F => F.from !== L.id)) { const prev = lf.lines[i - 1]; B.begin("stepout"); ends.forEach(F => B.act("stretch", { fold: F.id, to: prev })); B.end(); Page.render(); Page.setCaret({ line: L.id, at: 0 }); return true; }
    B.sealUndo(); B.begin("foldline"); const r = B.act("write", { line: L.id, at: L.text.length, words: "\n" }); if (r.ok) ends.forEach(F => B.act("stretch", { fold: F.id, to: r.line })); B.end(); Page.render(); if (r.ok) { Page.setCaret(r.caret); Page.fire("typed", L.in); } return true; }
  if (L.text || !L.d || (i + 1 < lf.lines.length && dAt(lf, i + 1) >= L.d)) return;
  B.sealUndo(); const r = B.act("foldin", { line: L.id, dir: -1 }); if (!r.ok) return; Page.render(); Page.setCaret({ line: L.id, at: 0 }); Page.fire("typed", L.in); return true; });
Page.bar({ id: "out", mod: "fold", order: 10, label: "⇤", cls: "ic", title: "Take it out of the line it's within (Shift-Tab)", show: c => c.has, run: () => foldIn(-1) });
Page.bar({ id: "in", mod: "fold", order: 11, label: "⇥", cls: "ic", title: "Fold it into the line above (Tab)", show: c => c.has, run: () => foldIn(1) });
Page.bar({ id: "fold", mod: "fold", order: 20, label: "Fold", cls: "main", title: "Fold: close what's within this line (or open a space within it)", show: c => c.has, run: foldHere,
  paint: (b, c) => { const W = c.has && c.collapsed ? withinOf(c.line) : null, t = W && !W.open && holds(c.line) ? "Open" : "Fold"; if (b.textContent !== t) b.textContent = t; } });
Page.key((e, c) => { if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey && c.has) { foldIn(e.shiftKey ? -1 : 1); return true; } }, "fold");
Page.menu(c => { if (!c.has) return []; const L = D().lines[c.line], lf = D().leaves[c.leaf], i = lf.lines.indexOf(c.line), kids = hasKids(lf, i), W = withinOf(c.line), out = [];
  if (holds(c.line)) { const shut = !!(W && !W.open); out.push([shut ? "Open what's within" : "Close what's within", () => toggleLine(c.line, shut)]);
    out.push([W && W.name ? "Rename this fold…" : "Name this fold…", () => nameLine(c.line)]); if (W && W.name) { out.push(["Details of “" + clip(W.name, 16) + "”…", () => editDetails(W.id)]); out.push(["Everything in “" + clip(W.name, 16) + "”", () => openName(W.name)]); } }
  else out.push(["Fold: open a space within it", foldHere]);
  const p = B.parentLine(lf, i); if (p >= 0) out.push(["Close " + q(D().lines[lf.lines[p]].text) + " (the line this is within)", () => toggleLine(lf.lines[p], false)]);
  if (L.leaf && D().leaves[L.leaf]) { out.push(["Open its page", () => Page.go(L.leaf)]); out.push(["Put its page back within it", () => putBack(c.line)]); if (kids) out.push(["Lift what's within onto its page too", lift]); }
  else out.push([kids ? "Lift what's within onto its own page" : "Give this line its own page", lift]);
  if (kids || (L.leaf && D().leaves[L.leaf])) out.push(["Share this fold in another place…", () => startShare(c.line)]);
  if (sharing && sharing !== c.line && D().lines[sharing]) out.push(["Place " + q(D().lines[sharing].text) + " here", () => placeHere(c.line)]);
  placesIn(c.line).forEach(F => out.push(["Take shared " + q(label(F)) + " out of here", () => unplace(F.id)]));
  if (placesOf(c.line).length) out.push(["Everywhere this fold is placed", () => openShared(c.line)]);
  if (c.leaf !== D().trunk && lf.parent && D().lines[lf.parent]) out.push(["Put this page back within " + q(D().lines[lf.parent].text), () => putBack(lf.parent)]);
  return out; }, "fold", 20);
Page.menu(c => { if (!c.has) return []; const fs = covering(c.leaf, c.line).filter(F => !F.within && !F.place), out = []; if (!fs.length) return out; const F = fs[0], nm = "“" + clip(label(F), 16) + "”";
  out.push(["Close the gate " + nm, () => toggle(F.id, false)]); out.push([F.name ? "Rename the gate fold…" : "Name the gate fold…", () => askName(F.id)]); if (F.name) out.push(["Details of " + nm + "…", () => editDetails(F.id)]);
  out.push(["Remove the gate " + nm + " (lines stay)", () => { const r = B.act("unfold", { fold: F.id }); if (after(r)) Page.setCaret({ line: c.line, at: c.at }, true); }]); if (fs.length > 1) out.push(["The other folds here…", () => openList()]); return out; }, "fold", 30);
/* trace back: the path at the top follows the line you're on, fold by fold, to the trunk */
let trailSig = "";
function paintTrail() { const box = Page.$("#crumbs"); if (!box) return; const c = Page.ctx(), ids = Mods.on("fold") && c.has ? B.trail(c.line) : [], sig = Page.leaf + "|" + ids.join(",") + "|" + ids.map(id => D().lines[id].text).join("|");
  if (sig === trailSig && (box.querySelector(".wi") || !ids.length)) return; trailSig = sig; box.querySelectorAll(".wi").forEach(x => x.remove());
  ids.forEach(id => { box.appendChild(el("i", "wi", "›")); const b = el("button", "wi", clip(D().lines[id].text.trim() || "…", 22)); b.title = "Within " + D().lines[id].text; b.onclick = () => Page.setCaret({ line: id }); box.appendChild(b); }); box.scrollLeft = box.scrollWidth; }
Page.on("moved", paintTrail); Page.on("drawn", () => { trailSig = ""; paintTrail(); });

/* ================= the fold list: ☰ → Folds ================= */
function openList() {
  Page.sheet("Folds", body => { const ns = names(), here = foldsOf(Page.leaf).filter(F => !F.place && (F.name || !F.within) && reach(F));
    body.innerHTML = `<h2>Named folds, gathered across the book</h2><div class="rows">` + (ns.map(n => `<button class="rowi" data-name="${esc(n.name)}"><b>${esc(n.name)}</b><small>${n.n} piece${n.n === 1 ? "" : "s"}${n.rule ? " · also gathers “" + esc(n.rule) + "”" : ""}</small></button>`).join("") || `<div class="none">No named folds yet. Fold a line, then name its fold (⌄ → Name this fold).</div>`) + `</div>
      <div class="row"><button id="flRule">Gather by a search…</button></div>
      <h2>Named folds and gates in “${esc(B.title(Page.leaf))}”</h2><div class="rows">` + (here.map(F => `<div class="rowi"><button class="go" data-go="${F.id}"><b>${esc(label(F))}</b><small>${F.within ? "within this line" : (reach(F).b - reach(F).a + 1) + " lines behind a gate"} · ${F.open ? "open" : "closed"}</small></button><button class="mini" data-tg="${F.id}">${F.open ? "Close" : "Open"}</button></div>`).join("") || `<div class="none">No named folds or gates on this page.</div>`) + `</div>`;
    body.querySelectorAll("[data-name]").forEach(b => { b.onclick = () => openName(b.dataset.name); });
    body.querySelectorAll("[data-go]").forEach(b => { b.onclick = () => { const F = D().folds[b.dataset.go]; Page.go(F.leaf, F.from, { flash: true }); }; });
    body.querySelectorAll("[data-tg]").forEach(b => { b.onclick = () => { const F = D().folds[b.dataset.tg]; B.act("gate", { fold: F.id, open: !F.open }); Page.closeSheet(false); openList(); }; });
    body.querySelector("#flRule").onclick = () => { const nm = prompt("Name this gathering", ""); if (!nm || !nm.trim()) return; const q = prompt("Gather every line that has these words", ""); if (q == null) return; const r = B.act("gather", { name: nm.trim(), search: q }); if (!r.ok) return alert(r.why); openName(nm.trim()); }; });
}
function openName(name) {
  Page.sheet("“" + name + "”", body => { const draw = () => { const N = D().names[key(name)] || { name, keys: [] }, ps = pieces(name), hits = N.rule ? B.search(N.rule, 200) : [];
      body.innerHTML = `<p class="nt">Every fold named “${esc(N.name || name)}”, wherever it is in the book.</p><div class="rows">` + (ps.map(F => { const det = F.details ? Object.keys(F.details).map(d => d + ": " + F.details[d]).join(" · ") : ""; return `<div class="rowi"><button class="go" data-go="${F.id}"><b>${esc(B.where(F.from))}</b><small>${esc(clip(textOfFold(F).replace(/\n\s*/g, " / "), 90))}</small>${det ? `<small class="det">${esc(det)}</small>` : ""}</button><button class="mini" data-det="${F.id}">Details</button></div>`; }).join("") || `<div class="none">No fold has this name yet.</div>`) + `</div>` +
        (N.rule ? `<h2>Also gathered by the search “${esc(N.rule)}”</h2><div class="rows">` + (hits.map(h => `<button class="rowi" data-leaf="${h.leaf}" data-line="${h.line}"><b>${esc(h.text.trim())}</b><small>in ${esc(B.title(h.leaf))}</small></button>`).join("") || `<div class="none">No line has those words right now.</div>`) + `</div>` : "") +
        `<h2>This gathering</h2><label class="fld">Gather by a search too (leave empty for none)<input type="text" id="fnRule" value="${esc(N.rule || "")}" placeholder="words to look for"></label><label class="fld">Instructions the AI follows inside these folds<textarea id="fnTeach" rows="3" placeholder="For example: keep every line to eight syllables.">${esc(N.instructions || "")}</textarea></label>
        <div class="row"><button id="fnRen">Rename everywhere</button></div>`;
      body.querySelectorAll("[data-go]").forEach(b => { b.onclick = () => { const F = D().folds[b.dataset.go]; Page.go(F.leaf, F.from, { flash: true }); }; });
      body.querySelectorAll("[data-det]").forEach(b => { b.onclick = () => editDetails(b.dataset.det); });
      body.querySelectorAll("[data-leaf]").forEach(b => { b.onclick = () => Page.go(b.dataset.leaf, b.dataset.line, { flash: true }); });
      body.querySelector("#fnRule").onchange = e => { B.act("gather", { name, search: e.target.value }); draw(); };
      body.querySelector("#fnTeach").onchange = e => { B.act("teach", { name, words: e.target.value }); };
      body.querySelector("#fnRen").onclick = () => { const nn = prompt("Rename every “" + name + "” fold to", name); if (!nn || !nn.trim() || nn.trim() === name) return; const old = D().names[key(name)] || {}; B.begin("rename"); pieces(name).forEach(F => B.act("name", { fold: F.id, name: nn.trim() })); if (old.rule) B.act("gather", { name: nn.trim(), search: old.rule }); if (old.instructions) B.act("teach", { name: nn.trim(), words: old.instructions }); B.act("gather", { name, search: "" }); B.end(); Page.closeSheet(false); openName(nn.trim()); }; };
    draw(); });
}
Page.view({ mod: "fold", order: 20, label: "Folds", open: openList });
Page.on("search", v => { const lv = v.toLowerCase(), ns = names().filter(n => n.name.toLowerCase().indexOf(lv) >= 0); return ns.length ? `<h2>Folds</h2><div class="rows">` + ns.map(n => `<button class="rowi" data-fname="${esc(n.name)}"><b>${esc(n.name)}</b><small>${n.n} piece${n.n === 1 ? "" : "s"}</small></button>`).join("") + `</div>` : ""; });
Page.on("searchDrawn", out => { out.querySelectorAll("[data-fname]").forEach(b => { b.onclick = () => openName(b.dataset.fname); }); });
g.Fold = { foldsOf, rangeOf, reach, pieces, names, covering, label, textOfFold, foldHere, foldIn, lift, putBack, toggle, toggleLine, nameLine, askName, editDetails, openList, openName, key,
  withinOf, placesIn, placesOf, holds, isWithin, sharedLines, startShare, placeHere, unplace, openShared, instructionsFor: (leaf, line) => covering(leaf, line).map(F => F.name && D().names[key(F.name)] && D().names[key(F.name)].instructions ? { name: F.name, words: D().names[key(F.name)].instructions } : null).filter(Boolean) };
})(window);
