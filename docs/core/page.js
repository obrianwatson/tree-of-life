/* page.js · CORE · THE PAGE: what you see and touch.
   One leaf at a time: its lines (indented into branches), the cursor, the bar, the top row, menus, sheets.
   It never changes the book itself: every key, button and menu calls an action (book.js → Book.act).

   HOW TYPING STAYS LIGHT: each line is its own block. Typing inside a line is left to the browser, and only that
   one line is read back. Anything that touches more than one line (Return, joining lines, deleting across lines,
   pasting) is done through the book and then drawn. Drawing re-uses every line already on the screen.

   MODULES plug in here (see AGENTS.md):
     Page.bar(item)      a button in the bar            Page.menu(fn, mod)   items in a line's ⌄ menu
     Page.view(item)     an entry in the ☰ menu         Page.top(el, mod)    something in the top row
     Page.key(fn, mod)   a key handler                  Page.marker(item)    a small mark at the end of a line
     Page.on(what, fn)   "typed" | "moved" | "drawn" | "leaf" | "enter"      Page.layout = fn (Fold: what is hidden, the gates) */
(function () {
"use strict";
const Keep = window.Keep, Mods = window.Mods, lsGet = Keep.lsGet, lsSet = Keep.lsSet, UIK = Keep.K.ui;
const TOUCH = matchMedia("(pointer:coarse)").matches;
const $ = s => document.querySelector(s), el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const B = window.makeBook(Keep.store); Keep.attach(B); B.modOn = Mods.on; window.Book = B;
let ui = Object.assign({ leaf: null, spots: {}, nav: { list: [], i: -1 } }, lsGet(UIK) || {});
if (!B.D.leaves[ui.leaf] || !B.alive(ui.leaf)) ui.leaf = B.D.trunk;
const saveUi = () => lsSet(UIK, ui);

document.body.insertAdjacentHTML("beforeend", `
<div class="head" id="head">
  <div class="top" id="top"><button id="tMenu" aria-label="Menu">☰</button><button id="tBack" aria-label="Back">‹</button><button id="tFwd" aria-label="Forward">›</button>
    <div class="crumbs" id="crumbs"></div><span class="kept" id="kept"></span><span class="tr" id="topRight"></span></div>
  <div class="bar" id="bar"><div class="in" id="barIn"></div></div>
  <div class="strip hide" id="strip"></div>
</div>
<main class="col" id="col">
  <input class="ttl" id="ttl" type="text" autocomplete="off" autocapitalize="sentences" spellcheck="true" aria-label="The name of this leaf" enterkeyhint="next">
  <div class="pg" id="pg" contenteditable="true" spellcheck="true" autocapitalize="sentences" role="textbox" aria-multiline="true" aria-label="This leaf"></div>
  <div class="msg" id="msg"></div>
</main>
<button class="plus" id="plus" aria-label="New leaf">＋</button>
<div class="menu hide" id="menu" role="menu"></div>
<div class="sheet hide" id="sheet"><div class="sh"><button id="shBack" aria-label="Back">‹</button><b id="shT"></b><button id="shX">Done</button></div><div class="sb" id="shB"></div></div>
<div class="toast hide" id="toast"></div>
<div class="shield hide" id="shield"></div><div class="finger hide" id="finger"></div>`);
const pg = $("#pg"), head = $("#head"), bar = $("#bar"), menu = $("#menu"), ttl = $("#ttl");
let pos = null, sel = null, DEMO = false, composing = false, mt = null;
const say = t => { $("#msg").textContent = t || ""; clearTimeout(mt); if (t) mt = setTimeout(() => { $("#msg").textContent = ""; }, 6000); };
const lf = () => B.D.leaves[ui.leaf];
const focused = () => document.activeElement === pg;

/* ---------- what modules plug in ---------- */
const bars = [], menus = [], views = [], keys = [], markers = [], hooks = {};
const on = (what, fn, first) => { const h = hooks[what] = hooks[what] || []; if (first) h.unshift(fn); else h.push(fn); };
const fire = (what, a, b) => { let r; for (const fn of (hooks[what] || [])) { try { const x = fn(a, b); if (x === true) return true; if (x !== undefined) r = (typeof r === "string" && typeof x === "string") ? r + x : x; } catch (e) { console.error(e); } } return r; };       // (a hook that answers true has handled it: the rest aren't asked)
const live = m => !m || Mods.on(m);

/* a button that never takes the cursor or the keyboard away */
function press(b, fn) { b.addEventListener("pointerdown", e => e.preventDefault()); b.addEventListener("mousedown", e => e.preventDefault()); b.addEventListener("click", e => { e.preventDefault(); fn(e); }); }

/* ================= drawing a leaf ================= */
const els = new Map();                         // line id (or "g:" + fold id) → its element on the screen
function setText(e, text) { if (text) { const f = e.firstChild; if (f && f.nodeType === 3 && e.childNodes.length === 1) f.data = text; else e.textContent = text; } else e.innerHTML = "<br>"; e._t = text; }
const canonical = e => { const c = e.childNodes; return c.length === 1 ? (c[0].nodeType === 3 || c[0].nodeName === "BR") : (c.length === 2 && c[0].nodeType === 3 && c[1].nodeName === "BR"); };
function marksOf(L) { let s = ""; markers.forEach(m => { if (live(m.mod) && m.has(L)) s += m.glyph; }); return s; }
function render() {
  const leaf = lf(), lay = Page.layout && Mods.on("fold") ? Page.layout(leaf) : null, used = new Set(); let at = pg.firstChild;
  const put = e => { if (at === e) at = at.nextSibling; else pg.insertBefore(e, at); };
  if (lay && lay.gut) pg.style.setProperty("--gut", lay.gut + "px"); else pg.style.removeProperty("--gut");
  leaf.lines.forEach((id, i) => {
    if (lay && lay.gates[i]) lay.gates[i].forEach(F => { const key = "g:" + F.id; let e = els.get(key); if (!e) { e = el("div", "gate"); e.contentEditable = "false"; e.dataset.f = F.id; els.set(key, e); } lay.paintGate(e, F); used.add(key); put(e); });
    if (lay && lay.hidden[i]) return;
    const L = B.D.lines[id]; let e = els.get(id);
    if (!e) { e = el("div", "l"); e.dataset.id = id; e._t = null; els.set(id, e); }
    if (e._t !== L.text) setText(e, L.text);
    const m = marksOf(L), dk = lay ? lay.decor(i) : "", k = L.d + "|" + (L.by === "ai" ? 1 : L.by === "book" ? 2 : 0) + "|" + m + "|" + dk;
    if (e._k !== k) { e._k = k; e.className = "l" + (L.by === "ai" ? " by-ai" : L.by === "book" ? " by-book" : "") + (L.leaf ? " lf" : "") + (m ? " mk" : ""); e.style.cssText = "--d:" + L.d + (m ? ";--m:" + m.length : "") + (dk ? ";" + dk : ""); if (m) e.dataset.m = m; else delete e.dataset.m; }
    used.add(id); put(e);
  });
  while (at) { const n = at.nextSibling; pg.removeChild(at); at = n; }
  els.forEach((e, key) => { if (!used.has(key)) els.delete(key); });
  pg._n = pg.childNodes.length;
  paintTop(); paintBar(); fire("drawn", leaf);
}
function show(leafId) { ui.leaf = leafId; els.clear(); pg.textContent = ""; pos = null; sel = null; closeMenu(); render(); placeBar(); fire("leaf", leafId); }

/* ---------- the top row ---------- */
function paintTop() {
  const c = $("#crumbs"), p = B.path(ui.leaf); c.textContent = "";
  p.forEach((id, k) => { if (k) c.appendChild(el("i", "", "›")); const b = el("button", k === p.length - 1 ? "here" : "", B.title(id)); b.onclick = () => { if (id !== ui.leaf) go(id); else scrollTo({ top: 0, behavior: "smooth" }); }; c.appendChild(b); });
  c.scrollLeft = c.scrollWidth;
  const trunk = ui.leaf === B.D.trunk, t = B.title(ui.leaf);
  ttl.readOnly = trunk; ttl.classList.toggle("trunk", trunk); if (document.activeElement !== ttl || trunk) { const v = trunk ? "Trunk" : (B.D.lines[lf().parent] ? B.D.lines[lf().parent].text : t); if (ttl.value !== v) ttl.value = v; }
  $("#tBack").disabled = ui.nav.i <= 0; $("#tFwd").disabled = ui.nav.i >= ui.nav.list.length - 1;
  const k = $("#kept"); k.textContent = B.kept ? "" : "Not saved!"; k.classList.toggle("bad", !B.kept);
  $("#topRight").childNodes.forEach(e => { if (e.dataset) e.classList.toggle("hide", !live(e.dataset.mod)); });
}
ttl.addEventListener("input", () => { const leaf = lf(); if (!leaf.parent) return; const L = B.D.lines[leaf.parent]; if (!L) return; const v = ttl.value.replace(/\n/g, " ");
  const r = B.act("write", { line: L.id, at: 0, remove: L.text.length, words: v }); if (r.ok) { fire("typed", leaf.id); const c = $("#crumbs").lastChild; if (c) c.textContent = B.title(leaf.id); } });
ttl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); B.sealUndo(); setCaret({ line: lf().lines[0], at: 0 }); } });

