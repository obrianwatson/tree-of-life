/* guide.js · THE GUIDED TEST of BOLW Essentials: the 11 checks from the plan, one at a time.
   For each: Show me (a finger does it slowly, through the SAME buttons and joints, then everything is put back),
   then you try it and answer Works or Something's off, with a note. At the end your answers are sent for Claude to read.
   This page is the real app on its own sample book ("bolw-test" drawer): never your real book, never synced.
   In Show me, the AI's part is a REHEARSAL (a scripted stand-in, no key, no cost). When you try it yourself, it's the real AI. */
(function () {
"use strict";
const B = window.Book, Page = window.Page, Shelf = window.Shelf, Breath = window.Breath, Socket = window.Socket, Keep = window.Keep, Settings = window.Settings;
const $ = s => document.querySelector(s), el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TOUCH = matchMedia("(pointer:coarse)").matches, WIDE = () => matchMedia("(pointer:fine) and (min-width:900px)").matches;
const QUICK = /[?&]quick/.test(location.search);

/* ---------- the sample book ---------- */
const PSALM = "Psalm 23\nThe Lord is my shepherd; I shall not want.\nHe maketh me to lie down in green pastures:\nhe leadeth me beside the still waters.\nHe restoreth my soul.";
function seed() { const mk = text => { const r = B.act("open_note", { note: "new" }); B.act("write", { where: r.where, words: text }); return r.note; };
  mk("Groceries\neggs\nbread\ncoffee"); const song = mk("Song idea\nrivers in the desert\na road where there was none"); const ps = mk(PSALM);
  const P = Shelf.projects(); Shelf.putNote(song, P[0].id); Shelf.putNote(ps, P[2].id); B.clearUndo(); B.flush(); Shelf.flush(); Page.ui = { view: "note", spots: {}, proj: "" }; Page.render(); }
if (!Object.keys(B.D.notes).length) seed();
const noteId = title => { const n = B.notes().find(n => B.title(n.id) === title); return n && n.id; };

/* ---------- the strip ---------- */
const strip = el("div", "gt"); strip.innerHTML = `<div class="tl"><b id="tN"></b><span class="sp" id="tT"></span><button id="tMore">Hide</button><button id="tNext">Next</button></div><div class="td" id="tD"></div>`;
function place() { const br = $("#br"), sheet = $("#set"), t = !sheet.classList.contains("hide") ? sheet : (!br.classList.contains("hide") && !WIDE()) ? br : $("#head"); if (strip.parentNode !== t) { t.insertBefore(strip, t.firstChild); Breath.fit(); } }
place(); new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ["class"] });

/* ---------- the rehearsal AI (Show me only) ---------- */
let script = [], held = null;
Socket.plug("rehearsal", { label: "Claude", models: async () => [{ id: "rehearsal", label: "Rehearsal (no cost)" }],
  async stream({ messages, signal, onText }) { let blocks = script.shift() || [["text", "(end of the rehearsal)"]]; if (typeof blocks === "function") blocks = blocks(messages);
    const content = []; let tool = false;
    for (const b of blocks) { if (b[0] === "text") { let t = ""; for (const w of b[1].split(" ")) { if (signal.aborted) throw Object.assign(new Error("stopped"), { name: "AbortError" }); onText(w + " "); t += w + " "; await new Promise(r => setTimeout(r, QUICK ? 1 : 70)); } content.push({ type: "text", text: t }); }
      else { tool = true; await new Promise(r => setTimeout(r, QUICK ? 1 : 500)); content.push({ type: "tool_use", id: "t" + Math.random().toString(36).slice(2), name: b[0], input: b[1] }); } }
    return { content, stop: tool ? "tool_use" : "end_turn", usage: { in: 0, out: 0 } }; } });

