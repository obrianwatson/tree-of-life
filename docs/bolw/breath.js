/* breath.js · THE AI WINDOW (the breath).
   Laptop: a side window beside the page (⌘K or Ctrl K shows and hides it). iPhone: full screen (✦ opens it, ← Book goes back).
   Like the chat apps: history (new, rename, delete and bring back, search), a model picker, instructions for all
   of BOLW plus per project, the open note going along (and others you attach), streaming with Stop.
   It acts on your notes ONLY through the six joints, with the one hand joints.js gives it, past the riverbanks
   (banks.js). Everything it does is a line in the chat you can tap; one reply is one Undo; its writing has its own
   color until you edit it. It never types, so it never adds writing time.
   What goes to the AI: only what you send (your message, the instructions, the note that goes along, notes you
   attached), and only when you press Send. */
(function (g) {
"use strict";
const B = g.Book, Shelf = g.Shelf, Socket = g.Socket, Banks = g.Banks, Page = g.Page;
const hand = B.breath();                                // the breath's one hand on the joints
Banks.attach(B, Shelf);
const $ = s => document.querySelector(s), el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const WIDE = () => matchMedia("(pointer:fine) and (min-width:900px)").matches;
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const uid = () => Math.random().toString(36).slice(2, 9);

document.body.insertAdjacentHTML("beforeend", `
<aside class="br hide" id="br" aria-label="The AI window">
  <div class="brh"><button id="brChats" aria-label="Chats and projects">☰ Chats</button><span class="sp" id="brTitle"></span><select id="brModel" aria-label="Model"></select><button class="back" id="brBack"></button></div>
  <div class="brv" id="brChat">
    <div class="brctx" id="brCtx"></div>
    <div class="brm" id="brMsgs"></div>
    <div class="brnote hide" id="brNote"></div>
    <div class="brc"><textarea id="brIn" rows="1" placeholder="Ask, or ask it to do something in this note"></textarea><button class="send" id="brSend">Send</button><button class="send stop hide" id="brStop">Stop</button></div>
  </div>
  <div class="brv scroll hide" id="brList"></div>
  <div class="brv scroll hide" id="brProj"></div>
</aside>`);
const br = $("#br"), msgs = $("#brMsgs"), input = $("#brIn");
let chat = null, busy = null, view = "chat", models = [], listQ = "";

/* ================= opening and closing ================= */
function fit() {             // phone: the window fills exactly what you can see, so the keyboard never covers the box you type in
  if (br.classList.contains("hide") || WIDE()) { br.style.height = ""; br.style.transform = ""; return; }
  const v = g.visualViewport; if (!v) return; br.style.height = (v.height - br.offsetTop) + "px"; br.style.transform = "translateY(" + v.offsetTop + "px)"; }
if (g.visualViewport) { visualViewport.addEventListener("resize", fit); visualViewport.addEventListener("scroll", fit); }
function open() {
  if (!br.classList.contains("hide")) return; Page.saveSpot();
  if (!WIDE() && document.activeElement && document.activeElement.blur) document.activeElement.blur();
  br.classList.remove("hide"); document.body.classList.add("br-open"); $("#brBack").textContent = WIDE() ? "Hide" : "← Book";
  if (!chat) { const c = Shelf.chat(Shelf.S.current); chat = c && !c.deleted ? c : null; }
  if (!chat || (chat.msgs.length && Date.now() - chat.updatedAt > 6 * 3600000)) startChat(Shelf.projectOf(B.D.current));     // a fresh chat after a long while away
  show("chat"); fit(); Page.placeBar(); loadModels(); if (WIDE()) input.focus();
}
function close() { br.classList.add("hide"); document.body.classList.remove("br-open"); Shelf.flush(); Page.placeBar(); }
const toggle = () => br.classList.contains("hide") ? open() : close();
$("#brBack").onclick = close;
function show(v) { view = v; $("#brChat").classList.toggle("hide", v !== "chat"); $("#brList").classList.toggle("hide", v !== "list"); $("#brProj").classList.toggle("hide", v !== "proj");
  $("#brChats").textContent = v === "chat" ? "☰ Chats" : "‹ Chat"; $("#brModel").classList.toggle("hide", v !== "chat");
  if (v === "chat") paintChat(); else if (v === "list") paintList(); }
$("#brChats").onclick = () => show(view === "chat" ? "list" : "chat");

/* ================= models ================= */
const modelOf = () => (chat && chat.model) || Shelf.S.set.model || "claude-sonnet-5-5";
function paintModels() { const s = $("#brModel"), cur = modelOf(); const list = models.slice(); if (!list.some(m => m.id === cur)) list.unshift({ id: cur, label: cur });
  s.innerHTML = list.map(m => `<option value="${esc(m.id)}"${m.id === cur ? " selected" : ""}>${esc(m.label)}</option>`).join(""); }
function loadModels() { Socket.models().then(l => { models = l || []; paintModels(); }).catch(() => {}); paintModels(); }
$("#brModel").onchange = e => { if (chat) { chat.model = e.target.value; Shelf.touch(chat); } Shelf.set({ model: e.target.value }); };

/* ================= one chat ================= */
function startChat(project) { chat = Shelf.newChat(project || null, B.D.current); if (view === "chat") paintChat(); return chat; }
function openChat(id) { const c = Shelf.chat(id); if (!c) return; chat = c; Shelf.S.current = id; Shelf.save(true); show("chat"); }
const goesAlong = () => chat && chat.alone ? null : (Page.view === "note" && B.D.notes[B.D.current] ? B.D.current : null);
function paintCtx() {
  const c = $("#brCtx"); c.textContent = ""; if (!chat) return;
  const p = Shelf.project(chat.project); const pb = el("button", "chip" + (p ? " on" : ""), p ? p.name : "No project"); pb.onclick = () => pickProject(pb); c.appendChild(pb);
  const cur = goesAlong();
  if (cur) { const b = el("button", "chip on", "With: " + clip(B.title(cur), 22) + " ×"); b.title = "This note goes along with what you send. Tap to leave it out of this chat."; b.onclick = () => { chat.alone = true; Shelf.touch(chat, true); paintCtx(); }; c.appendChild(b); }
  else if (chat.alone && Page.view === "note") { const b = el("button", "chip", "+ the open note"); b.onclick = () => { chat.alone = false; Shelf.touch(chat, true); paintCtx(); }; c.appendChild(b); }
  (chat.attach || []).filter(id => B.D.notes[id]).forEach(id => { const b = el("button", "chip on", "+ " + clip(B.title(id), 18) + " ×"); b.onclick = () => { chat.attach = chat.attach.filter(x => x !== id); Shelf.touch(chat, true); paintCtx(); }; c.appendChild(b); });
  const add = el("button", "chip", "Attach a note"); add.onclick = () => { const items = B.notes().filter(n => n.id !== cur && (chat.attach || []).indexOf(n.id) < 0 && B.hasWriting(n.id)).slice(0, 12).map(n => [clip(B.title(n.id), 30), () => { chat.attach = (chat.attach || []).concat(n.id); Shelf.touch(chat, true); paintCtx(); }]);
    const r = add.getBoundingClientRect(); Page.openMenu({ left: r.left, top: r.top, bottom: r.bottom }, items.length ? items : [["No other notes to attach", () => {}]]); }; c.appendChild(add);
}
function pickProject(btn) { const r = btn.getBoundingClientRect(), set = id => { chat.project = id; Shelf.touch(chat, true); paintCtx(); paintTitle(); };
  Page.openMenu({ left: r.left, top: r.top, bottom: r.bottom }, [[(chat.project ? "" : "✓ ") + "No project", () => set(null)]].concat(Shelf.projects().map(p => [(chat.project === p.id ? "✓ " : "") + p.name, () => set(p.id)]))); }
const paintTitle = () => { $("#brTitle").textContent = view !== "chat" ? "" : (chat && chat.title) || "New chat"; };
function paintNote() { const n = $("#brNote"); let t = "";
  if (navigator.onLine === false) t = "You're offline. The AI needs the internet. What you type here is kept as a draft.";
  else if (!Socket.hasKey()) t = "There's no AI key on this device yet. Add it under Notes → Settings → AI key.";
  n.textContent = t; n.classList.toggle("hide", !t); $("#brSend").disabled = !!t || !!busy; }
addEventListener("online", paintNote); addEventListener("offline", paintNote);
function paintChat() { paintTitle(); paintCtx(); paintModels(); paintNote(); msgs.textContent = "";
  if (!chat.msgs.length) { const p = Shelf.project(chat.project); msgs.appendChild(el("div", "empty", "Ask about the note you're on, or ask it to do something in it: fold a line, write inside a fold, trace a fold back." + (p ? " This chat follows the “" + p.name + "” project's instructions." : ""))); }
  chat.msgs.forEach(m => msgs.appendChild(drawMsg(m)));
  if (input.value !== (chat.draft || "")) input.value = chat.draft || ""; grow(); msgs.scrollTop = msgs.scrollHeight; }
function drawMsg(m) {
  const d = el("div", "m " + (m.role === "user" ? "me" : "ai")); d.dataset.id = m.id;
  if (m.role === "user") { d.textContent = m.text; return d; }
  (m.parts || []).forEach(p => drawPart(d, p)); drawTail(d, m); return d;
}
function drawPart(d, p) {
  if (p.t === "text") { const s = el("div", "tx", p.text); d.appendChild(s); return s; }
  if (p.t === "act") { const b = el("button", "act" + (p.ok ? "" : " no") + (p.eye ? " eye" : ""), (p.ok ? (p.eye ? "· " : "✓ ") : "✗ ") + p.label); if (p.go) b.onclick = () => jumpTo(p.go); else b.disabled = true; d.appendChild(b); return b; }
  if (p.t === "ask") { const c = el("div", "ask"); c.innerHTML = `<b>${esc(p.ask.title)}</b><div class="ba"><span>Before</span><div>${esc(p.ask.before)}</div></div><div class="ba"><span>After</span><div>${esc(p.ask.after)}</div></div>`;
    if (p.answer) c.appendChild(el("div", "ans", p.answer === "allow" ? "You allowed it." : "You said don't.")); d.appendChild(c); return c; }
}
function drawTail(d, m) { const old = d.querySelector(".tail"); if (old) old.remove(); const t = el("div", "tail");
  if (m.error) t.appendChild(el("div", "err", m.error)); if (m.stopped) t.appendChild(el("div", "nt", "Stopped."));
  if (m.changed && !m.undone) { const u = el("button", "undo", "Undo " + (Socket.label || "the AI") + "’s changes"); u.onclick = () => undoReply(m); t.appendChild(u); }
  if (m.undone) t.appendChild(el("div", "nt", "Its changes were undone."));
  if (t.childNodes.length) d.appendChild(t); }
function jumpTo(go) { if (!B.D.boxes[go.where] && !B.D.notes[go.note]) return; if (!WIDE()) close(); if (!Page.goto(go)) Page.say("That line isn't there any more."); }
function undoReply(m) {
  const depth = B.groupDepth(m.tag); if (depth < 0) { m.undone = true; return redrawMsg(m); }
  if (depth > 0 && !confirm("You've done " + depth + " thing" + (depth > 1 ? "s" : "") + " in the book since this reply. Undoing it takes " + (depth > 1 ? "those" : "that") + " back too. Go ahead?")) return;
  for (let i = 0; i <= depth; i++) B.undo(); Page.render();
}
B.on(ev => { if (ev.type === "undo" && ev.group) { const c = Object.values(Shelf.S.chats).find(c => c.msgs.some(m => m.tag === ev.group)); if (c) { const m = c.msgs.find(m => m.tag === ev.group); m.undone = true; Shelf.touch(c, true); if (c === chat) redrawMsg(m); } } });
function redrawMsg(m) { const d = msgs.querySelector('.m[data-id="' + m.id + '"]'); if (d) drawTail(d, m); }

/* ================= the box you type in ================= */
function grow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; }
input.addEventListener("input", () => { grow(); if (chat) { chat.draft = input.value; Shelf.save(true); } });        // what you type is kept as a draft, online or not
input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && WIDE()) { e.preventDefault(); send(); } });
$("#brSend").onclick = () => send();
$("#brStop").onclick = () => { if (busy) busy.abort(); };