/* ================= the cursor ================= */
function lineEl(n) { while (n && n !== pg) { if (n.nodeType === 1 && n.classList && n.classList.contains("l")) return n; n = n.parentNode; } return null; }
function offIn(e, node, off) {                 // how many letters into its line a place in the page is
  if (node === e) { let n = 0; for (let k = 0; k < off && k < e.childNodes.length; k++) n += e.childNodes[k].textContent.length; return n; }
  let n = node.nodeType === 3 ? off : 0; if (node.nodeType !== 3) for (let k = 0; k < off && k < node.childNodes.length; k++) n += node.childNodes[k].textContent.length;
  let w = node; while (w && w !== e) { let p = w.previousSibling; while (p) { n += p.textContent.length; p = p.previousSibling; } w = w.parentNode; }
  return n;
}
function point(node, off, endSide) {           // a place in the page → { line, at, i }
  let e = lineEl(node), at = 0;
  if (e) at = offIn(e, node, off);
  else {                                        // between lines, or on a gate: the nearest line
    let c = node === pg ? pg.childNodes[off] : node; while (c && c.parentNode !== pg) c = c.parentNode;
    let f = c; while (f && !(f.nodeType === 1 && f.classList.contains("l"))) f = f.nextSibling;
    if (f && !endSide) { e = f; at = 0; }
    else { let b = c ? c.previousSibling : pg.lastChild; while (b && !(b.nodeType === 1 && b.classList.contains("l"))) b = b.previousSibling; if (b) { e = b; at = (b._t || "").length; } else if (f) { e = f; at = 0; } }
  }
  if (!e || !B.D.lines[e.dataset.id]) return null;
  const id = e.dataset.id, len = e.textContent.length; return { line: id, at: Math.min(at, len), i: lf().lines.indexOf(id), el: e };
}
function readSel(range) {
  let a, b;
  if (range) { a = point(range.startContainer, range.startOffset, false); b = point(range.endContainer, range.endOffset, true); }
  else { const s = getSelection(); if (!s.rangeCount || !pg.contains(s.anchorNode)) return null; const r = s.getRangeAt(0); a = point(r.startContainer, r.startOffset, false); b = r.collapsed ? a : point(r.endContainer, r.endOffset, true); }
  if (!a || !b || a.i < 0 || b.i < 0) return null; if (b.i < a.i || (b.i === a.i && b.at < a.at)) { const t = a; a = b; b = t; }
  return { a, b, collapsed: a.line === b.line && a.at === b.at };
}
function setCaret(p, quiet) {
  let e = els.get(p.line); if (!e) { const leaf = lf(), i = leaf.lines.indexOf(p.line); if (i < 0) return false; fire("reveal", p.line); render(); e = els.get(p.line); if (!e) return false; }
  const L = B.D.lines[p.line], at = Math.max(0, Math.min(p.at == null ? L.text.length : p.at, L.text.length)), i = lf().lines.indexOf(p.line);
  pos = { leaf: ui.leaf, line: p.line, at }; sel = { a: i, b: i, collapsed: true };
  if (DEMO) { pg.querySelectorAll(".cur").forEach(x => x.classList.remove("cur")); e.classList.add("cur"); paintBar(); fire("moved", ctx()); return true; }
  const r = document.createRange(), t = e.firstChild; if (t && t.nodeType === 3) r.setStart(t, Math.min(at, t.length)); else r.setStart(e, 0); r.collapse(true);
  try { pg.focus({ preventScroll: true }); } catch (x) { pg.focus(); }
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  if (!quiet) keepInView(e); paintBar(); return true;
}
function keepInView(e) {                        // the line you're on stays between the top row and the bar
  e = e || (pos && els.get(pos.line)); if (!e) return; const rc = e.getBoundingClientRect(), v = window.visualViewport, top = head.getBoundingClientRect().bottom + 6, bot = (v ? v.height + v.offsetTop : innerHeight) - (getComputedStyle(bar).position === "fixed" ? bar.offsetHeight : 0) - 14;
  if (rc.bottom > bot) scrollBy({ top: rc.bottom - bot, behavior: rc.bottom - bot < 120 ? "smooth" : "auto" }); else if (rc.top < top) scrollBy({ top: rc.top - top, behavior: "auto" });
}
let selT = 0;
document.addEventListener("selectionchange", () => { if (DEMO || selT) return; selT = requestAnimationFrame(() => { selT = 0; const s = readSel(); if (!s) return;
  pos = { leaf: ui.leaf, line: s.b.line, at: s.b.at }; sel = { a: s.a.i, b: s.b.i, collapsed: s.collapsed }; paintBar(); fire("moved", ctx()); saveSpotSoon(); }); });
