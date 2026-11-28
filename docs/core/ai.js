/* ai.js · MODULE "ai" (part 2) · THE FAST AI: the AI inside the book.
   Laptop: a side window beside the page (⌘K or Ctrl K). iPhone: full screen (✦ opens it, ← Book goes back).
   - It does everything you can, with the modules that are on: every tool below is one of the book's own actions,
     taken with the one hand book.js gives the AI (so the book always knows what the AI wrote).
   - It SEES the leaf you're on, the folds and links around it, and any leaf you attach; and only when you press Send.
   - It ASKS before changing or removing your words, deleting, or removing a fold or a link (Allow / Don't, with
     before and after). Adding is free.
   - Everything it does is a line in the chat you can tap; ONE reply is ONE Undo; its writing has its own color
     until you edit it. It never types, so it never adds writing time, and it can't press Hold.
   - It can't change BOLW itself: it writes a request instead (requests.js).
   Other modules add tools with AI.tool({ name, mod, description, input_schema, run }). */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Keep = g.Keep, Mods = g.Mods, Socket = g.Socket, D = () => B.D;
Mods.add({ id: "ai", name: "The fast AI", about: "An AI inside the book (Claude, or any OpenAI-compatible AI) that acts through the book's own actions." });
const hand = B.hand("ai");                              // the AI's one hand on the book
const $ = Page.$, el = Page.el, esc = Page.esc;
const WIDE = () => matchMedia("(pointer:fine) and (min-width:900px)").matches;
const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const uid = () => Math.random().toString(36).slice(2, 9);
const q = s => "“" + clip(String(s || "").trim() || "(empty)", 28) + "”";

/* ---------- chats: kept on this device with the book, synced (lock.js carries them) ---------- */
let S = Keep.lsGet(Keep.K.chats); if (!S || !S.chats) S = { chats: {}, current: null };
let saveT = null; const flush = () => { clearTimeout(saveT); saveT = null; Keep.lsSet(Keep.K.chats, S); };
const save = () => { if (!saveT) saveT = setTimeout(flush, 300); if (g.Lock) g.Lock.changed(); };
addEventListener("pagehide", flush); document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
if (g.Lock) g.Lock.carry("chats", { get: () => S.chats, merge(theirs) { let ch = false; Object.keys(theirs || {}).forEach(id => { if (!S.chats[id] || (theirs[id].updatedAt || 0) > (S.chats[id].updatedAt || 0)) { if (!(chat && chat.id === id && busy)) { S.chats[id] = theirs[id]; ch = true; } } }); if (ch) { flush(); if (chat) chat = S.chats[chat.id] || chat; if (view === "list") paintList(); } return ch; } });
const chatsLive = qy => { qy = (qy || "").trim().toLowerCase(); return Object.values(S.chats).filter(c => !c.deleted && (c.msgs.length || c.draft)).filter(c => !qy || (c.title || "").toLowerCase().indexOf(qy) >= 0 || c.msgs.some(m => ((m.text || "") + (m.parts || []).map(p => p.text || "").join(" ")).toLowerCase().indexOf(qy) >= 0)).sort((a, b) => b.updatedAt - a.updatedAt); };
function newChat(o) { const id = "c" + uid() + Date.now().toString(36).slice(-3), now = Date.now(); S.chats[id] = Object.assign({ id, title: "", attach: [], at: now, updatedAt: now, draft: "", msgs: [] }, o || {}); S.current = id; save(); return S.chats[id]; }
const touch = c => { c.updatedAt = Date.now(); save(); };

document.body.insertAdjacentHTML("beforeend", `
<aside class="ai hide" id="ai" aria-label="The AI window">
  <div class="aih"><button id="aiChats" aria-label="Chats">☰</button><span class="sp" id="aiTitle"></span><button id="aiModel" class="model"></button><button class="back" id="aiBack"></button></div>
  <div class="aiv" id="aiChat">
    <div class="aictx" id="aiCtx"></div>
    <div class="aim" id="aiMsgs"></div>
    <div class="ainote hide" id="aiNote"></div>
    <div class="aic"><textarea id="aiIn" rows="1" placeholder="Ask, or ask it to do something in the book"></textarea><button class="send" id="aiSend">Send</button><button class="send stop hide" id="aiStop">Stop</button></div>
  </div>
  <div class="aiv scroll hide" id="aiList"></div>
</aside>`);
const win = $("#ai"), msgs = $("#aiMsgs"), input = $("#aiIn");
let chat = null, busy = null, view = "chat", listQ = "", replying = false;

/* ================= opening and closing ================= */
function fit() { if (win.classList.contains("hide") || WIDE()) { win.style.height = ""; win.style.transform = ""; return; } const v = g.visualViewport; if (!v) return; win.style.height = (v.height - win.offsetTop) + "px"; win.style.transform = "translateY(" + v.offsetTop + "px)"; }
if (g.visualViewport) { visualViewport.addEventListener("resize", fit); visualViewport.addEventListener("scroll", fit); }
function open() {
  if (!Mods.on("ai")) return Page.say("The fast AI is switched off (Settings)."); if (!win.classList.contains("hide")) return; Page.saveSpot();
  if (!WIDE() && document.activeElement && document.activeElement.blur) document.activeElement.blur();
  win.classList.remove("hide"); document.body.classList.add("ai-open"); $("#aiBack").textContent = WIDE() ? "Hide" : "← Book";
  if (!chat) { const c = S.chats[S.current]; chat = c && !c.deleted ? c : null; }
  if (!chat || (chat.msgs.length && Date.now() - chat.updatedAt > 6 * 3600000)) chat = newChat({ leaf: Page.leaf });
  show("chat"); fit(); Page.placeBar(); if (WIDE()) input.focus();
}
function close() { win.classList.add("hide"); document.body.classList.remove("ai-open"); flush(); Page.placeBar(); }
const toggle = () => win.classList.contains("hide") ? open() : close();
$("#aiBack").onclick = close;
function show(v) { view = v; $("#aiChat").classList.toggle("hide", v !== "chat"); $("#aiList").classList.toggle("hide", v !== "list"); $("#aiChats").textContent = v === "chat" ? "☰" : "‹"; $("#aiModel").classList.toggle("hide", v !== "chat"); if (v === "chat") paintChat(); else paintList(); }
$("#aiChats").onclick = () => show(view === "chat" ? "list" : "chat");
const spark = el("button", "", "✦"); spark.id = "tAI"; spark.setAttribute("aria-label", "Open the AI window"); Page.press(spark, toggle); Page.top(spark, "ai", 9);
Page.key(e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { toggle(); return true; } }, "ai", true);
document.addEventListener("keydown", e => { if (e.target === input && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); } });

