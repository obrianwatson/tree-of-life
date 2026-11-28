/* guide.js · THE GUIDED TESTS of BOLW Core: a few short checks for each stage.
   For each check: Show me (a finger does it slowly through the same actions, then everything is put back), then you
   try it and answer Works or Something's off, with a note. At the end of a stage your answers are sent for Claude to read.
   This page is the real app on its own sample book (the "core-test" drawer): never your real book, never synced. */
(function () {
"use strict";
const B = window.Book, Page = window.Page, Keep = window.Keep, Mods = window.Mods, $ = Page.$, el = Page.el, esc = Page.esc, TOUCH = Page.TOUCH;
const QUICK = /[?&]quick/.test(location.search), D = () => B.D;
const find = (txt, leaf) => D().leaves[leaf || Page.leaf].lines.find(l => D().lines[l].text.indexOf(txt) >= 0);
const leafNamed = name => B.leaves().find(id => B.title(id) === name);

/* ---------- the sample book ---------- */
function mk(parentLeaf, name, text) { const lf = D().leaves[parentLeaf], last = lf.lines[lf.lines.length - 1]; let line = last; if (D().lines[last].text || D().lines[last].leaf) line = B.act("write", { line: last, words: "\n" }).line; if (D().lines[line].d) B.act("grow", { line, dir: -9 });
  B.act("write", { line, at: 0, remove: D().lines[line].text.length, words: name }); const r = B.act("lift", { line }); if (text) B.act("write", { line: D().leaves[r.leaf].lines[0], words: text }); return r.leaf; }
function seed() {
  const songs = mk(D().trunk, "Songs", ""), river = mk(songs, "River song", "Verse one\n\tthe river is high today\n\tand the banks are low\nChorus\n\tcarry me over\n\tcarry me home\nVerse two\n\tthe rain came down all night");
  mk(songs, "Desert road", "Verse one\n\trivers in the desert\n\ta road where there was none\nChorus\n\tmake a way\n\tmake a way again");
  const scr = mk(D().trunk, "Scripture", ""); mk(scr, "Psalm 23", "The Lord is my shepherd; I shall not want.\nHe maketh me to lie down in green pastures:\nhe leadeth me beside the still waters.\nHe restoreth my soul.");
  mk(D().trunk, "Journal", "Friday\n\tWrote by the window. The light was good.");
  B.clearUndo(); B.flush(); Page.show(river);
}
if (B.leaves().length <= 2 && !leafNamed("River song")) seed();
window.addEventListener("bolw-seed", seed);

/* ---------- the strip ---------- */
const strip = el("div", "gt"); strip.innerHTML = `<div class="gtl"><b id="gN"></b><span class="sp" id="gT"></span><button id="gMore">Hide</button><button id="gNext">Next</button></div><div class="gtd" id="gD"></div>`;
function place() { const sheet = $("#sheet"), ai = $("#ai"), t = !sheet.classList.contains("hide") ? sheet : (ai && !ai.classList.contains("hide") && !matchMedia("(pointer:fine) and (min-width:900px)").matches) ? ai : $("#head"); if (strip.parentNode !== t) { t.insertBefore(strip, t.firstChild); if (window.AI && window.AI.fit) window.AI.fit(); } }
place(); new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ["class"] });