const ctx = () => { const leaf = lf(), a = sel ? Math.min(sel.a, sel.b) : -1, b = sel ? Math.max(sel.a, sel.b) : -1; return { leaf: ui.leaf, line: pos ? pos.line : null, at: pos ? pos.at : 0, a, b, lines: a >= 0 ? leaf.lines.slice(a, b + 1) : [], collapsed: !sel || sel.collapsed, has: !!(pos && B.D.lines[pos.line] && B.D.lines[pos.line].in === ui.leaf) }; };
let spotT = null;
function saveSpot() { clearTimeout(spotT); spotT = null; if (pos && pos.leaf === ui.leaf) ui.spots[ui.leaf] = { line: pos.line, at: pos.at, y: Math.round(scrollY) }; else if (ui.spots[ui.leaf]) ui.spots[ui.leaf].y = Math.round(scrollY); saveUi(); }
const saveSpotSoon = () => { if (!spotT) spotT = setTimeout(saveSpot, 600); };

/* ================= typing ================= */
let pend = null;                                // the line the browser is about to change
function hiddenBetween(i, j) { const lay = Page.layout && Mods.on("fold") ? Page.layout(lf()) : null; if (!lay) return false; for (let k = i; k <= j; k++) if (lay.hidden[k]) return true; return false; }
/* take away everything from a to z (across lines if it must) and put words there: one write */
function splice(a, z, words) {
  const leaf = lf(); if (a.i !== z.i && hiddenBetween(a.i, z.i)) { say("There's a closed fold in there. Open it first, or use Delete on the line."); return null; }
  let remove = -a.at + z.at; for (let k = a.i; k < z.i; k++) remove += B.D.lines[leaf.lines[k]].text.length + 1;
  const r = B.act("write", { line: a.line, at: a.at, remove, words: words || "" }); if (!r.ok) { say(r.why); return null; }
  if (r.structural) render(); else { const e = els.get(a.line); if (e) setText(e, B.D.lines[a.line].text); }
  setCaret(r.caret); fire("typed", ui.leaf); return r;
}
function lineChanged(e) {                       // the browser changed one line: read it back, tell the book
  const id = e.dataset.id, L = B.D.lines[id]; if (!L) return resync();
  const now = e.textContent; if (/[\n\r]/.test(now)) return resync();
  const old = L.text; if (now === old) { if (!canonical(e)) fixLine(e); return; }
  let p = 0; const max = Math.min(old.length, now.length); while (p < max && old.charCodeAt(p) === now.charCodeAt(p)) p++;
  let s = 0; while (s < max - p && old.charCodeAt(old.length - 1 - s) === now.charCodeAt(now.length - 1 - s)) s++;
  const r = B.act("write", { line: id, at: p, remove: old.length - p - s, words: now.slice(p, now.length - s) });
  if (!r.ok) { say(r.why); setText(e, old); return; }
  e._t = now; if (!canonical(e)) fixLine(e); if (L.leaf) paintTop(); fire("typed", ui.leaf);
}
function fixLine(e) { const s = getSelection(); let at = null; if (s.rangeCount && e.contains(s.anchorNode)) at = offIn(e, s.anchorNode, s.anchorOffset); const t = e.textContent; e._t = null; setText(e, t); if (at != null && focused()) setCaret({ line: e.dataset.id, at }, true); }
function resync() {                             // the page no longer matches the book line for line (dictation, an odd keyboard): read the whole page back as one change
  const leaf = lf(), lay = Page.layout && Mods.on("fold") ? Page.layout(leaf) : null, G = "\u0001";
  const dom = []; pg.childNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains("gate")) dom.push(G); else n.textContent.split(/\r?\n/).forEach(t => dom.push(t)); });
  const vis = [], mod = []; leaf.lines.forEach((id, i) => { if (lay && lay.gates[i]) lay.gates[i].forEach(() => { mod.push(G); vis.push(null); }); if (lay && lay.hidden[i]) return; mod.push(B.D.lines[id].text); vis.push(id); });
  const A = mod.join("\n"), Z = dom.join("\n"); if (A === Z) { render(); return; }
  let p = 0; const max = Math.min(A.length, Z.length); while (p < max && A.charCodeAt(p) === Z.charCodeAt(p)) p++;
  let s = 0; while (s < max - p && A.charCodeAt(A.length - 1 - s) === Z.charCodeAt(Z.length - 1 - s)) s++;
  const gone = A.slice(p, A.length - s), words = Z.slice(p, Z.length - s);
  if (gone.indexOf(G) >= 0 || words.indexOf(G) >= 0) { els.clear(); pg.textContent = ""; render(); return; }
  let k = 0, n = 0; while (k < mod.length - 1 && n + mod[k].length < p) { n += mod[k].length + 1; k++; }
  const id = vis[k]; els.clear(); pg.textContent = "";
  if (id) { const r = B.act("write", { line: id, at: p - n, remove: gone.length, words }); render(); if (r.ok) { setCaret(r.caret); fire("typed", ui.leaf); } else say(r.why); } else render();
}
function enter(s) {
  if (s.collapsed) { const L = B.D.lines[s.a.line]; if (fire("enter", L, s.a) === true) return; }
  B.sealUndo(); splice(s.a, s.b, "\n");
}
function backAtStart(a) {                       // Backspace at the very start of a line
  const leaf = lf(), L = B.D.lines[a.line];
  if (L.d > 0 && Mods.on("grow")) { const r = B.act("grow", { line: L.id, dir: -1 }); if (r.ok) { render(); setCaret({ line: L.id, at: 0 }); } return; }
  if (a.i === 0) return; if (hiddenBetween(a.i - 1, a.i - 1)) return say("The line above is inside a closed fold. Open the fold first.");
  const P = B.D.lines[leaf.lines[a.i - 1]]; if (L.leaf && P.leaf && L.text) return say("Both lines have a leaf of their own, so they can't be joined.");
  splice({ line: P.id, at: P.text.length, i: a.i - 1 }, { line: L.id, at: 0, i: a.i }, "");
}
pg.addEventListener("compositionstart", () => { composing = true; });
pg.addEventListener("compositionend", () => { composing = false; setTimeout(afterInput, 0); });
pg.addEventListener("beforeinput", e => {
  if (DEMO) return e.preventDefault(); if (composing || e.isComposing) return;
  const t = e.inputType || "";
  if (t === "historyUndo") { e.preventDefault(); return doUndo(); }
  if (t === "historyRedo" || t.indexOf("format") === 0 || t === "insertFromDrop" || t === "deleteByDrag") return e.preventDefault();
  let cur = readSel();
  if (!cur && pos && B.D.lines[pos.line] && B.D.lines[pos.line].in === ui.leaf && setCaret(pos, true)) cur = readSel();       // the browser lost the cursor (it happens after a blur): put it back where it was, so no key is swallowed
  if (!cur) return e.preventDefault();
  if (t === "insertParagraph" || t === "insertLineBreak") { e.preventDefault(); return enter(cur); }
  const del = t.indexOf("delete") === 0;
  if (del && cur.collapsed) {
    if (/Backward$/.test(t) && cur.a.at === 0) { e.preventDefault(); return backAtStart(cur.a); }
    if (/Forward$/.test(t) && cur.a.at === B.D.lines[cur.a.line].text.length) { e.preventDefault(); const leaf = lf(); if (cur.a.i >= leaf.lines.length - 1) return; if (hiddenBetween(cur.a.i + 1, cur.a.i + 1)) return say("The next line is inside a closed fold. Open the fold first."); const N = B.D.lines[leaf.lines[cur.a.i + 1]]; return void splice(cur.a, { line: N.id, at: 0, i: cur.a.i + 1 }, ""); }
  }
  let s = cur; const tr = e.getTargetRanges ? e.getTargetRanges() : null; if (tr && tr.length) { const x = readSel(tr[0]); if (x) s = x; }
  if (s.a.line === s.b.line) { pend = s.a.el; return; }                 // inside one line: the browser does it, then that line is read back
  e.preventDefault();
  let words = ""; if (!del) words = e.data != null ? e.data : (e.dataTransfer ? e.dataTransfer.getData("text/plain") : "");
  splice(s.a, s.b, words);
});
function afterInput() {
  if (composing) return; const s = getSelection(), e = (s.rangeCount && lineEl(s.anchorNode)) || pend; const p = pend; pend = null;
  if (pg.childNodes.length !== pg._n || !e || els.get(e.dataset.id) !== e) return resync();
  lineChanged(e); if (p && p !== e && p.isConnected && p.textContent !== p._t) lineChanged(p);
  if (TOUCH) keepInView(e);
}
pg.addEventListener("input", afterInput);
pg.addEventListener("paste", e => { e.preventDefault(); if (DEMO) return; const t = (e.clipboardData || window.clipboardData).getData("text/plain"); const s = readSel(); if (s && t) { B.sealUndo(); splice(s.a, s.b, t.replace(/\r\n?/g, "\n")); B.sealUndo(); } });
pg.addEventListener("drop", e => e.preventDefault());
function doUndo() { const keep = pos, r = B.undo(); if (!r) return say("Nothing to undo."); if (!B.D.leaves[ui.leaf] || !B.alive(ui.leaf)) ui.leaf = B.D.trunk; els.clear(); pg.textContent = ""; render(); const leaf = lf(); const line = r.key && B.D.lines[r.key] && B.D.lines[r.key].in === ui.leaf ? r.key : (keep && B.D.lines[keep.line] && B.D.lines[keep.line].in === ui.leaf ? keep.line : leaf.lines[0]); if (focused() || !TOUCH) setCaret({ line }); else paintBar(); fire("typed", null); }
pg.addEventListener("keydown", e => {
  if (DEMO) return;
  const mod = e.metaKey || e.ctrlKey, c = ctx();
  for (const k of keys) if (live(k.mod) && k.fn(e, c) === true) { e.preventDefault(); return; }
  if (mod && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); return doUndo(); }
  if (e.ctrlKey && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && c.has) { e.preventDefault(); return void doMove(e.key === "ArrowUp" ? "up" : "down"); }
  if (mod && e.key === "Enter" && c.has) { const L = B.D.lines[c.line]; if (L.leaf) { e.preventDefault(); go(L.leaf); } }
});
document.addEventListener("keydown", e => { if (e.target === pg || DEMO) return; for (const k of keys) if (k.global && live(k.mod) && k.fn(e, ctx()) === true) { e.preventDefault(); return; } });

