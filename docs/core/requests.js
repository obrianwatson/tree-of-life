/* requests.js · MODULE "requests" · REQUESTS TO A CODING AI (the slow AI, outside the app).
   The fast AI can't change BOLW itself. When you want BOLW to do something it can't, you (or the fast AI with you)
   write a REQUEST: what you want, what done looks like, why, which part of BOLW it touches, and where you were.
   - A request is a leaf on a "Requests" leaf on the trunk: readable, editable, synced like everything else.
   - "Copy for coding AI" gives a ready-to-paste prompt for Claude Code or any coding AI.
   - You keep working. When the change is published, BOLW waits until you're not typing, updates, and takes you
     back to where you were (update.js). Then you mark the request Done or Not yet.
   The same card as bookmarks is used (marks.js → Marks.card).
   Records: more.requests[id] = { id, leaf, want, status: "notyet" | "done", where, at, updatedAt }
   Actions: request { leaf, want, where? } · requestdone { request, done } */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, D = () => B.D, esc = Page.esc, el = Page.el;
Mods.add({ id: "requests", name: "Requests", about: "Write a request for a coding AI when you want BOLW itself to change." });
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const now = () => Date.now(), tbl = () => (D().more.requests = D().more.requests || {});
B.action("request", function (needs, who, T) { if (!D().leaves[needs.leaf]) throw B.plain("That request's leaf isn't there."); T.more("requests"); const id = B.uid("q");
  tbl()[id] = { id, leaf: needs.leaf, want: clip(needs.want, 200), status: "notyet", where: needs.where || null, by: who, at: now(), updatedAt: now() };
  return { request: id, log: { what: "request", leaf: needs.leaf, n: clip(needs.want, 60) } }; }, "requests");
B.action("requestdone", function (needs, who, T) { const R = tbl()[needs.request]; if (!R) throw B.plain("That request isn't there."); T.more("requests"); tbl()[R.id] = Object.assign({}, R, { status: needs.done === false ? "notyet" : "done", updatedAt: now() }); return { request: R.id, status: tbl()[R.id].status }; }, "requests");

const FIELDS = [["want", "What I want", 3, "What should BOLW do that it can't do now?"], ["doneLooks", "Done looks like", 2, "How will I know it's done?"], ["why", "Why", 2, "optional"], ["module", "Which part of BOLW", 1, "Fold, Link, the page, the AI… (optional)"]];
const whereNow = () => { const c = Page.ctx(), leaf = Page.leaf; return { leaf, line: c.has ? c.line : null, text: B.path(leaf).map(B.title).concat(c.has ? B.trail(c.line).map(id => clip(D().lines[id].text.trim() || "…", 30)) : []).join(" › ") + (c.has && D().lines[c.line].text.trim() ? " · " + clip(D().lines[c.line].text.trim(), 50) : "") }; };
const requestsLeaf = () => B.leaves().find(id => id !== D().trunk && B.parentLeaf(id) === D().trunk && B.title(id).trim().toLowerCase() === "requests");
/* make the request's leaf (on a Requests leaf on the trunk) and record it. A = the hand that makes the moves (yours, or the AI's inside a reply). */
async function create(f, A, where) {
  A = A || ((name, needs) => B.act(name, needs)); where = where || whereNow(); const mine = !arguments[1]; if (mine) B.begin("request");
  try {
    let home = requestsLeaf();
    if (!home) { const tr = D().leaves[D().trunk], last = tr.lines[tr.lines.length - 1], LL = D().lines[last]; let line = last; if (LL.text || LL.leaf) { line = (await A("write", { line: last, at: LL.text.length, words: "\n" })).line; if (D().lines[line].d) await A("foldin", { line, dir: -9 }); } await A("write", { line, at: 0, words: "Requests" }); home = (await A("leaf", { line })).leaf; }
    const hl = D().leaves[home], last = hl.lines[hl.lines.length - 1], LL = D().lines[last]; let line = last; if (LL.text || LL.leaf) { line = (await A("write", { line: last, at: LL.text.length, words: "\n" })).line; if (D().lines[line].d) await A("foldin", { line, dir: -9 }); }
    await A("write", { line, at: 0, words: clip(String(f.want || "A request").replace(/\n/g, " "), 70) }); const leaf = (await A("leaf", { line })).leaf;
    const text = ["What I want: " + (f.want || ""), "Done looks like: " + (f.doneLooks || ""), "Why: " + (f.why || ""), "Which part of BOLW: " + (f.module || ""), "Where I was: " + (where.text || ""), "Status: Not yet"].map(t => t.replace(/\n/g, " ")).join("\n");
    await A("write", { line: D().leaves[leaf].lines[0], at: 0, words: text }); const r = await A("request", { leaf, want: f.want || "", where: { leaf: where.leaf, line: where.line } });
    return { ok: true, request: r.request, leaf };
  } finally { if (mine) B.end(); }
}
function prompt(R) { const lf = D().leaves[R.leaf], body = lf ? lf.lines.map(l => D().lines[l].text).filter(t => !/^Status:/.test(t)).join("\n") : "What I want: " + R.want;
  return ["You are working on BOLW Core (the Book of Living Waters): a writer's own book, a web app of plain files with no build step.", "Repository: obrianwatson/tree-of-life · the app is in docs/core/ · read AGENTS.md first (it explains the book, the modules and how to test).", "",
    "THE REQUEST (written by the writer with the AI inside the app):", body, "",
    "HOW TO WORK:", "- One module per file. Change the module this touches; add a new module file if it is a new ability (list it in docs/core/index.html and give it a switch with Mods.add).", "- Everything that changes the book goes through an action (Book.action / Book.act) so Undo, the record and sync keep working.",
    "- Never weaken the unchangeables (writing is never lost, rings, export, encrypted sync, keys unreachable, nothing sent to an AI unless asked, who-wrote-what, safe mode).", "- Add checks to tests/test_core.py and run them (python3 tests/test_core.py). Bump the version with: python3 tools/core-version.py <new version>.",
    "- Build on a copy (a branch), and when you're done say in plain words what changed and what the writer should try. He is a writer, not a programmer."].join("\n"); }
