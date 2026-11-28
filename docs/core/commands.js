/* commands.js · MODULE "commands" · COMMANDS: your own moves, saved, run with no AI and no internet.
   A command is a CODE you choose (;layers), optional MODIFIERS typed after it (;layers 3), and a SCRIPT: plain steps
   made only of BOLW's own actions. Commands live in a "Commands" leaf on the trunk: readable, editable, synced, with
   rings like any leaf. A top-level line that starts with ";" is a command; the lines growing from it are its steps:

       ;song — a song's skeleton
           write Verse one
           write below Chorus
           fold as Chorus
           write below Verse two

   Type the code at the start of a line and press Return, or pick it from ";" in the bar.
   THE STEPS (each is something you could do yourself):
     write <words> · write below <words> · write inside <words>      grow · grow back · lift
     fold · fold <n> · fold as <name> · fold <n> as <name>            name <name> · detail <Key> = <value>
     link to <words> · link to <words> as <label>                     move up · move down · move to <leaf>
     go up · go down · go first · go last · go to <leaf>              bookmark <waiting for…>
     gather <name> = <search words> · search <words>                  repeat <n> (its own steps grow from it)
     run ;other <modifiers>                                           ask <instructions> (the fast AI writes new lines here)
   In words: {1} {2}… the modifiers · {all} all of them · {line} the line you're on · {leaf} · {date} · {time} · {n} the turn of a repeat.
   - Made with the fast AI once (make_command) or by hand; tried first with nothing kept; then it runs on your device.
   - An "ask" step waits for the internet; the rest still runs.
   - One run is one Undo. Every move it makes is in the record as the command's own.
   THE RULE: a command can never do anything you couldn't do yourself, and never changes BOLW's code. It has no
   steps that delete or rewrite your words. */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, D = () => B.D, esc = Page.esc, el = Page.el;
Mods.add({ id: "commands", name: "Commands", about: "Your own moves, saved under a code like ;song. They run offline." });
const hand = B.hand("cmd"); let running = 0;
B.guard((name, needs, who) => { if (who.indexOf("cmd") !== 0) return true; if (!running) return "A command only acts while it is running."; if (name === "prune" || name === "unfold" || name === "unlink" || (name === "write" && (needs.remove | 0) > 0)) return "Commands add and arrange; they don't delete or rewrite."; return true; });
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const homeLeaf = () => B.leaves().find(id => id !== D().trunk && B.parentLeaf(id) === D().trunk && B.title(id).trim().toLowerCase() === "commands");
const leafByName = name => { const n = String(name).trim().toLowerCase(); return B.leaves().find(id => B.title(id).trim().toLowerCase() === n); };

/* ---------- reading the Commands leaf ---------- */
function all() {
  const home = homeLeaf(), out = []; if (!home) return out; const lf = D().leaves[home];
  for (let i = 0; i < lf.lines.length; i++) { const L = D().lines[lf.lines[i]]; if (L.d !== 0) continue; const m = /^(;[^\s—:]+)\s*(?:[—–:-]\s*)?(.*)$/.exec(L.text.trim()); if (!m) continue;
    let steps = []; const e = B.branchEnd(lf, i); for (let k = i + 1; k < e; k++) { const S = D().lines[lf.lines[k]]; if (S.text.trim()) steps.push({ d: S.d - 1, text: S.text.trim() }); }
    if (!steps.length && L.leaf && D().leaves[L.leaf]) steps = D().leaves[L.leaf].lines.map(l => D().lines[l]).filter(S => S.text.trim()).map(S => ({ d: S.d, text: S.text.trim() }));
    out.push({ code: m[1].toLowerCase(), about: m[2].trim(), steps, line: L.id }); }
  return out;
}
const autos = () => { const home = homeLeaf(), out = []; if (!home) return out; D().leaves[home].lines.forEach(l => { const L = D().lines[l]; if (L.d !== 0) return; const m = /^(paused\s+)?when\s+(.+?)\s*:\s*(;\S+)(.*)$/i.exec(L.text.trim()); if (m) out.push({ on: !m[1], when: m[2].trim(), code: m[3].toLowerCase(), args: m[4].trim(), line: L.id, text: L.text.trim() }); }); return out; };
const find = code => all().find(c => c.code === String(code).toLowerCase());

