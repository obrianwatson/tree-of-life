/* AI inside the Tree of Life: feedback on your memory answers, questions made from your
   folds, and folds the AI writes for you — one level at a time, only when you ask.
   - Uses your own Anthropic API key, kept ONLY on this device (never synced, never sent to GitHub).
   - What goes to Anthropic: the fold's text, your answer, and the instruction you give.
   - AI writing never adds time to your writing clock. AI-written folds show a dashed line and an
     "AI" mark until you edit them.
   - Built so another provider (Venice / OpenAI-compatible) can be added to PROVIDERS later. */
(() => {
  const T = window.TOL; if (!T) return;
  const $ = id => document.getElementById(id), esc = T.esc, H = T.hooks, st = T.store;
  const CFG_KEY = "tol-ai", USE_KEY = "tol-ai-usage";       // this device only (previews share them, so you can try AI there)

  /* ---------------- providers ---------------- */
  const MODELS = {
    "claude-haiku-5-5": { label: "Claude Haiku 5.5 (fast, very cheap)", inM: 0.10, outM: 0.50, provider: "anthropic" },
    "claude-sonnet-5-5": { label: "Claude Sonnet 5.5 (deeper, costs more)", inM: 2, outM: 10, provider: "anthropic" },
    "claude-opus-5-5": { label: "Claude Opus 5.5 (the most capable, costs the most)", inM: 4, outM: 20, provider: "anthropic" }
  };
  /* what goes with every request to Anthropic. A key that isn't tied to one workspace needs the Workspace ID too. */
  const headers = c => Object.assign({ "content-type": "application/json", "x-api-key": c.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
                                     c.ws ? { "anthropic-workspace-id": c.ws } : {});
  /* Anthropic's answer when something is wrong, in plain words */
  function explain(status, msg) {
    if (/workspace/i.test(msg || "") && /scoped|anthropic-workspace-id/i.test(msg || "")) return "this key works across several workspaces, so Anthropic needs to know which one. Paste your Workspace ID below (it starts with wrkspc_; find it in the Claude Console under Workspaces), or make a new key inside one workspace";
    if (status === 401) return "the key wasn't accepted";
    if (status === 429) return "too many requests; try again in a minute";
    return msg || ("HTTP " + status);
  }
  const unreachable = c => navigator.onLine === false ? "you're offline" : "couldn't reach Anthropic" + (c.ws ? " (if this began after you added a Workspace ID, clear it and try again)" : "");
  const PROVIDERS = {
    anthropic: {
      async call({ key, ws, model, system, user, maxTokens, signal }) {
        let r;
        try { r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", signal, headers: headers({ key, ws }),
          body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] })
        }); } catch (e) { if (e.name === "AbortError") throw e; throw new Error(unreachable({ ws })); }
        let data = null; try { data = await r.json(); } catch (e) {}
        if (!r.ok) throw Object.assign(new Error(explain(r.status, data && data.error && data.error.message)), { status: r.status });
        const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
        return { text, usage: { in: (data.usage && data.usage.input_tokens) || 0, out: (data.usage && data.usage.output_tokens) || 0 } };
      }
    }
  };

  const cfg = () => Object.assign({ key: "", ws: "", model: "claude-haiku-5-5", cap: 5 }, st.get(CFG_KEY, {}));
  const setCfg = c => st.set(CFG_KEY, Object.assign(cfg(), c));
  const month = () => new Date().toISOString().slice(0, 7);
  function usage() { const u = st.get(USE_KEY, {}); return u.month === month() ? u : { month: month(), usd: 0, calls: 0 }; }
  const price = (model, i, o) => { const m = MODELS[model] || MODELS["claude-haiku-5-5"]; return (i * m.inM + o * m.outM) / 1e6; };
  const money = usd => usd < 0.01 ? `less than 1¢ (≈ $${usd.toFixed(4)})` : `≈ $${usd.toFixed(usd < 1 ? 3 : 2)}`;
  const estTokens = chars => Math.ceil(chars / 4);

  async function ask(system, user, maxTokens, opts) {
    const c = cfg(); if (!c.key) throw new Error("no AI key yet (Settings → AI)");
    const u = usage();
    if (!(opts && opts.force) && c.cap > 0 && u.usd >= c.cap) throw new Error(`this month's AI limit of $${c.cap} is reached (Settings → AI)`);
    if (navigator.onLine === false) throw new Error("you're offline");
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), (opts && opts.timeout) || 45000);
    try {
      const m = MODELS[c.model] ? c.model : "claude-haiku-5-5";
      const res = await PROVIDERS[MODELS[m].provider].call({ key: c.key, ws: c.ws, model: m, system, user, maxTokens, signal: ctl.signal });
      const nu = usage(); nu.usd += price(m, res.usage.in, res.usage.out); nu.calls++; st.set(USE_KEY, nu);
      return res.text;
    } catch (e) { if (e.name === "AbortError") throw new Error("the AI took too long"); throw e; }
    finally { clearTimeout(timer); }
  }
  function parseJSON(text) {                 // the reply should be JSON; be forgiving about extra words around it
    if (!text) return null;
    const t = text.replace(/```(?:json)?/gi, "");
    for (const [o, c] of [["{", "}"], ["[", "]"]]) {
      const a = t.indexOf(o), b = t.lastIndexOf(c);
      if (a !== -1 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    }
    return null;
  }
  const clip = (s, n) => (s || "").length > n ? s.slice(0, n) + "…" : (s || "");

  /* ---------------- feedback on a memory answer ---------------- */
  async function feedback({ prompt, ask: question, expected, answer, context }) {
    const sys = "You review a writer's answer in a memory test. Be warm, brief and exact. Compare the answer with the correct text. " +
      "Reply ONLY with JSON: {\"got\": [short phrases they remembered], \"missed\": [short phrases they left out or got wrong], " +
      "\"meaning\": \"kept\"|\"partly\"|\"lost\", \"tip\": one short memory tip, \"grade\": 1|2|3|4} where 1=missed, 2=almost, 3=got it, 4=easy (word-perfect and confident). " +
      "If wording differs but the meaning is kept, say so. Lyrics and poems need exact words for a 4.";
    const user = `Prompt: ${clip(prompt, 2000)}${question ? "\nQuestion: " + question : ""}${context ? "\nContext: " + clip(context, 600) : ""}\n\nCorrect text:\n${clip(expected, 6000)}\n\nTheir answer:\n${clip(answer, 6000) || "(empty)"}`;
    const j = parseJSON(await ask(sys, user, 500));
    if (!j || typeof j !== "object") return { note: "The AI's reply couldn't be read. Grade it yourself." };
    const g = Math.round(+j.grade);
    return { got: Array.isArray(j.got) ? j.got.slice(0, 8).map(String) : [], missed: Array.isArray(j.missed) ? j.missed.slice(0, 8).map(String) : [],
             meaning: ["kept", "partly", "lost"].includes(j.meaning) ? j.meaning : "", tip: j.tip ? String(j.tip).slice(0, 300) : "", grade: g >= 1 && g <= 4 ? g : null };
  }

  /* ---------------- a dialog for questions and "write deeper" ---------------- */
  const dlg = document.createElement("dialog"); dlg.id = "aiDlg"; dlg.setAttribute("aria-labelledby", "aiTitle"); document.body.appendChild(dlg);
  let dlgState = null;

  async function makeQuestions(foldId) {
    const f = T.node(foldId); if (!T.live(f)) return;
    if (!ready()) return needKey();
    dlgState = { kind: "q", foldId, list: null };
    dlg.innerHTML = `<h2 id="aiTitle">Questions from AI</h2><p>Reading “${esc(T.titleOf(f).slice(0, 50))}”…</p><div class="row"><button class="btn" data-ai="cancel">Cancel</button></div>`;
    dlg.showModal();
    const peg = f.anchor ? f.anchor.text : "";
    const sys = "You write memory-test questions for a writer, from their own text. Ask about what matters: key images, lines, facts, order, meaning. " +
      "Reply ONLY with JSON: {\"questions\": [{\"q\": question, \"a\": the exact answer from the text}]}, about 5 questions, short.";
    try {
      const j = parseJSON(await ask(sys, `${peg ? "The text is folded under the words: " + clip(peg, 300) + "\n\n" : ""}Text:\n${clip(f.text, 8000)}`, 900));
      const list = (j && (j.questions || (Array.isArray(j) ? j : null)) || []).filter(x => x && x.q).slice(0, 10).map(x => ({ q: String(x.q), a: x.a ? String(x.a) : "" }));
      if (!dlg.open || !dlgState || dlgState.kind !== "q") return;
      if (!list.length) { dlg.innerHTML = `<h2 id="aiTitle">Questions from AI</h2><p>The AI didn't return questions I could read. Try again.</p><div class="row"><button class="btn" data-ai="cancel">Close</button></div>`; return; }
      dlgState.list = list; paintQ();
    } catch (e) {
      dlg.innerHTML = `<h2 id="aiTitle">Questions from AI</h2><p>Couldn't make questions: ${esc(e.message)}.</p><div class="row"><button class="btn" data-ai="cancel">Close</button></div>`;
    }
  }
  function paintQ() {
    dlg.innerHTML = `<h2 id="aiTitle">Questions from AI</h2><p>Keep, edit or remove each. Kept ones join your tests for this fold.</p>
      <div class="aiq">${dlgState.list.map((x, i) => `<div class="aiq-item" data-i="${i}"><label><input type="checkbox" data-keep="${i}" checked> Keep</label>
        <input type="text" data-q="${i}" value="${esc(x.q)}" aria-label="Question ${i + 1}"><input type="text" data-a="${i}" value="${esc(x.a)}" aria-label="Answer ${i + 1}"></div>`).join("")}</div>
      <div class="row"><button class="btn primary" data-ai="keepq">Keep checked</button><button class="btn" data-ai="cancel">Cancel</button></div>`;
  }

  function deeper(target) {
    if (!ready()) return needKey();
    const c = cfg(), model = MODELS[c.model] ? c.model : "claude-haiku-5-5";
    let ctxChars = 0, label = "";
    if (target.selection) { const n = T.node(target.selection.id); ctxChars = Math.min(6000, (n.text || "").length); label = (n.text || "").slice(target.selection.s, target.selection.e); }
    else { const f = T.node(target.foldId); ctxChars = Math.min(6000, (f.text || "").length); label = f.anchor ? f.anchor.text : T.titleOf(f); }
    dlgState = { kind: "deep", target };
    const paintEst = () => {
      const depth = +$("aiDepth").value, chunks = +$("aiChunks").value;
      const one = price(model, estTokens(ctxChars + 1200), 700);
      let more = 0, n = 1; for (let l = 1; l < depth; l++) { n *= chunks; more += n; }
      $("aiDepthV").textContent = depth; $("aiChunksV").textContent = chunks;
      $("aiEst").textContent = `This step: ${money(one)}. ${more ? `If you later open every fold it marks, up to ${more} more passage${more === 1 ? "" : "s"}, each about ${money(price(model, estTokens(2400), 700))} — but each is written only when you open it and ask.` : "It won't mark deeper folds."}`;
    };
    dlg.innerHTML = `<h2 id="aiTitle">Write deeper with AI</h2>
      <p>${target.selection ? `The AI writes a new fold under “${esc(clip(label.replace(/\s+/g, " "), 60))}”` : `The AI marks meaningful words inside “${esc(clip(label.replace(/\s+/g, " "), 60))}” as folds it can write later`}. AI-written folds show a dashed line and “AI” until you edit them. None of it counts on your writing clock.</p>
      <div class="field"><label for="aiInstr"><span>What should it write? (optional)</span></label><textarea id="aiInstr" rows="2" placeholder="For example: the memory behind this line; or: explain this in simple words"></textarea></div>
      <div class="field"><label for="aiDepth"><span>How many levels deep (at most)</span><span id="aiDepthV"></span></label><input type="range" id="aiDepth" min="1" max="5" step="1" value="2"></div>
      <div class="field"><label for="aiChunks"><span>Folds per level (at most)</span><span id="aiChunksV"></span></label><input type="range" id="aiChunks" min="0" max="5" step="1" value="5"></div>
      <p id="aiEst"></p><p><small>Model: ${esc(MODELS[model].label)}. Sends the fold's text and your instruction to Anthropic.</small></p>
      <div class="row"><button class="btn primary" data-ai="go">Write it</button><button class="btn" data-ai="cancel">Cancel</button></div><p class="msg" id="aiMsg"></p>`;
    dlg.showModal(); paintEst();
    $("aiDepth").oninput = paintEst; $("aiChunks").oninput = paintEst;
  }

  const SYS_WRITE = "You help a writer by writing a passage that unfolds beneath their words, like a fold in a notebook. Write in plain, vivid language that fits their voice. " +
    "Then pick up to N short, meaningful phrases that appear EXACTLY (character for character) in your passage, worth unfolding further. " +
    "Reply ONLY with JSON: {\"text\": the passage, \"chunks\": [exact phrases from the passage]}. Keep the passage under 180 words.";
  async function writePassage({ words, context, pathTitles, instruction, chunks }) {
    const user = `N = ${chunks}\n${pathTitles ? "Where this sits: " + clip(pathTitles, 300) + "\n" : ""}Surrounding text:\n${clip(context, 4000)}\n\nThe words to unfold: “${clip(words, 600)}”\n${instruction ? "What the writer asked for: " + clip(instruction, 500) : "Write what lies beneath these words."}`;
    const j = parseJSON(await ask(SYS_WRITE, user, 900));
    if (!j || !j.text) throw new Error("the AI's reply couldn't be read");
    return { text: String(j.text).trim(), chunks: chunks > 0 && Array.isArray(j.chunks) ? j.chunks.map(String).filter(Boolean).slice(0, chunks) : [] };
  }
  function addPendingChunks(parentId, text, chunks, base) {   // mark phrases as folds the AI can write later
    let made = 0; const used = [];
    for (const ch of chunks) {
      const i = text.indexOf(ch); if (i < 0 || !ch.trim()) continue;
      if (used.some(([a, b]) => a === i && b === i + ch.length)) continue;
      used.push([i, i + ch.length]);
      T.createNode({ parentId, text: "", anchor: T.makeAnchor(text, i, i + ch.length),
                     ai: Object.assign({}, base, { pending: true, edited: false }) });
      made++;
    }
    return made;
  }
  const pathOf = id => T.path(id).map(T.titleOf).join(" › ");
  async function runDeeper() {
    const { target } = dlgState, instruction = $("aiInstr").value.trim(), depth = +$("aiDepth").value, chunks = +$("aiChunks").value;
    const model = cfg().model;
    $("aiMsg").textContent = "Writing…"; dlg.querySelectorAll("button").forEach(b => b.disabled = true);
    try {
      if (target.selection) {
        const n = T.node(target.selection.id), text = n.text || "", { s, e } = target.selection;
        const out = await writePassage({ words: text.slice(s, e), context: text, pathTitles: pathOf(n.id), instruction, chunks: depth > 1 ? chunks : 0 });
        const f = T.createNode({ parentId: n.id, anchor: T.makeAnchor(text, s, e), text: out.text,
                                 ai: { model, instruction, levelsLeft: depth, edited: false, at: Date.now() } });
        if (depth > 1) addPendingChunks(f.id, out.text, out.chunks, { model, instruction, levelsLeft: depth - 1, chunks });
        T.openFold(f.id, true); dlg.close(); T.rerender();
        T.toast("The AI wrote a fold. Open its dashed words to go deeper.");
      } else {
        const f = T.node(target.foldId);
        if (!(f.text || "").trim()) {           // empty fold: the AI writes it
          await generate(f.id, { instruction, levelsLeft: depth, chunks });
        } else {
          const sys = "Pick up to N short, meaningful phrases that appear EXACTLY (character for character) in the writer's text, worth unfolding further. Reply ONLY with JSON: {\"chunks\": [phrases]}.";
          const j = parseJSON(await ask(sys, `N = ${chunks}\n\nText:\n${clip(f.text, 8000)}`, 300));
          const made = addPendingChunks(f.id, f.text, (j && Array.isArray(j.chunks) ? j.chunks.map(String) : []).slice(0, chunks), { model, instruction, levelsLeft: depth, chunks });
          T.openFold(f.id, true); dlg.close(); T.rerender();
          T.toast(made ? `Marked ${made} phrase${made === 1 ? "" : "s"} with dashed lines. Open one and ask the AI to write it.` : "The AI didn't find phrases to mark.");
          return;
        }
        dlg.close(); T.rerender();
      }
    } catch (e) {
      $("aiMsg").textContent = "Couldn't write it: " + e.message + ".";
      dlg.querySelectorAll("button").forEach(b => b.disabled = false);
    }
  }
  /* write a fold that was marked by the AI (only when you ask) */
  async function generate(id, opts) {
    const f = T.node(id); if (!T.live(f)) return;
    const par = T.node(f.parentId), a = f.ai || {};
    const levelsLeft = (opts && opts.levelsLeft) || a.levelsLeft || 1, chunks = opts && opts.chunks != null ? opts.chunks : (a.chunks != null ? a.chunks : 3);
    const out = await writePassage({ words: f.anchor ? f.anchor.text : T.titleOf(f), context: par ? par.text || "" : "", pathTitles: pathOf(id),
                                     instruction: (opts && opts.instruction) || a.instruction || "", chunks: levelsLeft > 1 ? chunks : 0 });
    T.setText(id, out.text, { ai: Object.assign({}, a, { pending: false, edited: false, model: cfg().model, at: Date.now(), levelsLeft }) });   // not typing: no clock time
    if (levelsLeft > 1) addPendingChunks(id, out.text, out.chunks, { model: cfg().model, instruction: (opts && opts.instruction) || a.instruction || "", levelsLeft: levelsLeft - 1, chunks });
    T.openFold(id, true); T.rerender();
  }
  H.aiFoldBody = f => {
    if (!(f.ai && f.ai.pending && !(f.text || "").trim())) return null;
    const box = document.createElement("div"); box.className = "aipending";
    const est = price(cfg().model, estTokens(2400), 700);
    box.innerHTML = `<span>The AI can write this fold${f.ai.levelsLeft > 1 ? `, and mark up to ${f.ai.chunks} more inside it` : ""}. ${ready() ? money(est) + "." : "Add an AI key in Settings → AI first."}</span>
      <div class="row"><button class="fbtn" data-aigen="${f.id}"${ready() ? "" : " disabled"}>Write this with AI</button><button class="fbtn" data-aidrop="${f.id}">Remove this fold</button></div><small>Or just write in it yourself below.</small>`;
    return box;
  };
  document.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.aigen) {
      b.disabled = true; b.textContent = "Writing…";
      try { await generate(b.dataset.aigen); } catch (err) { b.disabled = false; b.textContent = "Write this with AI"; T.toast("Couldn't write it: " + err.message + "."); }
    } else if (b.dataset.aidrop) {
      const f = T.node(b.dataset.aidrop);
      if (f && !(f.text || "").trim()) { T.deleteNode(f.id); T.rerender(); }
    }
  });
  H.aiSelection = sel => deeper({ selection: sel });

  dlg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.ai === "cancel") { dlg.close(); dlgState = null; }
    else if (b.dataset.ai === "go") runDeeper();
    else if (b.dataset.ai === "keepq") {
      const kept = dlgState.list.map((x, i) => ({ keep: dlg.querySelector(`[data-keep="${i}"]`).checked, q: dlg.querySelector(`[data-q="${i}"]`).value.trim(), a: dlg.querySelector(`[data-a="${i}"]`).value.trim() }))
        .filter(x => x.keep && x.q);
      if (kept.length) T.memoryApi.addPrompts(dlgState.foldId, kept, "ai");
      dlg.close(); T.rerender();
      T.toast(kept.length ? `Kept ${kept.length} question${kept.length === 1 ? "" : "s"}. They'll come up when you test this fold.` : "No questions kept.");
    }
  });

  /* ---------------- settings → AI ---------------- */
  const ready = () => !!cfg().key;
  function needKey() { T.toast("Add your Anthropic key first: Settings → AI."); }
  function paintSettings(msg) {
    const a = $("aiArea"); if (!a) return;
    const c = cfg(), u = usage();
    a.innerHTML = `<label><span>AI (feedback, questions, AI folds)</span><span>${c.key ? "key saved" : "no key"}</span></label>
      <small>Uses your own Anthropic API key, kept only on this device. When you use AI (Claude in the book, feedback, questions, AI folds), the text it works on goes to Anthropic. AI never adds to your writing clock.</small>
      <small>With Claude Max, your monthly API credits can pay for this: on claude.ai go to Settings → Billing → API credits → Link organization, then make a key at platform.claude.com → API Keys and paste it here.</small>
      <div class="row"><input type="password" id="aiKey" placeholder="${c.key ? "Key saved. Paste a new one to replace it" : "Paste your Anthropic key (sk-ant-…)"}" autocomplete="off" style="flex:1 1 200px">
        <button class="btn" id="aiSave">Save</button><button class="btn" id="aiTest"${c.key ? "" : " disabled"}>Test key</button><button class="btn" id="aiRemove"${c.key ? "" : " disabled"}>Remove</button></div>
      <div class="row"><input type="text" id="aiWs" value="${esc(c.ws || "")}" placeholder="Workspace ID: only if the key test asks for one (wrkspc_…)" autocomplete="off" autocapitalize="none" spellcheck="false" style="flex:1 1 200px" aria-label="Workspace ID"></div>
      <div class="field"><label for="aiModel"><span>Model</span></label><select id="aiModel" style="width:100%;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:15px 'Hanken Grotesk',system-ui,sans-serif">
        ${Object.entries(MODELS).map(([k, m]) => `<option value="${k}"${k === c.model ? " selected" : ""}>${esc(m.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="aiCap"><span>Monthly limit (soft)</span><span>$${c.cap}</span></label><input type="range" id="aiCap" min="0" max="50" step="1" value="${c.cap}">
        <small>About $${u.usd.toFixed(u.usd < 1 ? 3 : 2)} used this month on this device (${u.calls} request${u.calls === 1 ? "" : "s"}). When it reaches the limit, AI pauses until next month or until you raise it. 0 = no limit.</small></div>
      <p class="msg" id="aiSetMsg">${esc(msg || "")}</p>`;
  }
  document.addEventListener("tol:settings", () => paintSettings());
  document.addEventListener("click", async e => {
    const id = e.target.id;
    if (id === "aiSave") {
      const v = ($("aiKey").value || "").replace(/\s+/g, "");
      if (!v) return paintSettings("Paste the key first.");
      if (!/^sk-ant-/.test(v)) return paintSettings("That doesn't look like an Anthropic key (it should start with sk-ant-).");
      setCfg({ key: v }); paintSettings("Saved on this device."); T.rerender();
    } else if (id === "aiRemove") { setCfg({ key: "" }); paintSettings("Removed from this device."); T.rerender(); }
    else if (id === "aiTest") {
      $("aiSetMsg").textContent = "Testing…";
      try { await ask("Reply with the single word OK.", "Test", 5, { force: true, timeout: 20000 }); paintSettings("The key works."); }
      catch (err) { paintSettings("The key didn't work: " + err.message + "."); }
    }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "aiModel") { setCfg({ model: e.target.value }); paintSettings("Model saved."); }
    if (e.target.id === "aiWs") {
      const v = (e.target.value || "").replace(/\s+/g, "");
      if (v && !/^wrkspc_[A-Za-z0-9_-]+$/.test(v)) return paintSettings("A Workspace ID starts with wrkspc_. Leave the box empty if the key test doesn't ask for one.");
      setCfg({ ws: v }); paintSettings(v ? "Workspace ID saved on this device. Tap Test key." : "Workspace ID cleared.");
    }
    if (e.target.id === "aiCap") { setCfg({ cap: +e.target.value }); paintSettings(); }
  });
  document.addEventListener("input", e => { if (e.target.id === "aiCap") { const s = e.target.parentElement.querySelector("label span:last-child"); if (s) s.textContent = "$" + e.target.value; } });

  /* for agent.js (Claude in the app): the key, model, spending cap and running estimate are shared */
  function record(model, i, o) { const nu = usage(); nu.usd += price(model, i, o); nu.calls++; st.set(USE_KEY, nu); }
  function capReached() { const c = cfg(), u = usage(); return c.cap > 0 && u.usd >= c.cap ? c.cap : 0; }
  T.ai = { ready, feedback, makeQuestions, deeper, generate, ask, cfg, record, capReached, price, money, parseJSON, headers: () => headers(cfg()), explain, unreachable: () => unreachable(cfg()), _models: MODELS, _usage: usage };
  T.rerender();
})();