/* ================= which AI, which model ================= */
const modelNow = () => (chat && chat.model && chat.provider === Socket.using ? chat.model : Socket.model());
function paintModel() { const m = modelNow(); $("#aiModel").textContent = clip(Socket.label + (m ? " · " + m.replace(/^claude-/, "") : ""), 26) + " ▾"; }
$("#aiModel").onclick = () => Page.sheet("Which AI?", body => {
  const draw = () => { const list = Socket.list(), sp = Socket.spend();
    body.innerHTML = `<h2>The AI</h2><div class="rows">` + list.map(p => `<button class="rowi" data-p="${esc(p.id)}"><b>${Socket.using === p.id ? "✓ " : ""}${esc(p.label)}</b><small>key: ${esc(Socket.keyHint(p.id))}${p.hasKey ? "" : " · add it in Settings → The fast AI"}</small></button>`).join("") + `</div>
      <h2>Its model</h2><input type="search" id="amQ" placeholder="Find a model"><div class="rows" id="amList"><div class="none">Looking…</div></div><p class="nt">This month: about $${sp.usd.toFixed(2)} of your $${Socket.limit()} limit (an estimate).</p>`;
    body.querySelectorAll("[data-p]").forEach(b => { b.onclick = () => { Socket.use(b.dataset.p); if (chat) { chat.provider = null; chat.model = null; } paintModel(); paintNote(); draw(); }; });
    let all = []; const cur = modelNow(), listEl = body.querySelector("#amList"), inp = body.querySelector("#amQ");
    const paint = () => { const f = inp.value.trim().toLowerCase(), ms = all.filter(m => !f || (m.id + " " + m.label).toLowerCase().indexOf(f) >= 0).slice(0, 80);
      listEl.innerHTML = ms.map(m => `<button class="rowi" data-m="${esc(m.id)}"><b>${m.id === cur ? "✓ " : ""}${esc(m.label)}</b>${m.label !== m.id ? `<small>${esc(m.id)}</small>` : ""}</button>`).join("") || `<div class="none">${all.length ? "No model by that name." : "No list of models yet (add the key first). You can also type a model's exact name above and press Return."}</div>`;
      listEl.querySelectorAll("[data-m]").forEach(b => { b.onclick = () => pickModel(b.dataset.m); }); };
    const pickModel = id => { Socket.setModel(id); if (chat) { chat.model = id; chat.provider = Socket.using; touch(chat); } paintModel(); Page.closeSheet(true); };
    inp.oninput = paint; inp.onkeydown = e => { if (e.key === "Enter" && inp.value.trim()) pickModel(inp.value.trim()); };
    Socket.models().then(l => { all = l || []; if (body.contains(listEl)) paint(); }).catch(() => { paint(); }); };
  draw(); });

/* ================= one chat ================= */
const alongLeaf = () => chat && chat.alone ? null : (D().leaves[Page.leaf] ? Page.leaf : null);
function paintCtx() {
  const c = $("#aiCtx"); c.textContent = ""; if (!chat) return; const cur = alongLeaf();
  if (cur) { const b = el("button", "chip on", "With: " + clip(B.title(cur), 22) + " ×"); b.title = "This leaf goes along with what you send. Tap to leave it out of this chat."; b.onclick = () => { chat.alone = true; touch(chat); paintCtx(); }; c.appendChild(b); }
  else { const b = el("button", "chip", "+ the open leaf"); b.onclick = () => { chat.alone = false; touch(chat); paintCtx(); }; c.appendChild(b); }
  (chat.attach || []).filter(id => D().leaves[id] && B.alive(id)).forEach(id => { const b = el("button", "chip on", "+ " + clip(B.title(id), 18) + " ×"); b.onclick = () => { chat.attach = chat.attach.filter(x => x !== id); touch(chat); paintCtx(); }; c.appendChild(b); });
  const add = el("button", "chip", "Attach a leaf"); add.onclick = () => Page.pickLeaf("Attach which leaf?", id => { if ((chat.attach || []).indexOf(id) < 0) chat.attach = (chat.attach || []).concat(id); touch(chat); paintCtx(); }); c.appendChild(add);
}
const paintTitle = () => { $("#aiTitle").textContent = view !== "chat" ? "Chats" : (chat && chat.title) || "New chat"; };
function paintNote() { const n = $("#aiNote"); let t = "";
  if (navigator.onLine === false) t = "You're offline. The AI needs the internet. What you type here is kept as a draft.";
  else if (!Socket.hasKey()) t = "There's no key for " + Socket.label + " on this device yet. Add it under ☰ → Settings → The fast AI.";
  else if (Socket.overLimit()) t = "This month's spending limit ($" + Socket.limit() + ") is reached. Raise it in Settings → The fast AI.";
  n.textContent = t; n.classList.toggle("hide", !t); $("#aiSend").disabled = !!t || !!busy; }
addEventListener("online", paintNote); addEventListener("offline", paintNote);
function paintChat() { paintTitle(); paintCtx(); paintModel(); paintNote(); msgs.textContent = "";
  if (!chat.msgs.length) msgs.appendChild(el("div", "empty", "Ask about the leaf you're on, or ask it to do something: fold lines into a line, close a fold and name it, link two lines, write within a line. It asks before it changes your words."));
  chat.msgs.forEach(m => msgs.appendChild(drawMsg(m))); if (input.value !== (chat.draft || "")) input.value = chat.draft || ""; grow(); msgs.scrollTop = msgs.scrollHeight; }
function drawMsg(m) { const d = el("div", "m " + (m.role === "user" ? "me" : "it")); d.dataset.id = m.id; if (m.role === "user") { d.textContent = m.text; return d; } (m.parts || []).forEach(p => drawPart(d, p)); drawTail(d, m); return d; }
function drawPart(d, p) {
  if (p.t === "text") { const s = el("div", "tx", p.text); d.appendChild(s); return s; }
  if (p.t === "act") { const b = el("button", "act" + (p.ok ? "" : " no") + (p.eye ? " eye" : ""), (p.ok ? (p.eye ? "· " : "✓ ") : "✗ ") + p.label); if (p.go) b.onclick = () => jumpTo(p.go); else b.disabled = true; d.appendChild(b); return b; }
  if (p.t === "ask") { const c = el("div", "ask"); c.innerHTML = `<b>${esc(p.ask.title)}</b><div class="ba"><span>Before</span><div>${esc(p.ask.before)}</div></div><div class="ba"><span>After</span><div>${esc(p.ask.after)}</div></div>`; if (p.answer) c.appendChild(el("div", "ans", p.answer === "allow" ? "You allowed it." : "You said don't.")); d.appendChild(c); return c; }
  if (p.t === "card") { const c = el("div", "ask card"); d.appendChild(c); const cd = cards[p.kind]; if (cd) cd(c, p); else c.textContent = p.title || ""; return c; }
}
function drawTail(d, m) { const old = d.querySelector(".tail"); if (old) old.remove(); const t = el("div", "tail");
  if (m.error) t.appendChild(el("div", "err", m.error)); if (m.stopped) t.appendChild(el("div", "nt", "Stopped."));
  if (m.changed && !m.undone) { const u = el("button", "undo", "Undo the AI’s changes"); u.onclick = () => undoReply(m); t.appendChild(u); }
  if (m.undone) t.appendChild(el("div", "nt", "Its changes were undone.")); if (t.childNodes.length) d.appendChild(t); }