/* ================= the breath's eyes and hands, described the way AI tools are described ================= */
const boxNote = where => B.noteOf(where);
function outline(box, pad) {             // a note as the breath reads it: numbered lines, folds shown under the line they hang from
  pad = pad || ""; const bx = B.D.boxes[box], out = [], fs = Page.lanes(box);
  bx.lines.forEach((id, i) => { const L = B.D.lines[id]; out.push(pad + (i + 1) + ": " + L.text + (L.by !== "me" ? "   «written by you, the AI»" : ""));
    fs.filter(x => x.b === i).forEach(x => { out.push(pad + "    [fold " + x.f.id + " on line" + (x.a === x.b ? " " + (x.a + 1) : "s " + (x.a + 1) + "-" + (x.b + 1)) + ", " + (x.f.open ? "open" : "closed") + "; to write inside it use where: \"" + x.f.id + "\"]"); out.push(outline(x.f.id, pad + "    ")); }); });
  return out.join("\n"); }
const noteView = id => "NOTE “" + B.title(id) + "” (where: \"" + id + "\")\n" + outline(id);
const lineId = (where, n) => { const bx = B.D.boxes[where]; if (!bx) return null; if (n == null) return bx.lines[bx.lines.length - 1]; return bx.lines[Math.round(n) - 1] || null; };
const TOOLS = [
  { name: "read_note", description: "Read the note that is open (or a note the writer attached to this chat), with numbered lines and its folds. Always read before you act: line numbers change after every write.", input_schema: { type: "object", properties: { note: { type: "string", description: "Leave out for the open note." } } } },
  { name: "list_notes", description: "List the writer's notes: title, project, id. Only looks.", input_schema: { type: "object", properties: {} } },
  { name: "search", description: "Search all notes for some words. Gives back the notes and lines that have them. Only looks.", input_schema: { type: "object", properties: { words: { type: "string" } }, required: ["words"] } },
  { name: "write", description: "Put words on a line, in the open note or inside a fold. how = \"new_line_after\" (default: your words become new line(s) after that line; in a fresh empty fold they simply fill it), \"add_to_end\" (add to the end of that line), \"replace\" (the line becomes your words; the writer is asked first if the words are his), \"remove_line\" (the writer is asked first if the words are his). Prefer adding inside a fold over changing the writer's lines.", input_schema: { type: "object", properties: { where: { type: "string", description: "The note's id or a fold's id. Leave out for the open note." }, line: { type: "integer", description: "Line number in that note or fold (1 is the first). Leave out for the last line." }, how: { type: "string", enum: ["new_line_after", "add_to_end", "replace", "remove_line"] }, words: { type: "string" } }, required: ["words"] } },
  { name: "fold_line", description: "Fold a whole line (or several lines in a row) so new writing can live inside it. Gives back the new fold's id: write inside it with where = that id. Folds can go inside folds.", input_schema: { type: "object", properties: { where: { type: "string", description: "The note's id or a fold's id. Leave out for the open note." }, from: { type: "integer", description: "Line number." }, to: { type: "integer", description: "Last line number, when folding several lines." } }, required: ["from"] } },
  { name: "open_fold", description: "Open or close a fold. Say the end state.", input_schema: { type: "object", properties: { fold: { type: "string" }, open: { type: "boolean" } }, required: ["fold", "open"] } },
  { name: "remove_fold", description: "Take a fold off its line. Its writing is kept. The writer is always asked first.", input_schema: { type: "object", properties: { fold: { type: "string" } }, required: ["fold"] } },
  { name: "trace_parent", description: "Show where a fold came from: note > fold > fold > this fold. Only looks.", input_schema: { type: "object", properties: { fold: { type: "string" } }, required: ["fold"] } },
  { name: "open_note", description: "Open another note, or start a new one (note: \"new\").", input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } }
];
/* One tool call → one joint. Gives back {text for the AI, label for the chat line, go: where to jump, ok, eye}. */
async function runTool(name, a, m, d) {
  a = a || {}; const cur = B.D.current, no = (why, label) => ({ ok: false, text: "NOT DONE: " + why, label: (label || "Not done") + ": " + why });
  if (name === "read_note") { const id = a.note || cur; if (!B.D.notes[id]) return no("That note isn't there.");
    if (id !== cur && (chat.attach || []).indexOf(id) < 0 && Shelf.S.set.thisNoteOnly) return no("I can only read the note that's open and the notes attached to this chat.", "Didn't read");
    return { ok: true, eye: true, text: noteView(id), label: "Read “" + clip(B.title(id), 30) + "”", go: { note: id, where: id, line: B.D.boxes[id].lines[0] } }; }
  if (name === "list_notes") return { ok: true, eye: true, label: "Looked at your list of notes", text: B.notes().map(n => { const p = Shelf.project(Shelf.projectOf(n.id)); return "“" + B.title(n.id) + "” (id " + n.id + (p ? ", project " + p.name : "") + (n.id === cur ? ", OPEN NOW" : "") + ")"; }).join("\n") || "(no notes)" };
  if (name === "search") { const q = String(a.words || "").toLowerCase().trim(); if (!q) return no("No words to search for."); const hits = [];
    B.notes().forEach(n => { B.textOf(n.id).split("\n").forEach(t => { if (hits.length < 30 && t.toLowerCase().indexOf(q) >= 0) hits.push("“" + B.title(n.id) + "” (id " + n.id + "): " + t.trim()); }); });
    return { ok: true, eye: true, label: "Searched for “" + clip(String(a.words), 24) + "”", text: hits.join("\n") || "Nothing found." }; }
  let needs, label, go;
  if (name === "write") { const where = a.where || cur, bx = B.D.boxes[where]; if (!bx) return no("That note or fold isn't there."); const id = lineId(where, a.line); if (!id) return no("That line isn't there. Read the note again.");
    const L = B.D.lines[id], n = bx.lines.indexOf(id) + 1, how = a.how || "new_line_after", words = String(a.words == null ? "" : a.words), inFold = B.D.folds[where] ? " in “" + B.foldName(where) + "”" : "";
    if (how === "replace") { needs = { where, line: id, at: 0, remove: L.text.length, words: words.replace(/\n+$/, "") }; label = "Changed line " + n + inFold; }
    else if (how === "remove_line") { if (bx.lines.length === 1) needs = { where, line: id, at: 0, remove: L.text.length, words: "" }; else if (n > 1) { const pv = bx.lines[n - 2]; needs = { where, line: pv, at: B.D.lines[pv].text.length, remove: L.text.length + 1, words: "" }; } else needs = { where, line: id, at: 0, remove: L.text.length + 1, words: "" }; label = "Removed line " + n + inFold; }
    else if (how === "add_to_end") { needs = { where, line: id, at: L.text.length, words }; label = "Added to line " + n + inFold; }
    else { const empty = bx.lines.length === 1 && !L.text; needs = { where, line: id, at: L.text.length, words: (empty ? "" : "\n") + words }; label = "Wrote " + (words.split("\n").length > 1 ? words.split("\n").length + " lines" : "a line") + inFold; }
  } else if (name === "fold_line") { const where = a.where || cur, f = lineId(where, a.from), t = a.to == null ? f : lineId(where, a.to); if (!f || !t) return no("That line isn't there. Read the note again.");
    needs = { where, from: f, to: t }; label = "Folded line" + (t === f ? " " + a.from : "s " + a.from + "–" + a.to); go = { where, line: f }; }
  else if (name === "open_fold") { needs = { fold: a.fold, open: !!a.open }; label = (a.open ? "Opened" : "Closed") + " fold “" + (B.D.folds[a.fold] ? B.foldName(a.fold) : "?") + "”"; }
  else if (name === "remove_fold") { needs = { fold: a.fold }; label = "Removed the fold on “" + (B.D.folds[a.fold] ? B.foldName(a.fold) : "?") + "”"; }
  else if (name === "trace_parent") { needs = { fold: a.fold }; label = "Traced “" + (B.D.folds[a.fold] ? B.foldName(a.fold) : "?") + "” back"; }
  else if (name === "open_note") { needs = { note: a.note }; label = a.note === "new" ? "Started a new note" : "Opened a note"; }
  else return no("There's no such action.");
  const f0 = B.D.folds[a.fold]; if (f0 && !go) go = { where: f0.host, line: f0.to };
  let r = hand(name, needs);
  if (!r.ok && r.ask) {                                 // the riverbank: you are asked first, with before and after
    const answer = await askCard(r.ask, m, d);
    if (answer !== "allow") return { ok: false, text: "NOT DONE: the writer said don't. Do not try this again unless he asks.", label: "Not done, you said don't (" + label.charAt(0).toLowerCase() + label.slice(1) + ")" };
    r = hand(name, needs, Banks.allow(name, needs));
  }
  if (!r.ok) return no(r.why, "Not done");
  if (name === "write") { go = { where: needs.where, line: r.line }; return { ok: true, label, go, text: "Done. That line now reads: " + JSON.stringify(r.reads) + ". Line numbers may have changed: read the note again before acting on other lines." }; }
  if (name === "fold_line") return { ok: true, label, go, text: "Done. The new fold's id is \"" + r.fold + "\". It is open and empty: write inside it with where: \"" + r.fold + "\"." };
  if (name === "open_fold") return { ok: true, label, go, text: "Done. It is now " + (r.open ? "open" : "closed") + "." };
  if (name === "remove_fold") return { ok: true, label, go: { where: f0.host, line: r.line }, text: "Done. The line now reads: " + JSON.stringify(r.reads) + (r.kept ? ". The fold's writing is kept under Recently removed." : ".") };
  if (name === "trace_parent") return { ok: true, eye: true, label, go, text: r.path.map(p => p.name).join(" > ") };
  return { ok: true, label, text: "Done. The open note is now “" + r.title + "” (where: \"" + r.note + "\")." };
}
function askCard(ask, m, d) { return new Promise(res => {
  const p = { t: "ask", ask }; m.parts.push(p); const c = drawPart(d, p), row = el("div", "row"), yes = el("button", "allow", "Allow"), nope = el("button", "", "Don’t");
  const done = v => { p.answer = v; row.remove(); c.appendChild(el("div", "ans", v === "allow" ? "You allowed it." : "You said don't.")); pendingAsk = null; res(v); };
  yes.onclick = () => done("allow"); nope.onclick = () => done("dont"); row.appendChild(yes); row.appendChild(nope); c.appendChild(row); pendingAsk = () => done("dont"); msgs.scrollTop = msgs.scrollHeight; }); }