/* ---------- running a script ---------- */
const stamp = () => new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
function subst(t, env) { return t.replace(/\{(\w+)\}/g, (m, k) => { if (/^\d+$/.test(k)) return env.args[+k - 1] || ""; if (k === "all") return env.args.join(" "); if (k === "line") return (D().lines[env.line] || { text: "" }).text.trim(); if (k === "leaf") return B.title(env.leaf); if (k === "date") return stamp(); if (k === "time") return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); if (k === "n") return String(env.n || 1); return m; }); }
function tree(steps) { const root = [], stack = [{ d: -1, kids: root }]; steps.forEach(s => { const node = { text: s.text, kids: [] }; while (stack.length > 1 && stack[stack.length - 1].d >= s.d) stack.pop(); stack[stack.length - 1].kids.push(node); stack.push({ d: s.d, kids: node.kids }); }); return root; }
const fail = msg => Object.assign(new Error(msg), { step: true });
function addLine(env, how, words) {         // a new line below (after this line and its branch) or inside (growing from it); the cursor moves to it
  const L = D().lines[env.line], lf = D().leaves[L.in], i = lf.lines.indexOf(L.id);
  if (how === "below" && env.fresh && !L.text && !L.leaf) { env.fresh = false; return env.do("write", { line: L.id, at: 0, words }); }       // the command began on an empty line: its first "write below" fills that line instead of leaving it blank
  const want = how === "inside" ? L.d + 1 : L.d, anchor = how === "inside" ? L.id : lf.lines[B.branchEnd(lf, i) - 1], before = lf.lines.length;
  const r = env.do("write", { line: anchor, at: D().lines[anchor].text.length, words: "\n" + words }); const k = lf.lines.indexOf(anchor) + 1, n = lf.lines.length - before, first = lf.lines[k], shift = want - D().lines[first].d;
  if (shift) env.do("grow", { line: first, to: lf.lines[k + n - 1], dir: shift }); env.line = lf.lines[k + n - 1]; return r;
}
function step(node, env) {
  const raw = node.text, t = subst(raw, env), L = D().lines[env.line]; if (!L) throw fail("The line the command was on is gone."); const lf = D().leaves[L.in]; let m;
  if (!/^(write\s+below|repeat)\b/i.test(t)) env.fresh = false;
  if ((m = /^repeat\s+(\S+)$/i.exec(t))) { const n = Math.max(0, Math.min(50, parseInt(m[1], 10) || 0)); for (let k = 1; k <= n; k++) { env.n = k; node.kids.forEach(c => step(c, env)); } return; }
  if (node.kids.length) throw fail("Only “repeat” has steps of its own: “" + raw + "”");
  if ((m = /^write\s+below\s+(.+)$/i.exec(t))) return void addLine(env, "below", m[1]);
  if ((m = /^write\s+inside\s+(.+)$/i.exec(t))) return void addLine(env, "inside", m[1]);
  if ((m = /^write\s+(.+)$/i.exec(t))) return void env.do("write", { line: L.id, at: L.text.length, words: (L.text && !/\s$/.test(L.text) ? " " : "") + m[1] });
  if ((m = /^grow(\s+back)?$/i.exec(t))) return void env.do("grow", { line: L.id, dir: m[1] ? -1 : 1 });
  if (/^lift$/i.test(t)) return void env.do("lift", { line: L.id });
  if ((m = /^fold(?:\s+(\d+))?(?:\s+as\s+(.+))?$/i.exec(t))) { const n = m[1] ? Math.max(1, +m[1]) : 0, needs = { from: L.id }; if (n) needs.to = lf.lines[Math.min(lf.lines.length - 1, lf.lines.indexOf(L.id) + n - 1)]; if (m[2]) needs.name = m[2].trim(); env.fold = env.do("fold", needs).fold; return; }
  if ((m = /^name\s+(.+)$/i.exec(t))) { const f = env.fold || (g.Fold && g.Fold.covering(L.in, L.id)[0] && g.Fold.covering(L.in, L.id)[0].id); if (!f) throw fail("There's no fold here to name."); return void env.do("name", { fold: f, name: m[1].trim() }); }
  if ((m = /^detail\s+(.+?)\s*=\s*(.*)$/i.exec(t))) { const f = env.fold || (g.Fold && g.Fold.covering(L.in, L.id)[0] && g.Fold.covering(L.in, L.id)[0].id); if (!f) throw fail("There's no fold here for a detail."); return void env.do("detail", { fold: f, key: m[1].trim(), value: m[2].trim() }); }
  if ((m = /^link\s+to\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(t))) { const hit = B.search(m[1].trim(), 20).find(h => h.line !== L.id); if (!hit) throw fail("No line has “" + m[1].trim() + "” to link to."); return void env.do("link", { from: L.id, to: hit.line, label: (m[2] || "").trim() }); }
  if ((m = /^move\s+(up|down)$/i.exec(t))) return void env.do("move", { line: L.id, dir: m[1].toLowerCase() });
  if ((m = /^move\s+to\s+(.+)$/i.exec(t))) { const dest = leafByName(m[1]); if (!dest) throw fail("There's no leaf called “" + m[1].trim() + "”."); env.do("move", { line: L.id, leaf: dest }); env.leaf = dest; return; }
  if ((m = /^go\s+(up|down|first|last)$/i.exec(t))) { const i = lf.lines.indexOf(L.id), k = { up: Math.max(0, i - 1), down: Math.min(lf.lines.length - 1, i + 1), first: 0, last: lf.lines.length - 1 }[m[1].toLowerCase()]; env.line = lf.lines[k]; return; }
  if ((m = /^go\s+to\s+(.+)$/i.exec(t))) { const dest = leafByName(m[1]); if (!dest) throw fail("There's no leaf called “" + m[1].trim() + "”."); env.leaf = dest; env.line = D().leaves[dest].lines[D().leaves[dest].lines.length - 1]; return; }
  if ((m = /^bookmark(?:\s+(.+))?$/i.exec(t))) return void env.do("mark", { line: L.id, waiting: (m[1] || "").trim() });
  if ((m = /^gather\s+(.+?)\s*=\s*(.+)$/i.exec(t))) return void env.do("gather", { name: m[1].trim(), search: m[2].trim() });
  if ((m = /^search\s+(.+)$/i.exec(t))) { env.search = m[1].trim(); return; }
  if ((m = /^run\s+(;\S+)\s*(.*)$/i.exec(t))) { const c = find(m[1]); if (!c) throw fail("There's no command " + m[1] + "."); if (env.depth >= 8) throw fail("Commands are calling each other in a circle."); const sub = Object.assign({}, env, { args: m[2].trim() ? m[2].trim().split(/\s+/) : [], depth: env.depth + 1, n: 1 }); tree(c.steps).forEach(x => step(x, sub)); env.line = sub.line; env.leaf = sub.leaf; env.fold = sub.fold; return; }
  if ((m = /^ask\s+(.+)$/i.exec(t))) { env.asks.push({ line: env.line, ask: m[1].trim() }); return; }
  throw fail("I don't know the step “" + raw + "”.");
}
/* run steps at a line. o: { code, args, line, hand (whose hand makes the moves), as, dry } → { ok, moves, why?, line, asks } */
function execute(steps, o) {
  const env = { line: o.line, leaf: B.leafOf(o.line), args: o.args || [], n: 1, depth: 0, asks: [], moves: 0, fold: null, fresh: !!D().lines[o.line] && !D().lines[o.line].text }, who = o.as || o.code;
  env.do = (name, needs) => { const r = o.hand(name, needs, { as: who }); if (!r.ok) throw fail(r.why); env.moves++; return r; };
  let why = null; running++; try { tree(steps).forEach(n => step(n, env)); } catch (e) { if (!e.step) { running--; throw e; } why = e.message; } running--;
  return { ok: !why, why, moves: env.moves, line: env.line, leaf: B.leafOf(env.line) || env.leaf, asks: env.asks, search: env.search };
}
/* the "ask" steps: the fast AI writes when it can; a step that can't run now waits for the internet */
const waiting = () => (D().more.waiting = D().more.waiting || {});
async function runAsks(asks, code) { for (const a of asks) { if (!g.AI || !Mods.on("ai")) { Page.toast("The step “ask” needs the fast AI (it's switched off)."); continue; }
    try { const r = await g.AI.compose(a.line, a.ask); if (r && r.ok === false) Page.toast("The AI step didn't write anything: " + (r.why || r.label || "")); }
    catch (e) { if (e.wait) { const id = B.uid("w"); waiting()[id] = { id, line: a.line, ask: a.ask, code, at: Date.now(), updatedAt: Date.now() }; B.save(); Page.toast("One step of " + code + " is waiting for the internet. The rest ran."); } else Page.toast("The AI step failed: " + (e.message || e)); } } }