function jumpTo(go) { const leaf = go.leaf || (go.line && B.leafOf(go.line)); if (!leaf || !D().leaves[leaf]) return Page.say("That isn't there any more."); if (!WIDE()) close(); Page.go(leaf, go.line && D().lines[go.line] ? go.line : null, { flash: true }); }
function undoReply(m) { const depth = B.groupDepth(m.tag); if (depth < 0) { m.undone = true; return redrawMsg(m); }
  if (depth > 0 && !confirm("You've done " + depth + " thing" + (depth > 1 ? "s" : "") + " in the book since this reply. Undoing it takes " + (depth > 1 ? "those" : "that") + " back too. Go ahead?")) return;
  for (let i = 0; i <= depth; i++) B.undo(); Page.redraw(); }
B.on(ev => { if (ev.type === "undo" && ev.group && !ev.dry) { const c = Object.values(S.chats).find(c => c.msgs.some(m => m.tag === ev.group)); if (c) { const m = c.msgs.find(m => m.tag === ev.group); m.undone = true; touch(c); if (c === chat) redrawMsg(m); } } });
function redrawMsg(m) { const d = msgs.querySelector('.m[data-id="' + m.id + '"]'); if (d) drawTail(d, m); }
function grow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; }
input.addEventListener("input", () => { grow(); if (chat) { chat.draft = input.value; clearTimeout(saveT); saveT = setTimeout(flush, 300); } });        // what you type is kept as a draft, online or not
input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && WIDE()) { e.preventDefault(); send(); } });
$("#aiSend").onclick = () => send(); $("#aiStop").onclick = () => { if (busy) busy.abort(); };

/* ================= the limits: at the book's checkpoint ================= */
const passes = new Map(), keyOf = (name, needs) => name + " " + JSON.stringify(needs);
const allow = (name, needs) => { const p = Math.random().toString(36).slice(2); passes.set(keyOf(name, needs), p); return p; };        // called only by the Allow button
const yours = L => L && L.by !== "ai" && L.text.trim();
B.guard(function (name, needs, who, grant) {
  if (who !== "ai") return true; if (!replying) return "The AI only acts while it is answering you.";
  let ask = null;
  if (name === "write" && (needs.remove | 0) > 0) { const L = D().lines[needs.line]; if (L) { const lf = D().leaves[L.in], i = lf.lines.indexOf(L.id), at = Math.max(0, Math.min(L.text.length, needs.at == null ? L.text.length : needs.at)); let j = i, end = at + needs.remove; while (j < lf.lines.length - 1 && end > D().lines[lf.lines[j]].text.length) { end -= D().lines[lf.lines[j]].text.length + 1; j++; }
      const touched = lf.lines.slice(i, j + 1).map(l => D().lines[l]); if (touched.some(yours)) { const before = touched.map(x => x.text).join("\n"), last = touched[touched.length - 1], after = L.text.slice(0, at) + (needs.words || "") + last.text.slice(Math.min(end, last.text.length)); ask = { title: after.trim() ? "Change your words?" : "Remove your words?", before: clip(before, 500), after: after.trim() ? clip(after, 500) : "(removed)" }; } } }
  else if (name === "prune") { const L = D().lines[needs.line]; if (L) { const lf = D().leaves[L.in], i = lf.lines.indexOf(L.id), e = B.branchEnd(lf, i), ls = lf.lines.slice(i, e).map(l => D().lines[l]); if (ls.some(x => yours(x) || x.leaf)) ask = { title: "Delete this?", before: clip(ls.map(x => "    ".repeat(x.d - L.d) + x.text).join("\n"), 500), after: "Taken out of the leaf. Kept under ☰ → Deleted, where it can be brought back." }; } }
  else if (name === "unfold") { const F = D().folds[needs.fold]; if (F) ask = { title: F.place ? "Take this shared fold out of here?" : "Remove this fold?", before: "The fold “" + (g.Fold ? g.Fold.label(F) : "fold") + "” within “" + B.where(F.from) + "”", after: F.place ? "It's no longer within this line. It stays where it lives." : F.within ? "What was within the line comes out of it, one step. Every line stays." : "The gate is gone. Every line in it stays." }; }
  else if (name === "unlink") { const K = D().links[needs.link]; if (K && D().lines[K.a] && D().lines[K.b]) ask = { title: "Remove this link?", before: q(D().lines[K.a].text) + " ↔ " + q(D().lines[K.b].text) + (K.label ? " (" + K.label + ")" : ""), after: "The two lines are no longer linked." }; }
  else if (name === "name" && !String(needs.name || "").trim()) { const F = D().folds[needs.fold]; if (F && F.name) ask = { title: "Take the name off this fold?", before: "“" + F.name + "”" + (F.details ? " with its details" : ""), after: "The fold stays, without a name (it leaves the gathering)." }; }
  if (!ask) return true; const k = keyOf(name, needs); if (grant && passes.get(k) === grant) { passes.delete(k); return true; } return { ask };
});
let pendingAsk = null;
function askCard(ask, m, d) { return new Promise(res => { const p = { t: "ask", ask }; m.parts.push(p); const c = drawPart(d, p), row = el("div", "row"), yes = el("button", "allow", "Allow"), nope = el("button", "", "Don’t");
  const done = v => { p.answer = v; row.remove(); c.appendChild(el("div", "ans", v === "allow" ? "You allowed it." : "You said don't.")); pendingAsk = null; res(v); };
  yes.onclick = () => done("allow"); nope.onclick = () => done("dont"); row.appendChild(yes); row.appendChild(nope); c.appendChild(row); pendingAsk = () => done("dont"); msgs.scrollTop = msgs.scrollHeight; }); }
/* one of the book's actions, taken by the AI: asks first when the checkpoint says so */
async function act(name, needs, env) { let r = hand(name, needs); if (!r.ok && r.ask) { const a = await askCard(r.ask, env.m, env.d); if (a !== "allow") return { ok: false, why: "The writer said don't. Don't try this again unless he asks.", said: true }; r = hand(name, needs, { grant: allow(name, needs) }); } return r; }