let pendingAsk = null;

/* ================= what goes to the AI, and the reply ================= */
function system() {
  const parts = [Shelf.S.how.text || Shelf.HOW], p = Shelf.project(chat.project);
  if (p && p.instructions.trim()) parts.push("THIS CHAT IS IN THE PROJECT “" + p.name + "”. The writer's instructions for this project:\n" + p.instructions.trim());
  parts.push("HOW YOU ACT: you have the same six joints the writer's finger has (write, fold_line, open_fold, remove_fold, trace_parent, open_note) and three ways to look (read_note, list_notes, search). Folds take whole lines. Everything you do shows as a line in the chat and can be undone in one tap. Your writing shows in its own color until he edits it. If something is refused, say so plainly and don't work around it.");
  const cur = goesAlong(); parts.push(cur ? "THE NOTE THAT IS OPEN RIGHT NOW (it goes along with this message):\n" + noteView(cur) : "No note is open right now (the writer is on the list of notes, or left the note out of this chat).");
  (chat.attach || []).filter(id => B.D.notes[id] && id !== cur).forEach(id => parts.push("A NOTE THE WRITER ATTACHED (read only):\n" + noteView(id)));
  return parts.join("\n\n");
}
const plain = m => m.role === "user" ? m.text : ((m.parts || []).map(p => p.t === "text" ? p.text : p.t === "act" && !p.eye ? "[" + (p.ok ? "done: " : "not done: ") + p.label + "]" : "").filter(Boolean).join("\n") || "(no words)");
function history() { const out = []; chat.msgs.forEach(m => { const role = m.role === "user" ? "user" : "assistant", text = plain(m); if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n" + text; else out.push({ role, content: text }); }); return out; }
async function send(text) {
  text = (text == null ? input.value : text).trim(); if (!text || busy || !chat) return;
  paintNote(); if (navigator.onLine === false || !Socket.hasKey()) return;                 // offline or no key: nothing is sent, your draft stays
  const first = !chat.msgs.length; if (first) msgs.textContent = "";
  const um = { id: uid(), role: "user", text, at: Date.now() }; chat.msgs.push(um); msgs.appendChild(drawMsg(um));
  if (!chat.title) chat.title = clip(text.split("\n")[0], 44); if (!chat.note) chat.note = B.D.current; chat.draft = ""; input.value = ""; grow(); paintTitle();
  const m = { id: uid(), role: "ai", parts: [], at: Date.now(), tag: "r" + uid(), model: modelOf() }; chat.msgs.push(m); const d = drawMsg(m); msgs.appendChild(d); d.classList.add("live");
  busy = new AbortController(); $("#brSend").classList.add("hide"); $("#brStop").classList.remove("hide"); Shelf.touch(chat, true);
  const messages = history().slice(0, -1); if (!messages.length || messages[messages.length - 1].role !== "user") messages.push({ role: "user", content: text });
  let curText = null, curEl = null, raf = 0;
  const onText = t => { if (!curText) { curText = { t: "text", text: "" }; m.parts.push(curText); curEl = drawPart(d, curText); } curText.text += t;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (curEl && curText) curEl.textContent = curText.text; const near = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120; if (near) msgs.scrollTop = msgs.scrollHeight; }); };
  Banks.replying = true; B.begin(m.tag);
  try {
    for (let turn = 0; turn < 12; turn++) {
      curText = null; curEl = null;
      const res = await Socket.stream({ model: m.model, system: system(), messages, tools: TOOLS, signal: busy.signal, onText });
      if (curEl && curText) curEl.textContent = curText.text;
      const uses = res.content.filter(b => b.type === "tool_use"); if (res.stop !== "tool_use" || !uses.length) break;
      messages.push({ role: "assistant", content: res.content.map(b => b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input || {} } : { type: "text", text: b.text || "" }).filter(b => b.type !== "text" || b.text) });
      const results = [];
      for (const u of uses) { let r; if (busy.signal.aborted) r = { ok: false, text: "NOT DONE: the writer pressed Stop.", label: "Stopped" };
        else { try { r = await runTool(u.name, u.input, m, d); } catch (e) { r = { ok: false, text: "NOT DONE: " + (e.message || e), label: "Not done: something went wrong" }; } }
        const p = { t: "act", ok: !!r.ok, eye: !!r.eye, label: r.label, go: r.go || null }; m.parts.push(p); drawPart(d, p); msgs.scrollTop = msgs.scrollHeight;
        results.push({ type: "tool_result", tool_use_id: u.id, content: clip(r.text, 20000), is_error: r.ok ? undefined : true }); }
      messages.push({ role: "user", content: results });
      if (busy.signal.aborted) { m.stopped = true; break; }
    }
  } catch (e) { if (e.name === "AbortError") m.stopped = true; else m.error = e.message || String(e); if (pendingAsk) pendingAsk(); }
  if (raf) { cancelAnimationFrame(raf); raf = 0; } if (curEl && curText) curEl.textContent = curText.text;
  m.changed = B.end(); Banks.replying = false; busy = null; d.classList.remove("live"); drawTail(d, m);
  $("#brSend").classList.remove("hide"); $("#brStop").classList.add("hide"); paintNote(); Shelf.touch(chat); msgs.scrollTop = msgs.scrollHeight;
}