/* ---------- the finger (Show me) ---------- */
let run = 0, DEMO = false; const fg = $("#finger"), shield = $("#shield");
const sleep = (ms, r) => new Promise((res, rej) => setTimeout(() => r === run ? res() : rej(0), QUICK ? Math.min(ms, 3) : ms));
async function demo(fn) {
  const before = JSON.stringify(B.D), uiB = JSON.stringify(Page.ui), y = scrollY, r = ++run, extra = Page.fire("demoStart") || null;
  openTask(false); Page.closeSheet(true); DEMO = true; Page.demo = true; shield.classList.remove("hide"); fg.classList.remove("hide"); fg.style.left = "50%"; fg.style.top = "70%";
  const f = {
    sleep: ms => sleep(ms, r), say: Page.say, find, leafNamed,
    async point(e) { if (!e) return; const inSheet = e.closest && e.closest("#sheet,#ai,#menu"); let rc = e.getBoundingClientRect(); if (!inSheet && (rc.top < $("#head").getBoundingClientRect().bottom + 10 || rc.bottom > innerHeight - 80)) { scrollBy(0, rc.top - innerHeight / 2); await sleep(60, r); } else if (inSheet && e.scrollIntoView) e.scrollIntoView({ block: "nearest" });
      rc = e.getBoundingClientRect(); fg.style.left = (rc.left + Math.min(rc.width / 2, 150)) + "px"; fg.style.top = (rc.top + rc.height / 2) + "px"; await sleep(900, r); },
    async tap(e) { await f.point(e); fg.classList.add("down"); await sleep(240, r); fg.classList.remove("down"); await sleep(300, r); },
    async caret(txt, at) { const id = typeof txt === "string" ? find(txt) : txt.id; await f.tap(Page.lineOf(id)); Page.setCaret({ line: id, at }); await sleep(300, r); return id; },
    async type(str, speed) { for (const ch of str) { const p = Page.pos, w = B.act("write", { line: p.line, at: p.at, words: ch }); if (!w.ok) break; Page.render(); Page.setCaret(w.caret); await sleep(speed || 55, r); } await sleep(450, r); },
    async bar(id, fn) { await f.tap($("#b_" + id)); fn(); Page.render(); if (Page.pos && D().lines[Page.pos.line]) Page.setCaret(Page.pos); await sleep(800, r); },
    async menu(label) { await f.tap($("#b_more")); const rc = $("#b_more").getBoundingClientRect(); Page.openMenu({ left: rc.left, top: rc.top, bottom: rc.bottom, fromBar: true }); await sleep(500, r);
      const b = [...$("#menu").querySelectorAll("button")].find(x => x.textContent.indexOf(label) === 0); if (b) { await f.tap(b); Page.closeMenu(); const it = Page.menuItems().find(i => i && i[0].indexOf(label) === 0); if (it) it[1](); } else Page.closeMenu(); await sleep(900, r); },
    async top(label) { await f.tap($("#tMenu")); const rc = $("#tMenu").getBoundingClientRect(); $("#tMenu").click(); await sleep(500, r); const b = [...$("#menu").querySelectorAll("button")].find(x => x.textContent.indexOf(label) === 0); if (b) { await f.tap(b); b.click(); } await sleep(900, r); },
    async chip(txt) { const id = find(txt), e = Page.lineOf(id), rc = e.getBoundingClientRect(); fg.style.left = (rc.right - 14) + "px"; fg.style.top = (rc.top + rc.height / 2) + "px"; await sleep(900, r); fg.classList.add("down"); await sleep(240, r); fg.classList.remove("down"); Page.go(D().lines[id].leaf); await sleep(900, r); },
    async click(sel) { const e = typeof sel === "string" ? document.querySelector(sel) : sel; if (!e) return; await f.tap(e); e.click(); await sleep(800, r); },
    async go(leaf, line) { Page.go(leaf, line); await sleep(700, r); },
    async select(a, b) { const ia = find(a), ib = find(b); await f.point(Page.lineOf(ia)); fg.classList.add("down"); await sleep(300, r); await f.point(Page.lineOf(ib)); fg.classList.remove("down"); Page.demoSelect(ia, ib); await sleep(500, r); },
    async gate(fid, more) { const e = document.querySelector('.gate[data-f="' + fid + '"]' + (more ? " .gm" : "")); await f.tap(e); if (!more) window.Fold.toggle(fid); await sleep(800, r); },
    async undo() { await f.tap($("#b_undo")); Page.doUndo(); await sleep(900, r); },
    async away() { const a = $("#col"); a.style.transition = "opacity .6s"; a.style.opacity = 0; await sleep(1300, r); a.style.opacity = ""; await sleep(900, r); a.style.transition = ""; }
  };
  try { await fn(f); await sleep(1300, r); } catch (e) { if (e !== 0) console.error(e); }
  DEMO = false; Page.fire("demoEnd", extra); fg.classList.add("hide"); shield.classList.add("hide"); Page.closeSheet(true); Page.closeMenu(); $("#toast").classList.add("hide"); Page.demo = false;
  B.replace(JSON.parse(before)); const u = JSON.parse(uiB); Page.ui = u; Page.show(D().leaves[u.leaf] && B.alive(u.leaf) ? u.leaf : D().trunk); scrollTo(0, y); openTask(true);
}
shield.addEventListener("click", () => { run++; });
const river = () => leafNamed("River song");

