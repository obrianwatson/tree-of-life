/* harvest.js · MODULE "harvest" · THE HARVEST: a joint debrief of a finished project, made from the record of every move.
   1. START the harvest on a project's branch (a leaf and everything under it): ☰ → Harvest.
   2. BOLW reads the record of every move for that branch and writes WHAT THE RECORD SHOWS into a HARVEST LEAF, the last
      line of the project's leaf, under five headings: how it went · what you did again and again · where you got stuck ·
      what you were waiting on · how the time was spent. This needs no AI and no internet. The book's own hand writes
      it, so those lines are marked as the book's (grey), never as yours.
   3. REFLECT TOGETHER in that leaf. When you ask, the fast AI reads the same record, adds its own lines under each
      heading (purple), and you talk it through. Your own lines stay plain. Three voices, each marked.
   4. YOU CHOOSE WHAT TO KEEP:  repeated moves → commands (or automations) · lessons → lines in your "Ways of mine" leaf
      (the AI follows that leaf in every chat) · things BOLW couldn't do → requests to a coding AI.
   5. The Harvest leaf stays on the branch as the project's last leaf.
   Starting a harvest sends nothing anywhere. Only the button that says so sends the record to the AI.
   What it adds to the book: the Harvest leaf (ordinary lines), a note of which leaf is whose harvest (more.harvests),
   and lines in "Ways of mine". Switching the module off hides ☰ → Harvest; every leaf and line stays. */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, Log = g.Log, D = () => B.D, esc = Page.esc, el = Page.el;
Mods.add({ id: "harvest", name: "Harvest", about: "A look back at a finished project, made together from the record of every move." });
const hand = B.hand("book"); let writing = 0;       // the book's own hand: it only ever writes what the record shows, into a Harvest leaf
B.guard((name, needs, who) => { if (who !== "book") return true; if (!writing) return "The book only writes during a harvest."; return name === "harvest" ? true : "The book only writes what the record shows, in a Harvest leaf."; });
const DAY = 86400000, clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }, q = s => "“" + s + "”";
const tbl = () => D().more.harvests || {};
const harvestOf = P => { const r = tbl()[P]; return r && D().leaves[r.leaf] && B.alive(r.leaf) ? r.leaf : null; };
const projectOf = H => { const t = tbl(); for (const k in t) if (t[k].leaf === H && D().leaves[k] && B.alive(k)) return k; return null; };
const waysLeaf = () => B.leaves().find(id => B.title(id).trim().toLowerCase() === "ways of mine");