/* ---------- the finger ---------- */
let run = 0, DEMO = false; const cu = $("#cur"), shield = $("#shield");
const sleep = (ms, r) => new Promise((res, rej) => setTimeout(() => r === run ? res() : rej(0), QUICK ? Math.min(ms, 4) : ms));
async function demo(fn) {
  const before = JSON.stringify(B.D), shelfBefore = JSON.stringify(Shelf.S), uiBefore = JSON.stringify(Page.ui), y = scrollY, r = ++run, prov = Socket.using;
  openTask(false); Breath.close(); Settings.close(); DEMO = true; Page.demoMode(true); Socket.use("rehearsal"); script = [];
  shield.classList.remove("hide"); cu.classList.remove("hide"); cu.style.left = "50%"; cu.style.top = "70%";
  const pg = $("#pg");
  const f = {
    sleep: ms => sleep(ms, r), say: Page.say, B,
    async point(e) { if (!e) return; const inWin = e.closest && e.closest("#br,#set"); const rc0 = e.getBoundingClientRect(); if (!inWin && (rc0.top < $("#head").getBoundingClientRect().bottom + 10 || rc0.bottom > innerHeight - 70)) { scrollBy(0, rc0.top - innerHeight / 2); await sleep(50, r); } else if (inWin && e.scrollIntoView) e.scrollIntoView({ block: "nearest" });
      const rc = e.getBoundingClientRect(); cu.style.left = (rc.left + Math.min(rc.width / 2, 160)) + "px"; cu.style.top = (rc.top + rc.height / 2) + "px"; await sleep(950, r); },
    async tap(e) { await f.point(e); cu.classList.add("down"); await sleep(260, r); cu.classList.remove("down"); await sleep(320, r); },
    find: Page.find, lineEl: line => pg.querySelector('.l[data-id="' + line + '"]'),
    async caret(spot, at) { const L = B.D.lines[spot.line]; await f.tap(f.lineEl(spot.line)); Page.setCaret({ where: spot.where, line: spot.line, at: at == null ? L.text.length : at }); await sleep(300, r); },
    async select(a, b) { await f.point(f.lineEl(a.line)); cu.classList.add("down"); await sleep(300, r); await f.point(f.lineEl(b.line)); cu.classList.remove("down"); Page.demoSelect(a, b); await sleep(500, r); },
    async type(str, speed) { for (const ch of str) { const p = Page.pos, w = B.act("write", { where: p.where, line: p.line, at: p.at, words: ch }); if (!w.ok) break; Page.render(); Page.setCaret(w.caret); const e = f.lineEl(Page.pos.line); if (e) { const rc = e.getBoundingClientRect(); if (rc.bottom > innerHeight - 90) scrollBy(0, rc.bottom - innerHeight + 120); } await sleep(speed || 60, r); } await sleep(500, r); },
    async fold() { await f.tap($("#bFold")); const x = Page.cmdFold(); await sleep(700, r); return x; },
    async hinge(fid) { await f.tap(pg.querySelector('.hg[data-f="' + fid + '"]')); Page.cmdOpen(fid, !B.D.folds[fid].open); await sleep(900, r); },
    async thread(fid) { await f.tap(pg.querySelector('.th[data-f="' + fid + '"]')); Page.cmdOpen(fid, false); await sleep(900, r); },
    async menu(label) { await f.tap($("#bMore")); const rc = $("#bMore").getBoundingClientRect(); Page.openMenu({ left: rc.left, top: rc.top, bottom: rc.bottom, fromBar: true }); await sleep(600, r);
      const b = [...$("#menu").querySelectorAll("button")].find(x => x.textContent.indexOf(label) === 0); if (b) { await f.tap(b); Page.closeMenu(); const it = Page.menuItems().find(i => i && i[0].indexOf(label) === 0); if (it) it[1](); } else Page.closeMenu(); await sleep(900, r); },
    async undo() { await f.tap($("#bUndo")); Page.doUndo(); await sleep(900, r); },
    async notes() { await f.tap($("#notesBtn")); Page.showList(); await sleep(900, r); },
    async open(id) { await f.tap($('#listv [data-note="' + id + '"]')); Page.openNote(id); await sleep(900, r); },
    async newNote() { await f.tap($("#newNote")); const x = Page.openNote("new"); await sleep(700, r); return x; },
    async crumb(i) { const b = $("#path").querySelectorAll("button")[i]; await f.tap(b); const s = b.dataset.go; Page.jump(s ? { fold: s } : { note: 1 }); await sleep(1200, r); },
    async away() { const a = $("#app"); a.style.transition = "opacity .6s"; a.style.opacity = 0; await sleep(1400, r); a.style.opacity = ""; await sleep(900, r); a.style.transition = ""; },
    /* the AI window */
    async spark() { await f.tap($("#notev").classList.contains("hide") ? $("#spark2") : $("#spark")); Breath.open(); Breath.startChat(Shelf.projectOf(B.D.current)); Breath.show("chat"); await sleep(800, r); },
    async ask(text, ...replies) { script = replies; const inp = $("#brIn"); await f.point(inp); for (const ch of text) { inp.value += ch; await sleep(22, r); } await f.tap($("#brSend")); return { done: Breath.send(inp.value) }; },
    async reply(text, ...replies) { await (await f.ask(text, ...replies)).done; await sleep(900, r); },
    async click(sel, root) { const e = typeof sel === "string" ? (root || document).querySelector(sel) : sel; if (!e) return; await f.tap(e); e.click(); await sleep(800, r); },
    async reopen() { await f.tap($("#spark")); Breath.open(); await sleep(800, r); },
    async back() { await f.click("#brBack"); }
  };
  try { await fn(f); await sleep(1300, r); } catch (e) { if (e !== 0) console.error(e); }
  DEMO = false; if (Breath.busy) { $("#brStop").click(); await new Promise(r => setTimeout(r, 60)); }
  Socket.use(prov); cu.classList.add("hide"); shield.classList.add("hide"); Breath.close(); Settings.close(); Page.demoMode(false);
  B.replace(JSON.parse(before)); Shelf.replace(JSON.parse(shelfBefore)); Shelf.flush(); Breath.reset(); Page.ui = JSON.parse(uiBefore); Page.render(); scrollTo(0, y); openTask(true);
}
shield.addEventListener("click", () => { run++; });