async function flushWaiting() { const w = waiting(), ids = Object.keys(w).filter(id => !w[id].gone); if (!ids.length || navigator.onLine === false || !g.AI || !g.Socket.hasKey() || g.AI.busy) return;
  for (const id of ids) { const a = w[id]; if (!D().lines[a.line]) { w[id] = Object.assign({}, a, { gone: true, updatedAt: Date.now() }); continue; } try { await g.AI.compose(a.line, a.ask); w[id] = Object.assign({}, a, { gone: true, updatedAt: Date.now() }); B.save(); Page.toast("A waiting step of " + a.code + " has run now that you're online.", "Undo", Page.doUndo); } catch (e) { if (!e.wait) w[id] = Object.assign({}, a, { gone: true, updatedAt: Date.now() }); break; } } }
addEventListener("online", () => setTimeout(flushWaiting, 1500)); document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(flushWaiting, 2000); }); setTimeout(flushWaiting, 5000);

/* RUN a command for real, at a line. One Undo. */
function run(code, args, line, o) {
  o = o || {}; const c = typeof code === "string" ? find(code) : code; if (!c) return { ok: false, why: "There's no command " + code + "." }; if (!Mods.on("commands")) return { ok: false, why: "Commands are switched off (Settings)." };
  const tag = "cmd" + B.uid(""); B.begin(tag, "cmd:" + c.code); let r; try { if (o.before) o.before(); r = execute(c.steps, { code: c.code, args: args || [], line, hand: o.hand || hand, as: o.as }); } finally { B.end(); }
  if (g.Log && !B.dry) g.Log.add({ who: o.who || "me", what: o.what || "command", leaf: B.leafOf(line) || r.leaf, n: c.code + (args && args.length ? " " + args.join(" ") : "") + " (" + r.moves + " move" + (r.moves === 1 ? "" : "s") + ")" });
  if (r.asks.length && !o.dry) runAsks(r.asks, c.code); r.tag = tag; return r;
}
/* TRY a command first: it really runs at a line, the result is read, and everything is put back exactly (Book.trial), so
   nothing is kept. Gives back how the leaf would read (new lines marked +). */