/* ================= what the AI reads ================= */
function outline(leaf, cursor) {
  const lf = D().leaves[leaf]; if (!lf) return "(that leaf isn't there)"; const out = ["LEAF “" + B.title(leaf) + "” (leaf id " + leaf + ") · " + B.path(leaf).map(B.title).join(" › ")];
  lf.lines.forEach(l => { const L = D().lines[l]; let s = l + " | " + "  ".repeat(L.d) + L.text; if (/^outside/.test(L.by || "")) s += "   «written by Claude, working outside the app»"; else if (L.by === "ai") s += "   «written by you, the AI»"; else if (L.by === "book") s += "   «from the record»"; if (L.leaf && D().leaves[L.leaf]) s += "   {what's within it is on its own page: leaf " + L.leaf + "}";
    if (g.Fold && Mods.on("fold")) { const W = g.Fold.withinOf(l); if (W) s += "   {its fold " + W.id + (W.name ? " “" + W.name + "”" : "") + ", " + (W.open ? "open" : "closed") + (W.details && Object.keys(W.details).length ? ", details: " + Object.keys(W.details).map(k => k + "=" + W.details[k]).join(", ") : "") + "}"; g.Fold.placesIn(l).forEach(F => { s += "   {↻ shared fold " + F.id + " placed within it: what's within " + F.place + " " + q(D().lines[F.place].text) + " (lives in “" + clip(B.title(D().lines[F.place].in), 20) + "”)}"; }); if (g.Fold.placesOf(l).length) s += "   {its fold is also placed within " + g.Fold.placesOf(l).map(F => F.from).join(", ") + "}"; }
    if (g.Link && Mods.on("link")) g.Link.of(l).forEach(x => { s += "   {link" + (x.label ? " “" + x.label + "”" : "") + " → " + q(x.text) + " (" + x.other + " in “" + clip(B.title(x.leaf), 20) + "”)}"; }); out.push(s); });
  if (g.Fold && Mods.on("fold")) { const fs = g.Fold.foldsOf(leaf).filter(F => !F.within && !F.place && g.Fold.rangeOf(F)); if (fs.length) { out.push("GATE FOLDS in this leaf (several lines folded together):"); fs.forEach(F => out.push("  " + F.id + (F.name ? " “" + F.name + "”" : " (no name)") + " from " + F.from + " to " + F.to + " (" + (F.open ? "open" : "closed") + ")" + (F.details && Object.keys(F.details).length ? " details: " + Object.keys(F.details).map(k => k + "=" + F.details[k]).join(", ") : ""))); } }
  if (cursor && D().lines[cursor] && D().lines[cursor].in === leaf) out.push("THE CURSOR IS ON: " + cursor + " " + q(D().lines[cursor].text));
  return out.join("\n");
}
const BASE = `You are the fast AI inside the Book of Living Waters (BOLW), one writer's own book. He is a writer and songwriter; he calls writing "to enscribe oneself into life".

What BOLW is: leaves of lines, and folds. A FOLD is what's within a line: every line can hold lines within it (shown indented under it), folds within folds without end, and a line's fold can be open or closed. BRANCHES are the tree of folds, seen from above: from the trunk out to any line. A LEAF is a fold given its own page: lifting what's within a line puts it on a page of its own, still within its line (and it can be put back). The same fold can be SHARED: placed within more than one line, one fold shown in each place; writing in it anywhere changes it everywhere. Several lines can also be folded together behind a gate. Naming a fold (when the writer wants) makes it gather across the book (every fold with the same name is one gathering), and named folds can carry details like Status or Key. Any line can be linked to any other, with an optional label. Everything is text. Speak of it his way: "fold this line", "within River song › Chorus".

How to be here:
- Speak plainly and briefly, like a good editor beside him. No headings or bullet lists unless he asks.
- His words are his. Add your own writing only when he asks you to write, and add it as new lines (after a line, or within it) rather than over his lines. Diagrams and drawings are made of text.
- Lines are named by their ids (like l3k2a9x1q). Read before you act; say in a few words what you did after you did it.
- If something is refused, say so plainly and don't work around it. You can't change BOLW itself: when he wants something BOLW can't do, write a request with him instead.`;
function waysOfMine() { const id = B.leaves().find(x => B.title(x).trim().toLowerCase() === "ways of mine"); return id && B.hasWriting(id) ? B.textOf(id) : ""; }
function system() {
  const parts = [BASE], ways = waysOfMine(); if (ways) parts.push("THE WRITER'S OWN WAYS (his “Ways of mine” leaf; follow them):\n" + clip(ways, 4000));
  const cur = alongLeaf(), c = Page.ctx();
  if (cur) { parts.push("THE LEAF THAT IS OPEN RIGHT NOW (it goes along with this message):\n" + clip(outline(cur, c.has ? c.line : null), 30000));
    if (g.Fold && Mods.on("fold")) { const seen = {}; g.Fold.foldsOf(cur).forEach(F => { if (!F.name || seen[g.Fold.key(F.name)]) return; seen[g.Fold.key(F.name)] = 1; const N = D().names[g.Fold.key(F.name)]; if (N && N.instructions) parts.push("WITHIN FOLDS NAMED “" + F.name + "”, FOLLOW THE WRITER'S INSTRUCTIONS: " + N.instructions); }); } }
  else parts.push("No leaf goes along with this chat (the writer left it out).");
  (chat.attach || []).filter(id => D().leaves[id] && B.alive(id) && id !== cur).forEach(id => parts.push("A LEAF THE WRITER ATTACHED:\n" + clip(outline(id), 20000)));
  if (chat.extra) parts.push(chat.extra);
  extras.forEach(fn => { try { const t = fn(chat); if (t) parts.push(t); } catch (e) {} });
  return parts.join("\n\n");
}

/* ================= the tools: each one is one of the book's own actions ================= */
const TOOLS = [], cards = {}, extras = [];
const tool = t => { const i = TOOLS.findIndex(x => x.name === t.name); if (i >= 0) TOOLS[i] = t; else TOOLS.push(t); };
const no = (why, label) => ({ ok: false, text: "NOT DONE: " + why, label: (label || "Not done") + ": " + why });
const lineOr = id => D().lines[id] || null;
const S_ = (props, req) => ({ type: "object", properties: props, required: req || [] }), str = d => ({ type: "string", description: d }), int = d => ({ type: "integer", description: d });
const done = (r, label, go, text) => r.ok ? { ok: true, label, go, text: text || "Done." } : no(r.why, r.said ? "Not done, you said don't (" + label.charAt(0).toLowerCase() + label.slice(1) + ")" : "Not done");
tool({ name: "read_leaf", eye: true, description: "Read a leaf: its lines with their ids, indentation, lifted leaves, links and folds. Leave `leaf` out for the open leaf. Read before you act.", input_schema: S_({ leaf: str("A leaf id.") }),
  run: a => { const id = a.leaf || Page.leaf; if (!D().leaves[id] || !B.alive(id)) return no("That leaf isn't there."); return { ok: true, eye: true, label: "Read " + q(B.title(id)), go: { leaf: id }, text: outline(id) }; } });
tool({ name: "list_leaves", eye: true, description: "List every leaf in the book with its id and where it hangs.", input_schema: S_({}), run: () => ({ ok: true, eye: true, label: "Looked at the leaves of the book", text: B.leaves().map(id => id + " · " + B.path(id).map(B.title).join(" › ") + (id === Page.leaf ? "   (OPEN NOW)" : "")).join("\n") }) });
tool({ name: "search", eye: true, mod: "search", description: "Search every leaf for some words. Gives back the lines that have them, with their ids.", input_schema: S_({ words: str("") }, ["words"]),
  run: a => { const hits = B.search(a.words, 40); return { ok: true, eye: true, label: "Searched for " + q(a.words), text: hits.map(h => h.line + " | " + h.text.trim() + "   (within “" + B.where(h.line) + "”, leaf " + h.leaf + ")").join("\n") || "Nothing found." }; } });