/* ---------- the 11 checks ---------- */
const psalm = () => noteId("Psalm 23"), L = t => Page.find(t);
const TASKS = [
  { t: "Notes: write, leave, come back", d: "Tap <b>‹ Notes</b>, then <b>New note</b>, and write a few lines. Go back to Notes and open another note. Then close this page completely and open it again: you should land on the same note, on the line you left. (Offline is check 9.)",
    show: async f => { Page.openNote(psalm()); await f.sleep(600); await f.notes(); const n = await f.newNote(); await f.type("A thought\nIt saves itself as I type."); await f.notes(); await f.open(psalm()); await f.caret(L("still waters")); f.say("Closing the page…"); await f.away(); f.say("…and back: the same note, the same line."); const e = f.lineEl(L("still waters").line); e.classList.add("flash"); await f.sleep(1500); } },
  { t: "Folds: fold, fold inside, hinge, remove, trace", d: "Tap a line, then <b>Fold</b>, and write inside. Fold a line inside the fold. Tap the small ▾ to close and open. Use <b>⌄</b> for Trace back and Remove fold, then <b>Undo</b>. Watch the colored threads.", dLaptop: "Click a line, then <b>Fold</b> (or press Tab, or right-click the line), and write inside. Fold a line inside the fold. Click the small ▾ to close and open. Use <b>⌄</b> or right-click for Trace back and Remove fold, then <b>Undo</b> (⌘Z).",
    show: async f => { Page.openNote(psalm()); await f.sleep(500); await f.caret(L("The Lord is my shepherd")); const a = await f.fold(); await f.type("A shepherd guides and guards."); const b = await f.fold(); await f.type("He walks ahead."); await f.hinge(a.fold); await f.hinge(a.fold); await f.caret(L("He walks ahead")); await f.menu("Trace back"); await f.crumb(1); await f.caret(L("The Lord is my shepherd")); await f.menu("Remove fold"); await f.undo(); } },
  { t: "The AI window: open, model, stream, stop", d: "Tap <b>✦</b> (top right). Pick a model at the top. Ask something about the note and watch the answer arrive word by word. Ask for something long and tap <b>Stop</b>. <b>← Book</b> takes you back.", dLaptop: "Press <b>⌘K</b> (or click ✦): the window opens beside the page. Pick a model. Ask something about the note and watch it arrive word by word. Ask for something long and press <b>Stop</b>. ⌘K hides it.", n: "Trying it yourself uses your real AI key (Notes → Settings → AI key).",
    show: async f => { Page.openNote(psalm()); await f.spark(); await f.point($("#brModel")); await f.reply("What is this psalm about?", [["text", "It is a song of trust. The writer is a sheep, and the Lord is the shepherd who feeds, leads and guards him."]]); const p = await f.ask("Tell me the whole history of shepherds", [["text", "Long before cities, people walked beside their flocks across dry hills, watching the sky for rain and the ground for grass, and every evening they counted them home again, one by one, because a shepherd who cannot count"]]); await f.sleep(1800); await f.tap($("#brStop")); $("#brStop").click(); await p.done; await f.sleep(900); await f.back(); } },
  { t: "A project with its own instructions", d: "In the AI window tap <b>☰ Chats</b>, open a project (or make one), write instructions for it, then <b>New chat in this project</b>. Ask something and check that it follows them.",
    show: async f => { await f.spark(); await f.click("#brChats"); await f.click('[data-p="' + Shelf.projects()[0].id + '"]'); const t = $("#bpIns"); await f.point(t); t.value = "Answer only in rhyming couplets."; t.dispatchEvent(new Event("input")); await f.sleep(900); await f.click("#bpChat"); await f.reply("Give me a line about rain", [["text", "The clouds roll in, the dust lies down, and silver falls on a thirsty town."]]); await f.back(); } },
  { t: "Chat history: find, rename, delete, bring back", d: "Tap <b>☰ Chats</b>. Search for a word from an old chat. Tap <b>⋯</b> on a chat to rename it, then delete it. Find it under Recently deleted chats and bring it back.",
    show: async f => { await f.spark(); await f.reply("What rhymes with river?", [["text", "Shiver, giver, deliver, quiver."]]); await f.click("#brChats"); const id = Breath.chat.id; await f.point($('[data-more="' + id + '"]')); Shelf.rename(id, "River rhymes"); Breath.show("list"); await f.sleep(1100); await f.point($('[data-more="' + id + '"]')); Shelf.remove(id); Breath.show("list"); await f.sleep(1100); await f.click('[data-back="' + id + '"]'); await f.sleep(700); await f.back(); } },
  { t: "The AI folds a line and writes inside", d: "In a note, ask the AI: <i>“Fold the line about the still waters and write a short thought inside.”</i> Check: each thing it did is a line in the chat; tapping a line takes you there; its writing has its own color; <b>Undo Claude’s changes</b> takes it all back in one tap.",
    show: async f => { Page.openNote(psalm()); await f.spark(); await f.reply("Fold the line about the still waters and write a short thought inside", [["read_note", {}]], [["fold_line", { from: 4 }]], m => [["write", { where: /id is \\?"(f\w+)/.exec(JSON.stringify(m[m.length - 1]))[1], words: "Still water is where a sheep can drink without fear." }]], [["text", "I folded line 4 and wrote one thought inside it."]]);
      const acts = document.querySelectorAll(".m.ai:last-child .act"); await f.click(acts[acts.length - 1]); await f.sleep(1500); if (!WIDE()) await f.reopen(); await f.click(".m.ai:last-child .undo"); if (!WIDE()) await f.back(); await f.sleep(900); } },
  { t: "It asks first", d: "Ask the AI to <i>change one of your lines</i>, and to <i>remove a fold</i>. Each time a card should show Before and After with <b>Allow</b> and <b>Don’t</b>, and nothing changes until you choose.",
    show: async f => { Page.openNote(psalm()); await f.spark(); const p = await f.ask("Reword the line about my soul", [["write", { line: 5, how: "replace", words: "He makes my soul new." }]], [["text", "I left your line as it was."]]); await f.sleep(1600); const no = [...document.querySelectorAll(".ask .row button")].find(b => b.textContent.indexOf("Don") === 0); await f.tap(no); no.click(); await p.done; await f.sleep(1200); await f.back(); } },
  { t: "Only the note that's open", d: "Ask the AI to add a line to a <i>different</i> note (say, Groceries). It should refuse and say why, and that note should be unchanged.",
    show: async f => { Page.openNote(psalm()); await f.spark(); await f.reply("Add milk to my Groceries note", [["write", { where: noteId("Groceries"), words: "milk" }]], [["text", "I can only work in the note that's open. Open Groceries and ask me there."]]); await f.back(); } },
  { t: "Offline", d: "Turn on Airplane Mode (and Wi-Fi off). Write in a note and make a fold: it all still works. Open ✦: it says it needs the internet. Type something there anyway, close this page, open it again: your draft is still in the box. Then turn the internet back on.", n: "No Show me for this one: it needs your device's own switch." },
  { t: "Export your book", d: "Go to <b>‹ Notes</b> → <b>Settings</b> → <b>Export to read (.txt)</b>. Open the file: your notes should be there in plain words, with folds indented under their lines.", n: "This page exports the sample book. In the real app it's your whole book.",
    show: async f => { await f.notes(); await f.tap($("#openSet")); Settings.open(); await f.sleep(700); await f.point($("#sTxt")); await f.sleep(1400); await f.point($("#sVers")); await f.sleep(1200); } },
  { t: "Feel", d: "Tap <b>Add a long note</b> below, then: type fast in the middle of it, scroll it top to bottom, open and close a fold, open and close the AI window. Nothing should lag or jump. Try the same in a short note.", feel: true },
  { t: "Send your answers", d: "That's all eleven. Send your answers, then tell Claude “done”." }
];
const LASTT = TASKS.length - 1;
function addLong() { const r = B.act("open_note", { note: "new" }), t = ["A long note for the feel check"]; for (let i = 1; i <= 1200; i++) t.push("Line " + i + ": the river keeps on running and the page keeps up with it."); B.act("write", { where: r.where, words: t.join("\n") });
  for (let i = 0; i < 12; i++) { const bx = B.D.boxes[r.where], f = B.act("fold_line", { where: r.where, from: bx.lines[20 + i * 90] }); B.act("write", { where: f.fold, words: "a thought kept inside line " + (20 + i * 90) }); if (i % 2) B.act("open_fold", { fold: f.fold, open: false }); }
  B.clearUndo(); Page.openNote(r.note); openTask(false); }

/* ---------- answers, and sending them ---------- */
const AK = Keep.NS + "-answers"; let answers = Keep.lsGet(AK) || {}, task = Math.min(LASTT, answers.at || 0);
const saveAnswers = () => Keep.lsSet(AK, answers);
function report() { const out = ["Essentials test (the 11 checks)", new Date().toLocaleString() + " · " + (TOUCH ? "touch" : "mouse") + " · " + innerWidth + "×" + innerHeight + " · " + navigator.userAgent.replace(/\s+/g, " ").slice(0, 140), ""];
  TASKS.slice(0, LASTT).forEach((T, i) => { const a = answers[i] || {}; out.push((i + 1) + ". " + T.t + ": " + (a.v === "ok" ? "WORKS" : a.v === "off" ? "SOMETHING'S OFF" : "(no answer)") + (a.note && a.note.trim() ? "\n   " + a.note.trim().replace(/\n/g, "\n   ") : "")); });
  if (answers.all && answers.all.trim()) out.push("", "Anything else: " + answers.all.trim()); return out.join("\n"); }
function paintTask() { const T = TASKS[task], last = task === LASTT, a = answers[task] || {}; answers.at = task; saveAnswers();
  $("#tN").textContent = last ? "Done" : "Check " + (task + 1) + " of " + LASTT; $("#tT").textContent = T.t;
  let h = "<p>" + (TOUCH || !T.dLaptop ? T.d : T.dLaptop) + "</p>" + (T.n ? '<p class="nt">' + T.n + "</p>" : "");
  if (!last) h += '<div class="ans"><div class="row"><button class="av' + (a.v === "ok" ? " on" : "") + '" data-v="ok">✓ Works</button><button class="av' + (a.v === "off" ? " on off" : "") + '" data-v="off">Something’s off</button></div><textarea id="aNote" rows="2" placeholder="What did you notice? (optional)">' + esc(a.note || "") + "</textarea></div>";
  else { const key = Keep.lsGet("tol-gh-token"), n = TASKS.slice(0, LASTT).filter((x, i) => answers[i] && answers[i].v).length;
    h += '<div class="ans"><p class="nt">' + n + " of " + LASTT + ' checks answered.</p><textarea id="aAll" rows="2" placeholder="Anything else? (optional)">' + esc(answers.all || "") + '</textarea><div class="row">' + (key ? '<button class="show" id="aSend">Send to Claude</button>' : "") + '<button id="aCopy">Copy my answers</button></div><p class="nt" id="aMsg">' + (answers.sent ? "Sent. Tell Claude “done” and it will read them." : key ? "Send posts your answers (never your writing) to your project on GitHub, where Claude reads them." : "This device has no GitHub key, so tap Copy and paste your answers to Claude.") + "</p></div>"; }
  h += '<div class="row">' + (T.show ? '<button class="show" id="tShow">Show me</button>' : "") + (T.feel ? '<button class="show" id="tLong">Add a long note</button>' : "") + (task ? '<button id="tBack">Back</button>' : "") + '<button id="tReset">Start over</button><a href="../" class="lnk">The real app</a></div>';
  $("#tD").innerHTML = h; $("#tNext").classList.toggle("hide", last);
  if (T.show) $("#tShow").onclick = () => demo(T.show); if (T.feel) $("#tLong").onclick = addLong; if (task) $("#tBack").onclick = () => { task--; paintTask(); };
  $("#tD").querySelectorAll(".av").forEach(b => { b.onclick = () => { answers[task] = Object.assign({}, answers[task], { v: b.dataset.v }); saveAnswers(); paintTask(); }; });
  const nt = $("#aNote"); if (nt) nt.oninput = () => { answers[task] = Object.assign({}, answers[task], { note: nt.value }); saveAnswers(); };
  $("#tReset").onclick = () => { if (confirm("Put the sample book back to the start? What you wrote on THIS test page is cleared. Your answers are kept.")) { try { sessionStorage.setItem("bolw-test-reset", "1"); } catch (e) {} location.reload(); } };
  if (last) { const all = $("#aAll"), msg = t => { $("#aMsg").textContent = t; }; all.oninput = () => { answers.all = all.value; saveAnswers(); };
    $("#aCopy").onclick = async () => { const text = report(); try { await navigator.clipboard.writeText(text); msg("Copied. Paste it to Claude."); } catch (e) { const ta = el("textarea"); ta.value = text; ta.rows = 6; ta.readOnly = true; $("#tD").appendChild(ta); ta.select(); msg("Select all of this and copy it:"); } };
    const sd = $("#aSend"); if (sd) sd.onclick = async () => { if (sd.dataset.sure !== "1") { sd.dataset.sure = "1"; sd.textContent = "Yes, post it"; return msg("Your project on GitHub is public, so these answers can be seen there. Your writing is not included. Tap again to post."); }
      sd.disabled = true; msg("Sending…"); try { const offs = TASKS.slice(0, LASTT).filter((x, i) => answers[i] && answers[i].v === "off").length;
        const r = await fetch("https://api.github.com/repos/obrianwatson/tree-of-life/issues", { method: "POST", headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + Keep.lsGet("tol-gh-token"), "Content-Type": "application/json" }, body: JSON.stringify({ title: "Essentials test" + (offs ? " · " + offs + " off" : " · all works"), body: "```\n" + report() + "\n```\n_Sent from the guided test page. No writing is included._" }) });
        if (!r.ok) throw new Error("GitHub answered " + r.status); answers.sent = Date.now(); saveAnswers(); paintTask(); } catch (e) { sd.disabled = false; msg("Couldn't send (" + (e.message || e) + "). Tap Copy and paste your answers to Claude instead."); } }; }
}
function openTask(v) { $("#tD").classList.toggle("hide", !v); $("#tMore").textContent = v ? "Hide" : "Details"; }
$("#tMore").onclick = () => openTask($("#tD").classList.contains("hide"));
$("#tD").addEventListener("click", e => { if (!e.target.closest("button,a,textarea")) openTask(false); });
document.addEventListener("pointerdown", e => { if (!strip.contains(e.target) && !DEMO) openTask(false); });
$("#tNext").onclick = () => { task = Math.min(LASTT, task + 1); paintTask(); openTask(true); };
paintTask(); openTask(true);
window.Guide = { TASKS, demo, report, get task() { return task; }, set task(n) { task = n; paintTask(); }, get answers() { return answers; } };
})();