function tryOut(c, args, line) {
  const leaf = B.leafOf(line), before = new Set(D().leaves[leaf].lines), foldsBefore = new Set(Object.keys(D().folds)), text = [];
  const r = B.trial(() => { const L = D().lines[line]; let at = line; running++;
    try { if (L.text.trim()) { const lf = D().leaves[leaf], i = lf.lines.indexOf(line), anchor = lf.lines[B.branchEnd(lf, i) - 1], w = hand("write", { line: anchor, at: D().lines[anchor].text.length, words: "\n" }, { as: c.code }); at = w.line; const sh = L.d - D().lines[at].d; if (sh) hand("grow", { line: at, dir: sh }, { as: c.code }); } } finally { running--; }
    const out = execute(c.steps, { code: c.code, args: args || [], line: at, hand, dry: true }), lf2 = D().leaves[out.leaf] || D().leaves[leaf];
    lf2.lines.forEach(l => { const X = D().lines[l]; if (l === at && !X.text && !out.moves) return; text.push((before.has(l) ? "  " : "+ ") + "    ".repeat(X.d) + X.text); });
    Object.values(D().folds).forEach(F => { if (!foldsBefore.has(F.id) && D().lines[F.from] && D().lines[F.to]) text.push("+ [a fold" + (F.name ? " named “" + F.name + "”" : "") + ": from “" + clip(D().lines[F.from].text, 24) + "” to “" + clip(D().lines[F.to].text, 24) + "”]"); });
    out.asks.forEach(a => text.push("+ [here the AI would write: " + a.ask + "]")); return out; });
  const news = text.map((t, i) => t[0] === "+" ? i : -1).filter(i => i >= 0), lo = news.length ? Math.max(0, news[0] - 3) : 0, hi = news.length ? Math.min(text.length, news[news.length - 1] + 3) : Math.min(text.length, 8);
  return { ok: r.ok, why: r.why, moves: r.moves, preview: (lo > 0 ? "  …\n" : "") + text.slice(lo, hi).join("\n") + (hi < text.length ? "\n  …" : ""), where: B.title(leaf) };
}