/* ---------- taps on what isn't words: a gate, the marks at the end of a line ---------- */
function zone(e, x) {                           // which end-of-line mark an x lands on
  const L = B.D.lines[e.dataset.id]; if (!L) return null; const ms = markers.filter(m => live(m.mod) && m.has(L)); if (!ms.length) return null;
  const k = Math.floor((e.getBoundingClientRect().right - x) / 30); return k >= 0 && k < ms.length ? { m: ms[ms.length - 1 - k], L } : null;
}
function tapAt(target, x, y) {
  const gate = target.closest ? target.closest(".gate") : null; if (gate) { fire("gate", gate.dataset.f, target); return true; }
  const e = lineEl(target); if (e && e.dataset.m) { const z = zone(e, x); if (z) { z.m.tap(z.L, e); return true; } }
  return false;
}
let t0 = null;
pg.addEventListener("touchstart", e => { const t = e.touches[0]; t0 = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now(), target: e.target } : null; }, { passive: true });
pg.addEventListener("touchend", e => { if (!t0) return; const t = e.changedTouches[0], still = Math.abs(t.clientX - t0.x) < 10 && Math.abs(t.clientY - t0.y) < 10 && Date.now() - t0.at < 600; const s = t0; t0 = null; if (still && !DEMO && tapAt(s.target, t.clientX, t.clientY)) e.preventDefault(); });
pg.addEventListener("mousedown", e => { if (e.button === 0 && !DEMO && (e.target.closest(".gate") || (lineEl(e.target) && lineEl(e.target).dataset.m && zone(lineEl(e.target), e.clientX)))) e.preventDefault(); });
pg.addEventListener("click", e => { if (DEMO || e.detail === 0) return; if (tapAt(e.target, e.clientX, e.clientY)) e.preventDefault(); });
pg.addEventListener("contextmenu", e => { if (TOUCH || DEMO) return; const le = lineEl(e.target); if (!le) return; e.preventDefault(); const s = readSel(); if (!s || s.collapsed || !pos || le.dataset.id !== pos.line) setCaret({ line: le.dataset.id, at: 0 }, true); openMenu({ left: e.clientX, top: e.clientY, bottom: e.clientY }); });