/* ---------- the checks, stage by stage ---------- */
const STAGES = {
  1: { name: "The core, Grow, the clock", tasks: [
    { t: "A leaf that saves as you type", d: "Tap <b>＋</b> (bottom right), give the leaf a name, press Return and write a few lines. Then close this page completely and open it again: you should land on the same leaf, on the line you left.", dLaptop: "Click <b>＋</b> (bottom right), name the leaf, press Return and write a few lines. Close the tab and open the page again: same leaf, same line.",
      show: async f => { await f.go(leafNamed("Songs")); await f.tap($("#plus")); Page.newLeaf(); await f.sleep(500); const t = $("#ttl"); for (const ch of "Morning song") { t.value += ch; t.dispatchEvent(new Event("input")); await f.sleep(50); } await f.sleep(400); Page.setCaret({ line: D().leaves[Page.leaf].lines[0], at: 0 }); await f.type("the kettle sings\nand so do I"); f.say("Closing the page…"); await f.away(); f.say("…and back: the same leaf, the same line."); Page.lineOf(Page.pos.line).classList.add("flash"); await f.sleep(1400); } },
    { t: "Branches: grow a line under another", d: "Put the cursor on a line and tap <b>⇥</b>: it grows under the line above (a branch). <b>⇤</b> brings it back. A line moves with everything under it.", dLaptop: "Put the cursor on a line and press <b>Tab</b>: it grows under the line above (a branch). <b>Shift-Tab</b> brings it back. A line moves with everything under it.",
      show: async f => { await f.go(leafNamed("Desert road")); await f.caret("a road where"); await f.bar("in", () => B.act("grow", { line: find("a road where"), dir: 1 })); await f.type("\nthrough the dry land"); await f.caret("a road where"); await f.bar("out", () => B.act("grow", { line: find("a road where"), dir: -1 })); await f.bar("in", () => B.act("grow", { line: find("a road where"), dir: 1 })); } },
    { t: "Lift a branch into its own leaf", d: "Put the cursor on a line that has a branch (like <i>Chorus</i>). Tap <b>⌄</b> → <b>Lift this branch into its own leaf</b>. The line gets a <b>›</b>: tap it to open the leaf. The path at the top shows where you are; <b>‹</b> goes back.", dLaptop: "Put the cursor on a line that has a branch (like <i>Chorus</i>). Click <b>⌄</b> (or right-click the line) → <b>Lift this branch into its own leaf</b>. The line gets a <b>›</b>: click it to open the leaf. The path at the top shows where you are; <b>‹</b> goes back.",
      show: async f => { await f.go(river()); await f.caret("Chorus"); await f.menu("Lift this branch"); await f.chip("Chorus"); await f.point($("#crumbs")); await f.sleep(900); await f.click("#tBack"); } },
    { t: "Move and Delete (and bring back)", d: "On any line: <b>⌄</b> → <b>Move up</b> / <b>Move down</b> (its branch goes with it), or <b>Move to…</b> another leaf. Then <b>⌄</b> → <b>Delete</b>. Find it again under <b>☰</b> → <b>Deleted</b> → <b>Bring back</b>. <b>Undo</b> undoes any of these.",
      show: async f => { await f.go(river()); await f.caret("Chorus"); await f.menu("Move up"); await f.menu("Move down"); await f.caret("Verse two"); await f.menu("Delete"); await f.top("Deleted"); await f.click("#sheet [data-id]"); await f.sleep(900); } },
    { t: "Search, and the record of every move", d: "<b>☰</b> → <b>Search</b>: type a word from another leaf and tap the result. Then <b>☰</b> → <b>The record</b>: your moves should be there in plain words (wrote, grew, lifted, moved, deleted…).",
      show: async f => { await f.go(river()); await f.top("Search"); const i = $("#sheet input"); for (const ch of "shepherd") { i.value += ch; i.dispatchEvent(new Event("input")); await f.sleep(60); } await f.sleep(700); await f.click("#sheet [data-line]"); await f.sleep(900); await f.top("The record"); await f.sleep(2200); } },
    { t: "The writing clock and Hold", d: "Type for a few seconds: the clock at the top runs (●) and stops (○) about 4 seconds after your last key. Press and hold the round <b>Hold</b> button: it runs while you hold. ☰ → Settings has the pause length and a daily goal.", dLaptop: "Type for a few seconds: the clock at the top runs (●) and stops (○) about 4 seconds after your last key. Hold the <b>Option</b> key (or press and hold the Hold button): it runs while you hold. ☰ → Settings has the pause length and a daily goal." },
    { t: "Feel", d: "Tap <b>Add a long leaf</b>, then type fast in the middle of it, press Return a few times, scroll top to bottom. Nothing should lag or jump. The bar should sit right on top of the keyboard.", feel: true }
  ] }
};
STAGES[2] = { name: "Fold", tasks: [
  { t: "Fold lines behind a gate", d: "Put the cursor on <i>Chorus</i> and tap <b>Fold</b>: the line and its branch collapse behind a gate. Tap the gate to open it, tap again to close. Open, the fold shows as a colored line in the margin.", dLaptop: "Put the cursor on <i>Chorus</i> and click <b>Fold</b>: the line and its branch collapse behind a gate. Click the gate to open and close it. Open, the fold shows as a colored line in the margin.",
    show: async f => { await f.go(river()); await f.caret("Chorus"); let r; await f.bar("fold", () => { r = B.act("fold", { from: find("Chorus") }); }); await f.gate(r.fold); await f.gate(r.fold); await f.gate(r.fold); } },
  { t: "Fold a selection, and folds that overlap", d: "Select a few lines (touch and hold a word, then drag the handles across lines) and tap <b>Fold</b>. Then fold another stretch that overlaps the first. Each fold has its own gate and its own colored line; open and close them separately.", dLaptop: "Drag across a few lines to select them and click <b>Fold</b>. Then fold another stretch that overlaps the first. Each fold has its own gate and its own colored line; open and close them separately.",
    show: async f => { await f.go(river()); await f.select("Chorus", "carry me home"); let a, b; await f.bar("fold", () => { a = B.act("fold", { from: find("Chorus"), to: find("carry me home") }); }); await f.gate(a.fold); await f.select("carry me home", "Verse two"); await f.bar("fold", () => { b = B.act("fold", { from: find("carry me home"), to: find("Verse two") }); }); await f.gate(b.fold); await f.gate(a.fold); await f.gate(a.fold); } },
  { t: "Name a fold: it gathers across the book", d: "Tap <b>⋯</b> on a gate → <b>Name this fold…</b> and call it <i>Chorus</i>. Open <i>Desert road</i> (☰ → Search), fold its chorus and give it the same name. Then <b>☰</b> → <b>Folds</b> → <b>Chorus</b>: both pieces are there, each from its own song. Tap one to go to it.",
    show: async f => { await f.go(river()); await f.caret("Chorus"); let a, b; await f.bar("fold", () => { a = B.act("fold", { from: find("Chorus") }); }); await f.gate(a.fold, true); f.say("⋯ → Name this fold… → Chorus"); B.act("name", { fold: a.fold, name: "Chorus" }); Page.render(); await f.sleep(1200);
      await f.go(leafNamed("Desert road")); await f.caret("Chorus"); await f.bar("fold", () => { b = B.act("fold", { from: find("Chorus"), name: "Chorus" }); }); await f.top("Folds"); await f.click('#sheet [data-name="Chorus"]'); await f.sleep(1800); await f.click("#sheet [data-go]"); await f.sleep(900); } },
  { t: "Details on a named fold", d: "On a named fold: <b>⋯</b> → <b>Details…</b>. Add a detail called <i>Key</i> and give it a value (G). Add <i>Status</i> too. They show on the closed gate and in ☰ → Folds → Chorus. The other Chorus offers the same kinds of detail.",
    show: async f => { await f.go(river()); await f.caret("Chorus"); let a; await f.bar("fold", () => { a = B.act("fold", { from: find("Chorus"), name: "Chorus" }); }); await f.gate(a.fold, true); f.say("⋯ → Details… → Key: G, Status: draft"); B.act("detail", { fold: a.fold, key: "Key", value: "G" }); B.act("detail", { fold: a.fold, key: "Status", value: "draft" }); Page.render(); await f.sleep(1500); await f.top("Folds"); await f.click('#sheet [data-name="Chorus"]'); await f.sleep(1800); } },
  { t: "Gather by a search", d: "<b>☰</b> → <b>Folds</b> → <b>Gather by a search…</b>. Name it <i>Water</i> and search for <i>river</i>. The gathering lists every line in the book with that word, and keeps up as you write more.",
    show: async f => { await f.go(river()); await f.top("Folds"); await f.point(document.querySelector("#flRule")); B.act("gather", { name: "Water", search: "river" }); window.Fold.openName("Water"); await f.sleep(2200); } },
  { t: "Writing in and around a fold", d: "Open a fold. Press Return at the end of its last line: the new line stays inside the fold (the colored line follows). Press Return again on the empty line: you step out of the fold. Then <b>⋯</b> → <b>Remove the fold</b>: the gate goes, every line stays. <b>Undo</b> brings the fold back.",
    show: async f => { await f.go(river()); await f.caret("Chorus"); let a; await f.bar("fold", () => { a = B.act("fold", { from: find("Chorus") }); }); await f.gate(a.fold); await f.caret("carry me home"); B.begin("x"); const w = B.act("write", { line: find("carry me home"), words: "\n" }); B.act("stretch", { fold: a.fold, to: w.line }); B.end(); Page.render(); Page.setCaret(w.caret); await f.type("all the way home"); f.say("⋯ → Remove the fold: the lines stay"); await f.gate(a.fold, true); B.act("unfold", { fold: a.fold }); Page.render(); await f.sleep(1200); await f.undo(); } }
] };
const inLeaf = (name, txt) => find(txt, leafNamed(name));
STAGES[3] = { name: "Link and the Map", tasks: [
  { t: "Link two lines", d: "Put the cursor on <i>carry me home</i>. Tap <b>⌄</b> → <b>Link to…</b>, search for <i>still waters</i> and pick that line. Give the link a label (<i>echoes</i>) or leave it empty. Both lines now show <b>∞</b> at their end.",
    show: async f => { await f.go(river()); await f.caret("carry me home"); await f.menu("Link to"); const i = $("#sheet input"); for (const ch of "still waters") { i.value += ch; i.dispatchEvent(new Event("input")); await f.sleep(50); } await f.sleep(600); await f.click("#sheet [data-line]"); const l = $("#lkLabel"); for (const ch of "echoes") { l.value += ch; await f.sleep(60); } await f.click("#lkOk"); await f.point(Page.lineOf(find("carry me home"))); await f.sleep(1200); } },
  { t: "Both ends know: tap ∞ to jump", d: "Tap the <b>∞</b> at the end of a linked line: its links are listed. Tap one to jump to the other line, wherever it is. From there, <b>∞</b> brings you back. With the cursor on a linked line, its links also float under the top row.",
    show: async f => { B.act("link", { from: inLeaf("River song", "carry me home"), to: inLeaf("Psalm 23", "still waters"), label: "echoes" }); await f.go(river()); const id = find("carry me home"), e = Page.lineOf(id), rc = e.getBoundingClientRect(); fg.style.left = (rc.right - 14) + "px"; fg.style.top = (rc.top + rc.height / 2) + "px"; await f.sleep(1000); window.Link.showLinks(id, { left: rc.right - 260, top: rc.top, bottom: rc.bottom }); await f.sleep(900); await f.click("#menu button"); await f.sleep(1400); await f.caret("still waters"); await f.sleep(1400); } },
  { t: "Labels get their own colors", d: "Make two more links from the same line with different labels (<i>rhymes with</i>, <i>answers</i>). Each label gets its own color, the same everywhere in the book. <b>⌄</b> → <b>Its links…</b> lets you change a label or remove a link.",
    show: async f => { const a = inLeaf("River song", "carry me home"); B.act("link", { from: a, to: inLeaf("Psalm 23", "still waters"), label: "echoes" }); B.act("link", { from: a, to: inLeaf("Desert road", "make a way again"), label: "rhymes with" }); B.act("link", { from: a, to: inLeaf("River song", "the river is high") }); await f.go(river()); await f.caret("carry me home"); await f.sleep(1500); await f.menu("Its links"); await f.sleep(2000); } },
  { t: "The Map", d: "With the cursor on a linked line: <b>☰</b> → <b>Map</b>. Above: what the line grew from, back to the trunk. Below: what grows from it. To the sides: its links, in their colors. Tap anything to center the map on it; tap a label at the top to see only those links; <b>Go there</b> opens the line.",
    show: async f => { const a = inLeaf("River song", "carry me home"); B.act("link", { from: a, to: inLeaf("Psalm 23", "still waters"), label: "echoes" }); B.act("link", { from: a, to: inLeaf("Desert road", "make a way again"), label: "rhymes with" }); await f.go(river()); await f.caret("carry me home"); await f.top("Map"); await f.sleep(1800); await f.click('#sheet [data-only="echoes"]'); await f.sleep(900); await f.click('#sheet .mn.web'); await f.sleep(1500); await f.click('#sheet .mup .mn.up'); await f.sleep(1500); await f.click("#mGo"); } }
] };
STAGES[4] = { name: "Bookmarks", tasks: [
  { t: "Leave a bookmark", d: "In any leaf, with the cursor on a line, tap <b>🔖</b> (top right). Where you were is filled in by itself. Add a line or two if you like (<i>What I was doing</i>, <i>Waiting for</i>…): all optional. Tap <b>Close</b>. The line now shows <b>⚑</b>.",
    show: async f => { await f.go(river()); await f.caret("Verse two"); await f.tap($("#tMark")); window.Marks.markHere(); await f.sleep(900); const t = $('#sheet [data-f="waiting"]'); await f.point(t); for (const ch of "a second line that rhymes with night") { t.value += ch; await f.sleep(25); } t.dispatchEvent(new Event("change")); await f.sleep(700); await f.click([...document.querySelectorAll("#cdRow button")].pop()); await f.point(Page.lineOf(find("Verse two"))); await f.sleep(1200); } },
  { t: "The list, and jumping back", d: "Go somewhere else in the book. Then <b>☰</b> → <b>Bookmarks</b>: everything left waiting is there. Tap one: you're back on the line where you left it. <b>Card</b> opens its lines.",
    show: async f => { B.act("mark", { line: find("Verse two", river()), waiting: "a second line that rhymes with night" }); await f.go(leafNamed("Psalm 23")); await f.top("Bookmarks"); await f.sleep(1200); await f.click("#sheet [data-j]"); await f.sleep(1400); } },
  { t: "Done stays as a record", d: "In <b>☰</b> → <b>Bookmarks</b>, tap <b>Done</b> on a bookmark. It moves down to <i>Done (kept as a record)</i> and its ⚑ leaves the line. Open its card: <b>Not done after all</b> puts it back.",
    show: async f => { B.act("mark", { line: find("Verse two", river()), waiting: "a second line that rhymes with night" }); await f.go(river()); await f.top("Bookmarks"); await f.sleep(900); await f.click("#sheet [data-d]"); await f.sleep(1800); } }
] };
window.GuideStages = STAGES;
function addLong() { Page.go(D().trunk); Page.newLeaf(); const id = Page.leaf, t = []; B.act("write", { line: D().leaves[id].parent, at: 0, words: "A long leaf for the feel check" }); for (let i = 1; i <= 1200; i++) t.push((i % 6 === 2 ? "\t" : "") + "Line " + i + ": the river keeps on running and the page keeps up with it."); B.act("write", { line: D().leaves[id].lines[0], words: t.join("\n") }); B.clearUndo(); Page.show(id); openTask(false); }