/* KEEP a command: it is written into the Commands leaf (made on the trunk the first time). A = whose hand writes it. */
async function keep(c, A) {
  A = A || ((name, needs) => B.act(name, needs)); const mine = !arguments[1]; if (mine) B.begin("keepcmd");
  try { let home = homeLeaf();
    if (!home) { const tr = D().leaves[D().trunk], last = tr.lines[tr.lines.length - 1], LL = D().lines[last]; let line = last; if (LL.text || LL.leaf) { line = (await A("write", { line: last, at: LL.text.length, words: "\n" })).line; if (D().lines[line].d) await A("grow", { line, dir: -9 }); } await A("write", { line, at: 0, words: "Commands" }); home = (await A("leaf", { line })).leaf; }
    const code = normCode(c.code), ex = !c.when && find(code); if (ex) return { ok: false, why: "There's already a command " + code + ". Choose another code, or change that one in the Commands leaf." };
    const hl = D().leaves[home], last = hl.lines[hl.lines.length - 1], LL = D().lines[last]; let line = last; if (LL.text || LL.leaf || LL.d) { line = (await A("write", { line: last, at: LL.text.length, words: "\n" })).line; if (D().lines[line].d) await A("grow", { line, dir: -9 }); }
    const head = c.when ? "when " + c.when + ": " + code + (c.args ? " " + c.args : "") : code + (c.about ? " — " + String(c.about).replace(/\n/g, " ") : "");
    await A("write", { line, at: 0, words: head + (c.steps && c.steps.length ? "\n" + c.steps.map(s => "\t" + "\t".repeat(s.d || 0) + s.text).join("\n") : "") });
    return { ok: true, code, leaf: home, line };
  } finally { if (mine) B.end(); }
}
const normCode = c => { c = String(c || "").trim().toLowerCase().replace(/\s+/g, "-"); if (c[0] !== ";") c = ";" + c; return c.replace(/[^;\w.-]/g, "").slice(0, 24); };
const parseSteps = text => String(text || "").replace(/\r/g, "").split("\n").filter(l => l.trim()).map(l => { const m = /^(\t*|(?: {2,4})*)/.exec(l)[0]; return { d: m.indexOf("\t") >= 0 ? m.length : Math.floor(m.length / 2), text: l.trim() }; });
function examples() { B.begin("examples"); keepSync({ code: ";today", about: "writes today's date", steps: [{ d: 0, text: "write {date}" }] }); keepSync({ code: ";song", about: "a song's skeleton, with the chorus folded and named", steps: ["write Verse one", "write below Chorus", "fold as Chorus", "write below Verse two", "write below Bridge"].map(t => ({ d: 0, text: t })) }); B.end(); }
function keepSync(c) { let out; const A = (name, needs) => B.act(name, needs); let home = homeLeaf(); if (!home) { const tr = D().leaves[D().trunk], last = tr.lines[tr.lines.length - 1], LL = D().lines[last]; let line = last; if (LL.text || LL.leaf) { line = A("write", { line: last, at: LL.text.length, words: "\n" }).line; if (D().lines[line].d) A("grow", { line, dir: -9 }); } A("write", { line, at: 0, words: "Commands" }); home = A("leaf", { line }).leaf; }
  const hl = D().leaves[home], last = hl.lines[hl.lines.length - 1], LL = D().lines[last]; let line = last; if (LL.text || LL.leaf || LL.d) { line = A("write", { line: last, at: LL.text.length, words: "\n" }).line; if (D().lines[line].d) A("grow", { line, dir: -9 }); }
  A("write", { line, at: 0, words: normCode(c.code) + (c.about ? " — " + c.about : "") + "\n" + c.steps.map(s => "\t" + "\t".repeat(s.d || 0) + s.text).join("\n") }); return home; }