tool({ name: "write", description: "Put words in the book. how = \"after\" (default: new line(s) after this line and what's within it, at the same depth), \"within\" (new line(s) within this line: in its fold), \"append\" (add to the end of this line), \"replace\" (the line becomes your words; the writer is asked first if the words are his), \"remove\" (delete this line and what's within it; asked first; it stays recoverable). Several lines: separate with newlines; start a line with a tab to put it within the one before.", input_schema: S_({ line: str("The line's id."), how: { type: "string", enum: ["after", "within", "append", "replace", "remove"] }, words: str("") }, ["line"]),
  run: async (a, env) => { const L = lineOr(a.line); if (!L) return no("That line isn't there. Read the leaf again."); const how = a.how === "inside" ? "within" : a.how || "after", words = String(a.words == null ? "" : a.words).replace(/\r\n?/g, "\n"), lf = D().leaves[L.in], i = lf.lines.indexOf(L.id), go = { line: L.id };
    if (how === "remove") return done(await act("prune", { line: L.id }, env), "Deleted " + q(L.text), { leaf: lf.id });
    if (how === "replace") return done(await act("write", { line: L.id, at: 0, remove: L.text.length, words: words.replace(/\n+/g, " ") }, env), "Changed " + q(L.text), go);
    if (how === "append") return done(await act("write", { line: L.id, at: L.text.length, words: words.replace(/\n+/g, " ") }, env), "Added to " + q(L.text), go);
    if (!words.trim()) return no("No words to write.");
    if (lf.lines.length === 1 && !L.text && !L.leaf && how === "after") { const r = await act("write", { line: L.id, at: 0, words }, env); return done(r, "Wrote " + words.split("\n").length + " line" + (words.indexOf("\n") >= 0 ? "s" : ""), go, r.ok ? "Done. The first new line is " + L.id + "." : ""); }
    const want = how === "within" ? L.d + 1 : L.d, anchor = how === "within" ? L.id : lf.lines[B.branchEnd(lf, i) - 1], before = lf.lines.length;
    const r = await act("write", { line: anchor, at: D().lines[anchor].text.length, words: "\n" + words }, env); if (!r.ok) return done(r, "Wrote", go);
    const k = lf.lines.indexOf(anchor) + 1, n = lf.lines.length - before, first = lf.lines[k], lastNew = lf.lines[k + n - 1], shift = want - D().lines[first].d;
    if (shift) hand("foldin", { line: first, to: lastNew, dir: shift });
    return { ok: true, label: "Wrote " + n + " line" + (n > 1 ? "s" : "") + (how === "within" ? " within " : " after ") + q(L.text), go: { line: first }, text: "Done. New line ids: " + lf.lines.slice(k, k + n).join(", ") + "." }; } });
tool({ name: "fold_into", mod: "fold", description: "Fold a line (and what's within it) into the line above it (dir 1), or take it out of the line it's within (dir -1).", input_schema: S_({ line: str(""), dir: int("1 or -1") }, ["line", "dir"]), run: async (a, env) => { const L = lineOr(a.line); if (!L) return no("That line isn't there."); return done(await act("foldin", { line: a.line, dir: a.dir }, env), (a.dir < 0 ? "Took " + q(L.text) + " out of its fold" : "Folded " + q(L.text) + " into the line above"), { line: a.line }); } });
tool({ name: "lift", mod: "fold", description: "Lift what's within a line onto its own page (a leaf), still within that line. Gives back the new leaf's id and its first line.", input_schema: S_({ line: str("") }, ["line"]), run: async (a, env) => { const L = lineOr(a.line); if (!L) return no("That line isn't there."); const r = await act("lift", { line: a.line }, env); return done(r, "Lifted what's within " + q(L.text) + " onto its own page", r.ok ? { leaf: r.leaf } : null, r.ok ? "Done. The leaf's id is " + r.leaf + "; its first line is " + D().leaves[r.leaf].lines[0] + "." : ""); } });
tool({ name: "put_back", mod: "fold", description: "Put a line's page (its leaf) back within the line: its lines go back into the line's fold. Give the line that has the page.", input_schema: S_({ line: str("") }, ["line"]), run: async (a, env) => { const L = lineOr(a.line); if (!L) return no("That line isn't there."); return done(await act("putback", { line: a.line }, env), "Put the page of " + q(L.text) + " back within it", { line: a.line }); } });
tool({ name: "place_fold", mod: "fold", description: "Share a fold: place what's within line `from` within line `into` as well. It stays one fold, shown in both places; writing in it anywhere changes it everywhere.", input_schema: S_({ from: str("The line whose fold is shared."), into: str("The line it should also be within.") }, ["from", "into"]), run: async (a, env) => { const X = lineOr(a.from), Y = lineOr(a.into); if (!X || !Y) return no("One of those lines isn't there."); const r = await act("place", { from: a.from, into: a.into }, env); return done(r, "Placed " + q(X.text) + " within " + q(Y.text) + " too", { line: a.into }, r.ok ? "Done. The shared fold's id there is " + r.fold + "." : ""); } });
tool({ name: "new_leaf", mod: "fold", description: "Make a new leaf: a new line with this name at the end of a leaf (default: the open leaf), with a page of its own, and optional words within it.", input_schema: S_({ name: str("The leaf's name."), under: str("The leaf to hang it on. Leave out for the open leaf."), words: str("Lines to put in it.") }, ["name"]),
  run: async (a, env) => { const host = D().leaves[a.under || Page.leaf]; if (!host || !B.alive(host.id)) return no("That leaf isn't there."); const last = host.lines[host.lines.length - 1], LL = D().lines[last]; let line = last;
    if (LL.text || LL.leaf) { const r = await act("write", { line: last, at: LL.text.length, words: "\n" }, env); if (!r.ok) return done(r, "Made a leaf"); line = r.line; if (D().lines[line].d) hand("foldin", { line, dir: -D().lines[line].d }); }
    hand("write", { line, at: 0, words: String(a.name).replace(/\n/g, " ") }); const r = hand("leaf", { line }); if (!r.ok) return no(r.why); if (a.words) hand("write", { line: D().leaves[r.leaf].lines[0], at: 0, words: String(a.words) });
    return { ok: true, label: "Made the leaf " + q(a.name), go: { leaf: r.leaf }, text: "Done. The leaf's id is " + r.leaf + "; its first line is " + D().leaves[r.leaf].lines[0] + "." }; } });