/* ---------- answers, and sending them ---------- */
const AK = Keep.NS + "-answers"; let answers = Keep.lsGet(AK) || {};
const m = /[?&]s=(\d+)/.exec(location.search); let stage = (m && STAGES[m[1]]) ? +m[1] : (answers.stage && STAGES[answers.stage] ? answers.stage : Math.max.apply(null, Object.keys(STAGES).map(Number)));
const A = () => (answers["s" + stage] = answers["s" + stage] || {}); let task = 0;
const saveAnswers = () => { answers.stage = stage; Keep.lsSet(AK, answers); };
const tasks = () => STAGES[stage].tasks;
function report() { const a = A(), out = ["Core test · stage " + stage + " (" + STAGES[stage].name + ")", new Date().toLocaleString() + " · " + (TOUCH ? "touch" : "mouse") + " · " + innerWidth + "×" + innerHeight + " · v" + (window.CORE_VERSION || "?") + " · " + navigator.userAgent.replace(/\s+/g, " ").slice(0, 140), ""];
  tasks().forEach((T, i) => { const x = a[i] || {}; out.push((i + 1) + ". " + T.t + ": " + (x.v === "ok" ? "WORKS" : x.v === "off" ? "SOMETHING'S OFF" : "(no answer)") + (x.note && x.note.trim() ? "\n   " + x.note.trim().replace(/\n/g, "\n   ") : "")); });
  if (a.all && a.all.trim()) out.push("", "Anything else: " + a.all.trim()); return out.join("\n"); }