/* ---------- on the page: type the code and press Return, or pick it from ; in the bar ---------- */
function runHere(c, args, line) {
  const r = run(c, args, line);
  Page.render(); if (r.line && D().lines[r.line]) { if (B.leafOf(r.line) !== Page.leaf) Page.go(B.leafOf(r.line), r.line, { caret: true }); else Page.setCaret({ line: r.line }); }
  if (r.search && g.Search) g.Search.open(r.search);
  Page.toast(r.ok ? "Ran " + c.code + ": " + r.moves + " move" + (r.moves === 1 ? "" : "s") + "." : c.code + " stopped: " + r.why + (r.moves ? " (" + r.moves + " moves were made.)" : ""), r.moves ? "Undo" : null, Page.doUndo); return r;
}
Page.on("enter", (L, a) => { if (!Mods.on("commands") || !L || L.text[0] !== ";") return; const m = /^(;\S+)\s*(.*)$/.exec(L.text.trim()); if (!m) return; const c = find(m[1]); if (!c || L.in === homeLeaf()) return;
  B.sealUndo(); const args = m[2].trim() ? m[2].trim().split(/\s+/) : [], tag = "typed" + B.uid("");
  B.begin(tag, "cmd:" + c.code); const w = B.act("write", { line: L.id, at: 0, remove: L.text.length, words: "" }); runHere(c, args, L.id); B.end(); Page.fire("typed", L.in); return true; }, true);
function pickAndRun(at) { const cs = all(), c0 = Page.ctx(); if (!cs.length) return openList();
  Page.openMenu(at, cs.map(c => [c.code + (c.about ? "  ·  " + clip(c.about, 26) : ""), () => { const needsArgs = c.steps.some(s => /\{(\d+|all)\}/.test(s.text)); let args = []; if (needsArgs) { const v = prompt("Modifiers for " + c.code + " (what goes after the code)", ""); if (v == null) return; args = v.trim() ? v.trim().split(/\s+/) : []; } runAt(c, args); }]).concat([null, ["All commands…", openList]])); }
function runAt(c, args) { const c0 = Page.ctx(), leaf = D().leaves[Page.leaf]; let line = c0.has ? c0.line : leaf.lines[leaf.lines.length - 1]; const L = D().lines[line];
  B.begin("at" + B.uid(""), "cmd:" + c.code); if (L.text.trim()) { const i = leaf.lines.indexOf(line), anchor = leaf.lines[B.branchEnd(leaf, i) - 1], w = B.act("write", { line: anchor, at: D().lines[anchor].text.length, words: "\n" }); line = w.line; const sh = L.d - D().lines[line].d; if (sh) B.act("grow", { line, dir: sh }); } const r = runHere(c, args, line); B.end(); return r; }
Page.bar({ id: "cmd", mod: "commands", order: 30, label: ";", cls: "ic", menu: true, title: "Run one of your commands", show: c => c.has, run: (c, b) => { const r = b.getBoundingClientRect(); pickAndRun({ left: r.left, top: r.top, bottom: r.bottom, fromBar: true }); } });