tool({ name: "move", description: "Move a line with what's within it: dir \"up\" or \"down\" past the line beside it, or to another leaf (leaf, and optionally after a line there).", input_schema: S_({ line: str(""), dir: { type: "string", enum: ["up", "down"] }, leaf: str("Destination leaf id."), after: str("A line in the destination to put it after.") }, ["line"]),
  run: async (a, env) => { const L = lineOr(a.line); if (!L) return no("That line isn't there."); const n = { line: a.line }; if (a.dir) n.dir = a.dir; else { n.leaf = a.leaf || L.in; if (a.after) n.after = a.after; } return done(await act("move", n, env), "Moved " + q(L.text) + (a.dir ? " " + a.dir : " to " + q(B.title(n.leaf))), { line: a.line }); } });
tool({ name: "fold", mod: "fold", description: "Fold a line: close what's within it (if nothing is within it yet, a space opens within it and stays open). Or, with `to`, fold several lines together behind a gate. An optional name makes it part of the gathering with that name across the book.", input_schema: S_({ from: str(""), to: str(""), name: str("") }, ["from"]),
  run: async (a, env) => { const L = lineOr(a.from); if (!L) return no("That line isn't there."); const n = { from: a.from }; if (a.to) n.to = a.to; if (a.name) n.name = a.name; const r = await act("fold", n, env); return done(r, r.within ? (r.line ? "Opened a space within " + q(L.text) : "Folded what's within " + q(L.text)) + (a.name ? " as " + q(a.name) : "") : "Folded " + r.lines + " lines behind a gate" + (a.name ? " as " + q(a.name) : ""), { line: a.from }, r.ok ? "Done. The fold's id is " + r.fold + (r.line ? "; the new empty line within it is " + r.line + " (it is open)." : " (it is " + (r.open ? "open" : "closed") + ").") : ""); } });
tool({ name: "gate", mod: "fold", description: "Open or close a fold: give the fold, or a line (what's within it). Say the end state.", input_schema: S_({ fold: str(""), line: str(""), open: { type: "boolean" } }, ["open"]), run: async (a, env) => { const F = a.fold && D().folds[a.fold], L = !F && a.line && lineOr(a.line); if (!F && !L) return no("That fold isn't there."); return done(await act("gate", F ? { fold: a.fold, open: !!a.open } : { line: a.line, open: !!a.open }, env), (a.open ? "Opened" : "Closed") + " " + (F ? "the fold " + q(g.Fold.label(F)) : "what's within " + q(L.text)), { line: F ? F.from : a.line }); } });
tool({ name: "name_fold", mod: "fold", description: "Name a fold (or rename it). Folds with the same name anywhere in the book are one gathering.", input_schema: S_({ fold: str(""), name: str("") }, ["fold", "name"]), run: async (a, env) => { const F = D().folds[a.fold]; if (!F) return no("That fold isn't there."); return done(await act("name", { fold: a.fold, name: a.name }, env), "Named a fold " + q(a.name), { line: F.from }); } });
tool({ name: "detail", mod: "fold", description: "Set a detail on a named fold (like Status or Key). An empty value clears it.", input_schema: S_({ fold: str(""), key: str(""), value: str("") }, ["fold", "key"]), run: async (a, env) => { const F = D().folds[a.fold]; if (!F) return no("That fold isn't there."); return done(await act("detail", { fold: a.fold, key: a.key, value: a.value }, env), "Set " + a.key + ": " + (a.value || "(empty)") + " on " + q(g.Fold.label(F)), { line: F.from }); } });
tool({ name: "unfold", mod: "fold", description: "Remove a fold. A gate fold: the gate goes, its lines stay. A line's fold: what was within it comes out of it (nothing is lost). A shared fold: it is taken out of this place (it stays where it lives). The writer is asked first.", input_schema: S_({ fold: str("") }, ["fold"]), run: async (a, env) => { const F = D().folds[a.fold]; if (!F) return no("That fold isn't there."); const lb = g.Fold.label(F), ln = F.from; return done(await act("unfold", { fold: a.fold }, env), "Removed the fold " + q(lb), { line: ln }); } });
tool({ name: "read_fold", eye: true, mod: "fold", description: "Read a gathering: every fold in the book with this name, with its leaf and its words. Without a name: the list of names.", input_schema: S_({ name: str("") }),
  run: a => { if (!a.name) return { ok: true, eye: true, label: "Looked at the named folds", text: g.Fold.names().map(n => "“" + n.name + "”: " + n.n + " piece(s)" + (n.rule ? ", also gathers the search “" + n.rule + "”" : "")).join("\n") || "No named folds yet." };
    const ps = g.Fold.pieces(a.name), N = D().names[g.Fold.key(a.name)] || {}; return { ok: true, eye: true, label: "Read the gathering " + q(a.name), text: (ps.map(F => "fold " + F.id + " within “" + B.where(F.from) + "” (leaf " + F.leaf + ")" + (F.details ? " details: " + JSON.stringify(F.details) : "") + ":\n" + g.Fold.textOfFold(F)).join("\n\n") || "No fold has that name.") + (N.rule ? "\n\nAlso gathered by the search “" + N.rule + "”:\n" + B.search(N.rule, 40).map(h => h.line + " | " + h.text).join("\n") : "") }; } });
tool({ name: "gather", mod: "fold", description: "Save a search as a named gathering (“gather by rule”): the name then also lists every line with those words.", input_schema: S_({ name: str(""), search: str("") }, ["name", "search"]), run: async (a, env) => done(await act("gather", { name: a.name, search: a.search }, env), "Made " + q(a.name) + " gather the search " + q(a.search)) });
tool({ name: "link", mod: "link", description: "Link two lines, anywhere in the book, with an optional label (the labels are the kinds of link).", input_schema: S_({ from: str(""), to: str(""), label: str("") }, ["from", "to"]), run: async (a, env) => { const A = lineOr(a.from), Z = lineOr(a.to); if (!A || !Z) return no("One of those lines isn't there."); const r = await act("link", { from: a.from, to: a.to, label: a.label }, env); return done(r, "Linked " + q(A.text) + " ↔ " + q(Z.text) + (a.label ? " (" + a.label + ")" : ""), { line: a.from }, r.ok ? "Done. The link's id is " + r.link + "." : ""); } });
tool({ name: "unlink", mod: "link", description: "Remove a link between two lines (give both lines). The writer is asked first.", input_schema: S_({ from: str(""), to: str("") }, ["from", "to"]), run: async (a, env) => { const x = g.Link.of(a.from).find(k => k.other === a.to); if (!x) return no("Those two lines aren't linked."); return done(await act("unlink", { link: x.id }, env), "Removed a link", { line: a.from }); } });
tool({ name: "read_map", eye: true, mod: "map", description: "The map around a line: the folds it is within (up to the trunk), what's within it (and shared folds placed within it), and its links.", input_schema: S_({ line: str("") }, ["line"]), run: a => { if (!lineOr(a.line)) return no("That line isn't there."); const m = g.MapView.around(a.line), t = id => id + " " + q(D().lines[id].text); return { ok: true, eye: true, label: "Looked at the map around " + q(D().lines[a.line].text), go: { line: a.line }, text: "WITHIN (from the trunk): " + (m.up.map(t).join(" › ") || "(it is on the trunk)") + "\nWITHIN IT: " + (m.down.map(t).join("; ") || "(nothing)") + "\nLINKS: " + (m.links.map(x => (x.label || "link") + " → " + x.other + " " + q(x.text)).join("; ") || "(none)") }; } });
tool({ name: "bookmark", mod: "marks", description: "Leave a bookmark on a line, with optional notes.", input_schema: S_({ line: str(""), doing: str("What the writer was doing"), waiting: str("What he is waiting for"), why: str(""), done_looks_like: str(""), meanwhile: str("") }, ["line"]), run: async (a, env) => { const L = lineOr(a.line); if (!L) return no("That line isn't there."); return done(await act("mark", { line: a.line, doing: a.doing, waiting: a.waiting, why: a.why, doneLooks: a.done_looks_like, meanwhile: a.meanwhile }, env), "Left a bookmark on " + q(L.text), { line: a.line }); } });
tool({ name: "show", eye: true, description: "Take the writer to a leaf or a line (it opens on his page).", input_schema: S_({ leaf: str(""), line: str("") }), run: a => { const leaf = a.leaf || (a.line && B.leafOf(a.line)); if (!leaf || !D().leaves[leaf] || !B.alive(leaf)) return no("That isn't there."); Page.go(leaf, a.line && D().lines[a.line] ? a.line : null, { flash: true }); return { ok: true, eye: true, label: "Opened " + q(B.title(leaf)), go: { leaf, line: a.line }, text: "Done. That leaf is open now." }; } });
const toolsNow = () => TOOLS.filter(t => !t.mod || Mods.on(t.mod)).filter(t => !t.when || t.when(chat));

