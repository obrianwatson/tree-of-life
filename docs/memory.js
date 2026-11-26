/* Memory: folds as pegs, a memory palace you walk and test yourself on.
   - A fold's visible words are the peg; what's folded under them is what you remember
     (or the other way round, per fold). You can also attach your own questions, and keep
     questions an AI suggests.
   - A test shows a prompt, you type your answer (it counts on the writing clock like any
     typing), submit, and see the correct answer beside yours word by word, plus AI feedback
     if you've added a key. You grade it: Missed / Almost / Got it / Easy.
   - Scheduling uses FSRS (Free Spaced Repetition Scheduler, v5 formulas, default weights):
     each prompt has a stability and difficulty learned from your answers; it comes back when
     your chance of remembering it falls to your "desired recall". The user only sets simple
     limits (desired recall, reviews per day, new per day, longest gap).
   - Stored in tol-memory (synced, encrypted, newest wins per record; review history is merged,
     never lost). Format: only add fields.
       settings {retention, dailyReviews, newPerDay, maxInterval, updatedAt}
       folds    {[foldId]: {hide, review, cue, practice, memorize, updatedAt}}
       prompts  {[promptId]: {id, foldId, q, a, dir, source, createdAt, updatedAt, deleted?}}
       cards    {["<prompt key>|<dir>"]: {id, prompt, dir, history: [{id, t, g, by}], updatedAt}}
                 prompt key = "peg:<foldId>" (the fold itself) or "q:<promptId>"; dir = "fwd" | "back".
       A card's FSRS state is recomputed from its history, so merging histories is always safe. */
