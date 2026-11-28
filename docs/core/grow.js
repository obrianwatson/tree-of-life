/* grow.js · MODULE "grow" · GROW: branches and leaves.
   - Indent a line under another and it grows from it: that's a branch (⇥ in the bar, or Tab; ⇤ or Shift-Tab goes back).
   - LIFT any branch into its own leaf when it gets big. The leaf stays attached to the line it grew from (tap › to open it).
   One idea covers both: a branch inside a leaf, and a new leaf.
   Actions: grow { line, to?, dir }   lift { line } */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, D = () => B.D;
Mods.add({ id: "grow", name: "Grow", about: "Branches by indenting, and lifting a branch into its own leaf." });

/* GROW: a line (or a run of lines, from `line` to `to`) and everything under it goes one step deeper (dir 1) or back out (dir -1). */
B.action("grow", function (needs, who, T) {
  const L = D().lines[needs.line]; if (!L) throw B.plain("That line isn't there.");
  const lf = D().leaves[L.in], i = lf.lines.indexOf(L.id), j0 = needs.to && D().lines[needs.to] && D().lines[needs.to].in === lf.id ? lf.lines.indexOf(needs.to) : i, j = Math.max(i, j0), e = B.branchEnd(lf, j);
  let dir = (needs.dir | 0) || 1;
  if (dir > 0) { if (i === 0) throw B.plain("The first line has nothing above it to grow from."); dir = Math.min(dir, D().lines[lf.lines[i - 1]].d + 1 - L.d); if (dir <= 0) throw B.plain("It's already as deep as it can go under the line above."); }
  else { let min = L.d; for (let k = i; k <= j; k++) min = Math.min(min, D().lines[lf.lines[k]].d); dir = Math.max(dir, -min); if (dir >= 0) throw B.plain("It's already all the way out."); }
  T.leaf(lf.id); for (let k = i; k < e; k++) D().lines[lf.lines[k]].d += dir; B.fixDepths(lf);
  return { line: L.id, depth: L.d, structural: true, log: { what: "grow", leaf: lf.id, line: L.id, n: dir < 0 ? "back" : "in" } };
}, "grow");

/* LIFT: a line's branch becomes its own leaf, attached to that line. A line with no branch gets an empty leaf (a new leaf). */
B.action("lift", function (needs, who, T) {
  const L = D().lines[needs.line]; if (!L) throw B.plain("That line isn't there.");
  const lf = D().leaves[L.in], i = lf.lines.indexOf(L.id), e = B.branchEnd(lf, i), kids = lf.lines.slice(i + 1, e), now = Date.now();
  let leaf = L.leaf && D().leaves[L.leaf];
  if (leaf && !kids.length) throw B.plain("This line already has its own leaf. Tap › to open it.");
  T.leaf(lf.id);
  if (leaf) T.leaf(leaf.id); else { const id = B.uid("f"); T.leaf(id); leaf = D().leaves[id] = { id, lines: [], folds: [], parent: L.id, at: now, updatedAt: now, name: L.text }; L.leaf = id; }
  const old = lf.lines.slice(), gone = {}; kids.forEach(k => { gone[k] = true; });
  B.refold(lf, old, gone, leaf); lf.lines.splice(i + 1, kids.length);
  kids.forEach(k => { const R = D().lines[k]; R.d -= L.d + 1; R.in = leaf.id; });
  if (kids.length && leaf.lines.length === 1 && !D().lines[leaf.lines[0]].text && !D().lines[leaf.lines[0]].leaf) { delete D().lines[leaf.lines[0]]; leaf.lines = []; }
  leaf.lines.push(...kids); B.fixDepths(leaf);
  return { leaf: leaf.id, line: L.id, moved: kids.length, structural: true, log: { what: "lift", leaf: lf.id, line: L.id, n: L.text.slice(0, 60), k: kids.length } };
}, "grow");

function grow(dir) { const c = Page.ctx(); if (!c.has) return; const r = B.act("grow", { line: c.lines[0] || c.line, to: c.lines[c.lines.length - 1], dir }); if (!r.ok) return Page.say(r.why); Page.render(); if (c.collapsed) Page.setCaret({ line: c.line, at: c.at }); }
function lift() { const c = Page.ctx(); if (!c.has) return; const r = B.act("lift", { line: c.line }); if (!r.ok) return Page.say(r.why); Page.render(); Page.setCaret({ line: c.line }, true);
  Page.toast(r.moved ? "Lifted " + r.moved + " line" + (r.moved > 1 ? "s" : "") + " into their own leaf. Tap › to open it." : "This line has its own leaf now. Tap › to open it.", "Open", () => Page.go(r.leaf)); }
Page.bar({ id: "out", mod: "grow", order: 10, label: "⇤", cls: "ic", title: "Back out (Shift-Tab)", show: c => c.has, run: () => grow(-1) });
Page.bar({ id: "in", mod: "grow", order: 11, label: "⇥", cls: "ic", title: "Grow under the line above (Tab)", show: c => c.has, run: () => grow(1) });
Page.key((e, c) => { if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey && c.has) { grow(e.shiftKey ? -1 : 1); return true; } }, "grow");
Page.menu(c => { if (!c.has) return []; const L = D().lines[c.line], lf = D().leaves[c.leaf], i = lf.lines.indexOf(c.line), kids = B.branchEnd(lf, i) - i - 1, out = [];
  if (L.leaf && D().leaves[L.leaf]) { out.push(["Open its leaf", () => Page.go(L.leaf)]); if (kids) out.push(["Lift its branch into the leaf", lift]); }
  else out.push([kids ? "Lift this branch into its own leaf" : "Give this line its own leaf", lift]);
  return out; }, "grow", 20);
g.Grow = { grow, lift };
})(window);