/* ---------- the two moves this module adds ---------- */
function leafAtEnd(lf, name, who, T) {              // (inside an action) a new line of this name at the end of a leaf, with its own leaf
  T.leaf(lf.id); let L = D().lines[lf.lines[lf.lines.length - 1]]; if (!L || L.text || L.leaf || L.d) { const id = B.newLine(lf.id, "", 0, who); lf.lines.push(id); L = D().lines[id]; }
  L.text = name; L.by = who; const now = Date.now(), id = B.uid("f"); T.leaf(id); D().leaves[id] = { id, lines: [], folds: [], parent: L.id, at: now, updatedAt: now, name }; L.leaf = id; return D().leaves[id];
}
function addLines(lf, rows, who) {                  // (inside an action) lines added at the end of a leaf; nothing there is changed
  if (lf.lines.length === 1 && !D().lines[lf.lines[0]].text && !D().lines[lf.lines[0]].leaf) { delete D().lines[lf.lines[0]]; lf.lines = []; }
  let first = null; rows.forEach(r => { const id = B.newLine(lf.id, String(r.text == null ? "" : r.text).replace(/\s+/g, " ").trim(), Math.max(0, r.d | 0), who); lf.lines.push(id); first = first || id; }); B.fixDepths(lf); return first;
}
/* HARVEST: the project's leaf gets a Harvest leaf as its last line (once), and lines are added at its end. needs: leaf (the project), lines [{ d, text }]. */
B.action("harvest", function (needs, who, T) {
  const P = D().leaves[needs.leaf]; if (!P || !B.alive(P.id)) throw B.plain("That leaf isn't there."); if (P.id === D().trunk) throw B.plain("Open the project's own leaf first: a harvest looks at one leaf and everything under it.");
  if (projectOf(P.id)) throw B.plain("This is a Harvest leaf. Harvest the project it belongs to.");
  const rows = (needs.lines || []).filter(r => r && r.text != null), had = harvestOf(P.id); let H = had && D().leaves[had];
  if (H) T.leaf(H.id); else { H = leafAtEnd(P, "Harvest", who, T); T.more("harvests"); const now = Date.now(); D().more.harvests = Object.assign({}, D().more.harvests, { [P.id]: { id: P.id, leaf: H.id, at: now, updatedAt: now } }); }
  const first = addLines(H, rows, who);
  return { leaf: H.id, project: P.id, made: !had, first: first || H.lines[0], lines: rows.length, structural: true, log: { what: "facts", leaf: H.id, k: rows.length } };
}, "harvest");
/* LESSON: one line is added to the "Ways of mine" leaf on the trunk (made when it isn't there yet). needs: text. */
B.action("lesson", function (needs, who, T) {
  const text = String(needs.text || "").replace(/\s+/g, " ").trim().slice(0, 400); if (!text) throw B.plain("There's nothing to keep on that line.");
  const had = waysLeaf(); let W = had && D().leaves[had];
  if (W) { if (W.lines.some(l => D().lines[l].text.trim() === text)) throw B.plain("That line is already in Ways of mine."); T.leaf(W.id); } else W = leafAtEnd(D().leaves[D().trunk], "Ways of mine", who, T);
  const line = addLines(W, [{ d: 0, text }], who);
  return { leaf: W.id, line, structural: true, log: { what: "lesson", leaf: W.id, n: text.slice(0, 60) } };
}, "harvest");

/* ---------- reading the record: what it shows ---------- */
const dayKey = t => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const midnight = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const dayName = t => new Date(t).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
const dateY = t => new Date(t).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const stamp = t => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dur = ms => { if (ms < 60000) return Math.max(1, Math.round(ms / 1000)) + " sec"; const m = Math.round(ms / 60000); return m < 60 ? m + " min" : Math.floor(m / 60) + " hr" + (m % 60 ? " " + (m % 60) + " min" : ""); };
const times = n => n === 1 ? "once" : n === 2 ? "twice" : n + " times";
const some = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
const days = n => n < 1 ? "less than a day" : some(n, "day");
const tops = (o, n) => Object.keys(o).sort((a, b) => o[b] - o[a]).slice(0, n);
const total = o => Object.keys(o).reduce((s, k) => s + o[k], 0);
function branch(P) { const set = Log.under(P), hv = harvestOf(P); if (hv) Object.keys(Log.under(hv)).forEach(k => { delete set[k]; }); return set; }      // the project's leaves (its Harvest leaf is not part of what is harvested)
const entries = P => { const set = branch(P); return Log.all().then(a => a.filter(e => e.leaf && set[e.leaf] && e.what !== "harvest" && e.what !== "facts")); };
const DID = { fold: "folded lines", name: "named a fold", lift: "lifted a branch into its own leaf", newleaf: "made a new leaf", grow: "grew a branch (or moved one back)", move: "moved a branch", link: "linked two lines", mark: "left a bookmark", detail: "set a detail on a fold" };

