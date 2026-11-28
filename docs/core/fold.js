/* fold.js · MODULE "fold" · FOLD: gathering.
   - Select lines and fold them: they collapse behind a GATE you open and close. With no selection, Fold takes the
     line you're on and its branch. Folds can overlap.
   - NAMING a fold is what makes it gather across the book: a fold named "Chorus" in two songs is the same fold,
     and the fold list (☰ → Folds) shows every piece of it.
   - A named fold's pieces can carry a few DETAILS (Status, Key). "Gather by rule" is a search you save as a fold.
   - A named fold can carry instructions the fast AI follows inside it.
   A fold: { id, leaf, from: line id, to: line id, name?, open, details?, by, at }. Its leaf lists it in leaf.folds.
   A gathering (what a name means across the book): names[key] = { name, keys: [detail names], rule?, instructions?, updatedAt }.
   Actions: fold { from, to?, name? } · gate { fold, open } · unfold { fold } · name { fold, name } · detail { fold, key, value }
            stretch { fold, from?, to? } · gather { name, search } · teach { name, words } */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, D = () => B.D, esc = Page.esc, el = Page.el;
Mods.add({ id: "fold", name: "Fold", about: "Fold lines behind a gate. Name a fold and it gathers across the book." });
const COLORS = ["#2f6fb5", "#1d9e75", "#c9892b", "#b5482f", "#8a55b5", "#3d8f8f"];
const key = n => String(n || "").trim().toLowerCase();
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const foldsOf = leaf => ((D().leaves[leaf] || {}).folds || []).map(f => D().folds[f]).filter(Boolean);
const rangeOf = F => { const lf = D().leaves[F.leaf]; if (!lf) return null; const a = lf.lines.indexOf(F.from), b = lf.lines.indexOf(F.to); return a < 0 || b < a ? null : { a, b }; };
const label = F => F.name || clip((D().lines[F.from] || { text: "" }).text.trim() || "fold", 34);
const now = () => Date.now();