/* ================= what goes to the AI, and the reply ================= */
const plain = m => m.role === "user" ? m.text : ((m.parts || []).map(p => p.t === "text" ? p.text : p.t === "act" && !p.eye ? "[" + (p.ok ? "done: " : "not done: ") + p.label + "]" : p.t === "card" ? "[" + (p.title || "a card") + (p.answer ? ": " + p.answer : "") + "]" : "").filter(Boolean).join("\n") || "(no words)");
function history() { const out = []; chat.msgs.forEach(m => { const role = m.role === "user" ? "user" : "assistant", text = plain(m); if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n" + text; else out.push({ role, content: text }); }); return out; }
async function send(text) {
  text = (text == null ? input.value : text).trim(); if (!text || busy || !chat) return;
  paintNote(); if (navigator.onLine === false || !Socket.hasKey() || Socket.overLimit()) return;                 // nothing is sent; your draft stays
  if (!chat.msgs.length) msgs.textContent = "";
  const um = { id: uid(), role: "user", text, at: Date.now() }; chat.msgs.push(um); msgs.appendChild(drawMsg(um));
  if (!chat.title) chat.title = clip(text.split("\n")[0], 44); if (!chat.leaf) chat.leaf = Page.leaf; chat.draft = ""; input.value = ""; grow(); paintTitle();
  const m = { id: uid(), role: "ai", parts: [], at: Date.now(), tag: "r" + uid(), model: modelNow(), by: Socket.label }; chat.msgs.push(m); const d = drawMsg(m); msgs.appendChild(d); d.classList.add("live");
  busy = new AbortController(); $("#aiSend").classList.add("hide"); $("#aiStop").classList.remove("hide"); touch(chat);
  if (g.Log) g.Log.add({ who: "me", what: "ask", leaf: Page.leaf, n: clip(text, 60) });
  const messages = history().slice(0, -1); if (!messages.length || messages[messages.length - 1].role !== "user") messages.push({ role: "user", content: text });
  let curText = null, curEl = null, raf = 0; const env = { m, d, chat };
  const onText = t => { if (!curText) { curText = { t: "text", text: "" }; m.parts.push(curText); curEl = drawPart(d, curText); } curText.text += t;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (curEl && curText) curEl.textContent = curText.text; if (msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 140) msgs.scrollTop = msgs.scrollHeight; }); };
  replying = true; B.begin(m.tag, "ai");
  try {
    for (let turn = 0; turn < 14; turn++) {
      curText = null; curEl = null; const tools = toolsNow();
      const res = await Socket.stream({ model: m.model, system: system(), messages, tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })), signal: busy.signal, onText });
      if (curEl && curText) curEl.textContent = curText.text;
      const uses = res.content.filter(b => b.type === "tool_use"); if (res.stop !== "tool_use" || !uses.length) break;
      messages.push({ role: "assistant", content: res.content.map(b => b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input || {} } : { type: "text", text: b.text || "" }).filter(b => b.type !== "text" || b.text) });
      const results = [];
      for (const u of uses) { let r; const t = tools.find(x => x.name === u.name);
        if (busy.signal.aborted) r = { ok: false, text: "NOT DONE: the writer pressed Stop.", label: "Stopped" }; else if (!t) r = no("There's no such action (or its module is switched off).");
        else { try { r = await t.run(u.input || {}, env); } catch (e) { r = { ok: false, text: "NOT DONE: " + (e.message || e), label: "Not done: something went wrong" }; } }
        if (!r.card) { const p = { t: "act", ok: !!r.ok, eye: !!r.eye, label: r.label, go: r.go || null }; m.parts.push(p); drawPart(d, p); } msgs.scrollTop = msgs.scrollHeight;
        results.push({ type: "tool_result", tool_use_id: u.id, content: clip(r.text, 24000), is_error: r.ok ? undefined : true }); }
      messages.push({ role: "user", content: results }); if (busy.signal.aborted) { m.stopped = true; break; }
    }
  } catch (e) { if (e.name === "AbortError") m.stopped = true; else m.error = e.message || String(e); if (pendingAsk) pendingAsk(); }
  if (raf) { cancelAnimationFrame(raf); raf = 0; } if (curEl && curText) curEl.textContent = curText.text;
  m.changed = B.end(); replying = false; busy = null; d.classList.remove("live"); drawTail(d, m);
  $("#aiSend").classList.remove("hide"); $("#aiStop").classList.add("hide"); paintNote(); touch(chat); msgs.scrollTop = msgs.scrollHeight; Page.fire("aiDone", m);
}

/* ONE-SHOT WRITING for a command's "ask" step: the AI writes new lines after a line, from short instructions. No chat, no tools.
   It needs the internet; when there is none, commands.js keeps the step waiting. */