async function digest(P) {
  const set = branch(P), es = await entries(P), dg = { project: P, title: B.title(P), moves: 0, leaves: Object.keys(set).length, lines: 0, words: 0, went: [], again: [], stuck: [], waiting: [], time: [], ideas: [] };
  Object.keys(set).forEach(id => { const lf = D().leaves[id]; if (lf) lf.lines.forEach(l => { const t = D().lines[l].text.trim(); if (t) { dg.lines++; dg.words += t.split(/\s+/).length; } }); });
  const byDay = {}, who = { me: 0, ai: 0, cmd: 0, auto: 0 }, did = {}, names = {}, labels = {}, cmds = {}, undoIn = {}, typed = {}, held = {}, wrote = {}, took = {}, asksIn = {};
  let first = 0, last = 0, tTyped = 0, tHeld = 0;
  es.forEach(e => { const t2 = e.t2 || e.t, lt = e.lt || B.title(e.leaf), dd = byDay[dayKey(e.t)] = byDay[dayKey(e.t)] || { t: e.t, ms: 0 }; if (!first || e.t < first) first = e.t; if (t2 > last) last = t2;
    if (e.what === "time") { tTyped += e.ms; dd.ms += e.ms; typed[lt] = (typed[lt] || 0) + e.ms; return; }
    if (e.what === "held") { tHeld += e.ms; dd.ms += e.ms; held[lt] = (held[lt] || 0) + e.ms; return; }
    dg.moves++; const w = e.who || "me", wk = w === "me" ? "me" : w === "ai" ? "ai" : w.indexOf("cmd") === 0 ? "cmd" : w.indexOf("auto") === 0 ? "auto" : ""; if (wk) who[wk]++;
    if (w !== "me") return;                                           // "what you did again and again" counts your own moves
    if (e.what === "ask") { asksIn[lt] = (asksIn[lt] || 0) + 1; return; }
    if (e.what === "undo") { undoIn[lt] = (undoIn[lt] || 0) + 1; return; }
    did[e.what] = (did[e.what] || 0) + 1;
    if (e.what === "write") { wrote[lt] = (wrote[lt] || 0) + (e.c || 0); took[lt] = (took[lt] || 0) + (e.r || 0); }
    if ((e.what === "fold" || e.what === "name") && e.n) names[e.n] = (names[e.n] || 0) + 1;
    if (e.what === "link" && e.n) labels[e.n] = (labels[e.n] || 0) + 1;
    if (e.what === "command" && e.n) { const c = String(e.n).split(/\s/)[0]; cmds[c] = (cmds[c] || 0) + 1; } });
  const dks = Object.keys(byDay).sort(), nd = dks.length;
  /* how it went */
  if (!es.length) dg.went.push("The record has no moves for this project yet.");
  else if (nd === 1) dg.went.push("All in one day: " + dayName(first) + ".");
  else dg.went.push("From " + dayName(first) + " to " + dayName(last) + ": " + some(nd, "day") + " of work across " + some(Math.round((midnight(last) - midnight(first)) / DAY) + 1, "day") + ".");
  dg.went.push(some(dg.leaves, "leaf", "leaves") + ", " + some(dg.lines, "line") + ", about " + some(dg.words, "word") + ".");
  if (dg.moves) dg.went.push("Who made the moves: you " + who.me + (who.ai ? ", the fast AI " + who.ai : "") + (who.cmd ? ", commands " + who.cmd : "") + (who.auto ? ", automations " + who.auto : "") + ".");
  /* what you did again and again */
  Object.keys(DID).filter(k => did[k] >= 2).sort((a, b) => did[b] - did[a]).slice(0, 5).forEach(k => dg.again.push("You " + DID[k] + " " + times(did[k]) + "."));
  tops(names, 3).filter(n => names[n] >= 2).forEach(n => dg.again.push("You gave folds the name " + q(n) + " " + times(names[n]) + "."));
  tops(labels, 3).filter(n => labels[n] >= 2).forEach(n => dg.again.push("You used the link label " + q(n) + " " + times(labels[n]) + "."));
  tops(cmds, 3).filter(c => cmds[c] >= 2).forEach(c => dg.again.push("You ran " + c + " " + times(cmds[c]) + "."));
  const asks = total(asksIn); if (asks >= 2) { const a2 = tops(asksIn, 2); dg.again.push("You asked the fast AI " + times(asks) + (a2.length > 1 && asksIn[a2[0]] > asksIn[a2[1]] ? ", most in " + q(a2[0]) : "") + "."); }
  const heads = {}, spelt = {}; Object.keys(set).forEach(id => { const lf = D().leaves[id], seen = {}; if (lf) lf.lines.forEach(l => { const L = D().lines[l], t = L.text.trim(), k = t.toLowerCase(); if (L.d || !t || t.length > 40 || t[0] === ";" || L.leaf || seen[k]) return; seen[k] = 1; heads[k] = (heads[k] || 0) + 1; spelt[k] = spelt[k] || t; }); });
  let shared = Object.keys(heads).filter(k => heads[k] >= 2);
  if (shared.length >= 2) { let best = null, n = -1; Object.keys(set).forEach(id => { const lf = D().leaves[id]; if (!lf) return; const c = lf.lines.filter(l => !D().lines[l].d && shared.indexOf(D().lines[l].text.trim().toLowerCase()) >= 0).length; if (c > n) { n = c; best = lf; } });
    const order = []; best.lines.forEach(l => { const L = D().lines[l], k = L.text.trim().toLowerCase(); if (!L.d && shared.indexOf(k) >= 0 && order.indexOf(k) < 0) order.push(k); }); shared = order.concat(shared.filter(k => order.indexOf(k) < 0)).slice(0, 8);
    dg.again.push("These lines open more than one of its leaves: " + shared.map(k => spelt[k]).join(", ") + "."); } else shared = [];
  if (!dg.again.length) dg.again.push("The record shows nothing done more than once yet.");
  /* where you got stuck */
  let gap = 0, ga = 0, gb = 0; for (let i = 1; i < dks.length; i++) { const a = midnight(byDay[dks[i - 1]].t), b = midnight(byDay[dks[i]].t), d = Math.round((b - a) / DAY) - 1; if (d > gap) { gap = d; ga = a; gb = b; } }
  if (gap >= 2) dg.stuck.push("The longest pause: " + gap + " days with no moves, between " + dayName(ga) + " and " + dayName(gb) + ".");
  const undos = total(undoIn), u2 = tops(undoIn, 2); if (undos) dg.stuck.push("You pressed Undo " + times(undos) + (u2.length === 1 ? " in " + q(u2[0]) : undoIn[u2[0]] > undoIn[u2[1]] ? ", most in " + q(u2[0]) + " (" + undoIn[u2[0]] + ")" : "") + ".");
  const rw = Object.keys(took).filter(k => took[k] >= 40 && took[k] >= wrote[k] * 0.3).sort((a, b) => took[b] - took[a])[0]; if (rw) dg.stuck.push("You rewrote the most in " + q(rw) + ": " + wrote[rw] + " letters written, " + took[rw] + " taken away.");
  const hk = Object.keys(held).filter(k => held[k] >= 300000 && held[k] >= (typed[k] || 0) * 0.3).sort((a, b) => held[b] - held[a])[0]; if (hk) dg.stuck.push("You held the clock longest in " + q(hk) + ": " + dur(held[hk]) + " of holding beside " + dur(typed[hk] || 0) + " of typing.");
  if (did.prune) dg.stuck.push("You deleted " + some(did.prune, "branch", "branches") + (did.restore ? " and brought " + did.restore + " back" : "") + ".");
  if (!dg.stuck.length) dg.stuck.push("Nothing in the record stands out. Where did it feel stuck to you?");
  /* what you were waiting on */
  Object.values(D().marks || {}).filter(m => set[m.leaf] && (m.waiting || m.doing)).sort((a, b) => a.at - b.at).slice(0, 12).forEach(m => { const n = Math.round(((m.done || Date.now()) - m.at) / DAY);
    dg.waiting.push((m.waiting ? "Waiting for " + q(clip(m.waiting, 70)) : "A bookmark, while " + q(clip(m.doing, 70))) + ": " + (m.done ? "done after " + days(n) : "still open after " + days(n)) + "."); });
  Object.values(D().more.requests || {}).filter(R => R.where && set[R.where.leaf]).slice(0, 6).forEach(R => dg.waiting.push("A request to a coding AI, " + q(clip(R.want, 70)) + ": " + (R.status === "done" ? "done" : "not yet") + "."));
  if (!dg.waiting.length) dg.waiting.push("No bookmarks or requests were left in this project.");
  /* how the time was spent */
  if (tTyped || tHeld) { dg.time.push(dur(tTyped) + " of writing" + (tHeld ? " and " + dur(tHeld) + " of holding (thinking, singing, rereading)" : "") + ", over " + some(nd, "day") + ".");
    const bd = dks.slice().sort((a, b) => byDay[b].ms - byDay[a].ms)[0]; if (nd > 1 && byDay[bd].ms) dg.time.push("The longest day: " + dayName(byDay[bd].t) + " (" + dur(byDay[bd].ms) + ").");
    const per = {}; Object.keys(typed).forEach(k => { per[k] = typed[k]; }); Object.keys(held).forEach(k => { per[k] = (per[k] || 0) + held[k]; }); if (Object.keys(per).length > 1) dg.time.push("Where it went: " + tops(per, 4).map(k => q(k) + " " + dur(per[k])).join(" · ") + "."); }
  else dg.time.push("The writing clock has nothing for this project.");
  /* repeated moves that could become commands (only moves the record or the leaves themselves show) */
  const C = g.Commands; if (C && Mods.on("commands")) { const have = C.all(), slug = s => ";" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16);
    tops(names, 3).filter(n => names[n] >= 2).forEach(n => { const code = slug(n), step = "fold as " + n; if (code.length < 2 || have.some(c => c.code === code || (c.steps.length === 1 && c.steps[0].text.toLowerCase() === step.toLowerCase()))) return;
      dg.ideas.push({ code, about: "folds the lines you're on and names the fold " + q(n), steps: [{ d: 0, text: step }], why: "You gave folds the name " + q(n) + " " + times(names[n]) + "." }); });
    if (shared.length >= 2) { const steps = shared.map((k, i) => ({ d: 0, text: (i ? "write below " : "write ") + spelt[k] })), same = c => c.steps.length === steps.length && c.steps.every((s, i) => s.text.toLowerCase() === steps[i].text.toLowerCase());
      let code = slug(dg.title + " shape"); if (code.length < 3 || have.some(c => c.code === code)) code = ";shape" + (have.some(c => c.code === ";shape") ? "2" : "");
      if (!have.some(same) && !have.some(c => c.code === code)) dg.ideas.push({ code, about: "writes the lines a leaf of " + q(clip(dg.title, 24)) + " starts from: " + shared.map(k => spelt[k]).join(", "), steps, why: "More than one of its leaves opens with these lines." }); } }
  return dg;
}
const SECTIONS = [["How it went", "went"], ["What you did again and again", "again"], ["Where you got stuck", "stuck"], ["What you were waiting on", "waiting"], ["How the time was spent", "time"]];
function rowsOf(dg, again) {
  const rows = [], d0 = again ? 1 : 0, put = (d, t) => rows.push({ d, text: t });
  put(0, again ? "What the record shows now · " + dateY(Date.now()) : "From the record of every move in " + q(dg.title) + ", " + dateY(Date.now()) + ". Grey lines are the book's, purple lines are the AI's, plain lines are yours. Write under any heading.");
  SECTIONS.forEach(s => { put(d0, s[0]); dg[s[1]].forEach(t => put(d0 + 1, t)); });
  if (!again) { put(0, "What to keep"); dg.ideas.forEach(i => put(1, "A command you could keep: " + i.code + " (" + i.about + "). " + i.why));
    put(1, "Repeated moves can become commands, and the fast AI can add its own debrief: ☰ → Harvest."); put(1, "A lesson goes to your “Ways of mine” leaf: tap ⌄ on a line here, then “Keep in Ways of mine”."); put(1, "Something BOLW couldn't do becomes a request to a coding AI: tap ⌄ on a line, then “Make this a request”."); }
  return rows;
}
/* START (or, on a project already harvested, write today's facts again at the end of its Harvest leaf) */
async function start(P) {
  if (!Mods.on("harvest")) return { ok: false, why: "The harvest is switched off (Settings)." };
  const dg = await digest(P), had = harvestOf(P); let r; writing++; try { r = hand("harvest", { leaf: P, lines: rowsOf(dg, !!had) }); } finally { writing--; }
  if (r.ok && r.made) Log.add({ who: "me", what: "harvest", leaf: P }); r.digest = dg; return r;
}