/* ================= the bar and the ⌄ menu ================= */
function buildBar() {
  const box = $("#barIn"); box.textContent = ""; bars.sort((a, b) => a.order - b.order).forEach(it => {
    const b = it.make ? it.make() : el("button", it.cls || "", it.label); b.id = "b_" + it.id; if (it.title) { b.title = it.title; b.setAttribute("aria-label", it.title); } it.el = b; if (it.menu) b.dataset.menu = "1"; if (!it.make) press(b, e => { if (!DEMO) it.run(ctx(), b); }); box.appendChild(b); });
}
function paintBar() { const c = ctx(); bars.forEach(it => { if (!it.el) return; it.el.classList.toggle("hide", !live(it.mod) || (it.show ? !it.show(c) : false)); if (it.paint) it.paint(it.el, c); }); }
function menuItems() { const c = ctx(), out = []; menus.forEach(m => { if (!live(m.mod)) return; const its = m.fn(c); if (its && its.length) { if (out.length) out.push(null); its.forEach(i => out.push(i)); } }); return out; }
function openMenu(at, items) {
  menu.textContent = ""; (items || menuItems()).forEach(it => { if (!it) return menu.appendChild(el("hr")); const b = el("button", it[2] || "", it[0]); b.setAttribute("role", "menuitem"); press(b, () => { closeMenu(); it[1](); }); menu.appendChild(b); });
  if (!menu.childNodes.length) return; menu.classList.remove("hide"); const w = menu.offsetWidth, h = menu.offsetHeight, v = window.visualViewport, vh = v ? v.height + v.offsetTop : innerHeight;
  menu.style.left = Math.max(8, Math.min(at.left, innerWidth - w - 8)) + "px";
  const below = at.bottom + 6, above = at.top - h - 6; menu.style.top = Math.max(8, (at.fromBar && getComputedStyle(bar).position === "fixed") || (below + h > vh - 8 && above > 0) ? above : below) + "px";
}
function closeMenu() { menu.classList.add("hide"); }
document.addEventListener("pointerdown", e => { if (!menu.contains(e.target) && !e.target.closest("[data-menu]")) closeMenu(); });
/* The bar sits on the bottom edge of what you can SEE (the keyboard's top when it's up); measured from the top,
   because on the iPhone the "bottom" of the page stays behind the keyboard. */