/* ================= history, projects, and the instructions for all of BOLW ================= */
const when = t => { const d = new Date(t); return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" }); };
function paintList() { paintTitle(); const L = $("#brList"), chats = Shelf.chats(listQ), gone = Shelf.deleted();
  L.innerHTML = `<div class="row"><button class="send" id="blNew">New chat</button></div>
    <input id="blQ" type="search" placeholder="Search chats" value="${esc(listQ)}" autocomplete="off">
    <div class="rows">${chats.map(c => { const p = Shelf.project(c.project); return `<div class="rowi"><button class="go" data-c="${c.id}"><b>${esc(c.title || "New chat")}</b><small>${esc(when(c.updatedAt))}${p ? " · " + esc(p.name) : ""}</small></button><button class="mini" data-more="${c.id}" aria-label="Rename or delete">⋯</button></div>`; }).join("") || `<div class="none">${listQ ? "No chats have those words." : "No chats yet."}</div>`}</div>
    <h2>Projects</h2><div class="rows">${Shelf.projects().map(p => `<div class="rowi"><button class="go" data-p="${p.id}"><b>${esc(p.name)}</b><small>${esc(clip(p.instructions.trim() || "No instructions yet", 60))}</small></button></div>`).join("")}<div class="rowi"><button class="go" id="blNewP"><b>+ New project</b></button></div></div>
    <h2>For every chat</h2><div class="rows"><div class="rowi"><button class="go" id="blHow"><b>How BOLW works</b><small>The instructions that go with every chat</small></button></div></div>
    ${gone.length ? `<h2>Recently deleted chats</h2><div class="rows">${gone.map(c => `<div class="rowi"><span class="go"><b>${esc(c.title || "Chat")}</b><small>deleted ${esc(when(c.deleted))}</small></span><button class="mini put" data-back="${c.id}">Bring back</button></div>`).join("")}</div>` : ""}`;
  $("#blNew").onclick = () => { startChat(Shelf.projectOf(B.D.current)); show("chat"); if (WIDE()) input.focus(); };
  $("#blQ").oninput = e => { listQ = e.target.value; const at = e.target.selectionStart; paintList(); const f = $("#blQ"); f.focus(); try { f.setSelectionRange(at, at); } catch (x) {} };
  L.querySelectorAll("[data-c]").forEach(b => { b.onclick = () => openChat(b.dataset.c); });
  L.querySelectorAll("[data-more]").forEach(b => { b.onclick = () => { const id = b.dataset.more, r = b.getBoundingClientRect(); Page.openMenu({ left: r.left - 150, top: r.top, bottom: r.bottom }, [
    ["Rename", () => { const c = Shelf.chat(id), t = prompt("Name this chat", c.title || ""); if (t != null && t.trim()) { Shelf.rename(id, t.trim()); paintList(); } }],
    ["Delete", () => { Shelf.remove(id); if (chat && chat.id === id) chat = null; if (!chat) startChat(); paintList(); }]]); }; });
  L.querySelectorAll("[data-back]").forEach(b => { b.onclick = () => { Shelf.bringBack(b.dataset.back); paintList(); }; });
  L.querySelectorAll("[data-p]").forEach(b => { b.onclick = () => paintProj(b.dataset.p); });
  $("#blNewP").onclick = () => { const n = prompt("Name the project", ""); if (n && n.trim()) paintProj(Shelf.newProject(n.trim()).id); };
  $("#blHow").onclick = () => paintProj(null);
}
function paintProj(id) {               // a project's page (or, with no id, the instructions for every chat)
  show("proj"); const P = $("#brProj"), p = id ? Shelf.project(id) : null; if (id && !p) return show("list");
  const notes = p ? B.notes().filter(n => Shelf.projectOf(n.id) === id) : [], chats = p ? Shelf.chats().filter(c => c.project === id) : [];
  P.innerHTML = p ? `<input id="bpName" value="${esc(p.name)}" aria-label="Project name"><label>Instructions for chats in this project</label><textarea id="bpIns" rows="7" placeholder="How should the AI help with this kind of writing?">${esc(p.instructions)}</textarea>
      <div class="row"><button class="send" id="bpChat">New chat in this project</button></div>
      <h2>Its notes</h2><div class="rows">${notes.map(n => `<div class="rowi"><button class="go" data-n="${n.id}"><b>${esc(B.title(n.id))}</b></button></div>`).join("") || `<div class="none">No notes yet. In a note, tap its project name at the top to put it here.</div>`}</div>
      <h2>Its chats</h2><div class="rows">${chats.map(c => `<div class="rowi"><button class="go" data-c="${c.id}"><b>${esc(c.title || "New chat")}</b><small>${esc(when(c.updatedAt))}</small></button></div>`).join("") || `<div class="none">No chats yet.</div>`}</div>
      <div class="row"><button id="bpDel">Delete this project</button></div><p class="nt">Deleting a project never deletes its notes or chats.</p>`
    : `<h2>How BOLW works</h2><p class="nt">These instructions go with every chat, before a project's own.</p><textarea id="bpHow" rows="16">${esc(Shelf.S.how.text)}</textarea><div class="row"><button id="bpReset">Put back the starting text</button></div>`;
  if (!p) { $("#bpHow").oninput = e => Shelf.setHow(e.target.value); $("#bpReset").onclick = () => { if (confirm("Put back the starting instructions? Yours will be replaced.")) { Shelf.setHow(Shelf.HOW); paintProj(null); } }; return; }
  $("#bpName").oninput = e => Shelf.setProject(id, { name: e.target.value.trim() || "Project" }); $("#bpIns").oninput = e => Shelf.setProject(id, { instructions: e.target.value });
  $("#bpChat").onclick = () => { startChat(id); show("chat"); if (WIDE()) input.focus(); };
  P.querySelectorAll("[data-n]").forEach(b => { b.onclick = () => { if (!WIDE()) close(); Page.openNote(b.dataset.n); }; });
  P.querySelectorAll("[data-c]").forEach(b => { b.onclick = () => openChat(b.dataset.c); });
  $("#bpDel").onclick = () => { if (confirm("Delete the project “" + p.name + "”? Its notes and chats stay.")) { Shelf.setProject(id, { deleted: Date.now() }); show("list"); } };
}
g.Breath = { reset() { chat = null; listQ = ""; if (!br.classList.contains("hide")) { startChat(Shelf.projectOf(B.D.current)); show("chat"); } }, fit, open, close, toggle, send, startChat, openChat, show, TOOLS, runTool, get chat() { return chat; }, get busy() { return !!busy; }, get isOpen() { return !br.classList.contains("hide"); } };
})(window);