/* ---------- reflect together: the fast AI reads the same record ---------- */
async function askAI(P) {
  const AI = g.AI, H = harvestOf(P); if (!H) return false; if (!AI || !Mods.on("ai")) { Page.say("The fast AI is switched off (Settings)."); return false; }
  const es = await entries(P), lines = []; let size = 0, left = 0;
  for (let i = es.length - 1; i >= 0; i--) { const s = stamp(es[i].t) + " · " + Log.say(es[i]); if (size + s.length > 14000) { left = i + 1; break; } lines.push(s); size += s.length + 1; } lines.reverse();
  const t = B.title(P), extra = ["THIS CHAT IS A HARVEST: a joint debrief of the writer's project " + q(t) + " (leaf id " + P + "), made together from the record of every move.",
    "The open leaf is its Harvest leaf (leaf id " + H + "). It already holds what the record shows under five headings (lines marked «from the record») and a last heading “What to keep”.",
    "YOUR PART, in this order:",
    "1. Read the record below. Read the project's own leaves too if you need them (read_leaf).",
    "2. Add your debrief INTO the Harvest leaf: under each of the five headings, one or two plain lines of your own, written after the record's lines under that heading and at their depth. Say what you notice that the bare numbers don't: the shape of the work from start to finish, the moves he repeats, where it slowed or went in circles, what he was waiting on, where the time went. Don't repeat the numbers. Don't change or remove any line.",
    "3. Then talk it through with him in this chat: one short question at a time about one thing you noticed, and listen to his answer.",
    "4. When something is worth keeping, offer it, one at a time. He decides each: a move he repeats → make_command (or make_automation for “when this happens, run that”) · a lesson about how he works → keep_lesson (one line for his “Ways of mine” leaf) · something BOLW couldn't do → write_request.",
    "THE RECORD OF EVERY MOVE IN THIS PROJECT (oldest first; " + es.length + " entries" + (left ? "; the earliest " + left + " are left out here, but the Harvest leaf counts them all" : "") + "):", lines.join("\n") || "(the record has nothing for this project yet)"].join("\n");
  Page.closeSheet(true); if (Page.leaf !== H) Page.go(H);
  AI.newChat({ title: "Harvest of " + clip(t, 30), leaf: H, harvest: P, extra, draft: "Read the record of " + q(t) + " and add your debrief to the Harvest leaf, under each heading. Then let's talk it through." });
  AI.open(); AI.send(); return true;
}