function placeBar() { const v = window.visualViewport;
  if (!v || getComputedStyle(bar).position !== "fixed") { bar.classList.remove("up"); bar.style.transform = ""; return; }
  bar.classList.add("up"); bar.classList.toggle("kb", document.documentElement.clientHeight - v.height > 120);
  bar.style.transform = "translateY(" + Math.round(v.offsetTop + v.height - bar.offsetHeight) + "px)"; }
if (window.visualViewport) { visualViewport.addEventListener("resize", () => { placeBar(); closeMenu(); setTimeout(() => { if (focused()) keepInView(); }, 60); }); visualViewport.addEventListener("scroll", placeBar); }
addEventListener("resize", placeBar); addEventListener("scroll", placeBar, { passive: true });
pg.addEventListener("focus", () => { document.body.classList.add("typing"); placeBar(); }); pg.addEventListener("blur", () => { document.body.classList.remove("typing"); });

/* ================= moving around: leaves, Back and Forward ================= */
function go(leafId, line, o) {
  o = o || {}; if (!B.D.leaves[leafId] || !B.alive(leafId)) { say("That leaf isn't there any more."); return false; }
  if (leafId !== ui.leaf) { saveSpot(); if (!o.nav) { ui.nav.list = ui.nav.list.slice(0, ui.nav.i + 1); if (ui.nav.list[ui.nav.list.length - 1] !== ui.leaf) ui.nav.list.push(ui.leaf); ui.nav.list.push(leafId); if (ui.nav.list.length > 60) ui.nav.list = ui.nav.list.slice(-60); ui.nav.i = ui.nav.list.length - 1; } show(leafId); saveUi(); }
  closeSheet(true);
  const spot = line ? { line, at: o.at } : ui.spots[leafId];
  if (spot && spot.line && B.D.lines[spot.line] && B.D.lines[spot.line].in === leafId) {
    fire("reveal", spot.line); if (!els.get(spot.line)) render(); const e = els.get(spot.line);
    if (e) { const rc = e.getBoundingClientRect(), h = innerHeight; if (rc.top < head.getBoundingClientRect().bottom + 10 || rc.bottom > h - 100) scrollTo(0, Math.max(0, scrollY + rc.top - h * 0.35)); if (line || o.flash) { e.classList.remove("flash"); void e.offsetWidth; e.classList.add("flash"); } }
    if (!TOUCH || o.caret) setCaret(spot, true); else { pos = { leaf: leafId, line: spot.line, at: spot.at || 0 }; const i = lf().lines.indexOf(spot.line); sel = { a: i, b: i, collapsed: true }; paintBar(); }
  } else scrollTo(0, 0);
  fire("moved", ctx()); return true;
}
function step(d) { const n = ui.nav.i + d; if (n < 0 || n >= ui.nav.list.length) return; ui.nav.i = n; const id = ui.nav.list[n]; if (B.D.leaves[id] && B.alive(id)) go(id, null, { nav: true }); else step(d); saveUi(); }
$("#tBack").onclick = () => step(-1); $("#tFwd").onclick = () => step(1);
/* a new leaf, like a new note: a new line at the end of the leaf you're on, lifted, opened, ready for its name */
function newLeaf() {                                  // a new leaf: a new line at the end of this leaf, with its own leaf (its name is that line)
  const r = B.act("leaf", { under: lf().id }); if (!r.ok) return say(r.why); go(r.leaf); ttl.focus();
}
$("#plus").onclick = newLeaf;

/* ================= the core's own buttons and menu items ================= */
function doMove(dir) { const c = ctx(); if (!c.has) return; const r = B.act("move", { line: c.line, dir }); if (!r.ok) return say(r.why); render(); setCaret({ line: c.line, at: c.at }); }
function doDelete() { const c = ctx(); if (!c.has) return; const leaf = lf(), i = leaf.lines.indexOf(c.line), n = B.branchEnd(leaf, i) - i, L = B.D.lines[c.line];
  const r = B.act("prune", { line: c.line }); if (!r.ok) return say(r.why); render(); if (focused() || !TOUCH) setCaret({ line: r.line }); else { pos = null; paintBar(); }
  toast("Deleted “" + (L ? L.text.slice(0, 24) : "") + "”" + (n > 1 ? " and its branch" : "") + ". It's kept under ☰ → Deleted.", "Undo", doUndo); }