/* ---------- ☰ → Commands ---------- */
function openList() {
  Page.sheet("Commands", body => { const draw = () => { const cs = all(), as = autos(), home = homeLeaf();
      body.innerHTML = `<p class="nt">A command is a code you choose and a few plain steps. Type the code at the start of a line and press Return, or tap <b>;</b> in the bar. They run on this device, with no AI and no internet. They live in your Commands leaf, where you can read and change them.</p>
        <div class="rows">` + (cs.map((c, i) => `<div class="rowi cmd" style="flex-wrap:wrap"><span class="go"><b>${esc(c.code)}</b><small>${esc(c.about || "")}${c.about ? " · " : ""}${c.steps.length} step${c.steps.length === 1 ? "" : "s"}</small></span><button class="mini" data-try="${i}">Try it first</button><button class="mini put" data-run="${i}">Run here</button></div>`).join("") || `<div class="none">No commands yet.</div>`) + `</div><div id="cmTry"></div>
        <div class="row">${home ? '<button id="cmOpen">Open the Commands leaf</button>' : ""}<button id="cmNew">New command</button>${cs.length ? "" : '<button class="go" id="cmEx">Add two examples</button>'}</div>
        ${g.Autos ? g.Autos.section(as) : ""}
        <h2>The steps you can use</h2><p class="nt">write … · write below … · write inside … · grow · grow back · lift · fold · fold 3 · fold as Name · name … · detail Key = value · link to words · link to words as label · move up · move down · move to Leaf · go up/down/first/last · go to Leaf · bookmark … · gather Name = words · repeat 3 (with its own steps under it) · run ;other · ask … (the fast AI writes here; waits for the internet)<br>In words: {1} {2} the modifiers, {all}, {line}, {leaf}, {date}, {time}, {n}.</p>`;
      body.querySelectorAll("[data-run]").forEach(b => { b.onclick = () => { Page.closeSheet(true); runAt(cs[+b.dataset.run], []); }; });
      body.querySelectorAll("[data-try]").forEach(b => { b.onclick = () => { const c = cs[+b.dataset.try], c0 = Page.ctx(), line = c0.has ? c0.line : D().leaves[Page.leaf].lines[0], r = tryOut(c, [], line); body.querySelector("#cmTry").innerHTML = `<div class="ask"><b>${esc(c.code)} tried in “${esc(r.where)}” (nothing was kept)</b><pre>${esc(r.preview)}</pre><div class="ans">${r.ok ? r.moves + " move" + (r.moves === 1 ? "" : "s") + ". Lines marked + would be new." : "It stopped: " + esc(r.why)}</div></div>`; }; });
      const o = body.querySelector("#cmOpen"); if (o) o.onclick = () => Page.go(home);
      body.querySelector("#cmNew").onclick = () => { const code = prompt("The code for your command (it will start with ;)", ""); if (!code || !code.trim()) return; keep({ code, about: "what it does", steps: [{ d: 0, text: "write below your words here" }] }).then(r => { if (!r.ok) return alert(r.why); Page.go(r.leaf, r.line); Page.toast("Change its steps right here in the Commands leaf."); }); };
      const ex = body.querySelector("#cmEx"); if (ex) ex.onclick = () => { examples(); draw(); };
      if (g.Autos) g.Autos.wire(body, draw); };
    draw(); });
}
Page.view({ mod: "commands", order: 60, label: "Commands", open: openList });