function paintTask() {
  const list = tasks(), last = task >= list.length, T = list[task], a = A(), x = a[task] || {}; a.at = task; saveAnswers();
  $("#gN").textContent = "Stage " + stage + " · " + (last ? "done" : (task + 1) + " of " + list.length); $("#gT").textContent = last ? "Send your answers" : T.t;
  let h = "";
  if (!last) { h = "<p>" + (TOUCH || !T.dLaptop ? T.d : T.dLaptop) + "</p>" + (T.n ? '<p class="nt">' + T.n + "</p>" : "") + '<div class="gans"><div class="row"><button class="av' + (x.v === "ok" ? " on" : "") + '" data-v="ok">✓ Works</button><button class="av' + (x.v === "off" ? " on off" : "") + '" data-v="off">Something’s off</button></div><textarea id="gNote" rows="2" placeholder="What did you notice? (optional)">' + esc(x.note || "") + "</textarea></div>"; }
  else { const key = Keep.lsGet("tol-gh-token"), n = list.filter((q, i) => a[i] && a[i].v).length;
    h = '<p>That’s stage ' + stage + ". Send your answers, then tell Claude “done”.</p><div class=\"gans\"><p class=\"nt\">" + n + " of " + list.length + ' checks answered.</p><textarea id="gAll" rows="2" placeholder="Anything else? (optional)">' + esc(a.all || "") + '</textarea><div class="row">' + (key ? '<button class="show" id="gSend">Send to Claude</button>' : "") + '<button id="gCopy">Copy my answers</button></div><p class="nt" id="gMsg">' + (a.sent ? "Sent. Tell Claude “done” and it will read them." : key ? "Send posts your answers (never your writing) to your project on GitHub, where Claude reads them." : "This device has no GitHub key, so tap Copy and paste your answers to Claude.") + "</p></div>"; }
  h += '<div class="row">' + (!last && T.show ? '<button class="show" id="gShow">Show me</button>' : "") + (!last && T.feel ? '<button class="show" id="gLong">Add a long leaf</button>' : "") + (task ? '<button id="gBack">Back</button>' : "") + '<select id="gStage" aria-label="Stage">' + Object.keys(STAGES).map(k => '<option value="' + k + '"' + (+k === stage ? " selected" : "") + ">Stage " + k + ": " + esc(STAGES[k].name) + "</option>").join("") + '</select><button id="gReset">Start over</button><a href="../" class="lnk">The real app</a></div>';
  $("#gD").innerHTML = h; $("#gNext").classList.toggle("hide", last);
  if (!last && T.show) $("#gShow").onclick = () => demo(T.show); if (!last && T.feel) $("#gLong").onclick = addLong; if (task) $("#gBack").onclick = () => { task--; paintTask(); };
  $("#gStage").onchange = e => { stage = +e.target.value; task = Math.min(A().at || 0, tasks().length); paintTask(); };
  $("#gD").querySelectorAll(".av").forEach(b => { b.onclick = () => { a[task] = Object.assign({}, a[task], { v: b.dataset.v }); saveAnswers(); paintTask(); }; });
  const nt = $("#gNote"); if (nt) nt.oninput = () => { a[task] = Object.assign({}, a[task], { note: nt.value }); saveAnswers(); };
  $("#gReset").onclick = () => { if (confirm("Put the sample book back to the start? What you wrote on THIS test page is cleared. Your answers are kept.")) { try { sessionStorage.setItem("core-test-reset", "1"); } catch (e) {} location.reload(); } };
  if (last) { const all = $("#gAll"), msg = t => { $("#gMsg").textContent = t; }; all.oninput = () => { a.all = all.value; saveAnswers(); };
    $("#gCopy").onclick = async () => { const text = report(); try { await navigator.clipboard.writeText(text); msg("Copied. Paste it to Claude."); } catch (e) { const ta = el("textarea"); ta.value = text; ta.rows = 6; ta.readOnly = true; $("#gD").appendChild(ta); ta.select(); msg("Select all of this and copy it:"); } };
    const sd = $("#gSend"); if (sd) sd.onclick = async () => { if (sd.dataset.sure !== "1") { sd.dataset.sure = "1"; sd.textContent = "Yes, post it"; return msg("Your project on GitHub is public, so these answers can be seen there. Your writing is not included. Tap again to post."); }
      sd.disabled = true; msg("Sending…"); try { const offs = list.filter((q, i) => a[i] && a[i].v === "off").length;
        const r = await fetch("https://api.github.com/repos/obrianwatson/tree-of-life/issues", { method: "POST", headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + Keep.lsGet("tol-gh-token"), "Content-Type": "application/json" }, body: JSON.stringify({ title: "Core test · stage " + stage + (offs ? " · " + offs + " off" : " · all works"), body: "```\n" + report().replace(/@/g, "(at)") + "\n```\n_Sent from the guided test page. No writing is included._" }) });
        if (!r.ok) throw new Error("GitHub answered " + r.status); a.sent = Date.now(); saveAnswers(); paintTask(); } catch (e) { sd.disabled = false; msg("Couldn't send (" + (e.message || e) + "). Tap Copy and paste your answers to Claude instead."); } }; }
}
function openTask(v) { $("#gD").classList.toggle("hide", !v); $("#gMore").textContent = v ? "Hide" : "Details"; }
$("#gMore").onclick = () => openTask($("#gD").classList.contains("hide"));
$("#gD").addEventListener("click", e => { if (!e.target.closest("button,a,textarea,select")) openTask(false); });
document.addEventListener("pointerdown", e => { if (!strip.contains(e.target) && !DEMO) openTask(false); });
$("#gNext").onclick = () => { task = Math.min(tasks().length, task + 1); paintTask(); openTask(true); };
task = Math.min(A().at || 0, tasks().length); paintTask(); openTask(true);
window.Guide = { STAGES, demo, report, seed, repaint: paintTask, get stage() { return stage; }, set stage(n) { stage = n; task = 0; paintTask(); }, get task() { return task; }, set task(n) { task = n; paintTask(); }, get answers() { return answers; } };
})();
