/* Claude, living in the Book of Living Waters.
   A quiet presence on every page: ✦ Claude in the header, Ctrl/⌘ K anywhere, or "Ask Claude" on
   selected words. Claude answers as it thinks (streaming) and acts with the same hands you have:
   folds, nesting, tests, looks, settings, drills and add-ons. Every step shows as a line, and all
   of a reply's changes can be undone together. Claude never removes your words without asking.
   - Uses the Anthropic key in Settings → AI (this device only), the same monthly limit and estimate.
   - Nothing Claude does adds time to your writing clock (it never goes through typing).
   - Conversations are kept per page or fold, inside memory.convos (synced, encrypted).
   - Without internet, the book keeps working; Claude says so plainly. */
(() => {
  const T = window.TOL; if (!T || !T.ai || !T.memoryApi) return;
  const $ = id => document.getElementById(id), esc = T.esc, H = T.hooks, M = T.memoryApi;
  const clip = (s, n) => (s || "").length > n ? s.slice(0, n) + "…" : (s || "");
  const clone = o => o == null ? null : JSON.parse(JSON.stringify(o));
  const MAX_ROUNDS = 8, KEEP = 40;

  /* ---------------- the panel ---------------- */
  const css = document.createElement("style");
  css.textContent = `
#agent{position:fixed;right:16px;bottom:16px;width:min(420px,calc(100vw - 32px));max-height:min(72vh,640px);display:flex;flex-direction:column;z-index:30;
  background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 50px rgb(0 0 0/.22)}
#agent[hidden]{display:none}
#agent .ag-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}
#agent .ag-top b{flex:1;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#agent .ag-top button{min-height:36px}
#agent .ag-msgs{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
#agent .ag-m{max-width:94%;line-height:1.5;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}
#agent .ag-m.u{align-self:flex-end;background:color-mix(in srgb,var(--green) 12%,var(--paper));border-radius:12px 12px 2px 12px;padding:8px 10px}
#agent .ag-m.a{align-self:flex-start}
#agent .ag-quote{font-size:13px;color:var(--muted);border-left:3px solid var(--green);padding-left:8px;margin-bottom:4px;white-space:pre-wrap}
#agent .ag-step{display:block;font-size:13px;color:var(--muted);padding:2px 0}
#agent .ag-step::before{content:"• "}
#agent .ag-tier{display:inline-block;font-size:11px;border:1px solid var(--line);border-radius:999px;padding:0 7px;margin-top:4px;color:var(--muted)}
#agent .ag-ask{border:1px solid var(--green);border-radius:10px;padding:8px;font-size:14px;white-space:normal}
#agent .ag-ask .row{margin-top:6px}
#agent .ag-foot{border-top:1px solid var(--line);padding:8px 10px calc(8px + env(safe-area-inset-bottom))}
#agent .ag-sel{font-size:12px;color:var(--muted);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#agent textarea{width:100%;min-height:44px;max-height:30vh;resize:vertical;font:16px/1.4 "Hanken Grotesk",system-ui,sans-serif;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--paper);color:var(--ink)}
#agent .ag-row{display:flex;gap:8px;align-items:center;margin-top:6px}
#agent .ag-row small{flex:1;color:var(--muted)}
@media (max-width:760px){#agent{left:8px;right:8px;bottom:8px;width:auto;max-height:78vh}}
body.agent-open .thumb{display:none!important}`;
  document.head.appendChild(css);
  const panel = document.createElement("div"); panel.id = "agent"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Claude");
  panel.innerHTML = `<div class="ag-top"><b id="agTitle">Claude</b><button class="btn" id="agUndo" hidden>Undo Claude's changes</button><button class="btn" id="agClose" aria-label="Close">✕</button></div>
    <div class="ag-msgs" id="agMsgs" aria-live="polite"></div>
    <div class="ag-foot"><div class="ag-sel" id="agSel" hidden></div>
      <textarea id="agIn" rows="2" placeholder="Ask Claude, or tell it what to do here…"></textarea>
      <div class="ag-row"><small id="agNote"></small><button class="btn" id="agStop" hidden>Stop</button><button class="btn primary" id="agSend">Send</button></div></div>`;
  document.body.appendChild(panel);

  let here = null;         // { nodeId, sel: {id,s,e,text} | null }
  let busy = null;         // AbortController while Claude is working
  const undoStack = [];    // { turn, nodes:{id:before}, mem:[[part,id,before]], theme, prefs }

  function whereAmI() {
    const a = document.activeElement;
    return a && a._c && T.live(T.node(a._c.id)) ? a._c.id : T.current();
  }
  function open(sel) {
    here = { nodeId: sel ? sel.id : whereAmI(), sel: sel || null };
    panel.hidden = false; document.body.classList.add("agent-open");
    paint(); setTimeout(() => $("agIn").focus({ preventScroll: true }), 30);
  }
  function close() { panel.hidden = true; document.body.classList.remove("agent-open"); }
  $("agClose").onclick = close;
  $("claudeHere").onclick = () => panel.hidden ? open(null) : close();
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); panel.hidden ? open(null) : close(); }
    if (e.key === "Escape" && !panel.hidden && !busy) close();
  });
  H.askSelection = sel => {
    const n = T.node(sel.id); if (!T.live(n)) return;
    open({ id: sel.id, s: sel.s, e: sel.e, text: (n.text || "").slice(sel.s, sel.e) });
  };

  /* ---------------- conversations (one per page or fold) ---------------- */
  const convo = id => M.getPart("convos")[id] || { id, msgs: [] };
  function saveConvo(c) { c.msgs = c.msgs.slice(-KEEP); M.putRecord("convos", c.id, c); }

  function bubble(m, live) {
    const d = document.createElement("div"); d.className = "ag-m " + (m.r === "u" ? "u" : "a");
    if (m.quote) { const q = document.createElement("div"); q.className = "ag-quote"; q.textContent = "“" + clip(m.quote, 240) + "”"; d.appendChild(q); }
    const t = document.createElement("div"); t.className = "ag-t"; t.textContent = m.t || (live ? "…" : ""); d.appendChild(t);
    const st = document.createElement("div"); st.className = "ag-steps";
    (m.steps || []).forEach(s => { const x = document.createElement("span"); x.className = "ag-step"; x.textContent = s; st.appendChild(x); });
    d.appendChild(st);
    if (m.r === "a" && m.tier && !live) { const b = document.createElement("span"); b.className = "ag-tier"; b.textContent = m.tier; d.appendChild(b); }
    return d;
  }
  function paint() {
    if (!here) return;
    const n = T.node(here.nodeId);
    $("agTitle").textContent = "Claude · " + (T.live(n) ? clip(T.titleOf(n), 40) : "your book");
    const box = $("agMsgs"); box.innerHTML = "";
    const c = convo(here.nodeId);
    if (!c.msgs.length) {
      const hi = document.createElement("div"); hi.className = "ag-m a";
      hi.textContent = "I'm here in your book. Ask me anything about this page, or tell me what to do: fold it, condense it into simpler levels, drill you, change the look, or build something new.";
      box.appendChild(hi);
    }
    c.msgs.forEach(m => box.appendChild(bubble(m)));
    box.scrollTop = box.scrollHeight;
    $("agSel").hidden = !here.sel; if (here.sel) $("agSel").textContent = "About: “" + clip(here.sel.text.replace(/\s+/g, " "), 80) + "”";
    const last = undoStack[undoStack.length - 1];
    $("agUndo").hidden = !(last && last.convo === here.nodeId);
    $("agNote").textContent = !T.ai.ready() ? "Add your Anthropic key in Settings → AI to talk with me." : navigator.onLine === false ? "You're offline. Your book works; I'll be back when you're online." : "Nothing I do counts on your writing clock.";
  }

  /* ---------------- tools: the same hands you have ---------------- */
  const tools = [];        // { def: {name, description, input_schema}, run(input, ctx), tier }
  function tool(name, description, props, required, run, tier) {
    tools.push({ def: { name, description, input_schema: { type: "object", properties: props, required: required || [] } }, run, tier: tier || "Instant" });
  }
  const S = (d, extra) => Object.assign({ type: "string", description: d }, extra || {});
  const N = d => ({ type: "number", description: d });
  function need(id) { const n = T.node(id); if (!T.live(n)) throw new Error("no page or fold with id " + id); return n; }
  function findWords(n, words, occurrence) {
    const text = n.text || "", k = Math.max(1, occurrence || 1); let at = -1;
    for (let i = 0; i < k; i++) { at = text.indexOf(words, at + 1); if (at < 0) break; }
    if (!words || at < 0) throw new Error(`the words “${clip(words, 60)}” aren't in “${clip(T.titleOf(n), 40)}”${k > 1 ? " (occurrence " + k + ")" : ""}`);
    return [at, at + words.length];
  }
  function snap(ctx, id) { if (!(id in ctx.nodes)) ctx.nodes[id] = clone(T.node(id) || null); }
  function snapMem(ctx, part, id) { if (!ctx.mem.some(x => x[0] === part && x[1] === id)) ctx.mem.push([part, id, clone(M.getPart(part)[id] || null)]); }
  const brief = n => ({ id: n.id, title: T.titleOf(n), kind: n.anchor ? "fold" : "page", words: n.anchor ? n.anchor.text : undefined, chars: (n.text || "").length });
  function describe(n, max) {
    const placed = T.placedIn(n.id);
    return { id: n.id, title: T.titleOf(n), path: T.path(n.id).map(T.titleOf).join(" › "), kind: n.anchor ? "fold" : "page",
             folded_under: n.anchor ? n.anchor.text : undefined, text: clip(n.text || "", max || 6000),
             folds: placed.slice(0, 80).map(m => ({ id: m.f.id, words: clip((n.text || "").slice(m.s, m.e), 80), start: m.s, end: m.e, preview: clip((m.f.text || "").replace(/\s+/g, " "), 80), link_to: m.f.portal || m.f.ref || undefined })),
             pages_inside: T.children(n.id).filter(c => !c.anchor).slice(0, 40).map(brief) };
  }
  function confirmAsk(ctx, what, before, after) {
    return new Promise(res => {
      const box = document.createElement("div"); box.className = "ag-m a ag-ask";
      box.innerHTML = `<b>Claude wants to ${esc(what)}</b>${before ? `<div class="ag-quote">Now: “${esc(clip(before, 300))}”</div>` : ""}${after != null ? `<div class="ag-quote">After: “${esc(clip(after, 300))}”</div>` : ""}
        <div class="row"><button class="btn primary" data-yes>Allow</button><button class="btn" data-no>Don't</button></div>`;
      $("agMsgs").appendChild(box); $("agMsgs").scrollTop = 1e9;
      box.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; box.remove(); res(b.hasAttribute("data-yes")); });
      ctx.signal && ctx.signal.addEventListener("abort", () => { box.remove(); res(false); });
    });
  }

  tool("read_here", "Read where the writer is now: this page or fold, its text, the folds in it (ids, words, positions), pages inside, and the selected words if any. Call this first when you need context.",
    {}, [], (inp, ctx) => {
      const n = need(ctx.here.nodeId), out = describe(n);
      if (ctx.here.sel) out.selection = { node_id: ctx.here.sel.id, start: ctx.here.sel.s, end: ctx.here.sel.e, words: ctx.here.sel.text };
      return { data: out };
    });
  tool("read_node", "Read any page or fold by id (its text, folds and pages inside).", { id: S("page or fold id") }, ["id"],
    inp => ({ data: describe(need(inp.id)), summary: null }));
  tool("list_pages", "List the book's pages (top level and what's inside, by id and title).", {}, [], () => {
    const out = []; (function walk(pid, d) { for (const c of T.children(pid)) { if (out.length > 300) return; if (c.ref || c.portal) continue; out.push(Object.assign(brief(c), { depth: d })); walk(c.id, d + 1); } })(null, 0);
    return { data: out };
  });
  tool("search_book", "Search all pages and folds for words. Returns ids, titles and a snippet.", { query: S("words to look for") }, ["query"], inp => {
    const q = (inp.query || "").toLowerCase().trim(); if (!q) return { data: [] };
    const hits = T.allNodes().filter(n => (n.text || "").toLowerCase().includes(q) || T.titleOf(n).toLowerCase().includes(q)).slice(0, 25)
      .map(n => { const t = n.text || "", i = Math.max(0, t.toLowerCase().indexOf(q) - 60); return Object.assign(brief(n), { snippet: t.slice(i, i + 160) }); });
    return { data: hits };
  });
  tool("add_text", "Add new words to a page or fold without removing anything: at the end (default), at the start, or right after some exact words.",
    { node_id: S("page or fold id"), text: S("the words to add"), where: S("end | start | after", { enum: ["end", "start", "after"] }), after: S("exact existing words to add after (when where=after)") },
    ["node_id", "text"], (inp, ctx) => {
      const n = need(inp.node_id), t = n.text || ""; let pos = t.length;
      if (inp.where === "start") pos = 0; else if (inp.where === "after") pos = findWords(n, inp.after)[1];
      snap(ctx, n.id); T.setText(n.id, t.slice(0, pos) + inp.text + t.slice(pos));
      return { summary: `Added ${inp.text.length} characters to “${clip(T.titleOf(n), 30)}”` };
    });
  tool("replace_text", "Change existing words in a page or fold (find exact words, replace them). The writer is asked first, because it removes their words.",
    { node_id: S("page or fold id"), find: S("exact words to replace"), replace: S("new words"), occurrence: N("which occurrence, 1 = first") },
    ["node_id", "find", "replace"], async (inp, ctx) => {
      const n = need(inp.node_id), [a, b] = findWords(n, inp.find, inp.occurrence);
      if (!(await confirmAsk(ctx, `change words in “${clip(T.titleOf(n), 30)}”`, inp.find, inp.replace))) return { data: "The writer said no. Leave their words as they are.", summary: "Asked to change words; you said no" };
      snap(ctx, n.id); const t = n.text || ""; T.setText(n.id, t.slice(0, a) + inp.replace + t.slice(b));
      return { summary: `Changed “${clip(inp.find, 30)}” → “${clip(inp.replace, 30)}”` };
    });
  tool("new_page", "Make a new page (optionally inside another page) with text in it.", { text: S("the page's text; its first line becomes its name"), parent_id: S("put it inside this page (optional)") },
    ["text"], (inp, ctx) => {
      if (inp.parent_id) need(inp.parent_id);
      const n = T.createNode({ parentId: inp.parent_id || null, text: inp.text || "", by: "Claude" }); ctx.nodes[n.id] = null;
      return { data: { id: n.id }, summary: `Made a page “${clip(T.titleOf(n), 40)}”` };
    });
  tool("make_fold", "Fold new text under some exact words in a page or fold (a fold opens beneath those words). Folds can overlap and nest without limit. Returns the new fold's id.",
    { node_id: S("the page or fold that holds the words"), words: S("exact words to fold under (any length, even one character)"), occurrence: N("which occurrence, 1 = first"), text: S("what goes inside the fold") },
    ["node_id", "words", "text"], (inp, ctx) => {
      const n = need(inp.node_id), [a, b] = findWords(n, inp.words, inp.occurrence);
      const f = T.ops.nest(n.id, a, b, inp.text || ""); if (!f) throw new Error("couldn't make the fold");
      ctx.nodes[f.id] = null;
      return { data: { id: f.id }, summary: `Folded under “${clip(inp.words, 30)}”` };
    });
  tool("nest_existing", "Move an existing page or fold so it is folded under some exact words (it keeps its own text).",
    { node_id: S("where the words are"), words: S("exact words"), occurrence: N("which occurrence"), existing_id: S("the page or fold to nest there") },
    ["node_id", "words", "existing_id"], (inp, ctx) => {
      const n = need(inp.node_id), x = need(inp.existing_id), [a, b] = findWords(n, inp.words, inp.occurrence);
      snap(ctx, x.id); if (!T.ops.reparent(x.id, n.id, a, b)) throw new Error("that would put a page inside itself");
      return { summary: `Nested “${clip(T.titleOf(x), 30)}” under “${clip(inp.words, 30)}”` };
    });
  tool("wrap_words", "Wrap here (shared): the words stay where they are and also appear inside a new (or existing) fold around them; editing them in either place edits both.",
    { node_id: S("where the words are"), words: S("exact words"), occurrence: N("which occurrence"), existing_id: S("wrap in this existing fold or page (optional)") },
    ["node_id", "words"], (inp, ctx) => {
      const n = need(inp.node_id), [a, b] = findWords(n, inp.words, inp.occurrence);
      const before = new Set(T.allNodes().map(x => x.id)); snap(ctx, n.id); if (inp.existing_id) snap(ctx, need(inp.existing_id).id);
      T.ops.wrap(n.id, a, b, inp.existing_id); T.allNodes().forEach(x => { if (!before.has(x.id)) ctx.nodes[x.id] = null; });
      return { summary: `Wrapped “${clip(inp.words, 30)}” (shared words)` };
    });
  tool("move_words", "Move into: cut exact words to a new page or an existing one, leaving a ⤷ marker. Asks the writer first.",
    { node_id: S("where the words are"), words: S("exact words"), occurrence: N("which occurrence"), dest_id: S("existing page or fold to move them into (optional; otherwise a new page)") },
    ["node_id", "words"], async (inp, ctx) => {
      const n = need(inp.node_id), [a, b] = findWords(n, inp.words, inp.occurrence);
      if (!(await confirmAsk(ctx, `move these words out of “${clip(T.titleOf(n), 30)}” (a ⤷ marker stays)`, inp.words, null))) return { data: "The writer said no.", summary: "Asked to move words; you said no" };
      const before = new Set(T.allNodes().map(x => x.id)); snap(ctx, n.id); T.foldsOf(n.id).forEach(f => snap(ctx, f.id)); if (inp.dest_id) snap(ctx, need(inp.dest_id).id);
      T.ops.move(n.id, a, b, inp.dest_id); T.allNodes().forEach(x => { if (!before.has(x.id)) ctx.nodes[x.id] = null; });
      return { summary: `Moved “${clip(inp.words, 30)}”` };
    });
  tool("open_fold", "Open or close a fold on the page (staircase view).", { fold_id: S("fold id"), open: { type: "boolean" } }, ["fold_id"], inp => {
    need(inp.fold_id); T.openFold(inp.fold_id, inp.open !== false); T.rerender();
    return { summary: `${inp.open === false ? "Folded away" : "Opened"} a fold` };
  });
  tool("go_to", "Open a page or fold on its own (focus view), so the writer sees it.", { node_id: S("page or fold id") }, ["node_id"], (inp, ctx) => {
    const n = need(inp.node_id); T.ops.focus(n.id); ctx.here.nodeId = ctx.here.nodeId;   // the conversation stays where it started
    return { summary: `Opened “${clip(T.titleOf(n), 40)}”` };
  });
  tool("set_memory", "Memory settings for a fold: practice (hide what's inside with hints), cue style, what tests hide, and who reviews answers.",
    { fold_id: S("fold id"), practice: { type: "boolean" }, cue: S("first | shape | alt | blank", { enum: ["first", "shape", "alt", "blank"] }),
      hide: S("contents | peg", { enum: ["contents", "peg"] }), review: S("ai | both | self", { enum: ["ai", "both", "self"] }) },
    ["fold_id"], (inp, ctx) => {
      need(inp.fold_id); snapMem(ctx, "folds", inp.fold_id);
      const f = {}; for (const k of ["practice", "cue", "hide", "review"]) if (inp[k] !== undefined) f[k] = inp[k];
      f.memorize = true; M.setFold(inp.fold_id, f); T.rerender();
      return { summary: "Changed memory settings for a fold" };
    });
  tool("add_questions", "Add test questions (with answers) to a fold. They join its memory tests.",
    { fold_id: S("fold id"), questions: { type: "array", items: { type: "object", properties: { q: S("question"), a: S("answer") }, required: ["q"] } } },
    ["fold_id", "questions"], (inp, ctx) => {
      need(inp.fold_id); const before = new Set(Object.keys(M.getPart("prompts")));
      snapMem(ctx, "folds", inp.fold_id); M.addPrompts(inp.fold_id, (inp.questions || []).filter(x => x && x.q).slice(0, 30), "ai");
      Object.keys(M.getPart("prompts")).forEach(k => { if (!before.has(k)) ctx.mem.push(["prompts", k, null]); });
      return { summary: `Added ${(inp.questions || []).length} question(s)` };
    });
  tool("start_test", "Start a memory test on a page or fold and everything inside it.", { node_id: S("page or fold id"), order: S("order | shuffle", { enum: ["order", "shuffle"] }) },
    ["node_id"], inp => { need(inp.node_id); setTimeout(() => { close(); M.startTest(inp.node_id, inp.order || "order"); }, 400); return { summary: "Starting a test" }; });
  tool("set_look", "Change the look instantly. Keys: " + Object.keys(T.THEME_DEFAULT).join(", ") + ". Use the same kinds of values as the defaults: " + JSON.stringify(T.THEME_DEFAULT),
    { changes: { type: "object", description: "only the keys to change" } }, ["changes"], (inp, ctx) => {
      if (!ctx.theme) ctx.theme = T.getTheme();
      const ch = {}; for (const [k, v] of Object.entries(inp.changes || {})) if (k in T.THEME_DEFAULT) ch[k] = v;
      T.setTheme(Object.assign(T.getTheme(), ch));
      return { summary: "Changed the look: " + (Object.keys(ch).join(", ") || "nothing") };
    });
  tool("set_setting", "Change a writing setting: pause (seconds a typing pause still counts, 1–15) or goal (daily hours, 1–12).",
    { name: S("pause | goal", { enum: ["pause", "goal"] }), value: N("the new value") }, ["name", "value"], (inp, ctx) => {
      if (!ctx.prefs) ctx.prefs = T.getPrefs(); T.ops.setSetting(inp.name, inp.value);
      return { summary: `Set ${inp.name === "pause" ? "typing pause" : "daily goal"} to ${inp.value}` };
    });
  tool("place_here", "Fold anywhere: show an existing page or fold ALSO under some words (a cross-fold / lateral link). It stays where it is; it's the same writing in both places. It may even be placed inside itself or its own folds (shown as 'already open above').",
    { node_id: S("where the words are (page or fold id)"), words: S("the exact words to place it under"), target_id: S("the page or fold to show there") }, ["node_id", "words", "target_id"], (inp, ctx) => {
      const n = need(inp.node_id), t = need(inp.target_id), r = findWords(n, inp.words);
      const f = T.placeHere(n.id, r[0], r[1], t.id); if (!f) throw new Error("couldn't place it there");
      ctx.nodes[f.id] = null;
      return { data: { id: f.id }, summary: `Placed “${T.titleOf(t).slice(0, 40)}” under “${clip(inp.words, 40)}” too` };
    });

  tool("ask_claude_code", "For big changes to the app's own structure that the tools and add-ons can't do: hand the request to Claude Code (on GitHub; takes minutes, the writer tries it and keeps or undoes it).",
    { request: S("the request, in plain words") }, ["request"], inp => {
      setTimeout(() => { close(); T.showView("chat"); const a = $("ask"); if (a) { a.value = inp.request; a.focus(); } }, 500);
      return { summary: "Handed this to Claude Code (Deep)" };
    }, "Deep");

  /* other parts (drills, add-ons, the app's code) add their own tools */
  T.agent = { open, close, tool: (name, description, props, required, run, tier) => tool(name, description, props, required, run, tier), snap, snapMem, need, findWords, clip, isOpen: () => !panel.hidden };

  /* ---------------- talking to Claude (streaming, with tools) ---------------- */
  const SYSTEM = () => `You are Claude, living inside the Book of Living Waters (BOLW): a writer's book of pages and folds, and a writing clock. You are its life and voice; the book is your body.
The writer is a songwriter and writer, not a programmer. Their definition of writing is "to enscribe oneself into life" (keep that spelling).
How the book works: every page, nest and fold is the same kind of thing. A fold hangs under exact words of its parent and opens beneath them; folds can overlap and nest without limit. "Wrap here" shares words with a bigger fold; "Move into" moves words and leaves a ⤷ marker. Folds can be hidden, practiced and tested (type from memory, word-by-word review, spaced review). Drills loop practice steps until mastery, then extend.
Rules: never delete or rewrite the writer's words unless they clearly ask (tools that remove words ask them first). Prefer adding folds and pages. Your actions never count on the writing clock. Keep replies short, warm and plain; no code unless asked. Act with tools when asked to do something; say in one line what you did. If a new ability is needed and fits a small add-on, you may build an add-on; for big changes to the app itself, use ask_claude_code.
Today is ${new Date().toDateString()}.`;

  async function stream(body, onText, signal) {
    const c = T.ai.cfg();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": c.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify(Object.assign({ stream: true }, body))
    });
    if (!r.ok) {
      let j = null; try { j = await r.json(); } catch (e) {}
      throw new Error(r.status === 401 ? "the AI key wasn't accepted (Settings → AI)" : r.status === 429 ? "too many requests; try again in a minute" : (j && j.error && j.error.message) || ("HTTP " + r.status));
    }
    const out = { content: [], stop: null, usage: { in: 0, out: 0 } };
    if (!(r.headers.get("content-type") || "").includes("event-stream") || !r.body) {
      const j = await r.json(); out.content = j.content || []; out.stop = j.stop_reason;
      out.usage = { in: (j.usage && j.usage.input_tokens) || 0, out: (j.usage && j.usage.output_tokens) || 0 };
      out.content.filter(b => b.type === "text").forEach(b => onText(b.text)); return out;
    }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    const handle = ev => {
      if (ev.type === "message_start" && ev.message && ev.message.usage) out.usage.in = ev.message.usage.input_tokens || 0;
      else if (ev.type === "content_block_start") out.content[ev.index] = Object.assign({}, ev.content_block, ev.content_block.type === "tool_use" ? { _json: "" } : { text: ev.content_block.text || "" });
      else if (ev.type === "content_block_delta") {
        const b = out.content[ev.index]; if (!b) return;
        if (ev.delta.type === "text_delta") { b.text += ev.delta.text; onText(ev.delta.text); }
        else if (ev.delta.type === "input_json_delta") b._json += ev.delta.partial_json || "";
      } else if (ev.type === "content_block_stop") {
        const b = out.content[ev.index];
        if (b && b.type === "tool_use") { try { b.input = b._json ? JSON.parse(b._json) : (b.input || {}); } catch (e) { b.input = {}; } delete b._json; }
      } else if (ev.type === "message_delta") { if (ev.delta && ev.delta.stop_reason) out.stop = ev.delta.stop_reason; if (ev.usage) out.usage.out = ev.usage.output_tokens || out.usage.out; }
      else if (ev.type === "error") throw new Error((ev.error && ev.error.message) || "the AI had a problem");
    };
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let k; while ((k = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
        const data = chunk.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
        if (data) { try { handle(JSON.parse(data)); } catch (e) { if (e instanceof SyntaxError) continue; throw e; } }
      }
    }
    out.content = out.content.filter(Boolean);
    return out;
  }

  async function send() {
    const text = $("agIn").value.trim(); if (!text || busy || !here) return;
    if (!T.ai.ready()) { paint(); $("agNote").textContent = "Add your Anthropic key first: Settings → AI."; return; }
    if (navigator.onLine === false) { $("agNote").textContent = "You're offline. Claude needs the internet; everything else in your book keeps working."; return; }
    const cap = T.ai.capReached(); if (cap) { $("agNote").textContent = `This month's AI limit of $${cap} is reached (Settings → AI).`; return; }
    $("agIn").value = "";
    const conv = convo(here.nodeId), sel = here.sel;
    const um = { r: "u", t: text, at: Date.now(), quote: sel ? sel.text : undefined };
    conv.msgs.push(um); saveConvo(conv);
    const am = { r: "a", t: "", at: Date.now(), steps: [], tier: "Instant" };
    const box = $("agMsgs"); box.appendChild(bubble(um));
    const ab = bubble(am, true); box.appendChild(ab); box.scrollTop = box.scrollHeight;
    const tEl = ab.querySelector(".ag-t"), stEl = ab.querySelector(".ag-steps");
    busy = new AbortController(); $("agStop").hidden = false; $("agSend").disabled = true;
    const ctx = { here: { nodeId: here.nodeId, sel }, nodes: {}, mem: [], theme: null, prefs: null, signal: busy.signal, tiers: new Set() };
    const node = T.node(here.nodeId);
    const history = conv.msgs.slice(-13, -1).filter(m => m.t).map(m => ({ role: m.r === "u" ? "user" : "assistant", content: m.t }));
    while (history.length && history[0].role !== "user") history.shift();
    const merged = []; for (const h of history) { const last = merged[merged.length - 1]; if (last && last.role === h.role) last.content += "\n\n" + h.content; else merged.push(Object.assign({}, h)); }
    if (merged.length && merged[merged.length - 1].role === "user") merged.pop();
    const where = T.live(node) ? `[I'm in: ${T.path(node.id).map(T.titleOf).join(" › ")} (id ${node.id})]` : "";
    const messages = merged.concat([{ role: "user", content: `${where}${sel ? `\n[Selected words in ${sel.id}, characters ${sel.s}–${sel.e}: “${clip(sel.text, 1500)}”]` : ""}\n\n${text}` }]);
    const c = T.ai.cfg(), model = T.ai._models[c.model] ? c.model : "claude-haiku-5-5";
    let firstText = true;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await stream({ model, max_tokens: 1500, system: SYSTEM(), tools: tools.map(t => t.def), messages },
          d => { if (firstText && !am.t) { tEl.textContent = ""; firstText = false; } am.t += d; tEl.textContent = am.t; box.scrollTop = box.scrollHeight; }, busy.signal);
        T.ai.record(model, res.usage.in, res.usage.out);
        messages.push({ role: "assistant", content: res.content.map(b => b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input || {} } : { type: "text", text: b.text || "" }).filter(b => b.type !== "text" || b.text) });
        const uses = res.content.filter(b => b.type === "tool_use");
        if (res.stop !== "tool_use" || !uses.length) break;
        const results = [];
        for (const u of uses) {
          const t = tools.find(x => x.def.name === u.name);
          let content, isErr = false;
          try {
            if (!t) throw new Error("no such tool");
            const r = await t.run(u.input || {}, ctx);
            if (r && r.summary) { am.steps.push(r.summary); const s = document.createElement("span"); s.className = "ag-step"; s.textContent = r.summary; stEl.appendChild(s); }
            if (t.tier !== "Instant") ctx.tiers.add(t.tier);
            content = JSON.stringify(r && r.data !== undefined ? r.data : "done");
          } catch (e) { isErr = true; content = "Couldn't: " + (e.message || e); }
          results.push({ type: "tool_result", tool_use_id: u.id, content: clip(content, 20000), is_error: isErr || undefined });
          if (busy.signal.aborted) break;
        }
        messages.push({ role: "user", content: results });
        if (busy.signal.aborted) break;
        if (am.t && !/\s$/.test(am.t)) { am.t += "\n"; }
      }
    } catch (e) {
      am.t += (am.t ? "\n\n" : "") + (e.name === "AbortError" ? "(Stopped.)" : "I couldn't finish: " + (e.message || e) + ".");
      tEl.textContent = am.t;
    } finally {
      am.t = am.t.trim() || (am.steps.length ? "Done." : "");
      tEl.textContent = am.t;
      am.tier = ctx.tiers.has("Deep") ? "Deep" : ctx.tiers.has("Add-on") ? "Add-on" : "Instant";
      const tb = document.createElement("span"); tb.className = "ag-tier"; tb.textContent = am.tier; ab.appendChild(tb);
      const changed = Object.keys(ctx.nodes).length || ctx.mem.length || ctx.theme || ctx.prefs;
      if (changed) { am.undo = true; undoStack.push({ convo: conv.id, turn: am.at, nodes: ctx.nodes, mem: ctx.mem, theme: ctx.theme, prefs: ctx.prefs }); if (undoStack.length > 20) undoStack.shift(); }
      conv.msgs.push(am); saveConvo(conv);
      busy = null; $("agStop").hidden = true; $("agSend").disabled = false;
      $("agUndo").hidden = !changed;
      T.refreshList();
    }
  }
  $("agSend").onclick = send;
  $("agStop").onclick = () => { if (busy) busy.abort(); };
  $("agIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !("ontouchstart" in window)) { e.preventDefault(); send(); } });

  /* ---------------- undo: everything Claude changed in its last reply ---------------- */
  function undoLast() {
    const u = undoStack.pop(); if (!u) return;
    if (Object.keys(u.nodes).length) T.restoreNodes(u.nodes);
    for (const [part, id, before] of u.mem.slice().reverse()) M.putRecord(part, id, before || { id, deleted: true });
    if (u.theme) T.setTheme(u.theme);
    if (u.prefs) { if (u.prefs.pause) T.ops.setSetting("pause", u.prefs.pause); if (u.prefs.goal) T.ops.setSetting("goal", u.prefs.goal); }
    document.dispatchEvent(new Event("tol:agent-undo"));
    const conv = convo(u.convo); conv.msgs.push({ r: "a", t: "Undone: everything from my last reply is back as it was.", at: Date.now(), steps: [], tier: "Instant" }); saveConvo(conv);
    T.rerender(); paint();
  }
  $("agUndo").onclick = undoLast;
  T.agent.undo = undoLast;
  window.addEventListener("online", () => { if (!panel.hidden) paint(); });
  window.addEventListener("offline", () => { if (!panel.hidden) paint(); });
})();