/* ---------- the fast AI makes commands with you (kept only when you say so) ---------- */
function card(c, p) {            // drawn in the chat: the code, the steps, Try it first, Keep / Don't
  const steps = p.steps || [], pre = steps.map(s => "    ".repeat(s.d || 0) + s.text).join("\n");
  c.innerHTML = `<b>${p.when ? "An automation" : "A new command"}</b>` + (p.when ? `<div class="ba"><span>When</span><div>${esc(p.when)}</div></div><div class="ba"><span>Run</span><div>${esc(p.code)}${p.args ? " " + esc(p.args) : ""}</div></div>` : `<label class="fld">Its code<input type="text" class="cdCode" value="${esc(p.code)}" ${p.answer ? "disabled" : ""}></label><div class="ba"><span>What it does</span><div>${esc(p.about || "")}</div></div><div class="ba"><span>Its steps</span><pre>${esc(pre)}</pre></div>`) + `<div class="tryout"></div>`;
  if (p.answer) { c.appendChild(el("div", "ans", p.answer)); return; }
  const row = el("div", "row"), tr = el("button", "", "Try it first"), yes = el("button", "allow", "Keep"), nope = el("button", "", "Don’t"), codeEl = c.querySelector(".cdCode");
  const finish = v => { if (!p._done) return; const d0 = p._done; p._done = null; row.remove(); d0(v, codeEl ? codeEl.value : p.code); };
  tr.onclick = () => { const c0 = Page.ctx(), line = c0.has ? c0.line : D().leaves[Page.leaf].lines[0], r = tryOut({ code: normCode(codeEl ? codeEl.value : p.code), steps }, (p.tryArgs || "").split(/\s+/).filter(Boolean), line);
    c.querySelector(".tryout").innerHTML = `<div class="ba"><span>Tried in “${esc(r.where)}” (nothing was kept)</span><pre>${esc(r.preview)}</pre></div><div class="ans">${r.ok ? r.moves + " move" + (r.moves === 1 ? "" : "s") + ". Lines marked + would be new." : "It stopped: " + esc(r.why)}</div>`; };
  yes.onclick = () => finish("keep"); nope.onclick = () => finish("dont"); if (!p.when) row.appendChild(tr); row.appendChild(yes); row.appendChild(nope); c.appendChild(row);
}
if (g.AI) {
  g.AI.cards.command = card;
  g.AI.tool({ name: "make_command", mod: "commands", description: "Make a command with the writer: a code he can type (like ;song), a line saying what it does, and plain steps. He reads it, can try it first, and keeps it or not. Steps (one per item; indent a step under a `repeat` with a leading tab): write <words> · write below <words> · write inside <words> · grow · grow back · lift · fold · fold <n> · fold as <name> · name <name> · detail <Key> = <value> · link to <words> [as <label>] · move up|down · move to <leaf> · go up|down|first|last · go to <leaf> · bookmark <text> · gather <name> = <words> · repeat <n> · run ;other · ask <instructions for the AI to write new lines>. In words: {1} {2} modifiers, {all}, {line}, {leaf}, {date}, {time}, {n}. A command adds and arranges; it never deletes or rewrites.",
    input_schema: { type: "object", properties: { code: { type: "string" }, about: { type: "string" }, steps: { type: "array", items: { type: "string" } }, try_with: { type: "string", description: "Modifiers to use when he tries it, if the steps use {1}." } }, required: ["code", "steps"] },
    run: (a, env) => new Promise(res => { const steps = parseSteps((a.steps || []).join("\n")), p = { t: "card", kind: "command", title: "A new command " + normCode(a.code), code: normCode(a.code), about: a.about || "", steps, tryArgs: a.try_with || "" };
      let box = null; const redraw = () => card(box, p);
      const onDone = async (v, code) => { if (v !== "keep") { p.answer = "Not kept."; redraw(); return res({ ok: false, card: true, text: "NOT KEPT: the writer said don't. Ask what he would change." }); }
        const r = await keep({ code, about: p.about, steps }, (name, needs) => g.AI.act(name, needs, env)); if (!r.ok) { p._done = onDone; redraw(); const w = box.querySelector(".tryout"); if (w) w.innerHTML = `<div class="ans">${esc(r.why)}</div>`; return; }
        p.code = r.code; p.answer = "Kept as " + r.code + ". Type it at the start of a line and press Return."; redraw(); res({ ok: true, card: true, text: "KEPT as " + r.code + " in the Commands leaf. He runs it by typing " + r.code + " at the start of a line and pressing Return (it works offline)." }); };
      p._done = onDone; box = g.AI.addPart(env, p); g.AI.waitCard(() => { if (p._done) { p._done = null; p.answer = "Not kept."; redraw(); res({ ok: false, card: true, text: "NOT KEPT." }); } }); }) });
  g.AI.tool({ name: "run_command", mod: "commands", description: "Run one of the writer's commands at a line (as he would by typing its code).", input_schema: { type: "object", properties: { code: { type: "string" }, modifiers: { type: "string" }, line: { type: "string", description: "The line to run it on." } }, required: ["code", "line"] },
    run: a => { const c = find(normCode(a.code)); if (!c) return g.AI.no("There's no command " + a.code + "."); if (!D().lines[a.line]) return g.AI.no("That line isn't there."); const r = run(c, String(a.modifiers || "").split(/\s+/).filter(Boolean), a.line, { who: "ai", what: "command" }); Page.redraw(); return r.ok ? { ok: true, label: "Ran " + c.code + " (" + r.moves + " moves)", go: { line: r.line }, text: "Done: " + r.moves + " moves." } : g.AI.no(r.why); } });
  g.AI.extras.push(() => { const cs = all(); return cs.length ? "THE WRITER'S COMMANDS (he types the code at the start of a line): " + cs.map(c => c.code + (c.about ? " (" + c.about + ")" : "")).join(", ") : ""; });
}
g.Commands = { all, autos, find, run, runAt, tryOut, keep, card, examples, openList, homeLeaf, execute, parseSteps, normCode, get waiting() { return Object.values(waiting()).filter(w => !w.gone); }, flushWaiting };
})(window);
