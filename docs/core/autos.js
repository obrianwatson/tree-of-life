/* autos.js · MODULE "autos" · AUTOMATIONS: "when this happens, run that command."
   An automation is one line in your Commands leaf:   when a line starts with todo: ;todo
   - WHEN: a new leaf is opened · a line starts with <words> · a line has <words> · a fold is named [<name>] · a line is linked
     (a line "starts with" or "has" something when you finish it with Return).
   - It runs one of your commands, on this device, offline. Only YOUR moves set one off (never the AI's, a command's
     or another automation's), so they can't chain.
   - Each has a switch (☰ → Commands); switched off, its line reads "paused when …". It shows what it did, and one
     run is one Undo.
   - Suggested or written by the fast AI (make_automation), kept only when you say so.
   THE STARTING LIMIT: an automation only ADDS (writes new words, grows, folds, names, details, links, bookmarks),
   and only in the leaf you're on. It can't move, delete, rewrite, lift, or touch another leaf. */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, C = g.Commands, D = () => B.D, esc = Page.esc;
Mods.add({ id: "autos", name: "Automations", about: "When this happens, run that command. They only add, and only in the leaf you're on." });
const hand = B.hand("auto"); let running = 0;
const ADDS = { write: 1, grow: 1, fold: 1, name: 1, detail: 1, link: 1, mark: 1, gather: 1, gate: 1, stretch: 1 };
B.guard((name, needs, who) => { if (who.indexOf("auto") !== 0) return true; if (!running) return "An automation only acts while it is running.";
  if (!ADDS[name] || (name === "write" && (needs.remove | 0) > 0) || (name === "name" && !String(needs.name || "").trim())) return "Automations only add: they don't move, delete, rewrite or lift.";
  const leaf = needs.line ? B.leafOf(needs.line) : needs.from ? B.leafOf(needs.from) : needs.fold ? (D().folds[needs.fold] || {}).leaf : Page.leaf;
  if (name !== "gather" && leaf !== Page.leaf) return "Automations only act in the leaf you're on."; return true; });