(() => {
  const T = window.TOL; if (!T) return;
  const $ = id => document.getElementById(id), esc = T.esc, H = T.hooks;
  const DAY = 86400000, MIN = 60000;

  /* ---------------- data ---------------- */
  const SET_DEFAULT = { retention: 0.9, dailyReviews: 100, newPerDay: 20, maxInterval: 365 };
  function mem() {
    const m = T.getMemory() || {};
    m.v = m.v || 1; m.settings = m.settings || {}; m.folds = m.folds || {}; m.prompts = m.prompts || {}; m.cards = m.cards || {};
    return m;
  }
  const settings = () => Object.assign({}, SET_DEFAULT, mem().settings);
  function save(fn) { const m = JSON.parse(JSON.stringify(mem())); fn(m); T.setMemory(m); }
  const FOLD_DEFAULT = { hide: "contents", review: "ai", cue: "first", practice: false, memorize: false };
  const foldSet = id => Object.assign({}, FOLD_DEFAULT, mem().folds[id] || {});
  function setFold(id, fields) { save(m => { m.folds[id] = Object.assign({}, FOLD_DEFAULT, m.folds[id] || {}, fields, { updatedAt: Date.now() }); }); }

  /* merging another device's memory into ours: newest wins per record; review history is united */
  T.mergeMemory = function (M, R) {
    if (!R || typeof R !== "object") return false;
    let changed = false;
    M.settings = M.settings || {}; M.folds = M.folds || {}; M.prompts = M.prompts || {}; M.cards = M.cards || {};
    if (R.settings && (R.settings.updatedAt || 0) > (M.settings.updatedAt || 0)) { M.settings = R.settings; changed = true; }
    for (const part of ["folds", "prompts"]) {
      for (const [k, v] of Object.entries(R[part] || {})) {
        const mine = M[part][k];
        if (!mine || (v.updatedAt || 0) > (mine.updatedAt || 0)) { M[part][k] = v; changed = true; }
      }
    }
    for (const [k, v] of Object.entries(R.cards || {})) {
      const mine = M.cards[k];
      if (!mine) { M.cards[k] = v; changed = true; continue; }
      const ids = new Set((mine.history || []).map(h => h.id)), add = (v.history || []).filter(h => !ids.has(h.id));
      if (add.length) {
        M.cards[k] = Object.assign({}, mine, { history: (mine.history || []).concat(add).sort((a, b) => a.t - b.t),
                                               updatedAt: Math.max(mine.updatedAt || 0, v.updatedAt || 0) });
        changed = true;
      }
    }
    return changed;
  };

  /* ---------------- FSRS (v5) ---------------- */
  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
             1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, FACTOR = 19 / 81;
  const clampD = d => Math.min(10, Math.max(1, d));
  const retr = (t, S) => Math.pow(1 + FACTOR * t / S, DECAY);
  const D0 = g => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
  const nextD = (D, g) => { const D1 = D - W[6] * (g - 3) * (10 - D) / 9; return clampD(W[7] * D0(4) + (1 - W[7]) * D1); };
  const sRecall = (D, S, R, g) => S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
  const sForget = (D, S, R) => Math.min(W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)), S);
  const sShort = (S, g) => S * Math.exp(W[17] * (g - 3 + W[18]));
  function intervalDays(S, set) {
    const r = Math.min(0.97, Math.max(0.7, set.retention));
    return Math.min(set.maxInterval, Math.max(1, Math.round(S / FACTOR * (Math.pow(r, 1 / DECAY) - 1))));
  }
  function step(st, g, t, set) {         // one answer → the new state
    let { S, D } = st;
    if (!st.reps) { S = W[g - 1]; D = D0(g); }
    else {
      const days = (t - st.last) / DAY;
      if (days < 1) S = sShort(S, g);
      else { const R = retr(days, S); S = g === 1 ? sForget(D, S, R) : sRecall(D, S, R, g); }
      D = nextD(D, g);
    }
    S = Math.max(0.01, S);
    const due = g === 1 ? t + 10 * MIN : t + intervalDays(S, set) * DAY;
    return { S, D, last: t, due, reps: (st.reps || 0) + 1, lapses: (st.lapses || 0) + (g === 1 && st.reps ? 1 : 0), lastGrade: g };
  }
  function cardState(card, set) {
    let st = { reps: 0 };
    for (const h of (card && card.history) || []) st = step(st, h.g, h.t, set || settings());
    return st;
  }
  T.memoryFSRS = { step, cardState, retr, intervalDays };   // for tests

  /* ---------------- what can be tested ---------------- */
  function scopeNodes(rootId) {           // depth-first, folds in the order they appear in the text (the palace route)
    const out = [], seen = new Set();
    (function walk(id) {
      if (seen.has(id) || out.length > 2000) return; seen.add(id);
      const n = T.node(id); if (!T.live(n)) return; out.push(n);
      const folds = T.placedIn(id).map(m => m.f), on = new Set(folds.map(f => f.id));
      const rest = T.children(id).filter(c => !on.has(c.id));   // pages inside, and folds whose words are gone
      folds.forEach(f => walk(f.id)); rest.forEach(c => walk(c.id));
    })(rootId);
    return out;
  }
  const words = s => (s || "").replace(/\s+/g, " ").trim();
  function lineAround(text, a) {          // the sentence/line the peg sits in, for context
    if (!a) return "";
    const st = Math.max(0, text.lastIndexOf("\n", a.start - 1) + 1), en = text.indexOf("\n", a.end);
    return text.slice(st, en === -1 ? text.length : en);
  }
  /* A prompt is asked in a direction: "fwd" (peg → what's inside; question → answer) or "back"
     (what's inside → the peg). Each (prompt, direction) has its own schedule and history. */
  const cardKey = (promptKey, dir) => promptKey + "|" + (dir || "fwd");
  const promptOfCard = (k, c) => (c && c.prompt) || k.split("|")[0];
  function foldOfCard(k, c) {
    const pk = promptOfCard(k, c), m = mem();
    if (pk.startsWith("peg:")) return pk.slice(4);
    if (pk.startsWith("q:")) return (m.prompts[pk.slice(2)] || {}).foldId;
    return null;
  }
  function itemsFor(nodes) {
    const m = mem(), out = [];
    const ids = new Set(nodes.map(n => n.id));
    for (const n of nodes) {
      if (n.anchor && !n.portal && words(n.text) && !(n.ai && n.ai.pending)) {
        const fs = foldSet(n.id), par = T.node(n.parentId);
        const peg = words(n.anchor.text), ctx = par ? words(lineAround(par.text || "", T.locate(n, par.text || "") ? { start: T.locate(n, par.text)[0], end: T.locate(n, par.text)[1] } : null)) : "";
        const pk = "peg:" + n.id;
        if (fs.hide === "peg") out.push({ card: cardKey(pk, "back"), promptKey: pk, dir: "back", foldId: n.id, kind: "peg", prompt: n.text.trim(), ask: "Which words is this folded under?", expected: n.anchor.text.trim(), context: "" });
        else out.push({ card: cardKey(pk, "fwd"), promptKey: pk, dir: "fwd", foldId: n.id, kind: "peg", prompt: peg, ask: "What's folded under these words?", expected: n.text.trim(), context: ctx && ctx !== peg ? ctx : "" });
      }
    }
    for (const p of Object.values(m.prompts)) {
      if (p.deleted || !ids.has(p.foldId)) continue;
      const n = T.node(p.foldId);
      const dir = p.dir || "fwd";
      out.push({ card: cardKey("q:" + p.id, dir), promptKey: "q:" + p.id, dir, foldId: p.foldId, kind: p.source === "ai" ? "ai" : "mine", prompt: p.q, ask: "", expected: (p.a && p.a.trim()) || (n.text || "").trim(), context: "" });
    }
    const order = new Map(nodes.map((n, i) => [n.id, i]));
    return out.sort((a, b) => order.get(a.foldId) - order.get(b.foldId));
  }
  function memorizedNodes() {
    const m = mem(), out = [];
    for (const [id, fs] of Object.entries(m.folds)) if (fs.memorize && T.live(T.node(id))) out.push(T.node(id));
    for (const p of Object.values(m.prompts)) if (!p.deleted && T.live(T.node(p.foldId)) && !out.some(n => n.id === p.foldId)) out.push(T.node(p.foldId));
    for (const [k, c] of Object.entries(m.cards)) { const id = foldOfCard(k, c), n = id && T.node(id); if (n && T.live(n) && !out.includes(n)) out.push(n); }
    return out;
  }
  const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function dueItems() {
    const m = mem(), set = settings(), items = itemsFor(memorizedNodes()), now = Date.now(), eod = endOfToday();
    const due = [], fresh = [];
    let newToday = 0;
    for (const c of Object.values(m.cards)) { const h = c.history || []; if (h.length && h[0].t >= startOfToday()) newToday++; }
    for (const it of items) {
      const c = m.cards[it.card];
      if (c && (c.history || []).length) { const st = cardState(c, set); if (st.due <= eod) due.push(Object.assign(it, { dueAt: st.due })); }
      else fresh.push(it);
    }
    due.sort((a, b) => a.dueAt - b.dueAt);
    const reviews = due.slice(0, set.dailyReviews);
    const news = fresh.slice(0, Math.max(0, set.newPerDay - newToday));
    return { reviews, news, all: reviews.concat(news), now };
  }
  const dueCount = () => { try { return dueItems().all.length; } catch (e) { return 0; } };
  function isDue(foldId) {
    const m = mem(), set = settings(), eod = endOfToday();
    return Object.entries(m.cards).some(([k, c]) => {
      return foldOfCard(k, c) === foldId && (c.history || []).length && cardState(c, set).due <= eod;
    });
  }

  /* ---------------- word-by-word comparison ---------------- */
  const norm = w => w.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  function diffWords(expected, answer) {
    const A = (expected || "").split(/\s+/).filter(Boolean).slice(0, 1500), B = (answer || "").split(/\s+/).filter(Boolean).slice(0, 1500);
    const a = A.map(norm), b = B.map(norm), n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] && a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] && a[i] === b[j]) { ops.push({ t: "eq", x: A[i], y: B[j] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { ops.push({ t: "del", x: A[i] }); i++; }
      else { ops.push({ t: "ins", y: B[j] }); j++; }
    }
    while (i < n) ops.push({ t: "del", x: A[i++] }); while (j < m) ops.push({ t: "ins", y: B[j++] });
    // a missed word right next to an added one reads as "changed"
    const exp = [], yours = []; let matched = 0, missed = 0, added = 0, changed = 0;
    for (let k = 0; k < ops.length; k++) {
      const o = ops[k], nx = ops[k + 1];
      if (o.t === "eq") { exp.push(["ok", o.x]); yours.push(["ok", o.y]); matched++; }
      else if (o.t === "del" && nx && nx.t === "ins") { exp.push(["ch", o.x]); yours.push(["ch", nx.y]); changed++; k++; }
      else if (o.t === "ins" && nx && nx.t === "del") { exp.push(["ch", nx.x]); yours.push(["ch", o.y]); changed++; k++; }
      else if (o.t === "del") { exp.push(["miss", o.x]); missed++; }
      else { yours.push(["add", o.y]); added++; }
    }
    const total = A.filter(w => norm(w)).length || 1;
    return { exp, yours, matched, missed, added, changed, score: Math.round(100 * matched / total) };
  }
  T.memoryDiff = diffWords;   // for tests
  const diffHTML = list => list.map(([k, w]) => k === "ok" ? `<span class="w ok">${esc(w)}</span>` : `<mark class="w ${k}">${esc(w)}</mark>`).join(" ") || '<span class="w none">(nothing)</span>';

  /* ---------------- practice: hide what's inside, press and hold to peek ---------------- */
  function cue(text, style) {
    const shape = w => w.replace(/[\p{L}\p{N}]/gu, "_");
    if (style === "blank") return text.split("\n").map(l => l.trim() ? "_".repeat(Math.min(48, Math.max(8, l.length))) : "").join("\n");
    if (style === "shape") return text.split(/(\s+)/).map(shape).join("");
    if (style === "alt") { let k = 0; return text.split(/(\s+)/).map(p => /\S/.test(p) ? (k++ % 2 ? shape(p) : p) : p).join(""); }
    return text.split(/(\s+)/).map(p => p.replace(/^([^\p{L}\p{N}]*[\p{L}\p{N}])[\p{L}\p{N}'’-]*/u, "$1")).join("");   // first letters
  }
  T.memoryCue = cue;
  H.foldBody = (f, depth) => {
    const fs = foldSet(f.id), out = {};
    if (fs.practice && (f.text || "").trim()) {
      const box = document.createElement("div"); box.className = "practice";
      box.innerHTML = `<div class="cue" aria-live="polite"></div><div class="row"><button class="fbtn peek">Hold to peek</button>` +
        `<button class="fbtn" data-test-fold="${f.id}">Test me</button><button class="fbtn" data-stop-practice="${f.id}">Stop practicing</button></div>`;
      const c = box.querySelector(".cue"), real = f.text, hid = cue(real, fs.cue);
      c.textContent = hid;
      const pk = box.querySelector(".peek");
      const show = e => { e.preventDefault(); c.textContent = real; c.classList.add("peeking"); };
      const hide = () => { c.textContent = hid; c.classList.remove("peeking"); };
      pk.addEventListener("pointerdown", show); ["pointerup", "pointercancel", "pointerleave"].forEach(ev => pk.addEventListener(ev, hide));
      pk.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") show(e); }); pk.addEventListener("keyup", hide);
      pk.addEventListener("contextmenu", e => e.preventDefault());
      out.replace = box;
    }
    const ai = H.aiFoldBody ? H.aiFoldBody(f, depth) : null;   // ai.js: a fold the AI will write when you ask
    if (ai) out.prepend = ai;
    return out.replace || out.prepend ? out : null;
  };
  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.stopPractice) { setFold(b.dataset.stopPractice, { practice: false }); T.rerender(); }
    else if (b.dataset.testFold) startTest(b.dataset.testFold, "order");
  });

  /* ---------------- the list: what's due today ---------------- */
  H.listTop = () => {
    const n = dueCount();
    return `<div class="item memrow"><button class="open" data-listtop="memory"><b>Memory</b><small>${n ? n + " to review today" : "Nothing due today"}</small></button></div>`;
  };
  H.listTopClick = () => openHub();

  /* ---------------- the fold menu (More…) ---------------- */
  const dlg = document.createElement("dialog"); dlg.id = "memDlg"; dlg.setAttribute("aria-labelledby", "memTitle");
  document.body.appendChild(dlg);
  let menuFor = null;
  H.foldMenu = id => { menuFor = id; paintMenu(); dlg.showModal(); };
  function paintMenu(msg) {
    const f = T.node(menuFor); if (!T.live(f)) { dlg.close(); return; }
    const fs = foldSet(f.id), m = mem(), mine = Object.values(m.prompts).filter(p => p.foldId === f.id && !p.deleted);
    const ai = !!T.ai, sel = (name, val, opts) => `<select data-set="${name}">${opts.map(([v, l]) => `<option value="${v}"${v === val ? " selected" : ""}>${l}</option>`).join("")}</select>`;
    dlg.innerHTML = `<h2 id="memTitle">“${esc(words(f.anchor ? f.anchor.text : T.titleOf(f)).slice(0, 60))}”</h2>
      <p>Memory and AI for this fold.</p>
      <div class="row"><button class="btn primary" data-act="test">Test me on this</button>
        <label class="btn" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" data-act="practice"${fs.practice ? " checked" : ""}> Practice: hide what's inside</label></div>
      <div class="field"><label><span>Hints while practicing</span></label>${sel("cue", fs.cue, [["first", "First letters"], ["shape", "Word shapes"], ["alt", "Every other word"], ["blank", "Blank lines"]])}</div>
      <div class="field"><label><span>In tests, hide</span></label>${sel("hide", fs.hide, [["contents", "What's inside (you see the words it's folded under)"], ["peg", "The words it's folded under (you see what's inside)"]])}</div>
      <div class="field"><label><span>Reviewing my answers</span></label>${sel("review", fs.review, [["ai", "AI feedback, and it suggests the grade"], ["both", "AI feedback, but I choose the grade"], ["self", "Only me (no AI)"]])}
        ${ai ? "" : "<small>AI feedback needs an Anthropic key in Settings → AI. Without one, you review yourself.</small>"}</div>
      <div class="field"><label><span>My questions</span></label>
        <div class="qlist">${mine.map(p => `<div class="q"><div><b>${esc(p.q)}</b><small>${p.a ? "Answer: " + esc(p.a.slice(0, 120)) : "Answer: what's in this fold"}${p.source === "ai" ? " · from AI" : ""}</small></div>
          <button class="fbtn" data-edit-q="${p.id}">Edit</button><button class="fbtn" data-del-q="${p.id}">Delete</button></div>`).join("") || "<small>None yet.</small>"}</div>
        <div class="qform"><input type="text" id="qQ" placeholder="Your question"><input type="text" id="qA" placeholder="Answer (leave empty to use what's in this fold)">
          <div class="row"><button class="btn" data-act="addq">Add question</button></div></div></div>
      ${ai ? `<div class="row"><button class="btn" data-act="aiq">Make questions with AI</button><button class="btn" data-act="aideep">Write deeper with AI</button></div>` : ""}
      <p class="msg">${esc(msg || "")}</p>
      <div class="row"><button class="btn primary" data-act="close">Done</button></div>`;
  }
  let editing = null;
  dlg.addEventListener("change", e => {
    const t = e.target, id = menuFor;
    if (t.dataset.set) { setFold(id, { [t.dataset.set]: t.value }); if (t.dataset.set === "cue") T.rerender(); }
    if (t.dataset.act === "practice") { setFold(id, { practice: t.checked, memorize: true }); T.openFold(id, true); T.rerender(); }
  });
  dlg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const id = menuFor, act = b.dataset.act;
    if (act === "close") dlg.close();
    else if (act === "test") { dlg.close(); startTest(id, "order"); }
    else if (act === "addq") {
      const q = $("qQ").value.trim(), a = $("qA").value.trim(); if (!q) { paintMenu("Write the question first."); return; }
      const now = Date.now();
      save(m => {
        if (editing && m.prompts[editing]) m.prompts[editing] = Object.assign({}, m.prompts[editing], { q, a: a || null, updatedAt: now });
        else { const pid = T.uid(); m.prompts[pid] = { id: pid, foldId: id, q, a: a || null, dir: "fwd", source: "mine", createdAt: now, updatedAt: now }; }
        m.folds[id] = Object.assign({}, FOLD_DEFAULT, m.folds[id] || {}, { memorize: true, updatedAt: now });
      });
      paintMenu(editing ? "Question updated." : "Question added."); editing = null;
    }
    else if (b.dataset.editQ) { const p = mem().prompts[b.dataset.editQ]; editing = p.id; $("qQ").value = p.q; $("qA").value = p.a || ""; $("qQ").focus(); }
    else if (b.dataset.delQ) { save(m => { m.prompts[b.dataset.delQ] = { id: b.dataset.delQ, foldId: id, deleted: true, updatedAt: Date.now() }; }); paintMenu("Question deleted."); }
    else if (act === "aiq" && T.ai) { dlg.close(); T.ai.makeQuestions(id); }
    else if (act === "aideep" && T.ai) { dlg.close(); T.ai.deeper({ foldId: id }); }
  });
  T.memoryApi = {
    addPrompts(foldId, list, source) {
      const now = Date.now();
      save(m => {
        for (const x of list) { const pid = T.uid(); m.prompts[pid] = { id: pid, foldId, q: x.q, a: x.a || null, dir: "fwd", source: source || "mine", createdAt: now, updatedAt: now }; }
        m.folds[foldId] = Object.assign({}, FOLD_DEFAULT, m.folds[foldId] || {}, { memorize: true, updatedAt: now });
      });
    },
    foldSettings: foldSet, setFold, dueItems, dueCount, isDue, settings, cardKey
  };

  /* ---------------- the Memory hub (from the page list) ---------------- */
  const hub = document.createElement("dialog"); hub.id = "memHub"; document.body.appendChild(hub);
  function openHub() {
    const d = dueItems(), cur = T.node(T.current());
    hub.innerHTML = `<h2>Memory</h2>
      <p>${d.reviews.length} to review and ${d.news.length} new today.</p>
      <div class="row"><button class="btn primary" data-hub="due"${d.all.length ? "" : " disabled"}>Review what's due (${d.all.length})</button>
        ${cur ? `<button class="btn" data-hub="page">Test this page: “${esc(T.titleOf(cur).slice(0, 30))}”</button>` : ""}</div>
      <div class="field"><label><span>Order</span></label>
        <select id="hubOrder"><option value="order">Walk in order (room by room)</option><option value="shuffle">Shuffled</option></select></div>
      <p><small>Tip: on any fold, More… → Test me, Practice, or add your own questions.</small></p>
      <div class="row"><button class="btn" data-hub="close">Close</button></div>`;
    $("hubOrder").value = T.store.get(T.PREFIX + "mem-order", "order");
    hub.showModal();
  }
  hub.addEventListener("change", e => { if (e.target.id === "hubOrder") T.store.set(T.PREFIX + "mem-order", e.target.value); });
  hub.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const order = $("hubOrder") ? $("hubOrder").value : "order";
    if (b.dataset.hub === "close") hub.close();
    else if (b.dataset.hub === "due") { hub.close(); startSession(dueItems().all, "Due today", order); }
    else if (b.dataset.hub === "page") { hub.close(); startTest(T.current(), order); }
  });

  /* ---------------- the test screen ---------------- */
  const sec = document.createElement("section"); sec.id = "testView"; sec.dataset.view = "test"; sec.hidden = true; sec.setAttribute("aria-label", "Memory test");
  document.querySelector("main").appendChild(sec);
  let S = null;   // the session
  function startTest(rootId, order) {
    const nodes = scopeNodes(rootId), items = itemsFor(nodes);
    if (!items.length) { T.toast("Nothing to test here yet. Make a fold and write something inside it, or add a question (More… on a fold)."); return; }
    const now = Date.now();
    save(m => { for (const n of nodes) if (n.anchor && !n.portal) m.folds[n.id] = Object.assign({}, FOLD_DEFAULT, m.folds[n.id] || {}, { memorize: true, updatedAt: now }); });
    startSession(items, T.titleOf(T.node(rootId)), order || T.store.get(T.PREFIX + "mem-order", "order"));
  }
  function startSession(items, title, order) {
    items = items.slice();
    if (order === "shuffle") for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    S = { items, i: 0, title, results: [], phase: "ask" };
    T.showView("test"); paint();
  }
  T.memoryStart = (rootId, order) => startTest(rootId, order);
  function when(t) {
    const d = t - Date.now();
    if (d < 60 * MIN) return `in ${Math.max(1, Math.round(d / MIN))} min`;
    if (d < DAY) return `in ${Math.round(d / (60 * MIN))} h`;
    const days = Math.round(d / DAY); return days < 45 ? `in ${days} day${days === 1 ? "" : "s"}` : `in ${Math.round(days / 30)} months`;
  }
  const GRADES = [[1, "Missed"], [2, "Almost"], [3, "Got it"], [4, "Easy"]];
  function paint() {
    if (!S) return;
    const it = S.items[S.i];
    if (!it) return paintSummary();
    const head = `<div class="t-top"><span><b>${esc(S.title.slice(0, 40))}</b> · ${S.i + 1} of ${S.items.length}</span><button class="btn" data-t="quit">Back to writing</button></div>`;
    const prompt = `<div class="t-prompt">${it.ask ? `<small>${esc(it.ask)}</small>` : `<small>${it.kind === "ai" ? "Question (from AI)" : "Your question"}</small>`}
        <div class="t-q">${esc(it.prompt)}</div>${it.context ? `<div class="t-ctx">${esc(it.context)}</div>` : ""}</div>`;
    if (S.phase === "ask") {
      sec.innerHTML = head + `<div class="t-body">${prompt}
        <textarea id="tAns" rows="5" placeholder="Type what you remember"></textarea>
        <div class="row"><button class="btn primary" data-t="submit">Submit</button><button class="btn" data-t="skip">Skip</button><small style="align-self:center">Typing here counts on your writing clock.</small></div></div>`;
      const a = $("tAns"); a.value = S.draft || "";
      a.addEventListener("input", () => { S.draft = a.value; T.typed(); });
      a.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });
      a.focus({ preventScroll: true });
      return;
    }
    const r = S.review, fs = foldSet(it.foldId), set = settings(), c = mem().cards[it.card];
    const st = cardState(c, set), at = Date.now();
    const nexts = GRADES.map(([g]) => step(st, g, at, set).due);
    let aiBox = "";
    if (r.ai === "wait") aiBox = `<div class="t-ai"><b>AI feedback</b><p>Reading your answer…</p></div>`;
    else if (r.ai && r.ai.note) aiBox = `<div class="t-ai"><b>AI feedback</b><p>${esc(r.ai.note)}</p></div>`;
    else if (r.ai) aiBox = `<div class="t-ai"><b>AI feedback</b>
        ${r.ai.got && r.ai.got.length ? `<p><b>You got:</b> ${r.ai.got.map(esc).join("; ")}</p>` : ""}
        ${r.ai.missed && r.ai.missed.length ? `<p><b>You missed:</b> ${r.ai.missed.map(esc).join("; ")}</p>` : ""}
        ${r.ai.meaning ? `<p><b>Meaning:</b> ${esc({ kept: "kept", partly: "partly kept", lost: "lost" }[r.ai.meaning] || r.ai.meaning)}</p>` : ""}
        ${r.ai.tip ? `<p><b>Tip:</b> ${esc(r.ai.tip)}</p>` : ""}</div>`;
    const suggest = r.ai && r.ai.grade && fs.review === "ai" ? r.ai.grade : null;
    sec.innerHTML = head + `<div class="t-body">${prompt}
      <div class="t-cols"><div><small>Correct</small><div class="t-text">${diffHTML(r.d.exp)}</div></div>
        <div><small>Yours</small><div class="t-text">${diffHTML(r.d.yours)}</div></div></div>
      <p class="t-legend"><span class="w ok">matched</span> <mark class="w miss">missed</mark> <mark class="w add">added</mark> <mark class="w ch">changed</mark> · ${r.d.score}% of the words</p>
      ${aiBox}
      <div class="t-grades">${GRADES.map(([g, l], k) => `<button class="btn grade${suggest === g ? " sug" : ""}" data-grade="${g}"><b>${l}</b><small>${suggest === g ? "AI suggests · " : ""}next ${when(nexts[k])}</small></button>`).join("")}</div>
      </div>`;
  }
  function paintSummary() {
    const res = S.results, good = res.filter(x => x.g >= 3).length, set = settings();
    const weak = res.filter(x => x.g <= 2);
    const m = mem(), next = Object.values(m.cards).map(c => cardState(c, set).due).filter(d => d > Date.now()).sort((a, b) => a - b)[0];
    sec.innerHTML = `<div class="t-top"><span><b>${esc(S.title.slice(0, 40))}</b> · done</span><button class="btn" data-t="quit">Back to writing</button></div>
      <div class="t-body"><h2 class="t-score">${res.length ? Math.round(100 * good / res.length) : 0}%</h2>
      <p>${good} of ${res.length} remembered${res.length - good ? `, ${res.length - good} to work on` : ""}.</p>
      ${weak.length ? `<div class="t-weak"><b>Pegs that need work</b>${weak.map(x => `<div>${x.g === 1 ? "Missed" : "Almost"}: “${esc(x.prompt.slice(0, 80))}”</div>`).join("")}</div>` : ""}
      <p>${next ? "Next review " + when(next) + "." : ""}</p>
      <div class="row">${weak.length ? `<button class="btn primary" data-t="again">Practice the weak ones now</button>` : ""}<button class="btn" data-t="quit">Back to writing</button></div></div>`;
  }
  async function submit() {
    const it = S.items[S.i], ans = ($("tAns") || {}).value || "";
    T.endTyping();
    const d = diffWords(it.expected, ans), fs = foldSet(it.foldId);
    S.review = { d, ans, ai: null }; S.phase = "review";
    const wantAI = fs.review !== "self" && T.ai && T.ai.ready();
    if (wantAI) S.review.ai = "wait";
    paint();
    if (wantAI) {
      const mine = S.review, idx = S.i;
      const fb = await T.ai.feedback({ prompt: it.prompt, ask: it.ask, expected: it.expected, answer: ans, context: it.context }).catch(e => ({ note: "AI feedback isn't available right now (" + (e.message || "error") + "). Grade it yourself." }));
      if (S && S.review === mine && S.i === idx) { mine.ai = fb || { note: "No AI feedback this time. Grade it yourself." }; paint(); }
    }
  }
  function grade(g) {
    const it = S.items[S.i], now = Date.now();
    save(m => {
      const c = m.cards[it.card] || { id: it.card, prompt: it.promptKey, dir: it.dir, history: [] };
      c.history = (c.history || []).concat([{ id: T.uid(), t: now, g, by: T.deviceLabel || T.DEVICE }]);
      c.updatedAt = now; m.cards[it.card] = c;
    });
    S.results.push({ g, prompt: it.prompt, item: it });
    S.i++; S.phase = "ask"; S.draft = ""; S.review = null; paint();
  }
  sec.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !S) return;
    if (b.dataset.t === "quit") { S = null; T.showView("write"); T.refreshList(); }
    else if (b.dataset.t === "submit") submit();
    else if (b.dataset.t === "skip") { S.i++; S.draft = ""; paint(); }
    else if (b.dataset.t === "again") { const weak = S.results.filter(x => x.g <= 2).map(x => x.item); startSession(weak, S.title, "order"); }
    else if (b.dataset.grade) grade(+b.dataset.grade);
  });

  /* ---------------- settings → Memory ---------------- */
  function paintSettings() {
    const a = $("memArea"); if (!a) return;
    const s = settings();
    a.innerHTML = `<label><span>Memory</span></label>
      <small>Reviews are timed for you: each prompt comes back right before you'd likely forget it. These keep it simple.</small>
      <div class="field"><label for="msRet"><span>How sure you want to be when it comes back</span><span>${Math.round(s.retention * 100)}%</span></label>
        <input type="range" id="msRet" min="80" max="95" step="1" value="${Math.round(s.retention * 100)}"><small>Higher means more frequent reviews.</small></div>
      <div class="field"><label for="msRev"><span>Most reviews per day</span><span>${s.dailyReviews}</span></label><input type="range" id="msRev" min="10" max="500" step="10" value="${s.dailyReviews}"></div>
      <div class="field"><label for="msNew"><span>New prompts per day</span><span>${s.newPerDay}</span></label><input type="range" id="msNew" min="0" max="100" step="1" value="${s.newPerDay}"></div>
      <div class="field"><label for="msMax"><span>Longest gap between reviews</span><span>${s.maxInterval} days</span></label><input type="range" id="msMax" min="7" max="3650" step="1" value="${s.maxInterval}"></div>`;
  }
  document.addEventListener("tol:settings", paintSettings);
  const MS = { msRet: ["retention", v => v / 100, v => v + "%"], msRev: ["dailyReviews", v => v, v => v], msNew: ["newPerDay", v => v, v => v], msMax: ["maxInterval", v => v, v => v + " days"] };
  document.addEventListener("input", e => {       // while sliding: just show the number
    const map = MS[e.target.id]; if (!map) return;
    const lab = e.target.parentElement.querySelector("label span:last-child"); if (lab) lab.textContent = map[2](+e.target.value);
  });
  document.addEventListener("change", e => {      // let go: save it
    const map = MS[e.target.id]; if (!map) return;
    save(m => { m.settings = Object.assign({}, SET_DEFAULT, m.settings, { [map[0]]: map[1](+e.target.value), updatedAt: Date.now() }); });
  });
  H.foldBadge = f => isDue(f.id) ? '<span class="duebadge" title="Due for review today">due</span>' : "";
  document.addEventListener("tol:memory", () => { T.refreshList(); });

  T.rerender();
})();