/* ---------- choosing what to keep ---------- */
function keepLesson(text) { const r = B.act("lesson", { text }); if (!r.ok) return Page.say(r.why); Page.toast("Kept in Ways of mine. The fast AI follows that leaf in every chat.", "Undo", Page.doUndo); return r; }
Page.menu(c => { if (!c.has || !projectOf(c.leaf)) return []; const t = D().lines[c.line].text.trim(); if (!t) return []; const out = [["Keep in Ways of mine", () => keepLesson(t)]];
  if (g.Requests && Mods.on("requests")) out.push(["Make this a request…", () => g.Requests.newCard({ want: t })]); return out; }, "harvest", 38);

/* ---------- ☰ → Harvest ---------- */
function open() {
  Page.sheet("Harvest", body => { let msg = "";
    const draw = async () => {
      const here = Page.leaf, P = projectOf(here) || (here === D().trunk ? null : here);
      if (!P) { const hs = Object.values(tbl()).filter(r => harvestOf(r.id)).sort((a, b) => b.at - a.at);
        body.innerHTML = `<p class="nt">A harvest is a look back at a finished project, made from the record of every move. Open the project's own leaf first (a harvest looks at one leaf and everything under it), then come back here.</p>` + (hs.length ? `<h2>Harvests so far</h2><div class="rows">` + hs.map(r => `<button class="rowi" data-h="${esc(r.leaf)}"><b>${esc(B.title(r.id))}</b><small>${esc(dateY(r.at))}</small></button>`).join("") + `</div>` : "");
        body.querySelectorAll("[data-h]").forEach(b => { b.onclick = () => Page.go(b.dataset.h); }); return; }
      const H = harvestOf(P), t = B.title(P);
      if (!H) { body.innerHTML = `<p class="nt">A harvest is a look back at a finished project, made together from the record of every move: how it went, what you did again and again, where you got stuck, what you were waiting on, and how the time was spent. Then you choose what to keep.</p>
          <p class="nt">It looks at “${esc(t)}” and everything under it, and adds a Harvest leaf as its last line. Nothing is sent anywhere.</p><div class="row"><button class="go" id="hvStart">Start the harvest of “${esc(clip(t, 30))}”</button></div><p class="nt" id="hvMsg"></p>`;
        body.querySelector("#hvStart").onclick = async () => { const r = await start(P); if (!r.ok) { body.querySelector("#hvMsg").textContent = r.why; return; } Page.go(r.leaf, r.first); Page.toast("The harvest of “" + clip(t, 30) + "” has begun. What's next: ☰ → Harvest.", "Next", open); }; return; }
      body.innerHTML = `<p class="nt">Loading…</p>`; const dg = await digest(P), C = g.Commands, canAI = g.AI && Mods.on("ai"); if (!body.isConnected) return;
      body.innerHTML = `<p class="nt">The Harvest leaf is the last line of “${esc(t)}”. It holds what the record shows. Write your own lines under any heading.</p><div class="row"><button class="go" id="hvOpen">Open the Harvest leaf</button><button id="hvAgain">Write today's facts again</button></div><p class="nt" id="hvMsg">${esc(msg)}</p>` +
        (canAI ? `<h2>Reflect together</h2><p class="nt">The fast AI reads the same record, adds its own lines under each heading, and then you talk it through. This sends the record of this project's moves and the Harvest leaf to ${esc(g.Socket ? g.Socket.label : "the AI")}. As in any chat, it can read leaves as it works.</p><div class="row"><button id="hvAI">Ask the fast AI for its debrief</button></div>` : "") +
        `<h2>What to keep</h2><p class="nt">Repeated moves become commands. A lesson goes to your “Ways of mine” leaf, and something BOLW couldn't do becomes a request: in the Harvest leaf, tap ⌄ on a line.</p><div class="rows">` +
        (dg.ideas.map((c, i) => `<div class="rowi cmd" style="flex-wrap:wrap"><span class="go"><b>${esc(c.code)}</b><small>${esc(c.about)} · ${esc(c.steps.map(s => s.text).join(" · "))}</small><small>${esc(c.why)}</small></span><button class="mini" data-try="${i}">Try it first</button><button class="mini put" data-keep="${i}">Keep</button></div>`).join("") || `<div class="none">${C && Mods.on("commands") ? "The record shows no repeated move to turn into a command yet." : "Commands are switched off (Settings)."}${canAI ? " The fast AI can suggest some." : ""}</div>`) + `</div><div id="hvTry"></div>`;
      msg = "";
      body.querySelector("#hvOpen").onclick = () => Page.go(H);
      body.querySelector("#hvAgain").onclick = async () => { const r = await start(P); msg = r.ok ? "Today's facts are at the end of the Harvest leaf." : r.why; draw(); };
      if (canAI) body.querySelector("#hvAI").onclick = () => askAI(P);
      body.querySelectorAll("[data-try]").forEach(b => { b.onclick = () => { const c = dg.ideas[+b.dataset.try], lf = D().leaves[H], r = C.tryOut(c, [], lf.lines[lf.lines.length - 1]);
        body.querySelector("#hvTry").innerHTML = `<div class="ask"><b>${esc(c.code)} tried in “${esc(r.where)}” (nothing was kept)</b><pre>${esc(r.preview)}</pre><div class="ans">${r.ok ? r.moves + " move" + (r.moves === 1 ? "" : "s") + ". Lines marked + would be new." : "It stopped: " + esc(r.why)}</div></div>`; }; });
      body.querySelectorAll("[data-keep]").forEach(b => { b.onclick = async () => { const c = dg.ideas[+b.dataset.keep], r = await C.keep(c); msg = r.ok ? "Kept as " + r.code + ". Type it at the start of a line, or tap ; in the bar." : r.why; draw(); }; });
    };
    draw(); });
}
Page.view({ mod: "harvest", order: 60, label: "Harvest (look back at a project)", open });