async function compose(line, instructions) {
  const L = D().lines[line]; if (!L) throw new Error("That line isn't there any more."); if (navigator.onLine === false) throw Object.assign(new Error("offline"), { wait: true }); if (!Socket.hasKey()) throw Object.assign(new Error("no key"), { wait: true });
  let text = "", res; try { res = await Socket.stream({ model: Socket.model(), system: BASE + "\n\nYou are filling one step of the writer's own command. Write ONLY the lines asked for, as plain lines of text (one per line; start a line with a tab to put it within the one before). No preface, no explanation.\n\nTHE LEAF:\n" + clip(outline(L.in, line), 20000), messages: [{ role: "user", content: instructions }], tools: [], signal: new AbortController().signal, onText: t => { text += t; } }); }
  catch (e) { if (e.offline) e.wait = true; throw e; }                    // the AI couldn't be reached (even when the device thinks it's online): the step waits, like any offline step
  text = (text || (res.content.find(b => b.type === "text") || {}).text || "").replace(/\s+$/, ""); if (!text.trim()) return { ok: false, why: "The AI wrote nothing." };
  const tag = "c" + uid(); replying = true; B.begin(tag, "ai"); let r; try { r = await TOOLS.find(t => t.name === "write").run({ line, how: "after", words: text }, {}); } finally { B.end(); replying = false; } return r;
}

/* ================= history ================= */
const when = t => { const d = new Date(t); return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" }); };
function paintList() { paintTitle(); const L = $("#aiList"), cs = chatsLive(listQ), gone = Object.values(S.chats).filter(c => c.deleted && c.msgs.length).sort((a, b) => b.deleted - a.deleted);
  L.innerHTML = `<div class="row"><button class="send" id="alNew">New chat</button></div><input id="alQ" type="search" placeholder="Search chats" value="${esc(listQ)}" autocomplete="off">
    <div class="rows">${cs.map(c => `<div class="rowi"><button class="go" data-c="${c.id}"><b>${esc(c.title || "New chat")}</b><small>${esc(when(c.updatedAt))}${c.leaf && D().leaves[c.leaf] ? " · " + esc(clip(B.title(c.leaf), 24)) : ""}</small></button><button class="mini" data-more="${c.id}" aria-label="Rename or delete">⋯</button></div>`).join("") || `<div class="none">${listQ ? "No chats have those words." : "No chats yet."}</div>`}</div>
    ${gone.length ? `<h2>Recently deleted chats</h2><div class="rows">${gone.map(c => `<div class="rowi"><span class="go"><b>${esc(c.title || "Chat")}</b><small>deleted ${esc(when(c.deleted))}</small></span><button class="mini put" data-back="${c.id}">Bring back</button></div>`).join("")}</div>` : ""}`;
  $("#alNew").onclick = () => { chat = newChat({ leaf: Page.leaf }); show("chat"); if (WIDE()) input.focus(); };
  $("#alQ").oninput = e => { listQ = e.target.value; const at = e.target.selectionStart; paintList(); const f = $("#alQ"); f.focus(); try { f.setSelectionRange(at, at); } catch (x) {} };
  L.querySelectorAll("[data-c]").forEach(b => { b.onclick = () => { chat = S.chats[b.dataset.c]; S.current = chat.id; show("chat"); }; });
  L.querySelectorAll("[data-more]").forEach(b => { b.onclick = () => { const id = b.dataset.more, r = b.getBoundingClientRect(); Page.openMenu({ left: r.left - 150, top: r.top, bottom: r.bottom }, [
    ["Rename", () => { const c = S.chats[id], t = prompt("Name this chat", c.title || ""); if (t != null && t.trim()) { c.title = t.trim(); touch(c); paintList(); } }],
    ["Delete", () => { const c = S.chats[id]; c.deleted = Date.now(); touch(c); if (chat && chat.id === id) chat = newChat({ leaf: Page.leaf }); paintList(); }]]); }; });
  L.querySelectorAll("[data-back]").forEach(b => { b.onclick = () => { const c = S.chats[b.dataset.back]; delete c.deleted; touch(c); paintList(); }; });
}

/* ================= its part of Settings: keys and the spending limit ================= */
if (g.Settings) g.Settings.add({ order: 40, mod: "ai", title: "The fast AI", id: "ai", build(box) { const draw = () => { const sp = Socket.spend();
  box.innerHTML = `<p class="nt">Keys stay on this device and are sent only to that AI's own address. Nothing in the book goes to an AI until you press Send.</p>` + Socket.list().map(p => `<label class="fld">${esc(p.label)} · key: <span data-hint="${esc(p.id)}">${esc(Socket.keyHint(p.id))}</span><input type="password" data-key="${esc(p.id)}" placeholder="Paste a key to save or replace it" autocomplete="off"></label>`).join("") +
    `<input type="text" id="saWs" placeholder="Claude: Workspace ID (only if Anthropic asks for it)" autocomplete="off">
    <div class="row"><button id="saSave">Save keys</button><button id="saAdd">Add another OpenAI-compatible AI…</button></div><p class="nt" id="saMsg"></p>
    <label class="fld">One spending limit for all of them, per month, in dollars (0 for none)<input type="number" id="saLimit" min="0" step="1" value="${Socket.limit()}"></label><p class="nt">This month so far: about $${sp.usd.toFixed(2)} in ${sp.calls} request${sp.calls === 1 ? "" : "s"}. It's an estimate from the amount of text, leaning high when a model's price isn't known.</p>`;
  box.querySelector("#saSave").onclick = () => { let n = 0; box.querySelectorAll("[data-key]").forEach(i => { if (i.value.trim()) { Socket.setKey(i.dataset.key, i.value); n++; } }); const ws = box.querySelector("#saWs").value.trim(); if (ws) { Socket.setKey("claude", null, { ws }); n++; } draw(); box.querySelector("#saMsg").textContent = n ? "Saved on this device." : "Paste a key first."; paintNote(); };
  box.querySelector("#saAdd").onclick = () => { const label = prompt("A name for this AI", ""); if (!label || !label.trim()) return; const base = prompt("Its address (the part before /chat/completions)", "https://"); if (!base || !/^https:\/\//.test(base.trim())) return alert("The address must start with https://"); Socket.setKey(label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20) || "other", null, { label: label.trim(), base: base.trim() }); draw(); };
  box.querySelector("#saLimit").onchange = e => { Socket.setLimit(e.target.value); paintNote(); }; }; draw(); } });
Page.menu(c => c.has ? [["Ask the AI about this", () => { open(); if (WIDE()) input.focus(); }]] : [], "ai", 60);
Mods.changed(id => { if (id === "ai" && !Mods.on("ai")) close(); });
g.AI = { open, close, toggle, send, fit, tool, cards, extras, act, compose, drawPart, addPart(env, p) { env.m.parts.push(p); const e = drawPart(env.d, p); msgs.scrollTop = msgs.scrollHeight; return e; }, waitCard(fn) { pendingAsk = fn; }, newChat: o => { chat = newChat(o); if (!win.classList.contains("hide")) show("chat"); return chat; }, show, no, done, outline, system: () => system(), clip, q,
  reset() { chat = null; listQ = ""; if (!win.classList.contains("hide")) { chat = newChat({ leaf: Page.leaf }); show("chat"); } }, replaceChats(s) { S = s; chat = null; flush(); }, get chats() { return S; },
  get chat() { return chat; }, get busy() { return !!busy; }, get replying() { return replying; }, get isOpen() { return !win.classList.contains("hide"); }, get tools() { return toolsNow(); } };
})(window);