function moveTo() { const c = ctx(); if (!c.has) return; pickLeaf("Move to which leaf?", id => { const r = B.act("move", { line: c.line, leaf: id }); if (!r.ok) return say(r.why); render(); toast("Moved to “" + B.title(id) + "”.", "Undo", doUndo); }, c.line); }
function pickLeaf(title, fn, movingLine) {       // choose a leaf from the whole book
  sheet(title, body => { let q = ""; const draw = () => { const ids = B.leaves().filter(id => !q || B.title(id).toLowerCase().indexOf(q) >= 0);
      list.innerHTML = ids.map(id => `<button class="rowi" data-id="${id}"><b>${esc(B.title(id))}</b><small>${esc(B.path(id).slice(0, -1).map(B.title).join(" › ") || "the start of the book")}</small></button>`).join("") || `<div class="none">No leaf by that name.</div>`;
      list.querySelectorAll("[data-id]").forEach(b => { b.onclick = () => { closeSheet(true); fn(b.dataset.id); }; }); };
    const inp = el("input"); inp.type = "search"; inp.placeholder = "Find a leaf"; inp.oninput = () => { q = inp.value.trim().toLowerCase(); draw(); }; body.appendChild(inp); const list = el("div", "rows"); body.appendChild(list); draw(); });
}
bars.push({ id: "more", order: 40, label: "⌄", cls: "more", menu: true, title: "More for this line", show: c => c.has, run: (c, b) => { if (!menu.classList.contains("hide")) return closeMenu(); const r = b.getBoundingClientRect(); openMenu({ left: r.left, top: r.top, bottom: r.bottom, fromBar: true }); } });
bars.push({ id: "undo", order: 50, label: "Undo", title: "Undo", run: doUndo, paint: b => { b.disabled = !B.canUndo(); } });
menus.push({ order: 50, fn: c => c.has ? [["Move up", () => doMove("up")], ["Move down", () => doMove("down")], ["Move to…", moveTo], ["Delete", doDelete]] : [] });
markers.push({ order: 90, mod: null, glyph: "›", has: L => !!L.leaf && !!B.D.leaves[L.leaf], tap: L => go(L.leaf) });       // a line with a leaf of its own: tap › to open it
views.push({ order: 0, label: "Trunk (the start of the book)", open: () => go(B.D.trunk) });
views.push({ order: 1, label: "New leaf here", open: () => newLeaf() });
views.push({ order: 80, label: "Deleted", open: () => sheet("Deleted", body => {
  const draw = () => { const ps = B.D.pruned.slice().reverse(); body.innerHTML = `<p class="nt">Everything deleted is kept here, whole, so it can be brought back.</p><div class="rows">` + (ps.map(p => `<div class="rowi"><span class="go"><b>${esc(p.name)}</b><small>${esc(new Date(p.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))} · from “${esc(B.D.leaves[p.leaf] ? B.title(p.leaf) : "a leaf")}”${p.lines.length > 1 ? " · " + p.lines.length + " lines" : ""}</small></span><button class="mini put" data-id="${p.id}">Bring back</button></div>`).join("") || `<div class="none">Nothing has been deleted.</div>`) + `</div>`;
    body.querySelectorAll("[data-id]").forEach(b => { b.onclick = () => { const r = B.act("restore", { id: b.dataset.id }); if (!r.ok) return alert(r.why); go(r.leaf, r.line); }; }); }; draw(); }) });
views.push({ order: 82, label: "Rings (earlier versions of this leaf)", open: () => sheet("Rings of “" + B.title(ui.leaf) + "”", body => {
  body.innerHTML = `<p class="nt">Loading…</p>`; Keep.rings(ui.leaf).then(list => { const when = t => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    body.innerHTML = `<p class="nt">Before a leaf changes, the leaf as it was is kept here on this device. Bringing a ring back makes a NEW leaf beside this one, so nothing is written over.</p><div class="rows">` + (list.map((v, i) => `<div class="rowi"><span class="go"><b>${esc(when(v.at))}</b><small>${esc(v.why || "")} · ${v.piece.leaf.lines.length} lines</small></span><button class="mini put" data-v="${i}">Bring back</button></div>`).join("") || `<div class="none">No rings yet for this leaf. They start being kept as you write.</div>`) + `</div>`;
    body.querySelectorAll("[data-v]").forEach(b => { b.onclick = () => { const v = list[+b.dataset.v], id = B.copyIn(v.piece, "(as it was " + when(v.at) + ")"); go(id); }; }); }); }) });
$("#tMenu").dataset.menu = "1";
press($("#tMenu"), () => { if (!menu.classList.contains("hide")) return closeMenu(); const r = $("#tMenu").getBoundingClientRect(); openMenu({ left: r.left, top: r.top, bottom: r.bottom }, views.filter(v => live(v.mod)).sort((a, b) => a.order - b.order).map(v => [v.label, v.open])); });

/* ================= sheets (a full view over the page) and the toast ================= */
const stack = [];
function sheet(title, build, o) { stack.push({ title, build, o: o || {} }); drawSheet(); }
function drawSheet() { const s = stack[stack.length - 1], sh = $("#sheet"); if (!s) { sh.classList.add("hide"); document.body.classList.remove("sheet-open"); placeBar(); return; }
  if (document.activeElement && document.activeElement.blur && sh.classList.contains("hide")) document.activeElement.blur();
  $("#shT").textContent = s.title; $("#shBack").classList.toggle("hide", stack.length < 2); const body = $("#shB"); body.textContent = ""; body.scrollTop = 0; sh.classList.remove("hide"); document.body.classList.add("sheet-open"); s.build(body, s); }