/* ---------- the fast AI's part: a line for Ways of mine, kept only when you say so ---------- */
if (g.AI) {
  const card = (c, p) => { c.innerHTML = `<b>A line for “Ways of mine”</b><div class="ba"><span>The line</span><div>${esc(p.text)}</div></div>`; if (p.answer) { c.appendChild(el("div", "ans", p.answer)); return; }
    const row = el("div", "row"), yes = el("button", "allow", "Keep"), nope = el("button", "", "Don’t"), fin = v => { if (!p._done) return; const d0 = p._done; p._done = null; row.remove(); d0(v); };
    yes.onclick = () => fin("keep"); nope.onclick = () => fin("dont"); row.appendChild(yes); row.appendChild(nope); c.appendChild(row); };
  g.AI.cards.lesson = card;
  g.AI.tool({ name: "keep_lesson", mod: "harvest", description: "Offer the writer ONE line for his “Ways of mine” leaf: a lesson about how he works, in plain words as he would say it (for example: “I fold the chorus before I write the verses.”). That leaf goes along with every chat as his standing ways. He keeps it or not.",
    input_schema: { type: "object", properties: { line: { type: "string" } }, required: ["line"] },
    run: (a, env) => new Promise(res => { const text = String(a.line || "").replace(/\s+/g, " ").trim(); if (!text) return res(g.AI.no("There's no line to keep.")); const p = { t: "card", kind: "lesson", title: "A line for Ways of mine: " + clip(text, 60), text }; let box = null;
      p._done = async v => { if (v !== "keep") { p.answer = "Not kept."; card(box, p); return res({ ok: false, card: true, text: "NOT KEPT: the writer said don't." }); }
        const r = await g.AI.act("lesson", { text }, env); p.answer = r.ok ? "Kept in Ways of mine." : r.why; card(box, p); res({ ok: !!r.ok, card: true, text: r.ok ? "KEPT in his Ways of mine leaf." : "NOT KEPT: " + r.why }); };
      box = g.AI.addPart(env, p); g.AI.waitCard(() => { if (p._done) { p._done = null; p.answer = "Not kept."; card(box, p); res({ ok: false, card: true, text: "NOT KEPT." }); } }); }) });
}
g.Harvest = { start, digest, rowsOf, askAI, open, keepLesson, harvestOf, projectOf, waysLeaf, entries };
})(window);