function setDone(id, done) { const R = tbl()[id]; if (!R) return; B.begin("reqdone"); B.act("requestdone", { request: id, done }); const lf = D().leaves[R.leaf]; if (lf) { const l = lf.lines.find(x => /^Status:/.test(D().lines[x].text)); if (l) B.act("write", { line: l, at: 0, remove: D().lines[l].text.length, words: "Status: " + (done ? "Done" : "Not yet") }); } B.end(); }
const list = () => Object.values(tbl()).filter(R => D().leaves[R.leaf]).sort((a, b) => b.at - a.at);
function newCard(pre) { const where = whereNow(), vals = pre && typeof pre.want === "string" ? { want: pre.want } : {};
  g.Marks.card({ title: "A request for a coding AI", intro: "For when you want BOLW itself to change. Write what you want; a coding AI (like Claude Code) does it outside the app while you keep writing.", where: where.text, whereNote: "where you were (it goes into the request)", go: () => {}, fields: FIELDS, values: vals, change: (k, v) => { vals[k] = v; },
    buttons: [["Save the request", async msg => { if (!(vals.want || "").trim()) { msg.textContent = "Say what you want first."; return; } const r = await create(vals, null, where); Page.closeSheet(true); openList(); Page.toast("The request is saved on your Requests leaf.", "Undo", Page.doUndo); }, "go"], ["Cancel", () => Page.closeSheet(false)]] });
}
function openList() {
  Page.sheet("Requests", body => { const draw = () => { const rs = list();
      body.innerHTML = `<p class="nt">The AI inside the book can't change BOLW itself. A request is how you ask a coding AI (the slow AI, outside the app) to do that. Copy it, paste it to Claude Code or any coding AI, and keep writing.</p><div class="row"><button class="go" id="rqNew">New request</button></div><div class="rows">` +
        (rs.map(R => `<div class="rowi" style="flex-wrap:wrap"><button class="go" data-o="${R.id}"><b>${esc(R.want || "A request")}</b><small>${R.status === "done" ? "Done" : "Not yet"} · ${esc(new Date(R.at).toLocaleDateString([], { month: "short", day: "numeric" }))}</small></button><button class="mini put" data-cp="${R.id}">Copy for coding AI</button><button class="mini" data-dn="${R.id}">${R.status === "done" ? "Not yet" : "Done"}</button></div>`).join("") || `<div class="none">No requests yet.</div>`) + `</div><p class="nt" id="rqMsg"></p>`;
      body.querySelector("#rqNew").onclick = newCard;
      body.querySelectorAll("[data-o]").forEach(b => { b.onclick = () => Page.go(tbl()[b.dataset.o].leaf); });
      body.querySelectorAll("[data-dn]").forEach(b => { b.onclick = () => { const R = tbl()[b.dataset.dn]; setDone(R.id, R.status !== "done"); draw(); }; });
      body.querySelectorAll("[data-cp]").forEach(b => { b.onclick = async () => { const text = prompt(tbl()[b.dataset.cp]), msg = body.querySelector("#rqMsg"); try { await navigator.clipboard.writeText(text); msg.textContent = "Copied. Paste it to Claude Code or any coding AI."; } catch (e) { const ta = el("textarea"); ta.value = text; ta.rows = 10; ta.readOnly = true; body.appendChild(ta); ta.select(); msg.textContent = "Select all of this and copy it:"; } }; }); };
    draw(); });
}
Page.view({ mod: "requests", order: 50, label: "Requests (to a coding AI)", open: openList });
if (g.AI) g.AI.tool({ name: "write_request", mod: "requests", description: "When the writer wants BOLW itself to do something it can't (a new ability, a change to how it works), write a request for a coding AI with him: what he wants, what done looks like, why, and which part of BOLW it touches. Ask him first if any of these is unclear. You cannot change BOLW yourself.",
  input_schema: { type: "object", properties: { want: { type: "string" }, done_looks_like: { type: "string" }, why: { type: "string" }, module: { type: "string", description: "Which part of BOLW: Fold, Link, Map, Bookmarks, the AI, Commands, the page…" } }, required: ["want", "done_looks_like"] },
  run: async (a, env) => { const where = whereNow(); const r = await create({ want: a.want, doneLooks: a.done_looks_like, why: a.why, module: a.module }, (name, needs) => g.AI.act(name, needs, env), where); return { ok: true, label: "Wrote a request: " + g.AI.q(a.want), go: { leaf: r.leaf }, text: "Done. The request is saved as a leaf on the Requests leaf (☰ → Requests). Tell the writer he can tap “Copy for coding AI” there and paste it to Claude Code or any coding AI, then mark it Done when the change lands." }; } });
g.Requests = { create, list, prompt, openList, newCard, setDone };
})(window);