function closeSheet(all) { if (!stack.length) return; if (all) stack.length = 0; else stack.pop(); drawSheet(); if (!stack.length) { render(); } }
$("#shBack").onclick = () => closeSheet(false); $("#shX").onclick = () => closeSheet(true);
let toastT = null;
function toast(text, label, fn) { const t = $("#toast"); t.textContent = ""; t.appendChild(el("span", "", text)); if (label) { const b = el("button", "", label); b.onclick = () => { t.classList.add("hide"); fn(); }; t.appendChild(b); } t.classList.remove("hide"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hide"), label ? 7000 : 3500); }

/* ================= start ================= */
function refresh() { buildBar(); render(); placeBar(); }
function start() {
  const tr = B.D.leaves[B.D.trunk];                // a brand-new book: the trunk gets a Seeds leaf (for ideas not planted yet)
  if (Object.keys(B.D.leaves).length === 1 && tr.lines.length === 1 && !B.D.lines[tr.lines[0]].text) { const l = tr.lines[0]; B.act("leaf", { under: tr.id, name: "Seeds" }); B.act("write", { line: l, words: "\n" }); B.clearUndo(); ui.leaf = B.D.trunk; }
  refresh();
  try { history.scrollRestoration = "manual"; } catch (e) {}
  const spot = ui.spots[ui.leaf]; if (spot && spot.line && B.D.lines[spot.line] && B.D.lines[spot.line].in === ui.leaf) { fire("reveal", spot.line); const e = els.get(spot.line); if (e) { const rc = e.getBoundingClientRect(); if (rc.bottom > innerHeight - 100) scrollTo(0, Math.max(0, scrollY + rc.top - innerHeight * 0.4)); e.classList.add("flash"); } if (!TOUCH) setCaret(spot, true); else { pos = { leaf: ui.leaf, line: spot.line, at: spot.at || 0 }; const i = lf().lines.indexOf(spot.line); sel = { a: i, b: i, collapsed: true }; paintBar(); } }
  else if (!TOUCH) setCaret({ line: lf().lines[0], at: 0 }, true);
  fire("leaf", ui.leaf);
}
Mods.changed(() => { const had = focused() && pos; els.clear(); pg.textContent = ""; refresh(); if (had && B.D.lines[had.line] && B.D.lines[had.line].in === ui.leaf) setCaret(had, true); });      // (a switch flipped while the cursor is in the page: the cursor stays where it was)
/* The book changed under the page (the AI, a command, another device, a rescue copy): draw again and keep your place. */
let drawT = 0;
function redraw() { if (drawT) return; drawT = requestAnimationFrame(() => { drawT = 0; if (!B.D.leaves[ui.leaf] || !B.alive(ui.leaf)) { show(B.D.trunk); return; } const keep = pos, had = focused(); render(); if (keep && had && B.D.lines[keep.line] && B.D.lines[keep.line].in === ui.leaf) setCaret(keep, true); }); }
B.on(ev => { if (ev.dry) return; if ((ev.type === "action" && ev.who !== "me") || ev.type === "replace") redraw(); });
Keep.rescue().then(D => { if (D) { B.replace(D); toast("Your last save didn't fit in this device's storage. The rescue copy was brought back."); } });
document.addEventListener("visibilitychange", () => { if (document.hidden) { B.flush(); saveSpot(); } });
addEventListener("pagehide", () => { B.flush(); saveSpot(); });
let lastType = 0; on("typed", () => { lastType = Date.now(); });

function demoSelect(a, b) { const leaf = lf(), i = leaf.lines.indexOf(a), j = leaf.lines.indexOf(b); pos = { leaf: ui.leaf, line: b, at: 0 }; sel = { a: i, b: j, collapsed: false }; pg.querySelectorAll(".cur").forEach(x => x.classList.remove("cur")); leaf.lines.slice(i, j + 1).forEach(l => { const e = els.get(l); if (e) e.classList.add("cur"); }); paintBar(); }
window.Page = { B, TOUCH, demoSelect, el, esc, press, $, on, fire, say, toast, sheet, closeSheet, openMenu, closeMenu, menuItems, render, redraw, refresh, start, show, go, step, newLeaf, setCaret, keepInView, ctx, readSel, doUndo, doMove, doDelete, pickLeaf, placeBar, saveSpot, paintBar, paintTop, lineOf: id => els.get(id),
  bar: it => bars.push(it), menu: (fn, mod, order) => { menus.push({ fn, mod, order: order || 50 }); menus.sort((a, b) => a.order - b.order); }, view: v => views.push(v), key: (fn, mod, global) => keys.push({ fn, mod, global }), marker: m => { markers.push(m); markers.sort((a, b) => a.order - b.order); }, top: (e, mod, order) => { e.dataset.mod = mod || ""; e.style.order = order || 5; $("#topRight").appendChild(e); },
  layout: null, get leaf() { return ui.leaf; }, get pos() { return pos; }, get sel() { return sel; }, get ui() { return ui; }, set ui(u) { ui = u; saveUi(); }, get idle() { return Date.now() - lastType; }, get typing() { return composing || Date.now() - lastType < 4000; },
  get demo() { return DEMO; }, set demo(v) { DEMO = !!v; pg.querySelectorAll(".cur").forEach(x => x.classList.remove("cur")); if (v && document.activeElement && document.activeElement.blur) document.activeElement.blur(); closeMenu(); } };
})();
