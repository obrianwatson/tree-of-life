/* The page: what you see and touch. It never changes the book itself: every button, menu and key
   calls the action layer (core.js → Book.act). The view only draws, listens, and keeps the caret. */
(function () {
"use strict";
const P = window.PIECES[window.TRIAL_PIECE], F = P.flags, KEY = "bolw-trial-" + P.id;
const TOUCH = matchMedia("(pointer:coarse)").matches;
const $ = s => document.querySelector(s), el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const B = window.makeBook({ load: () => lsGet(KEY), save: d => lsSet(KEY, d) });
let ui = lsGet(KEY + "-ui") || { view: F.notes && P.startList ? "list" : "note", spots: {} };
if (!Object.keys(B.D.notes).length) { P.seed(B); B.clearUndo(); B.flush(); ui = { view: F.notes && P.startList ? "list" : "note", spots: {} }; }
window.Book = B;                                   // (so a test, and later the breath, can reach the same joints)

document.body.insertAdjacentHTML("beforeend", `
<div class="head" id="head">
  <div class="task"><div class="tl"><b id="tN"></b><span class="sp" id="tT"></span><button id="tMore">Hide</button><button id="tNext">Next</button></div><div class="td" id="tD"></div></div>
  <div class="bar" id="bar"><div class="in">
    <button class="main hide" id="bFold">Fold</button><button class="more hide" id="bMore" aria-label="More for this line">⌄</button><button id="bUndo" disabled>Undo</button>
    <button class="hold hide" id="hold">Hold</button></div></div>
  <div class="path hide" id="path"></div>
</div>
<div class="app fade" id="app"><main class="col">
  <div class="listv hide" id="listv"></div>
  <div class="notev" id="notev">
    <div class="top" id="top"><button class="notesBtn hide" id="notesBtn">‹ Notes</button><span class="mid"><span class="kept" id="kept"></span><span id="clock"></span></span><span class="spark-slot" aria-hidden="true"></span></div>
    <div class="pg" id="pg"></div><div class="msg" id="msg"></div>
  </div></main><aside class="side-slot" aria-hidden="true"></aside></div>
<button class="newNote hide" id="newNote">New note</button>
<div class="menu hide" id="menu" role="menu"></div>
<div class="shield hide" id="shield"></div><div class="cur hide" id="cur"></div>`);
const pg = $("#pg"), bar = $("#bar"), menu = $("#menu"), head = $("#head");
const COLORS = ["#2f6fb5", "#1d9e75", "#d85a30", "#7f77dd", "#ba7517", "#d4537e"], color = d => COLORS[(d - 1) % COLORS.length];
const maxIndent = () => innerWidth < 520 ? 4 : innerWidth < 900 ? 7 : 10;      // past this depth the indent stops growing; the thread colors carry on
let pos = null, sel = null, DEMO = false, demoSel = null, composing = false, mt = null;
const say = t => { $("#msg").textContent = t || ""; clearTimeout(mt); if (t) mt = setTimeout(() => { $("#msg").textContent = ""; }, 5000); };
/* a button that never takes the caret or the keyboard away */
function press(b, fn) {          // (the press never lands as a focus change: the caret stays in the text, and the action runs on the click)
  b.addEventListener("pointerdown", e => e.preventDefault()); b.addEventListener("mousedown", e => e.preventDefault());
  b.addEventListener("click", e => { e.preventDefault(); fn(e); }); }

/* ================= drawing ================= */
function lanes(box) {          // which folds sit on which lines; folds that overlap get their own lane so each shows distinctly
  const bx = B.D.boxes[box], fs = B.foldsIn(box).map(f => ({ f, a: bx.lines.indexOf(f.from), b: bx.lines.indexOf(f.to) })).filter(x => x.a >= 0 && x.b >= x.a);
  fs.sort((x, y) => x.a - y.a || x.f.at - y.f.at);
  fs.forEach((x, i) => { let k = 0; while (fs.slice(0, i).some(y => y.lane === k && y.b >= x.a)) k++; x.lane = k; });
  return fs;
}
function fill(pc, fs) {        // one stretch of lines, as editable text
  const box = pc.dataset.box, bx = B.D.boxes[box], i0 = +pc.dataset.i0, n = +pc.dataset.n, d = +pc.dataset.depth;
  fs = fs || lanes(box); pc.textContent = "";
  let lastHinge = false;
  for (let i = i0; i < i0 + n; i++) {
    const L = B.D.lines[bx.lines[i]], sp = el("span", "l" + (L.by !== "me" ? " by-ai" : "") + (d === 0 && i === 0 ? " ttl" : "")); sp.dataset.id = L.id;
    let inner = sp;
    fs.filter(x => x.a <= i && i <= x.b).sort((x, y) => x.lane - y.lane).forEach(x => { const c = el("span", "cv cv" + Math.min(x.lane, 3)); c.style.textDecorationColor = color(d + 1); inner.appendChild(c); inner = c; });
    if (L.text) inner.appendChild(document.createTextNode(L.text));
    pc.appendChild(sp);
    const ends = fs.filter(x => x.b === i).sort((x, y) => x.lane - y.lane); lastHinge = ends.length > 0;
    ends.forEach(x => { const h = el("span", "hg lane" + Math.min(x.lane, 2)); h.contentEditable = "false"; h.dataset.f = x.f.id; h.textContent = x.f.open ? "▾" : "▸"; h.style.color = color(d + 1);
      h.setAttribute("role", "button"); h.setAttribute("aria-label", (x.f.open ? "Close fold: " : "Open fold: ") + B.foldName(x.f.id)); pc.appendChild(h); });
    if (i < i0 + n - 1) pc.appendChild(document.createTextNode("\n"));
  }
  if (needsBr(pc, lastHinge)) pc.appendChild(el("br"));
}
function needsBr(pc, lastHinge) { const bx = B.D.boxes[pc.dataset.box], n = +pc.dataset.n, last = B.D.lines[bx.lines[+pc.dataset.i0 + n - 1]]; return n > 1 && !last.text && !lastHinge; }
function drawBox(box, d) {
  const bx = B.D.boxes[box], wrap = el("div", "bx"), fs = lanes(box);
  let s = 0;
  for (let i = 0; i < bx.lines.length; i++) {
    const open = fs.filter(x => x.b === i && x.f.open);
    if (!open.length && i < bx.lines.length - 1) continue;
    const pc = el("div", "pc"); pc.contentEditable = "true"; pc.spellcheck = true; pc.setAttribute("autocapitalize", "sentences");
    pc.dataset.box = box; pc.dataset.i0 = s; pc.dataset.n = i - s + 1; pc.dataset.depth = d; fill(pc, fs); wrap.appendChild(pc);
    open.forEach(x => { const fb = el("div", "fb" + (d + 1 > maxIndent() ? " flat" : "")); fb.dataset.f = x.f.id; fb.style.setProperty("--c", color(d + 1));
      const th = el("div", "th"); th.dataset.f = x.f.id; th.setAttribute("role", "button"); th.setAttribute("aria-label", "Close fold: " + B.foldName(x.f.id)); fb.appendChild(th);
      fb.appendChild(drawBox(x.f.id, d + 1)); wrap.appendChild(fb); });
    s = i + 1;
  }
  return wrap;
}
function renderNote() {
  if (!B.D.notes[B.D.current]) { const first = B.notes()[0]; B.act("open_note", { note: first ? first.id : "new" }); B.clearUndo(); }
  pg.textContent = ""; pg.appendChild(drawBox(B.D.current, 0)); marks(); paintBar();
}
function marks() { if (!DEMO) return; pg.querySelectorAll(".act").forEach(e => e.classList.remove("act"));
  const m = id => { const e = pg.querySelector('.l[data-id="' + id + '"]'); if (e) e.classList.add("act"); };
  if (demoSel) { const bx = B.D.boxes[demoSel.where]; if (bx) for (let i = demoSel.a; i <= demoSel.b; i++) m(bx.lines[i]); } else if (pos) m(pos.line); }
function render() {
  const list = !!F.notes && ui.view === "list";
  $("#listv").classList.toggle("hide", !list); $("#notev").classList.toggle("hide", list); $("#newNote").classList.toggle("hide", !list);
  bar.classList.toggle("hide", list); $("#notesBtn").classList.toggle("hide", !F.notes);
  if (list) { hidePath(); renderList(); } else renderNote();
  placeBar();
}

/* ================= where the caret is ================= */
const stripped = frag => { frag.querySelectorAll(".hg,br").forEach(x => x.remove()); return frag.textContent; };     // hinges are not words
const pieceText = pc => stripped(pc.cloneNode(true));
function absLen(pc, node, off) { const r = document.createRange(); r.setStart(pc, 0); try { r.setEnd(node, off); } catch (e) { return pieceText(pc).length; } return stripped(r.cloneContents()).length; }
const pieceLines = pc => { const bx = B.D.boxes[pc.dataset.box], i0 = +pc.dataset.i0; return bx.lines.slice(i0, i0 + (+pc.dataset.n)); };
const modelText = pc => pieceLines(pc).map(id => B.D.lines[id].text).join("\n");
function locate(pc, abs) { const ids = pieceLines(pc), i0 = +pc.dataset.i0; let a = abs;
  for (let k = 0; k < ids.length; k++) { const len = B.D.lines[ids[k]].text.length; if (a <= len || k === ids.length - 1) return { where: pc.dataset.box, idx: i0 + k, line: ids[k], at: Math.min(a, len) }; a -= len + 1; } }
function pieceOf(where, line) { const idx = B.D.boxes[where] ? B.D.boxes[where].lines.indexOf(line) : -1; if (idx < 0) return null;
  return [...pg.querySelectorAll(".pc")].find(p => p.dataset.box === where && idx >= +p.dataset.i0 && idx < +p.dataset.i0 + (+p.dataset.n)) || null; }
function pointIn(pc, line, at) {        // the spot in the page for (line, letter)
  const sp = [...pc.querySelectorAll(".l")].find(s => s.dataset.id === line); if (!sp) return null;
  const w = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT); let n, last = null, a = at;
  while ((n = w.nextNode())) { if (a <= n.length) return [n, a]; a -= n.length; last = n; }
  if (last) return [last, last.length];
  let inner = sp; while (inner.firstElementChild) inner = inner.firstElementChild; return [inner, 0];
}
function setCaret(c, quiet) {
  if (!c) return false; const pc = pieceOf(c.where, c.line); if (!pc) return false;
  pos = { where: c.where, line: c.line, at: Math.max(0, Math.min(c.at || 0, B.D.lines[c.line].text.length)) }; const idx = B.D.boxes[c.where].lines.indexOf(c.line);
  if (!(DEMO && demoSel)) sel = { where: c.where, a: idx, b: idx };
  if (DEMO) { marks(); paintBar(); return true; }
  const pt = pointIn(pc, c.line, pos.at); if (!pt) return false;
  const put = () => { const r = document.createRange(); r.setStart(pt[0], pt[1]); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  if (!quiet) pc.focus({ preventScroll: true });
  put();
  if (!quiet && document.activeElement !== pc) setTimeout(() => { if (pc.isConnected && document.activeElement !== pc) { pc.focus({ preventScroll: true }); put(); } }, 0);     // some browsers settle focus a beat later
  requestAnimationFrame(keepInView); paintBar(); return true;
}
function selAbs(pc) { const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0); if (!pc.contains(r.startContainer) || !pc.contains(r.endContainer)) return null;
  return { a: absLen(pc, r.startContainer, r.startOffset), b: absLen(pc, r.endContainer, r.endOffset) }; }
const pcOf = node => { const e = node && (node.nodeType === 1 ? node : node.parentElement); return e ? e.closest(".pc") : null; };
let spotT = null;
document.addEventListener("selectionchange", () => {
  if (DEMO) return; const s = getSelection(); if (!s.rangeCount) return; const pc = pcOf(s.anchorNode); if (!pc || !pg.contains(pc)) return;
  const r = s.getRangeAt(0), same = pc.contains(r.startContainer) && pc.contains(r.endContainer);
  const A = locate(pc, same ? absLen(pc, r.startContainer, r.startOffset) : absLen(pc, s.anchorNode, s.anchorOffset));
  let Z = same ? locate(pc, absLen(pc, r.endContainer, r.endOffset)) : A;
  let b = Z.idx; if (!s.isCollapsed && Z.at === 0 && b > A.idx) b--;          // a highlight that stops at the very start of a line doesn't touch that line
  sel = { where: A.where, a: A.idx, b }; const fc = pcOf(s.focusNode) === pc ? locate(pc, absLen(pc, s.focusNode, s.focusOffset)) : A; pos = { where: fc.where, line: fc.line, at: fc.at };
  paintBar(); clearTimeout(spotT); spotT = setTimeout(saveSpot, 300);
});
function saveSpot() { if (ui.view !== "list" && B.D.current) ui.spots[B.D.current] = Object.assign({}, ui.spots[B.D.current], pos, { y: scrollY }); lsSet(KEY + "-ui", ui); }
addEventListener("scroll", () => { clearTimeout(spotT); spotT = setTimeout(saveSpot, 300); }, { passive: true });
function keepInView() { const s = getSelection(); if (!s.rangeCount || !pg.contains(s.anchorNode)) return; const r = s.getRangeAt(0).cloneRange(); r.collapse(false);
  let rc = r.getClientRects()[0]; if (!rc) { const e = pcOf(s.anchorNode); rc = e && e.getBoundingClientRect(); } if (!rc) return;
  const v = window.visualViewport, fixedBar = getComputedStyle(bar).position === "fixed" && !bar.classList.contains("hide");
  const bottom = (fixedBar ? bar.getBoundingClientRect().top : (v ? v.height + v.offsetTop : innerHeight)) - 12, topLimit = Math.max(head.getBoundingClientRect().bottom, v ? v.offsetTop : 0) + 8;
  const by = rc.bottom > bottom ? rc.bottom - bottom + 4 : rc.top < topLimit ? rc.top - topLimit - 4 : 0;
  if (by) scrollBy({ top: by, behavior: Math.abs(by) < 160 ? "smooth" : "auto" }); }      // a line at a time glides; a long way jumps

/* ================= writing: the page tells the layer what was typed ================= */
function canonical(pc) {
  const ids = pieceLines(pc), sp = pc.querySelectorAll(".l"); if (sp.length !== ids.length) return false;
  for (let k = 0; k < ids.length; k++) { const L = B.D.lines[ids[k]]; if (sp[k].dataset.id !== ids[k] || sp[k].textContent !== L.text || sp[k].classList.contains("by-ai") !== (L.by !== "me")) return false; }
  let nl = 0, br = 0; for (const c of pc.childNodes) { if (c.nodeType === 3) { if (c.nodeValue !== "\n") return false; nl++; } else if (c.nodeName === "BR") br++; else if (!c.classList || !(c.classList.contains("l") || c.classList.contains("hg"))) return false; }
  const lastHinge = pc.lastElementChild && (pc.lastElementChild.classList.contains("hg") || (pc.lastElementChild.nodeName === "BR" && pc.lastElementChild.previousElementSibling && pc.lastElementChild.previousElementSibling.classList.contains("hg")));
  return nl === ids.length - 1 && br === (needsBr(pc, !!lastHinge) ? 1 : 0);
}
function grew(pc, before) {   // the box has more or fewer lines now: this piece and the ones after it move along
  const box = pc.dataset.box, delta = B.D.boxes[box].lines.length - before; if (!delta) return;
  pc.dataset.n = +pc.dataset.n + delta; pg.querySelectorAll(".pc").forEach(p => { if (p !== pc && p.dataset.box === box && +p.dataset.i0 > +pc.dataset.i0) p.dataset.i0 = +p.dataset.i0 + delta; });
}
function typedHere(pc, a, remove, words, caretAfter) {
  const before = B.D.boxes[pc.dataset.box].lines.length, at = locate(pc, a);
  const r = B.act("write", { where: at.where, line: at.line, at: at.at, remove, words });
  if (!r.ok) { fill(pc); say(r.why); return null; }
  const delta = B.D.boxes[at.where].lines.length - before; grew(pc, before);
  const c = caretAfter == null ? r.caret : locate(pc, caretAfter);
  if (delta && B.foldsIn(at.where).some(f => f.open)) { renderNote(); setCaret(c); }          // lines came or went around an open fold: draw the note again
  else if (!canonical(pc)) { fill(pc); setCaret(c); } else { pos = { where: c.where, line: c.line, at: c.at }; requestAnimationFrame(keepInView); }
  hidePath(); clockTyped(); paintBar(); return r;
}
function onInput(pc) {
  if (DEMO || composing) return;
  const old = modelText(pc), nw = pieceText(pc);
  if (old === nw) { if (!canonical(pc)) { const s = selAbs(pc); fill(pc); if (s) setCaret(locate(pc, s.b)); } return; }
  let a = 0; const m = Math.min(old.length, nw.length); while (a < m && old[a] === nw[a]) a++;
  let b = 0; while (b < m - a && old[old.length - 1 - b] === nw[nw.length - 1 - b]) b++;
  const s = selAbs(pc);
  typedHere(pc, a, old.length - a - b, nw.slice(a, nw.length - b), s ? s.b : nw.length - b);
}
pg.addEventListener("input", e => { const pc = pcOf(e.target); if (pc) onInput(pc); });
pg.addEventListener("compositionstart", () => { composing = true; });
pg.addEventListener("compositionend", e => { composing = false; const pc = pcOf(e.target); if (pc) onInput(pc); });
pg.addEventListener("beforeinput", e => {
  const pc = pcOf(e.target); if (!pc || DEMO) return; const t = e.inputType || "";
  if (t === "insertParagraph" || t === "insertLineBreak") { e.preventDefault(); const s = selAbs(pc); if (s) { B.sealUndo(); typedHere(pc, s.a, s.b - s.a, "\n"); } }
  else if (t === "deleteContentBackward") { const s = selAbs(pc); if (s && s.a === 0 && s.b === 0 && +pc.dataset.i0 > 0) { e.preventDefault(); joinUp(pc); } }
  else if (t === "historyUndo") { e.preventDefault(); doUndo(); }
  else if (t === "historyRedo" || t.indexOf("format") === 0 || t === "insertFromDrop") e.preventDefault();
});
function joinUp(pc) {          // Backspace at the start of a stretch: this line joins the one above (which sits above an open fold)
  const bx = B.D.boxes[pc.dataset.box], prev = bx.lines[+pc.dataset.i0 - 1];
  const r = B.act("write", { where: pc.dataset.box, line: prev, at: B.D.lines[prev].text.length, remove: 1, words: "" });
  if (r.ok) { renderNote(); setCaret(r.caret); clockTyped(); } else say(r.why);
}
pg.addEventListener("paste", e => { const pc = pcOf(e.target); if (!pc) return; e.preventDefault(); const s = selAbs(pc), text = (e.clipboardData || window.clipboardData).getData("text/plain"); if (s && text) { B.sealUndo(); typedHere(pc, s.a, s.b - s.a, text); B.sealUndo(); } });
pg.addEventListener("drop", e => e.preventDefault());
pg.addEventListener("keydown", e => {
  const pc = pcOf(e.target); if (!pc) return;
  if (e.key === "Tab") { e.preventDefault(); if (F.fold) cmdFold(); }
  else if (e.key === "Escape") { closeMenu(); if (pos && B.D.folds[pos.where]) cmdOpen(pos.where, false); }
  else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(); }
  else if ((e.metaKey || e.ctrlKey) && "biu".indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
  else if (/^Arrow/.test(e.key) && !e.shiftKey && getSelection().isCollapsed) {       // the arrow keys cross from one stretch to the next
    const s = selAbs(pc), all = [...pg.querySelectorAll(".pc")], k = all.indexOf(pc); if (!s) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowRight") && s.a >= modelText(pc).length && all[k + 1]) { e.preventDefault(); setCaret(locate(all[k + 1], 0)); }
    else if ((e.key === "ArrowUp" || e.key === "ArrowLeft") && s.a === 0 && all[k - 1]) { e.preventDefault(); setCaret(locate(all[k - 1], modelText(all[k - 1]).length)); }
  }
});
pg.addEventListener("focusin", () => openTask(false));

/* ================= hinges and threads: tap to open or close, without waking the keyboard ================= */
let tapT = 0;
const jointOf = t => t && t.closest ? t.closest(".hg,.th") : null;
pg.addEventListener("touchstart", e => { if (jointOf(e.target)) e.preventDefault(); }, { passive: false });
pg.addEventListener("touchend", e => { const j = jointOf(e.target); if (!j) return; e.preventDefault(); tapT = Date.now(); tapJoint(j); });
pg.addEventListener("mousedown", e => { if (jointOf(e.target)) e.preventDefault(); });
pg.addEventListener("click", e => {
  const j = jointOf(e.target); if (j) { e.preventDefault(); if (Date.now() - tapT > 600) tapJoint(j); return; }
  if ((e.metaKey || e.ctrlKey) && F.deep) { const pc = pcOf(e.target); if (pc) { e.preventDefault(); traceFrom(pc.dataset.box, sel); } }
});
function tapJoint(j) { const f = B.D.folds[j.dataset.f]; if (!f) return; cmdOpen(f.id, j.classList.contains("th") ? false : !f.open); }
pg.addEventListener("contextmenu", e => { const pc = pcOf(e.target); if (!pc || TOUCH || !F.fold) return; e.preventDefault(); const s = getSelection();
  if (s.isCollapsed || !pg.contains(s.anchorNode)) { const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : (document.caretPositionFromPoint && (p => { if (!p) return null; const r = document.createRange(); r.setStart(p.offsetNode, p.offset); return r; })(document.caretPositionFromPoint(e.clientX, e.clientY)));
    if (r && pcOf(r.startContainer)) { const p2 = pcOf(r.startContainer), L = locate(p2, absLen(p2, r.startContainer, r.startOffset)); setCaret(L); } }
  openMenu({ left: e.clientX, top: e.clientY, bottom: e.clientY }); });

/* ================= the commands: each is one call to the layer ================= */
const focused = () => pg.contains(document.activeElement);
function cmdFold() {
  if (!sel || !B.D.boxes[sel.where]) return say("Tap a line first.");
  const bx = B.D.boxes[sel.where], d = B.depth(sel.where);
  if (!F.deep && d >= 1) return say("Folds inside folds come in piece 1e.");
  if (!F.overlap && lanes(sel.where).some(x => x.a <= sel.b && sel.a <= x.b)) return say("A fold is already here. Overlapping folds come in piece 1f.");
  const r = B.act("fold_line", { where: sel.where, from: bx.lines[sel.a], to: bx.lines[sel.b] });
  if (!r.ok) return say(r.why);
  demoSel = null; renderNote(); setCaret({ where: r.where, line: r.line, at: 0 }); return r;
}
function cmdOpen(fid, open) {
  const f = B.D.folds[fid]; if (!f) return; const had = focused() || DEMO, keep = pos;
  const r = B.act("open_fold", { fold: fid, open }); if (!r.ok) return say(r.why);
  renderNote();
  if (!had) return;
  if (open && !B.hasWriting(fid)) return setCaret({ where: fid, line: B.D.boxes[fid].lines[0], at: 0 });
  if (!keep || !setCaret(keep)) setCaret({ where: f.host, line: f.to, at: B.D.lines[f.to].text.length });      // the caret was inside what just closed: it waits at the hinge
}
function cmdRemove(fid) { const f = B.D.folds[fid]; if (!f) return; const had = focused() || DEMO, r = B.act("remove_fold", { fold: fid }); if (!r.ok) return say(r.why);
  renderNote(); if (had) setCaret({ where: f.host, line: f.to, at: B.D.lines[f.to] ? B.D.lines[f.to].text.length : 0 });
  say(r.kept ? "Fold removed. Its writing is kept: Undo brings it back" + (F.notes ? ", and it's under Recently removed in Notes." : ".") : "Fold removed."); }
function traceFrom(where, s) {            // the fold you're inside; or, on a note's own line, the fold on that line
  let fid = B.D.folds[where] ? where : null;
  if (!fid && s) { const x = lanes(where).find(x => x.a <= s.b && s.a <= x.b); if (x) fid = x.f.id; }
  if (!fid) return say("This line isn't in a fold."); cmdTrace(fid);
}
function cmdTrace(fid) { const r = B.act("trace_parent", { fold: fid }); if (!r.ok) return say(r.why);
  const p = $("#path"); p.textContent = ""; r.path.forEach((s, i) => { if (i) { const a = el("i"); a.textContent = "›"; p.appendChild(a); } const b = el("button", i === r.path.length - 1 ? "here" : ""); b.textContent = s.name; b.dataset.go = s.fold || ""; press(b, () => jump(s)); p.appendChild(b); });
  p.classList.remove("hide"); p.scrollLeft = p.scrollWidth; return r; }
function hidePath() { $("#path").classList.add("hide"); }
function jump(s) {
  if (s.note) { scrollTo({ top: 0, behavior: "smooth" }); return; }
  const chain = B.act("trace_parent", { fold: s.fold }); if (!chain.ok) return;
  chain.path.forEach(x => { if (x.fold && x.fold !== s.fold && !B.D.folds[x.fold].open) B.act("open_fold", { fold: x.fold, open: true }); });   // every parent on the way opens
  renderNote(); const f = B.D.folds[s.fold], pc = pieceOf(f.host, f.to); if (!pc) return;
  const bx = B.D.boxes[f.host]; for (let i = bx.lines.indexOf(f.from); i <= bx.lines.indexOf(f.to); i++) { const e = pg.querySelector('.l[data-id="' + bx.lines[i] + '"]'); if (e) { e.classList.remove("flash"); void e.offsetWidth; e.classList.add("flash"); } }
  const e = pg.querySelector('.l[data-id="' + f.from + '"]'); if (e) { const rc = e.getBoundingClientRect(); scrollBy({ top: rc.top - head.getBoundingClientRect().bottom - 40, behavior: "smooth" }); }
}
function doUndo() { closeMenu(); const keep = pos, u = B.undo(); if (!u) return; demoSel = null;
  if (F.notes && !B.D.notes[B.D.current]) ui.view = "list";
  render(); if (ui.view !== "list" && keep && (focused() || !TOUCH || DEMO)) { if (!setCaret(keep)) { const bx = B.D.boxes[u.where]; if (bx) setCaret({ where: u.where, line: bx.lines[bx.lines.length - 1], at: 1e9 }); } } }

/* ================= the bar and the line's ⌄ menu ================= */
function paintBar() { $("#bFold").classList.toggle("hide", !F.fold); $("#bMore").classList.toggle("hide", !F.fold); $("#bUndo").disabled = !B.canUndo(); $("#hold").classList.toggle("hide", !F.clock);
  $("#bFold").textContent = sel && sel.b > sel.a ? "Fold " + (sel.b - sel.a + 1) + " lines" : "Fold";
  const k = $("#kept"); k.textContent = B.kept ? "" : "Not kept! Storage is blocked or full. "; k.classList.toggle("bad", !B.kept); }
press($("#bFold"), () => { closeMenu(); cmdFold(); });
press($("#bUndo"), doUndo);
press($("#bMore"), () => { if (!menu.classList.contains("hide")) return closeMenu(); const r = $("#bMore").getBoundingClientRect(); openMenu({ left: r.left, top: r.top, bottom: r.bottom, fromBar: true }); });
function menuItems() {
  const items = []; if (!sel || !B.D.boxes[sel.where]) return [["Tap a line first", () => {}]];
  items.push([sel.b > sel.a ? "Fold these " + (sel.b - sel.a + 1) + " lines" : "Fold this line", cmdFold]);
  const here = lanes(sel.where).filter(x => x.a <= sel.b && sel.a <= x.b);
  here.forEach(x => { const nm = "“" + B.foldName(x.f.id) + "”"; items.push(null); items.push([(x.f.open ? "Close " : "Open ") + nm, () => cmdOpen(x.f.id, !x.f.open)]);
    if (F.remove) items.push(["Remove fold " + nm, () => cmdRemove(x.f.id)]); });
  if (F.deep && (B.D.folds[sel.where] || here.length)) { items.push(null); const s = sel; items.push(["Trace back", () => traceFrom(s.where, s)]); }
  return items;
}
function openMenu(at) {
  menu.textContent = ""; menuItems().forEach(it => { if (!it) return menu.appendChild(el("hr")); const b = el("button"); b.textContent = it[0]; b.setAttribute("role", "menuitem"); press(b, () => { closeMenu(); it[1](); }); menu.appendChild(b); });
  menu.classList.remove("hide"); const w = menu.offsetWidth, h = menu.offsetHeight, v = window.visualViewport, vh = v ? v.height + v.offsetTop : innerHeight;
  menu.style.left = Math.max(8, Math.min(at.left, innerWidth - w - 8)) + "px";
  const below = at.bottom + 6, above = at.top - h - 6; menu.style.top = (at.fromBar && getComputedStyle(bar).position === "fixed" ? above : (below + h > vh - 8 && above > 0 ? above : below)) + "px";
}
function closeMenu() { menu.classList.add("hide"); }
document.addEventListener("pointerdown", e => { if (!menu.contains(e.target) && !e.target.closest("#bMore")) closeMenu(); });
/* The bar sits on the bottom edge of what you can SEE (the keyboard's top edge when it's up). It's measured from the top,
   because on the iPhone the "bottom" of the page stays behind the keyboard. */
function placeBar() { const v = window.visualViewport;
  if (!v || getComputedStyle(bar).position !== "fixed") { bar.classList.remove("up"); bar.style.transform = ""; return; }
  bar.classList.add("up"); const kb = document.documentElement.clientHeight - v.height > 120; bar.classList.toggle("kb", kb);
  bar.style.transform = "translateY(" + Math.round(v.offsetTop + v.height - bar.offsetHeight) + "px)"; }
if (window.visualViewport) { visualViewport.addEventListener("resize", () => { placeBar(); closeMenu(); setTimeout(keepInView, 60); }); visualViewport.addEventListener("scroll", placeBar); }
addEventListener("resize", placeBar); addEventListener("scroll", placeBar, { passive: true });

/* ================= the list of notes ================= */
let filter = "";
function renderList() {
  B.tidy(null); const lv = $("#listv"), all = B.notes(), q = filter.trim().toLowerCase();
  const text = id => B.D.boxes[id].lines.map(l => B.D.lines[l].text).join("\n");
  const rows = all.filter(n => !q || text(n.id).toLowerCase().indexOf(q) >= 0);
  const when = t => { const d = new Date(t), today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" }); };
  const second = id => { const bx = B.D.boxes[id]; let seen = false; for (const l of bx.lines) { const t = B.D.lines[l].text.trim(); if (t) { if (seen) return t; seen = true; } } return "No more words"; };
  const removed = B.D.removed.filter(r => B.D.boxes[r.fold.id]);
  lv.innerHTML = `<h1>Notes</h1><input id="filter" type="search" placeholder="Search" value="${esc(filter)}" autocomplete="off">
    <div class="rows">${rows.map(n => `<button class="rowi" data-note="${n.id}"><b>${esc(B.title(n.id))}</b><small>${esc(when(n.updatedAt))} · ${esc(second(n.id))}</small></button>`).join("") || `<div class="none">${q ? "No notes have those words." : "No notes yet. Tap New note."}</div>`}</div>
    ${removed.length ? `<div class="rm"><h2>Recently removed folds</h2><div class="rows">${removed.map(r => `<div class="rowi"><span><b>${esc(r.name)}</b><small>from ${esc(B.D.notes[r.note] ? B.title(r.note) : "a note")}</small></span><button class="put" data-put="${r.fold.id}">Put back</button></div>`).join("")}</div></div>` : ""}`;
  $("#filter").oninput = e => { filter = e.target.value; const at = e.target.selectionStart; renderList(); const f = $("#filter"); f.focus(); try { f.setSelectionRange(at, at); } catch (x) {} };
  lv.querySelectorAll("[data-note]").forEach(b => { b.onclick = () => openNote(b.dataset.note); });
  lv.querySelectorAll("[data-put]").forEach(b => { b.onclick = () => { const r = B.putBack(b.dataset.put); if (!r.ok) return alert(r.why); if (r.note) openNote(r.note, r.fold); else renderList(); }; });
}
function openNote(id, showFold) {
  const r = B.act("open_note", { note: id }); if (!r.ok) return say(r.why);
  ui.view = "note"; filter = ""; render(); lsSet(KEY + "-ui", ui);
  const spot = ui.spots[r.note];
  if (r.isNew) { scrollTo(0, 0); setCaret({ where: r.where, line: r.line, at: 0 }); }
  else if (showFold && B.D.folds[showFold]) jump({ fold: showFold });
  else { scrollTo(0, 0); comeBack(); }
  return r;
}
function showList() { closeMenu(); saveSpot(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); ui.view = "list"; render(); lsSet(KEY + "-ui", ui); scrollTo(0, 0); }
press($("#notesBtn"), showList);
$("#newNote").onclick = () => openNote("new");

/* ================= the writing clock and Hold: the writer's alone (not an action; the layer never touches it) ================= */
const CK = KEY + "-clock", today = () => new Date().toDateString();
let clock = lsGet(CK) || { day: today(), ms: 0 }, lastKey = 0, holdAt = null, beat = Date.now();
const PAUSE = 5000;
function bank(ms) { if (clock.day !== today()) clock = { day: today(), ms: 0 }; clock.ms += Math.max(0, ms); lsSet(CK, clock); }
function clockTyped() { if (!F.clock || DEMO) return; const n = Date.now(); if (!holdAt && lastKey && n - lastKey <= PAUSE) bank(n - lastKey); lastKey = n; }
function setHold(v, endAt) { if (!F.clock || !!holdAt === v) return; if (v) { holdAt = Date.now(); } else { bank((endAt || Date.now()) - holdAt); holdAt = null; lastKey = 0; } $("#hold").classList.toggle("on", v); }
const fmt = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 3600) + ":" + String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
setInterval(() => { const n = Date.now(); if (holdAt && n - beat > 10000) setHold(false, beat + 500); beat = n;          // time asleep is never counted
  if (!F.clock) return; if (clock.day !== today()) clock = { day: today(), ms: 0 };
  const on = holdAt || (lastKey && n - lastKey <= PAUSE); $("#clock").textContent = (on ? "● " : "○ ") + fmt(clock.ms + (holdAt ? n - holdAt : 0)) + " today"; }, 300);
const hold = $("#hold");
hold.addEventListener("touchstart", e => { e.preventDefault(); setHold(true); }, { passive: false });
["touchend", "touchcancel"].forEach(t => hold.addEventListener(t, e => { e.preventDefault(); setHold(false); }));
hold.addEventListener("mousedown", e => { e.preventDefault(); setHold(true); }); ["mouseup", "mouseleave"].forEach(t => hold.addEventListener(t, () => setHold(false)));
hold.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("keydown", e => { if (e.key === "Alt" && !e.repeat) setHold(true); }); document.addEventListener("keyup", e => { if (e.key === "Alt") setHold(false); });
addEventListener("blur", () => setHold(false)); document.addEventListener("visibilitychange", () => { if (document.hidden) { setHold(false); B.flush(); saveSpot(); } });
addEventListener("pagehide", () => { B.flush(); saveSpot(); });
B.on(ev => { if (ev.type === "kept") paintBar(); });

/* ================= the test: short tasks. Show me, then you try it and judge it ================= */
let task = 0; const TASKS = P.tasks, LASTT = TASKS.length - 1;
/* Your answers: for each task, Works or Something's off, and a note. Kept on this page; sent only when you tap Send. */
const AK = KEY + "-answers"; let answers = lsGet(AK) || {};
const saveAnswers = () => lsSet(AK, answers);
const realTasks = () => LASTT ? TASKS.slice(0, LASTT) : TASKS;
function report() {
  const out = ["Trial feedback · piece " + P.id + " (" + P.title + ")", new Date().toLocaleString() + " · " + (TOUCH ? "touch" : "mouse") + " · " + innerWidth + "×" + innerHeight + " · " + navigator.userAgent.replace(/\s+/g, " ").slice(0, 140), ""];
  realTasks().forEach((T, i) => { const a = answers[i] || {}; out.push((i + 1) + ". " + T.t + ": " + (a.v === "ok" ? "WORKS" : a.v === "off" ? "SOMETHING'S OFF" : "(no answer)") + (a.note && a.note.trim() ? "\n   " + a.note.trim().replace(/\n/g, "\n   ") : "")); });
  if (answers.all && answers.all.trim()) out.push("", "Anything else: " + answers.all.trim());
  return out.join("\n");
}
function answerBox(i) { const a = answers[i] || {};
  return '<div class="ans"><div class="row"><button class="av' + (a.v === "ok" ? " on" : "") + '" data-v="ok">✓ Works</button><button class="av' + (a.v === "off" ? " on off" : "") + '" data-v="off">Something’s off</button></div>'
    + '<textarea id="aNote" rows="2" placeholder="What did you notice? (optional)">' + esc(a.note || "") + "</textarea></div>"; }
function wireAnswer(i) { $("#tD").querySelectorAll(".av").forEach(b => { b.onclick = () => { answers[i] = Object.assign({}, answers[i], { v: b.dataset.v }); saveAnswers(); paintTask(); }; });
  const n = $("#aNote"); if (n) n.oninput = () => { answers[i] = Object.assign({}, answers[i], { note: n.value }); saveAnswers(); }; }
function sendBox() { const key = lsGet("tol-gh-token"), n = realTasks().filter((T, i) => answers[i] && answers[i].v).length;
  return '<div class="ans"><p class="nt">' + n + " of " + realTasks().length + ' tasks answered.</p><textarea id="aAll" rows="2" placeholder="Anything else about this piece? (optional)">' + esc(answers.all || "") + "</textarea>"
    + '<div class="row">' + (key ? '<button class="show" id="aSend">Send to Claude</button>' : "") + '<button id="aCopy">Copy my answers</button></div><p class="nt" id="aMsg">' + (answers.sent ? "Sent " + new Date(answers.sent).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ". Tell Claude “done” and it will read them." : key ? "Send posts your answers (never your writing) to your project on GitHub, where Claude reads them." : "This device has no GitHub key, so tap Copy and paste your answers to Claude.") + "</p></div>"; }
function wireSend() { const all = $("#aAll"); if (all) all.oninput = () => { answers.all = all.value; saveAnswers(); };
  const msg = t => { $("#aMsg").textContent = t; };
  const c = $("#aCopy"); if (c) c.onclick = async () => { const text = report(); try { await navigator.clipboard.writeText(text); msg("Copied. Paste it to Claude."); } catch (e) { const ta = el("textarea"); ta.value = text; ta.rows = 6; ta.readOnly = true; $("#tD").appendChild(ta); ta.select(); msg("Select all of this and copy it:"); } };
  const sd = $("#aSend"); if (sd) sd.onclick = async () => {
    if (sd.dataset.sure !== "1") { sd.dataset.sure = "1"; sd.textContent = "Yes, post it"; return msg("Your project on GitHub is public, so these answers can be seen there. Your writing is not included. Tap again to post."); }
    sd.disabled = true; msg("Sending…");
    try { const offs = realTasks().filter((T, i) => answers[i] && answers[i].v === "off").length;
      const r = await fetch("https://api.github.com/repos/obrianwatson/tree-of-life/issues", { method: "POST", headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + lsGet("tol-gh-token"), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Trial feedback: piece " + P.id + (offs ? " · " + offs + " off" : " · all works"), body: "```\n" + report() + "\n```\n_Sent from the trial page. No writing is included._" }) });
      if (!r.ok) throw new Error("GitHub answered " + r.status);
      answers.sent = Date.now(); saveAnswers(); paintTask();
    } catch (e) { sd.disabled = false; msg("Couldn't send (" + (e.message || e) + "). Tap Copy and paste your answers to Claude instead."); } };
}
function paintTask() { const T = TASKS[task], last = task >= LASTT; $("#tN").textContent = "Piece " + P.id + (LASTT ? " · " + (task + 1) + " of " + (LASTT + 1) : ""); $("#tT").textContent = T.t;
  $("#tD").innerHTML = "<p>" + (TOUCH || !T.dLaptop ? T.d : T.dLaptop) + "</p>" + (T.n ? '<p class="nt">' + T.n + "</p>" : "") + (!last || !LASTT ? answerBox(task) : "") + (last ? sendBox() : "")
    + '<div class="row">' + (T.show ? '<button class="show" id="tShow">Show me</button>' : "") + (task ? '<button id="tBack">Back</button>' : "") + '<button id="tReset">Start over</button><a href="../" style="align-self:center;font-size:13px;color:var(--acc);margin-left:6px">All pieces</a></div>';
  $("#tNext").classList.toggle("hide", last); if (T.show) $("#tShow").onclick = () => demo(T.show); if (task) $("#tBack").onclick = () => { task--; paintTask(); };
  if (!last || !LASTT) wireAnswer(task); if (last) wireSend();
  $("#tReset").onclick = () => { if (confirm("Put this test page back to the start? What you wrote on THIS test page will be cleared. Your answers are kept.")) { [KEY, KEY + "-ui", KEY + "-clock"].forEach(k => localStorage.removeItem(k)); B.flush = () => {}; saveSpot = () => {}; location.reload(); } }; }
function openTask(v) { $("#tD").classList.toggle("hide", !v); $("#tMore").textContent = v ? "Hide" : "Details"; }
$("#tMore").onclick = () => openTask($("#tD").classList.contains("hide"));
$("#tD").addEventListener("click", e => { if (!e.target.closest("button,a,textarea")) openTask(false); });      // tap the instructions themselves to put them away
document.addEventListener("pointerdown", e => { if (!head.contains(e.target) && !DEMO) openTask(false); });
$("#tNext").onclick = () => { task = Math.min(LASTT, task + 1); paintTask(); openTask(true); };

/* Show me: a finger does it slowly through the SAME commands and the SAME layer, then the page is put back as it was */
let run = 0; const cu = $("#cur"), QUICK = /[?&]quick/.test(location.search);       // ?quick: the robots' tests run every Show me at speed
const sleep = (ms, r) => new Promise((res, rej) => setTimeout(() => r === run ? res() : rej(0), QUICK ? Math.min(ms, 5) : ms));
function find(txt) { for (const id of Object.keys(B.D.boxes)) { const bx = B.D.boxes[id]; if (B.noteOf(id) !== B.D.current) continue; for (let i = 0; i < bx.lines.length; i++) if (B.D.lines[bx.lines[i]].text.indexOf(txt) >= 0) return { where: id, idx: i, line: bx.lines[i] }; } return null; }
async function demo(fn) {
  const before = JSON.stringify(B.D), uiBefore = JSON.stringify(ui), y = scrollY, r = ++run;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  openTask(false); DEMO = true; pos = null; sel = null; demoSel = null; $("#shield").classList.remove("hide"); cu.classList.remove("hide"); cu.style.left = "50%"; cu.style.top = "70%";
  const f = {
    sleep: ms => sleep(ms, r), say,
    async point(e) { if (!e) return; const rc0 = e.getBoundingClientRect(); if (rc0.top < head.getBoundingClientRect().bottom + 10 || rc0.bottom > innerHeight - 70) { scrollBy(0, rc0.top - innerHeight / 2); await sleep(50, r); }
      const rc = e.getBoundingClientRect(); cu.style.left = (rc.left + Math.min(rc.width / 2, 160)) + "px"; cu.style.top = (rc.top + rc.height / 2) + "px"; await sleep(950, r); },
    async tap(e) { await f.point(e); cu.classList.add("down"); await sleep(260, r); cu.classList.remove("down"); await sleep(320, r); },
    find,
    lineEl: line => pg.querySelector('.l[data-id="' + line + '"]'),
    async caret(spot, at) { const L = B.D.lines[spot.line]; await f.tap(f.lineEl(spot.line)); demoSel = null; setCaret({ where: spot.where, line: spot.line, at: at == null ? L.text.length : at }); await sleep(300, r); },
    async select(a, b) { await f.point(f.lineEl(a.line)); cu.classList.add("down"); await sleep(300, r); await f.point(f.lineEl(b.line)); cu.classList.remove("down"); demoSel = { where: a.where, a: a.idx, b: b.idx }; sel = { where: a.where, a: a.idx, b: b.idx }; pos = { where: b.where, line: b.line, at: 0 }; marks(); paintBar(); await sleep(500, r); },
    async type(str, speed) { for (const ch of str) { const w = B.act("write", { where: pos.where, line: pos.line, at: pos.at, words: ch }); if (!w.ok) break; renderNote(); setCaret(w.caret); const e = f.lineEl(pos.line); if (e) { const rc = e.getBoundingClientRect(); if (rc.bottom > innerHeight - 90) scrollBy(0, rc.bottom - innerHeight + 120); } await sleep(speed || 70, r); } await sleep(500, r); },
    async fold() { await f.tap($("#bFold")); const x = cmdFold(); await sleep(700, r); return x; },
    async hinge(fid) { await f.tap(pg.querySelector('.hg[data-f="' + fid + '"]')); const fo = B.D.folds[fid]; cmdOpen(fid, !fo.open); await sleep(900, r); },
    async thread(fid) { await f.tap(pg.querySelector('.th[data-f="' + fid + '"]')); cmdOpen(fid, false); await sleep(900, r); },
    async menu(label) { await f.tap($("#bMore")); const rc = $("#bMore").getBoundingClientRect(); openMenu({ left: rc.left, top: rc.top, bottom: rc.bottom, fromBar: true }); await sleep(600, r);
      const b = [...menu.querySelectorAll("button")].find(x => x.textContent.indexOf(label) === 0); if (b) { await f.tap(b); closeMenu(); const it = menuItems().find(i => i && i[0].indexOf(label) === 0); if (it) it[1](); } else closeMenu(); await sleep(900, r); },
    async undo() { await f.tap($("#bUndo")); doUndo(); await sleep(900, r); },
    async notes() { await f.tap($("#notesBtn")); showList(); await sleep(900, r); },
    async open(id) { await f.tap($('#listv [data-note="' + id + '"]')); openNote(id); await sleep(900, r); },
    async newNote() { await f.tap($("#newNote")); const x = openNote("new"); await sleep(700, r); return x; },
    async crumb(i) { const b = $("#path").querySelectorAll("button")[i]; await f.tap(b); const s = b.dataset.go; jump(s ? { fold: s } : { note: 1 }); await sleep(1200, r); },
    async away() { const a = $("#app"); a.style.transition = "opacity .6s"; a.classList.add("out"); await sleep(1400, r); a.classList.remove("out"); await sleep(900, r); a.style.transition = ""; },
    async putBack(fid) { const b = $('#listv [data-put="' + fid + '"]'); await f.tap(b); const x = B.putBack(fid); if (x.ok && x.note) openNote(x.note, x.fold); await sleep(1200, r); },
    view: () => ui.view, folds: where => B.foldsIn(where), B
  };
  try { await fn(f); await sleep(1100, r); } catch (e) { if (e !== 0) console.error(e); }
  DEMO = false; demoSel = null; pos = null; sel = null; cu.classList.add("hide"); $("#shield").classList.add("hide"); closeMenu(); hidePath(); say("");
  B.replace(JSON.parse(before)); ui = JSON.parse(uiBefore); render(); scrollTo(0, y); openTask(true);
}
$("#shield").addEventListener("click", () => { run++; });

/* ================= start ================= */
B.tidy(ui.view === "list" ? null : B.D.current); paintTask(); openTask(true); render(); placeBar();
/* Coming back: you're taken to the line you left off on, and it glows for a moment (on a phone the keyboard waits for your tap). */
try { history.scrollRestoration = "manual"; } catch (e) {}
function comeBack() { const spot = ui.view !== "list" && ui.spots[B.D.current]; if (!spot) return;
  const e = spot.line && pg.querySelector('.l[data-id="' + spot.line + '"]');
  if (e) { const rc = e.getBoundingClientRect(), v = window.visualViewport, h = v ? v.height : innerHeight; if (rc.top < head.getBoundingClientRect().bottom + 20 || rc.bottom > h - 90) scrollTo(0, Math.max(0, scrollY + rc.top - h * 0.4)); e.classList.add("flash"); }
  else scrollTo(0, spot.y || 0);
  if (!TOUCH && spot.line) setCaret(spot, false); }
comeBack(); addEventListener("load", () => setTimeout(comeBack, 50)); addEventListener("pageshow", e => { if (e.persisted) comeBack(); });
window.TrialView = { report, find, demo, tasks: TASKS, render, setCaret, cmdFold, cmdOpen, cmdRemove, cmdTrace, doUndo, openNote, showList, get pos() { return pos; }, get sel() { return sel; } };
})();