const unq = s => String(s || "").trim().replace(/^[“"'‘]+|[”"'’]+$/g, "");
const KINDS = [["a new leaf is opened", /^a new leaf is opened$/i, "newleaf"], ["a line starts with …", /^a line starts with (.+)$/i, "starts"], ["a line has …", /^a line has (.+)$/i, "has"], ["a fold is named …", /^a fold is named(?: (.+))?$/i, "named"], ["a line is linked", /^a line is linked$/i, "linked"]];
const parse = when => { for (const k of KINDS) { const m = k[1].exec(when.trim()); if (m) return { kind: k[2], text: unq(m[1]).toLowerCase() }; } return null; };
function fireFor(kind, text, line) {
  if (!Mods.on("autos") || !Mods.on("commands") || running) return; const L = D().lines[line]; if (!L || L.in !== Page.leaf || L.in === C.homeLeaf()) return;
  C.autos().forEach(a => { if (!a.on) return; const w = parse(a.when); if (!w || w.kind !== kind) return; const t = String(text || "").toLowerCase();
    if (kind === "starts" && t.trim().indexOf(w.text) !== 0) return; if (kind === "has" && t.indexOf(w.text) < 0) return; if (kind === "named" && w.text && t.trim() !== w.text) return;
    const c = C.find(a.code); if (!c) return Page.toast("The automation “when " + a.when + "” names " + a.code + ", but there's no such command.");
    running++; let r; try { r = C.run(c, a.args ? a.args.split(/\s+/) : [], line, { hand, as: a.code, who: "auto:" + a.code, what: "automation", dry: false }); } finally { running--; }
    Page.redraw(); Page.toast(r.ok ? "Automation: " + a.code + " ran (" + r.moves + " move" + (r.moves === 1 ? "" : "s") + "), because " + a.when.replace(/^a /, "a ") + "." : "Automation " + a.code + " stopped: " + r.why, r.moves ? "Undo" : null, Page.doUndo); });
}
B.on(ev => { if (ev.dry || ev.type !== "action" || ev.who !== "me" || running) return;
  if (ev.name === "write" && ev.needs.words === "\n" && ev.result.structural) { const L = D().lines[ev.needs.line]; if (L && L.text.trim() && L.text[0] !== ";") setTimeout(() => fireFor("starts", L.text, L.id) || fireFor("has", L.text, L.id), 0); }
  else if (ev.name === "name" && ev.needs.name) { const F = D().folds[ev.needs.fold]; if (F) setTimeout(() => fireFor("named", ev.needs.name, F.from), 0); }
  else if (ev.name === "link") setTimeout(() => fireFor("linked", "", ev.needs.from), 0); });
const opened = {};
Page.on("leaf", id => { const lf = D().leaves[id]; if (!lf || id === D().trunk || opened[id] || lf.lines.length !== 1 || D().lines[lf.lines[0]].text) return; opened[id] = 1; setTimeout(() => { if (Page.leaf === id && !Page.demo) fireFor("newleaf", "", lf.lines[0]); }, 0); });

/* ---------- their part of ☰ → Commands ---------- */
function section(as) {
  return `<h2>Automations</h2><p class="nt">“When this happens, run that command.” They run on this device, only add, and only in the leaf you're on. Each is one line in your Commands leaf.</p><div class="rows">` +
    (as.map((a, i) => `<label class="rowi"><input type="checkbox" data-auto="${i}"${a.on ? " checked" : ""} style="width:20px;height:20px;flex:none"><span class="go"><b>when ${esc(a.when)}</b><small>run ${esc(a.code)}${a.args ? " " + esc(a.args) : ""}${C.find(a.code) ? "" : " · there is no such command yet"}</small></span></label>`).join("") || `<div class="none">No automations yet.</div>`) + `</div>
    <div class="row"><select id="auKind">${KINDS.map((k, i) => `<option value="${i}">when ${esc(k[0])}</option>`).join("")}</select><input type="text" id="auText" placeholder="the words (if it has …)" style="flex:1;min-width:120px"><select id="auCmd">${C.all().map(c => `<option>${esc(c.code)}</option>`).join("")}</select><button id="auAdd">Add</button></div>`;
}
function wire(body, draw) { const as = C.autos();
  body.querySelectorAll("[data-auto]").forEach(cb => { cb.onchange = () => { const a = as[+cb.dataset.auto], L = D().lines[a.line]; if (!L) return; const t = L.text.replace(/^\s*paused\s+/i, ""); B.act("write", { line: L.id, at: 0, remove: L.text.length, words: (cb.checked ? "" : "paused ") + t }); draw(); }; });
  const add = body.querySelector("#auAdd"); if (add) add.onclick = () => { const k = KINDS[+body.querySelector("#auKind").value], txt = body.querySelector("#auText").value.trim(), code = body.querySelector("#auCmd").value; if (!code) return alert("Make a command first: an automation runs one of your commands.");
    if (/…/.test(k[0]) && !txt && k[2] !== "named") return alert("Type the words it should look for."); const when = k[0].replace(" …", txt ? " " + txt : ""); C.keep({ when, code }).then(r => { if (!r.ok) alert(r.why); draw(); }); }; }
if (g.AI) g.AI.tool({ name: "make_automation", mod: "autos", description: "Suggest an automation to the writer: “when this happens, run that command”. WHEN must be one of: “a new leaf is opened”, “a line starts with <words>”, “a line has <words>”, “a fold is named <name>”, “a line is linked”. The command must already exist (make it first). He keeps it or not. Automations only add, only in the leaf he's on.",
  input_schema: { type: "object", properties: { when: { type: "string" }, command: { type: "string" }, modifiers: { type: "string" } }, required: ["when", "command"] },
  run: (a, env) => new Promise(res => { const when = String(a.when || "").trim().replace(/^when\s+/i, ""), code = C.normCode(a.command); if (!parse(when)) return res(g.AI.no("That isn't one of the things an automation can wait for.")); if (!C.find(code)) return res(g.AI.no("There's no command " + code + " yet. Make it first."));
    const p = { t: "card", kind: "command", title: "An automation: when " + when, when, code, args: a.modifiers || "" }; let box = null;
    p._done = async v => { if (v !== "keep") { p.answer = "Not kept."; C.card(box, p); return res({ ok: false, card: true, text: "NOT KEPT: the writer said don't." }); } const r = await C.keep({ when, code, args: p.args }, (name, needs) => g.AI.act(name, needs, env)); p.answer = r.ok ? "Kept. It's switched on (☰ → Commands)." : r.why; C.card(box, p); res({ ok: r.ok, card: true, text: r.ok ? "KEPT and switched on." : "NOT KEPT: " + r.why }); };
    box = g.AI.addPart(env, p); g.AI.waitCard(() => { if (p._done) { p._done = null; p.answer = "Not kept."; C.card(box, p); res({ ok: false, card: true, text: "NOT KEPT." }); } }); }) });
g.Autos = { section, wire, parse, fireFor, KINDS };
})(window);