/* ================= the actions ================= */
B.action("fold", function (needs, who, T) {
  const A = D().lines[needs.from], Z = D().lines[needs.to || needs.from]; if (!A || !Z || A.in !== Z.in) throw B.plain("Those lines aren't in one leaf.");
  const lf = T.leaf(A.in); let a = lf.lines.indexOf(A.id), b = lf.lines.indexOf(Z.id); if (b < a) { const t = a; a = b; b = t; }
  if (!needs.to) b = B.branchEnd(lf, a) - 1;                        // one line: the fold takes its branch too
  if (foldsOf(lf.id).some(F => F.from === lf.lines[a] && F.to === lf.lines[b])) throw B.plain("Those lines are already folded just like that.");
  const id = B.uid("o"), nm = String(needs.name || "").trim();
  D().folds[id] = { id, leaf: lf.id, from: lf.lines[a], to: lf.lines[b], open: needs.open === true, by: who, at: now(), updatedAt: now() }; lf.folds = (lf.folds || []).concat(id);
  if (nm) { D().folds[id].name = nm; meta(T, nm); }
  return { fold: id, lines: b - a + 1, structural: true, log: { what: "fold", leaf: lf.id, line: lf.lines[a], n: nm, k: b - a + 1 } };
}, "fold");
B.action("gate", function (needs, who, T) {                          // open or close: say the end state
  const F = D().folds[needs.fold]; if (!F) throw B.plain("That fold isn't there."); const open = !!needs.open;
  if (F.open === open) return { fold: F.id, open, look: true };
  T.rec("folds", F.id); D().folds[F.id] = Object.assign({}, F, { open });
  return { fold: F.id, open, structural: true, log: { what: "gate", leaf: F.leaf, n: open ? "open" : "closed" } };
}, "fold");
B.action("unfold", function (needs, who, T) {                        // the fold goes; its lines stay exactly as they are
  const F = D().folds[needs.fold]; if (!F) throw B.plain("That fold isn't there.");
  const lf = T.leaf(F.leaf); lf.folds = lf.folds.filter(x => x !== F.id); delete D().folds[F.id];
  return { line: F.from, structural: true, log: { what: "unfold", leaf: lf.id, n: F.name || "" } };
}, "fold");
function meta(T, name) { const k = key(name), N = D().names[k]; if (N && N.name) return N; T.table("names"); return (D().names[k] = Object.assign({ name: name.trim(), keys: [] }, N || {}, { updatedAt: now() })); }
B.action("name", function (needs, who, T) {
  const F = D().folds[needs.fold]; if (!F) throw B.plain("That fold isn't there."); const nm = String(needs.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
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
B.action("stretch", function (needs, who, T) {                       // a fold reaches further, or less far
  const F = D().folds[needs.fold]; if (!F) throw B.plain("That fold isn't there."); const lf = T.leaf(F.leaf);
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
function pieces(name) { const k = key(name), live = {}; B.leaves().forEach(id => { live[id] = 1; }); return Object.values(D().folds).filter(F => F.name && key(F.name) === k && live[F.leaf] && rangeOf(F)).sort((x, y) => x.at - y.at); }
function names() { const out = {}, live = {}; B.leaves().forEach(id => { live[id] = 1; });
  Object.values(D().folds).forEach(F => { if (!F.name || !live[F.leaf]) return; const k = key(F.name); (out[k] = out[k] || { key: k, name: (D().names[k] && D().names[k].name) || F.name, n: 0 }).n++; });
  Object.keys(D().names).forEach(k => { const N = D().names[k]; if (N && N.name && (N.rule || out[k])) out[k] = Object.assign(out[k] || { key: k, name: N.name, n: 0 }, { rule: N.rule }); });
  return Object.values(out).sort((a, b) => a.name.localeCompare(b.name)); }
const textOfFold = F => { const lf = D().leaves[F.leaf], r = rangeOf(F); if (!r) return ""; const base = D().lines[lf.lines[r.a]].d; return lf.lines.slice(r.a, r.b + 1).map(l => "    ".repeat(Math.max(0, D().lines[l].d - base)) + D().lines[l].text).join("\n"); };
const covering = (leaf, line) => { const lf = D().leaves[leaf], i = lf.lines.indexOf(line); return foldsOf(leaf).filter(F => { const r = rangeOf(F); return r && r.a <= i && i <= r.b; }).sort((x, y) => { const p = rangeOf(x), q = rangeOf(y); return (p.b - p.a) - (q.b - q.a); }); };

/* ================= how a leaf is drawn with its folds: what's hidden, the gates, the lanes ================= */
Page.layout = function (lf) {
  const fs = foldsOf(lf.id).map(F => ({ F, r: rangeOf(F) })).filter(x => x.r).sort((x, y) => x.r.a - y.r.a || (y.r.b - y.r.a) - (x.r.b - x.r.a) || (x.F.id < y.F.id ? -1 : 1));
  const hidden = {}, gates = {}, lanes = []; let max = 0;
  fs.forEach(x => { let lane = 0; while (fs.some(y => y !== x && y.lane === lane && y.r.a <= x.r.b && x.r.a <= y.r.b)) lane++; x.lane = lane; max = Math.max(max, lane + 1); if (!x.F.open) for (let k = x.r.a; k <= x.r.b; k++) hidden[k] = true; });
  fs.forEach(x => {                      // a gate shows unless its fold sits wholly inside another closed fold
    const inside = fs.some(y => y !== x && !y.F.open && y.r.a <= x.r.a && x.r.b <= y.r.b && (y.r.a < x.r.a || x.r.b < y.r.b || fs.indexOf(y) < fs.indexOf(x)));
    if (!inside) (gates[x.r.a] = gates[x.r.a] || []).push(x.F); x.F._lane = x.lane; x.F._n = x.r.b - x.r.a + 1;
    if (x.F.open) for (let k = x.r.a; k <= x.r.b; k++) (lanes[k] = lanes[k] || []).push(x.lane); });
  return { hidden, gates, gut: 14 + max * 7,
    decor: i => { const L = lanes[i]; if (!L) return ""; return "background-image:" + L.map(n => "linear-gradient(" + COLORS[n % 6] + "," + COLORS[n % 6] + ")").join(",") + ";background-size:" + L.map(() => "2px 100%").join(",") + ";background-position:" + L.map(n => (5 + n * 7) + "px 0").join(","); },
    paintGate(e, F) { const k = (F.open ? 1 : 0) + "|" + F._lane + "|" + F._n + "|" + label(F) + "|" + JSON.stringify(F.details || ""); if (e._k === k) return; e._k = k;
      const det = F.details ? Object.keys(F.details).map(d => d + ": " + F.details[d]).join(" · ") : "";
      e.className = "gate" + (F.open ? " open" : "") + (F.name ? " named" : ""); e.style.cssText = "--c:" + COLORS[F._lane % 6] + ";margin-left:" + (2 + F._lane * 7) + "px";
      e.innerHTML = `<span class="gl"><i>${F.open ? "▾" : "▸"}</i> ${esc(label(F))}</span><span class="gn">${F.open ? "" : F._n + (F._n > 1 ? " lines" : " line")}${det ? (F.open ? "" : " · ") + esc(clip(det, 40)) : ""}</span><span class="gm" role="button" aria-label="More for this fold">⋯</span>`; } };
};

/* ================= doing it from the page ================= */
function after(r, line) { if (!r.ok) { Page.say(r.why); return false; } Page.render(); return true; }
function foldHere() {
  const c = Page.ctx(); if (!c.has) return; const multi = c.lines.length > 1 && !c.collapsed;
  const r = B.act("fold", multi ? { from: c.lines[0], to: c.lines[c.lines.length - 1] } : { from: c.line }); if (!after(r)) return;
  const lf = D().leaves[c.leaf], F = D().folds[r.fold], b = lf.lines.indexOf(F.to), a = lf.lines.indexOf(F.from), next = lf.lines[b + 1] || lf.lines[a - 1];
  if (next && !Page.TOUCH) Page.setCaret({ line: next, at: 0 }, true); else if (document.activeElement && document.activeElement.blur && Page.TOUCH) document.activeElement.blur();
  Page.toast("Folded " + r.lines + " line" + (r.lines > 1 ? "s" : "") + ". Tap the gate to open it.", "Name it", () => askName(r.fold));
}
function toggle(fid, open) { const F = D().folds[fid]; if (!F) return; const want = open == null ? !F.open : open, keep = Page.pos; const r = B.act("gate", { fold: fid, open: want }); if (!after(r)) return;
  if (keep && Page.lineOf(keep.line) && document.activeElement === Page.$("#pg")) Page.setCaret(keep, true); }
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
function foldMenu(fid, at) { const F = D().folds[fid]; if (!F) return; const items = [[F.open ? "Close" : "Open", () => toggle(fid)], [F.name ? "Rename…" : "Name this fold…", () => askName(fid)]];
  if (F.name) { items.push(["Details…", () => editDetails(fid)]); items.push(["Everything in “" + clip(F.name, 18) + "”", () => openName(F.name)]); }
  items.push(null); items.push(["Remove the fold (its lines stay)", () => { const r = B.act("unfold", { fold: fid }); if (after(r)) Page.toast("The fold is gone; its lines are all there.", "Undo", Page.doUndo); }]);
  Page.openMenu(at, items); }
Page.on("gate", (fid, target) => { if (target && target.closest && target.closest(".gm")) { const r = target.closest(".gm").getBoundingClientRect(); foldMenu(fid, { left: r.left - 180, top: r.top, bottom: r.bottom }); } else toggle(fid); });
Page.on("reveal", line => { const L = D().lines[line]; if (!L || !Mods.on("fold")) return; covering(L.in, line).forEach(F => { if (!F.open) B.act("gate", { fold: F.id, open: true }); }); });
/* Return at the end of a fold's last line keeps you inside the fold; Return on its empty last line steps out of it */
Page.on("enter", (L, a) => { if (!Mods.on("fold") || !L || a.at !== L.text.length) return; const ends = foldsOf(L.in).filter(F => F.open && F.to === L.id); if (!ends.length) return;
  if (!L.text && ends.every(F => F.from !== L.id)) { const lf = D().leaves[L.in], prev = lf.lines[lf.lines.indexOf(L.id) - 1]; B.begin("stepout"); ends.forEach(F => B.act("stretch", { fold: F.id, to: prev })); B.end(); Page.render(); Page.setCaret({ line: L.id, at: 0 }); return true; }
  B.sealUndo(); B.begin("foldline"); const r = B.act("write", { line: L.id, at: L.text.length, words: "\n" }); if (r.ok) ends.forEach(F => B.act("stretch", { fold: F.id, to: r.line })); B.end(); Page.render(); if (r.ok) { Page.setCaret(r.caret); Page.fire("typed", L.in); } return true; });
Page.bar({ id: "fold", mod: "fold", order: 20, label: "Fold", cls: "main", title: "Fold these lines behind a gate", show: c => c.has, run: foldHere });
Page.menu(c => { if (!c.has) return []; const fs = covering(c.leaf, c.line), out = []; if (!fs.length) return out; const F = fs[0], nm = "“" + clip(label(F), 16) + "”";
  out.push(["Close fold " + nm, () => toggle(F.id, false)]); out.push([F.name ? "Rename fold…" : "Name this fold…", () => askName(F.id)]); if (F.name) out.push(["Details of " + nm + "…", () => editDetails(F.id)]);
  out.push(["Remove fold " + nm + " (lines stay)", () => { const r = B.act("unfold", { fold: F.id }); if (after(r)) Page.setCaret({ line: c.line, at: c.at }, true); }]); if (fs.length > 1) out.push(["The other folds here…", () => openList()]); return out; }, "fold", 30);

/* ================= the fold list: ☰ → Folds ================= */
function openList() {
  Page.sheet("Folds", body => { const ns = names(), here = foldsOf(Page.leaf).filter(rangeOf);
    body.innerHTML = `<h2>Named folds, gathered across the book</h2><div class="rows">` + (ns.map(n => `<button class="rowi" data-name="${esc(n.name)}"><b>${esc(n.name)}</b><small>${n.n} piece${n.n === 1 ? "" : "s"}${n.rule ? " · also gathers “" + esc(n.rule) + "”" : ""}</small></button>`).join("") || `<div class="none">No named folds yet. Fold some lines, then name the fold (⋯ on its gate).</div>`) + `</div>
      <div class="row"><button id="flRule">Gather by a search…</button></div>
      <h2>Folds in “${esc(B.title(Page.leaf))}”</h2><div class="rows">` + (here.map(F => `<div class="rowi"><button class="go" data-go="${F.id}"><b>${esc(label(F))}</b><small>${F._n || (rangeOf(F).b - rangeOf(F).a + 1)} lines · ${F.open ? "open" : "closed"}</small></button><button class="mini" data-tg="${F.id}">${F.open ? "Close" : "Open"}</button></div>`).join("") || `<div class="none">No folds in this leaf.</div>`) + `</div>`;
    body.querySelectorAll("[data-name]").forEach(b => { b.onclick = () => openName(b.dataset.name); });
    body.querySelectorAll("[data-go]").forEach(b => { b.onclick = () => { const F = D().folds[b.dataset.go]; Page.go(F.leaf, F.from, { flash: true }); }; });
    body.querySelectorAll("[data-tg]").forEach(b => { b.onclick = () => { const F = D().folds[b.dataset.tg]; B.act("gate", { fold: F.id, open: !F.open }); Page.closeSheet(false); openList(); }; });
    body.querySelector("#flRule").onclick = () => { const nm = prompt("Name this gathering", ""); if (!nm || !nm.trim()) return; const q = prompt("Gather every line that has these words", ""); if (q == null) return; const r = B.act("gather", { name: nm.trim(), search: q }); if (!r.ok) return alert(r.why); openName(nm.trim()); }; });
}
function openName(name) {
  Page.sheet("“" + name + "”", body => { const draw = () => { const N = D().names[key(name)] || { name, keys: [] }, ps = pieces(name), hits = N.rule ? B.search(N.rule, 200) : [];
      body.innerHTML = `<p class="nt">Every fold named “${esc(N.name || name)}”, wherever it is in the book.</p><div class="rows">` + (ps.map(F => { const det = F.details ? Object.keys(F.details).map(d => d + ": " + F.details[d]).join(" · ") : ""; return `<div class="rowi"><button class="go" data-go="${F.id}"><b>${esc(B.title(F.leaf))}</b><small>${esc(clip(textOfFold(F).replace(/\n\s*/g, " / "), 90))}</small>${det ? `<small class="det">${esc(det)}</small>` : ""}</button><button class="mini" data-det="${F.id}">Details</button></div>`; }).join("") || `<div class="none">No fold has this name yet.</div>`) + `</div>` +
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
g.Fold = { foldsOf, rangeOf, pieces, names, covering, label, textOfFold, foldHere, toggle, askName, editDetails, openList, openName, key, instructionsFor: (leaf, line) => covering(leaf, line).map(F => F.name && D().names[key(F.name)] && D().names[key(F.name)].instructions ? { name: F.name, words: D().names[key(F.name)].instructions } : null).filter(Boolean) };
})(window);
