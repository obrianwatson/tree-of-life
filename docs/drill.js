/* Drills: practice that loops until it's natural, then grows.
   A drill is a saved recipe over a set of folds, arranged in groups (for Psalm 23: one group per
   verse, each holding that verse's levels, simplest first). A round = recall every active item once
   (show → hide → type it → review). When a round is right enough times in a row (default 3 perfect
   runs), the drill EXTENDS: the next level joins; when a group is done, the next group starts; when
   all groups are done, the finals are CHAINED (verse 1+2, then 1+2+3…). Hints fade as you get it.
   It adapts and says why in one line: a word missed twice gets a hint; fast perfect runs extend
   sooner; three misses in a row step back. A finished drill can join spaced review.
   Stored in memory.drills (synced, encrypted). Typing answers counts on the writing clock. */
(() => {
  const T = window.TOL; if (!T || !T.memoryApi) return;
  const $ = id => document.getElementById(id), esc = T.esc, H = T.hooks, M = T.memoryApi;
  const DAY = 86400000;
  const words = s => (s || "").replace(/\s+/g, " ").trim();
  const DEFAULT = { rule: { type: "streak", n: 3, pct: 90, wpm: 20 }, dir: "fwd", order: "front", fade: true, cue: "first", show: true, peek: true, srs: true };
  const ORDERS = [["front", "Front to back"], ["back", "Back to front"], ["shuffle", "Shuffled"], ["weakest", "Weakest first"], ["interleave", "Interleaved (spread out)"], ["chain", "Chain-building (cumulative)"], ["ai", "Arranged by Claude"]];
  const DIRS = [["fwd", "Forward: see the words it's under, recall what's inside"], ["back", "Backward: see what's inside, recall the words it's under"], ["both", "Both, alternating"]];
  const drills = () => Object.values(M.getPart("drills")).filter(d => d && !d.deleted).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const getD = id => { const d = M.getPart("drills")[id]; return d && !d.deleted ? d : null; };
  function put(d) { M.putRecord("drills", d.id, d); return M.getPart("drills")[d.id]; }

  /* ---------------- building a drill from folds ---------------- */
  function groupsFrom(rootId) {
    const placedFolds = id => T.placedIn(id).map(m => m.f).filter(f => !f.portal && !f.ref);
    const tops = placedFolds(rootId);
    const groups = tops.map(f => { const inner = placedFolds(f.id).filter(x => words(x.text)); return inner.length ? inner.map(x => x.id) : (words(f.text) ? [f.id] : []); }).filter(g => g.length);
    if (!groups.length) { const all = M.scope(rootId).filter(n => n.anchor && words(n.text) && !n.portal).map(n => n.id); return all.length ? [all] : []; }
    return groups;
  }
  function make(rootId, opts) {
    const root = T.node(rootId); if (!T.live(root)) throw new Error("no such page or fold");
    const groups = (opts && opts.groups && opts.groups.length ? opts.groups : groupsFrom(rootId)).map(g => g.filter(id => T.live(T.node(id)))).filter(g => g.length);
    if (!groups.length) throw new Error("there are no folds with writing inside to drill here yet");
    const now = Date.now(), o = opts || {};
    const d = Object.assign({ id: "dr" + T.uid(), name: o.name || ("Drill: " + T.titleOf(root).slice(0, 50)), rootId, groups, createdAt: now }, JSON.parse(JSON.stringify(DEFAULT)));
    if (o.rule) d.rule = Object.assign(d.rule, o.rule);
    for (const k of ["dir", "order", "fade", "cue", "show", "peek", "srs"]) if (o[k] !== undefined) d[k] = o[k];
    d.progress = fresh(d); d.log = [];
    return put(d);
  }
  const fresh = d => ({ g: 0, k: 1, phase: "levels", c: 1, streak: 0, fails: 0, fast: 0, need: d.rule.n || 3, misses: {}, hints: {}, rounds: 0, done: false });

  /* ---------------- what one item asks ---------------- */
  function label(id, d) {
    const p = T.path(id).map(T.titleOf), r = T.path(d.rootId).length;
    const n = T.node(id);
    const parts = T.path(id).slice(r).map(x => x.anchor ? words(x.anchor.text) : T.titleOf(x));
    return parts.join(" · ") || (n && n.anchor ? words(n.anchor.text) : p[p.length - 1]);
  }
  function itemFor(id, d, dir) {
    const n = T.node(id); if (!T.live(n)) return null;
    return dir === "back"
      ? { id, dir, prompt: (n.text || "").trim(), ask: "Which words is this folded under?", expected: n.anchor ? n.anchor.text.trim() : T.titleOf(n), where: label(id, d) }
      : { id, dir, prompt: label(id, d), ask: "What's folded under these words?", expected: (n.text || "").trim(), where: label(id, d) };
  }
  function active(d) {
    const P = d.progress;
    if (P.phase === "levels") return d.groups[P.g].slice(0, P.k);
    return d.groups.slice(0, P.c).map(g => g[g.length - 1]);           // chain: each group's final item
  }
  function arrange(d, ids, roundNo) {
    const out = ids.slice(), P = d.progress;
    const o = d.order;
    if (o === "back") out.reverse();
    else if (o === "shuffle") for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    else if (o === "weakest") out.sort((a, b) => missOf(P, b) - missOf(P, a));
    else if (o === "interleave") { const a = [], L = out.slice(); while (L.length) { a.push(L.shift()); if (L.length) a.push(L.pop()); } return a; }
    else if (o === "ai" && Array.isArray(P.aiOrder)) { const rank = new Map(P.aiOrder.map((id, i) => [id, i])); out.sort((a, b) => (rank.has(a) ? rank.get(a) : 999) - (rank.has(b) ? rank.get(b) : 999)); }
    return out;   // front and chain-building keep the natural order (chain-building = the cumulative chain itself)
  }
  const missOf = (P, id) => Object.entries(P.misses[id] || {}).reduce((s, [, n]) => s + n, 0);

  /* hints fade as the streak grows; words you keep missing keep their first letter */
  async function cueFor(d, it) {
    const P = d.progress, text = it.expected;
    const level = d.fade ? Math.max(0, 2 - P.streak) : 0;   // 2 = full hint, 1 = half, 0 = none
    let base;
    if (level === 0) base = null;
    else if (d.cue && d.cue.startsWith("addon:") && T.addons) { const [, aid, name] = d.cue.split(":"); base = await T.addons.cue(aid, name, text); }
    else base = M.cue(text, d.cue || "first");
    if (base && level === 1) { const a = base.split(/(\s+)/), b = text.split(/(\s+)/); base = a.map((p, i) => /\S/.test(p) && i % 4 === 0 ? p : (b[i] || "").replace(/[\p{L}\p{N}]/gu, "_")).join(""); }
    const hints = Object.keys((P.hints || {})[it.id] || {});
    if (hints.length) {
      const set = new Set(hints);
      const tok = (base || text.replace(/[\p{L}\p{N}]/gu, "_")).split(/(\s+)/), real = text.split(/(\s+)/);
      base = tok.map((p, i) => { const w = (real[i] || "").toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""); return set.has(w) && /\S/.test(p) ? real[i][0] + p.slice(1) : p; }).join("");
    }
    return base;
  }

  /* ---------------- the drill screen ---------------- */
  const sec = document.createElement("section"); sec.id = "drillView"; sec.dataset.view = "drill"; sec.hidden = true; sec.setAttribute("aria-label", "Drill");
  document.querySelector("main").appendChild(sec);
  const css = document.createElement("style");
  css.textContent = `#drillView{overflow-y:auto;padding:16px max(16px,calc((100% - 760px)/2)) 160px}
#drillView .d-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
#drillView .d-top b{flex:1}
#drillView .d-prog{font-size:14px;color:var(--muted);margin:0 0 8px}
#drillView .d-bar{height:6px;border-radius:3px;background:var(--side);overflow:hidden;margin:0 0 12px}
#drillView .d-bar span{display:block;height:100%;background:var(--green)}
#drillView .d-log{font-size:13px;color:var(--muted);border-left:3px solid var(--green);padding-left:8px;margin:8px 0}
#drillView .d-card{border:1px solid var(--line);border-radius:14px;padding:14px;margin:8px 0}
#drillView .d-where{font-size:13px;color:var(--muted)}
#drillView .d-q{font:20px/1.5 Literata,Georgia,serif;white-space:pre-wrap;margin:6px 0}
#drillView .d-cue{font:18px/1.6 ui-monospace,Menlo,monospace;color:var(--muted);white-space:pre-wrap;margin:6px 0}
#drillView textarea{width:100%;min-height:110px;font:18px/1.5 Literata,Georgia,serif;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--paper);color:var(--ink)}
#drillView .w.ok{color:var(--green)} #drillView mark.w{border-radius:4px;padding:0 2px}
#drillView mark.miss{background:#f6d6d0} #drillView mark.add{background:#fdeab8} #drillView mark.ch{background:#e5dcf7}
#drillView .row{margin-top:8px}
dialog#drillDlg .steps li{margin:4px 0}
dialog#drillDlg select,dialog#drillDlg input[type=text]{width:100%;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:15px "Hanken Grotesk",system-ui,sans-serif}`;
  document.head.appendChild(css);

  let R = null;   // the running round: { d, items, i, phase, startT, firstKey, results: [], dirFlip }
  function run(id) {
    const d = getD(id); if (!d) return;
    T.showView("drill");
    if (d.progress.done) return startReview(d);      // mastered: one full recall of the whole thing (the spaced-review item)
    startRound(getD(id));
  }
  async function startRound(d) {
    const P = d.progress;
    if (d.order === "ai" && !P.aiOrder) await aiArrange(d);
    d = getD(d.id);
    const dir = d.dir === "both" ? (P.rounds % 2 ? "back" : "fwd") : d.dir;
    const ids = arrange(d, active(d), P.rounds);
    R = { did: d.id, items: ids.map(id => itemFor(id, d, dir)).filter(Boolean), i: 0, phase: "ask", results: [] };
    if (R.items.length) R.phase = needShow(d, R.items[0].id) ? "show" : "ask";
    if (!R.items.length) { T.toast("This drill's folds are gone or empty."); T.showView("write"); return; }
    paint();
  }
  /* show it first when it's new to you, or after you missed it */
  const needShow = (d, id) => !!d.show && !((d.progress.ok || {})[id]);
  function startReview(d) {
    const ids = d.groups.map(g => g[g.length - 1]);
    R = { did: d.id, items: ids.map(id => itemFor(id, d, "fwd")).filter(Boolean), i: 0, phase: "ask", results: [], reviewMode: true };
    if (!R.items.length) { T.toast("This drill's folds are gone or empty."); T.showView("write"); return; }
    paint();
  }
  function afterReview() {
    const d = getD(R.did), res = R.results, perfect = res.every(r => r.perfect), avg = res.reduce((s, r) => s + r.score, 0) / res.length;
    const g = perfect ? (res.every(r => r.wpm >= 30) ? 4 : 3) : avg >= 70 ? 2 : 1;
    if (d.srs) M.record("drill:" + d.id + "|fwd", "drill:" + d.id, "fwd", g);
    d.log = (d.log || []).concat([perfect ? "Full recall from memory — it'll come back later." : "Some slipped, so it comes back sooner."]).slice(-30); put(d); T.refreshList();
    return { passed: perfect, extended: false, review: true };
  }
  function progressText(d) {
    const P = d.progress;
    if (P.done) return "Mastered.";
    const grp = d.groups.length > 1 ? `Group ${P.g + 1} of ${d.groups.length}` : "";
    if (P.phase === "levels") return `${grp}${grp ? " · " : ""}${P.k} of ${d.groups[P.g].length} item${d.groups[P.g].length === 1 ? "" : "s"} · ${P.streak}/${P.need} right in a row`;
    return `Chaining ${P.c} of ${d.groups.length} · ${P.streak}/${P.need} right in a row`;
  }
  function pct(d) {
    const P = d.progress, total = d.groups.reduce((s, g) => s + g.length, 0) + Math.max(0, d.groups.length - 1);
    let done = 0; for (let i = 0; i < P.g; i++) done += d.groups[i].length;
    done += P.phase === "levels" ? P.k - 1 : d.groups[d.groups.length - 1].length + (P.c - 1);
    return Math.min(100, Math.round(100 * (P.done ? total : done) / total));
  }
  async function paint() {
    const d = getD(R.did), it = R.items[R.i], P = d.progress;
    const top = `<div class="d-top"><b>${esc(d.name)}</b><button class="btn" data-d="edit">Edit drill</button><button class="btn" data-d="quit">Back to writing</button></div>
      <p class="d-prog">${esc(progressText(d))}</p><div class="d-bar"><span style="width:${pct(d)}%"></span></div>
      ${(d.log || []).slice(-2).map(l => `<div class="d-log">${esc(l)}</div>`).join("")}`;
    if (!it) return paintRoundEnd(d, top);
    const head = `<div class="d-where">${esc(it.where)} · ${R.i + 1} of ${R.items.length}${it.dir === "back" ? " · backward" : ""}</div>`;
    if (R.phase === "show") {
      sec.innerHTML = top + `<div class="d-card">${head}<small>Read it, then hide it and recall.</small><div class="d-q">${esc(it.expected)}</div>
        <div class="row"><button class="btn primary" data-d="hide">Hide it — I'm ready</button></div></div>`;
      return;
    }
    if (R.phase === "ask") {
      const cue = await cueFor(d, it);
      if (!R || R.items[R.i] !== it || R.phase !== "ask") return;      // you moved on (or left the drill) while the hint was being made
      sec.innerHTML = top + `<div class="d-card">${head}<small>${esc(it.ask)}</small><div class="d-q">${esc(it.prompt)}</div>
        ${cue ? `<div class="d-cue" aria-label="Hint">${esc(cue)}</div>` : ""}
        <textarea id="dAns" placeholder="Type it from memory"></textarea>
        <div class="row">${d.peek ? `<button class="btn" data-d="peek">Hold to peek</button>` : ""}<button class="btn primary" data-d="submit">Check</button><small style="align-self:center">Typing here counts on your writing clock.</small></div></div>`;
      const a = $("dAns"); a.value = R.draft || "";
      a.addEventListener("input", () => { if (!R.firstKey) R.firstKey = Date.now(); R.draft = a.value; T.typed(); });
      a.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); check(); } });
      const pk = sec.querySelector("[data-d=peek]");
      if (pk) {
        const q = sec.querySelector(".d-cue") || sec.querySelector(".d-q");
        const old = q.textContent, show = e => { e.preventDefault(); q.textContent = it.expected; R.peeked = true; }, hide = () => { q.textContent = old; };
        pk.addEventListener("pointerdown", show); ["pointerup", "pointerleave", "pointercancel"].forEach(ev => pk.addEventListener(ev, hide));
      }
      a.focus({ preventScroll: true });
      return;
    }
    const r = R.review;
    const dh = list => list.map(([k, w]) => k === "ok" ? `<span class="w ok">${esc(w)}</span>` : `<mark class="w ${k}">${esc(w)}</mark>`).join(" ") || "(nothing)";
    sec.innerHTML = top + `<div class="d-card">${head}<div class="d-q">${esc(it.prompt.slice(0, 300))}</div>
      <small>Correct</small><div>${dh(r.d.exp)}</div><small>Yours</small><div>${dh(r.d.yours)}</div>
      <p><b>${r.perfect ? "Perfect." : r.d.score + "% of the words."}</b>${r.peeked ? " (You peeked, so it doesn't count as perfect.)" : ""}${r.wpm ? ` ${r.wpm} words a minute.` : ""}</p>
      <div class="row"><button class="btn primary" data-d="next">${R.i + 1 < R.items.length ? "Next" : "Finish this round"}</button></div></div>`;
  }
  function check() {
    const it = R.items[R.i], ans = ($("dAns") || {}).value || "";
    T.endTyping();
    const d = M.diff(it.expected, ans);
    const perfect = !R.peeked && d.missed === 0 && d.added === 0 && d.changed === 0 && d.matched > 0;
    const mins = R.firstKey ? (Date.now() - R.firstKey) / 60000 : 0, n = ans.split(/\s+/).filter(Boolean).length;
    const wpm = mins > 0.02 ? Math.round(n / mins) : 0;
    R.review = { d, perfect, peeked: !!R.peeked, wpm };
    R.results.push({ id: it.id, perfect, score: d.score, wpm, missed: d.exp.filter(([k]) => k !== "ok").map(([, w]) => w) });
    R.phase = "review"; paint();
  }
  function roundPassed(d, res) {
    const rule = d.rule || DEFAULT.rule;
    if (rule.type === "accuracy") return res.every(r => r.score >= (rule.pct || 90));
    if (rule.type === "speed") return res.every(r => r.perfect && r.wpm >= (rule.wpm || 20));
    return res.every(r => r.perfect);
  }
  /* the heart: after each round, keep looping, extend, or step back — and say why */
  function afterRound() {
    const d = getD(R.did), P = Object.assign({}, d.progress), log = (d.log || []).slice(), res = R.results;
    P.misses = Object.assign({}, P.misses); P.hints = Object.assign({}, P.hints); P.ok = Object.assign({}, P.ok);
    for (const r of res) { if (r.perfect) P.ok[r.id] = true; else delete P.ok[r.id]; }
    P.rounds = (P.rounds || 0) + 1;
    const hinted = [];
    for (const r of res) {
      const m = Object.assign({}, P.misses[r.id] || {});
      for (const w of r.missed) {
        const k = w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""); if (!k) continue;
        m[k] = (m[k] || 0) + 1;
        if (m[k] === 2 && !(P.hints[r.id] || {})[k]) { P.hints[r.id] = Object.assign({}, P.hints[r.id] || {}, { [k]: true }); hinted.push(w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")); }
      }
      P.misses[r.id] = m;
    }
    if (hinted.length) { const u = [...new Set(hinted)], q = u.slice(0, 4).map(w => `“${w}”`).join(", ") + (u.length > 4 ? ` and ${u.length - 4} more` : "");
      log.push(`Added a first-letter hint for ${q} because ${u.length === 1 ? "it" : "they"} slipped twice.`); }
    const passed = roundPassed(d, res), fast = passed && res.every(r => r.wpm >= 30);
    let extended = false;
    if (passed) {
      P.streak++; P.fails = 0; P.fast = fast ? (P.fast || 0) + 1 : 0;
      if (P.fast >= 2 && P.need > 1 && P.streak < P.need) { P.need = P.need - 1; log.push(`Fast and perfect twice, so this step needs ${P.need} right in a row instead of ${d.rule.n || 3}.`); P.fast = 0; }
      if (P.streak >= P.need) {
        extended = true; P.streak = 0; P.need = d.rule.n || 3; P.fast = 0;
        if (P.phase === "levels") {
          if (P.k < d.groups[P.g].length) { P.k++; log.push(`Natural now — adding the next one (${P.k} of ${d.groups[P.g].length}).`); }
          else if (P.g < d.groups.length - 1) { P.g++; P.k = 1; log.push(`Group ${P.g} is mastered. On to group ${P.g + 1}.`); }
          else if (d.groups.length > 1) { P.phase = "chain"; P.c = 2; log.push("Every group is mastered. Now chaining them together: 1 and 2."); }
          else P.done = true;
        } else if (P.c < d.groups.length) { P.c++; log.push(`Chain holds — adding group ${P.c}.`); }
        else P.done = true;
        if (P.done) log.push("Mastered: the whole drill, from memory.");
      }
    } else {
      P.streak = 0; P.fast = 0; P.fails = (P.fails || 0) + 1;
      if (P.fails >= 3) {
        P.fails = 0;
        if (P.phase === "levels" && P.k > 1) { P.k--; log.push("Three misses in a row — stepping back to fewer items for a moment."); }
        else if (P.phase === "chain" && P.c > 2) { P.c--; log.push("Three misses in a row — shortening the chain for a moment."); }
        else if (d.fade) log.push("Three misses in a row — hints are back on full until you get it.");
      }
    }
    d.progress = P; d.log = log.slice(-30);
    const saved = put(d);
    if (P.done && d.srs) {                     // the final full recall joins spaced review
      const g = res.every(r => r.wpm >= 30) ? 4 : 3;
      M.record("drill:" + d.id + "|fwd", "drill:" + d.id, "fwd", g); T.refreshList();
    }
    return { saved, passed, extended };
  }
  function paintRoundEnd(d, top) {
    const out = R.outcome, P = d.progress;
    if (out.review) { sec.innerHTML = top + `<div class="d-card"><h2>${out.passed ? "Still there!" : "Some slipped."}</h2><p>${out.passed ? "The whole thing, from memory." : "It comes back sooner, and you can drill it again from the start."}</p>
      <div class="row"><button class="btn primary" data-d="quit">Back to writing</button><button class="btn" data-d="restart">Drill it again from the start</button></div></div>`; return; }
    sec.innerHTML = top + `<div class="d-card"><h2>${P.done ? "Mastered!" : out.passed ? "Right!" : "Again."}</h2>
      <p>${P.done ? (d.srs ? "It joins your spaced review, so it comes back right before you'd forget it." : "") : out.extended ? "It grows now." : out.passed ? `${P.streak} of ${P.need} right in a row.` : "Loop it until it's natural."}</p>
      <div class="row">${P.done ? `<button class="btn primary" data-d="quit">Back to writing</button><button class="btn" data-d="restart">Drill it again from the start</button>` : `<button class="btn primary" data-d="again">${out.extended ? "Next step" : "Loop again"}</button><button class="btn" data-d="quit">Stop for now</button>`}</div></div>`;
  }
  sec.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !R) return;
    const a = b.dataset.d;
    if (a === "quit") { R = null; T.showView("write"); T.refreshList(); }
    else if (a === "hide") { R.phase = "ask"; R.peeked = false; R.firstKey = 0; R.draft = ""; paint(); }
    else if (a === "submit") check();
    else if (a === "next") { const last = R.results[R.results.length - 1]; R.i++; R.peeked = false; R.firstKey = 0; R.draft = "";
      if (R.i >= R.items.length) R.outcome = R.reviewMode ? afterReview() : afterRound(); else R.phase = needShow(getD(R.did), R.items[R.i].id) ? "show" : "ask"; paint(); }
    else if (a === "again") startRound(getD(R.did));
    else if (a === "restart") { const d = getD(R.did); d.progress = fresh(d); d.log = (d.log || []).concat(["Starting again from the beginning."]).slice(-30); put(d); startRound(getD(d.id)); }
    else if (a === "edit") openEditor(R.did);
  });

  /* Claude arranges the order (one-line reason); without AI it falls back to front to back */
  async function aiArrange(d) {
    const ids = d.groups.flat(), P = Object.assign({}, d.progress);
    if (!(T.ai && T.ai.ready()) || navigator.onLine === false) { d.log = (d.log || []).concat(["Claude couldn't arrange the order right now (offline or no key), so it's front to back."]).slice(-30); P.aiOrder = ids; d.progress = P; put(d); return; }
    try {
      const list = ids.map((id, i) => `${i}: ${label(id, d)} — ${words(T.node(id).text).slice(0, 80)}`).join("\n");
      const j = T.ai.parseJSON(await T.ai.ask("You arrange memory drill items into the order that best builds recall (e.g. simple before complex, related items apart). Reply ONLY with JSON {\"order\": [item numbers], \"reason\": one short sentence}.", list, 300));
      const ord = j && Array.isArray(j.order) ? j.order.map(Number).filter(i => ids[i]).map(i => ids[i]) : null;
      P.aiOrder = ord && ord.length ? ord.concat(ids.filter(x => !ord.includes(x))) : ids;
      d.log = (d.log || []).concat(["Claude's order: " + ((j && j.reason) || "simple first.")]).slice(-30);
    } catch (e) { P.aiOrder = ids; d.log = (d.log || []).concat(["Claude couldn't arrange it (" + e.message + "), so it's front to back."]).slice(-30); }
    d.progress = P; put(d);
  }

  /* ---------------- edit a drill (its steps in plain words) ---------------- */
  const dlg = document.createElement("dialog"); dlg.id = "drillDlg"; dlg.setAttribute("aria-labelledby", "drTitle"); document.body.appendChild(dlg);
  let editing = null;
  function openEditor(id) {
    const d = getD(id); if (!d) return; editing = id;
    const sel = (name, val, opts) => `<select data-dr="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === val ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const cues = [["first", "First letters"], ["shape", "Word shapes"], ["alt", "Every other word"], ["blank", "Blank lines"]].concat(T.addons ? T.addons.cueList().map(c => ["addon:" + c.id + ":" + c.name, c.label]) : []);
    dlg.innerHTML = `<h2 id="drTitle">Edit drill</h2>
      <div class="field"><label><span>Name</span></label><input type="text" data-dr="name" value="${esc(d.name)}"></div>
      <div class="field"><label><span>The steps, each round</span></label><ol class="steps">
        <li><label><input type="checkbox" data-dr="show"${d.show ? " checked" : ""}> Show it first (and again after a miss)</label></li>
        <li>Hide it, and show the hint: ${sel("cue", d.cue, cues)} <label><input type="checkbox" data-dr="fade"${d.fade ? " checked" : ""}> hints fade as I get it</label></li>
        <li>Type it from memory <label><input type="checkbox" data-dr="peek"${d.peek ? " checked" : ""}> allow hold-to-peek (a peek isn't perfect)</label></li>
        <li>Review word by word</li>
        <li>Loop until: ${sel("rule", d.rule.type, [["streak", "perfect runs in a row"], ["accuracy", "a score in a row"], ["speed", "perfect and fast in a row"]])}
          <input type="text" data-dr="n" value="${d.rule.n}" aria-label="How many in a row" style="width:80px"> in a row${d.rule.type === "accuracy" ? `, at least <input type="text" data-dr="pct" value="${d.rule.pct}" style="width:80px">%` : d.rule.type === "speed" ? `, at least <input type="text" data-dr="wpm" value="${d.rule.wpm}" style="width:80px"> words a minute` : ""}</li>
        <li>Then extend: add the next item; finish a group, start the next; then chain the groups</li></ol></div>
      <div class="field"><label><span>Order</span></label>${sel("order", d.order, ORDERS)}</div>
      <div class="field"><label><span>Direction</span></label>${sel("dir", d.dir, DIRS)}</div>
      <div class="field"><label><input type="checkbox" data-dr="srs"${d.srs ? " checked" : ""}> When mastered, put it in spaced review</label></div>
      <p><small>${d.groups.length} group${d.groups.length === 1 ? "" : "s"}: ${d.groups.map((g, i) => `${i + 1}) ${g.length} item${g.length === 1 ? "" : "s"}`).join(", ")}.</small></p>
      <div class="row"><button class="btn primary" data-dre="save">Save</button><button class="btn" data-dre="run">Save and drill</button><button class="btn" data-dre="reset">Start progress over</button><button class="btn" data-dre="delete">Delete drill</button><button class="btn" data-dre="close">Cancel</button></div>`;
    if (!dlg.open) dlg.showModal();
  }
  function readEditor() {
    const d = getD(editing), v = k => { const el = dlg.querySelector(`[data-dr="${k}"]`); return !el ? undefined : el.type === "checkbox" ? el.checked : el.value; };
    d.name = (v("name") || d.name).slice(0, 80);
    for (const k of ["show", "fade", "peek", "srs"]) d[k] = !!v(k);
    d.cue = v("cue"); d.order = v("order"); d.dir = v("dir");
    d.rule = Object.assign({}, d.rule, { type: v("rule"), n: Math.max(1, Math.min(20, +v("n") || 3)) });
    if (v("pct") !== undefined) d.rule.pct = Math.max(10, Math.min(100, +v("pct") || 90));
    if (v("wpm") !== undefined) d.rule.wpm = Math.max(1, Math.min(200, +v("wpm") || 20));
    if (d.order !== "ai") d.progress = Object.assign({}, d.progress, { aiOrder: null });
    d.progress.need = d.rule.n;
    return put(d);
  }
  dlg.addEventListener("change", e => { if (e.target.dataset.dr === "rule") { readEditor(); openEditor(editing); } });
  dlg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const a = b.dataset.dre;
    if (a === "close") dlg.close();
    else if (a === "save") { readEditor(); dlg.close(); T.toast("Drill saved."); if (R) paint(); }
    else if (a === "run") { readEditor(); dlg.close(); run(editing); }
    else if (a === "reset") { const d = getD(editing); d.progress = fresh(d); d.log = (d.log || []).concat(["Progress started over."]); put(d); T.toast("Progress started over."); }
    else if (a === "delete") { M.putRecord("drills", editing, { id: editing, deleted: true }); dlg.close(); T.toast("Drill deleted."); T.refreshList(); }
  });

  /* ---------------- spaced review for drills ---------------- */
  function dueDrills() {
    const cards = (T.getMemory().cards) || {}, eod = new Date(); eod.setHours(23, 59, 59, 999);
    return drills().filter(d => { const c = cards["drill:" + d.id + "|fwd"]; return c && (c.history || []).length && M.cardState(c).due <= eod.getTime(); });
  }
  H.listTopMore = () => {
    const L = drills(); if (!L.length) return "";
    const due = dueDrills().length;
    return `<div class="item memrow"><button class="open" data-listtop="drills"><b>Drills</b><small>${due ? due + " due today" : L.length + " saved"}</small></button></div>`;
  };
  H.listTopOther = k => { if (k === "drills") M.hub(); };
  H.hubExtra = () => {
    const L = drills(), due = new Set(dueDrills().map(d => d.id)), cur = T.node(T.current());
    return `<div class="field"><label><span>Drills</span></label>
      ${L.map(d => `<div class="q"><div><b>${esc(d.name)}</b><small>${due.has(d.id) ? "Due today · " : ""}${esc(progressText(d))}</small></div>
        <button class="fbtn" data-drill-run="${d.id}">Drill</button><button class="fbtn" data-drill-edit="${d.id}">Edit</button></div>`).join("") || "<small>No drills yet.</small>"}
      <div class="row">${cur ? `<button class="btn" data-drill-new="${cur.id}">New drill from this page</button>` : ""}<button class="btn" data-drill-sample="1">Add sample: Psalm 23 (KJV)</button></div></div>`;
  };
  H.menuExtra = f => `<div class="row"><button class="btn" data-drill-new="${f.id}">Drill this fold (loop until natural)</button></div>`;
  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const closeDialogs = () => { ["memHub", "memDlg"].forEach(id => { const x = $(id); if (x && x.open) x.close(); }); };
    if (b.dataset.drillRun) { closeDialogs(); run(b.dataset.drillRun); }
    else if (b.dataset.drillEdit) { closeDialogs(); openEditor(b.dataset.drillEdit); }
    else if (b.dataset.drillNew) { try { const d = make(b.dataset.drillNew); closeDialogs(); openEditor(d.id); } catch (err) { T.toast("Can't make a drill: " + err.message + "."); } }
    else if (b.dataset.drillSample) { closeDialogs(); const d = addPsalm23(); T.toast("Added Psalm 23 (KJV) and its drill."); openEditor(d.id); }
  });

  /* ---------------- the sample: Psalm 23, King James Version (public domain) ---------------- */
  const PSALM = [
    ["God cares for me.", "The Lord is my shepherd.", "The Lord is my shepherd; I have all I need.", "The Lord is my shepherd; I shall not want for anything.",
     "The LORD is my shepherd; I shall not want."],
    ["He gives me rest.", "He lets me lie down in green grass.", "He makes me lie down in green pastures; he leads me by still water.", "He maketh me to lie down in green pastures; he leadeth me beside still waters.",
     "He maketh me to lie down in green pastures: he leadeth me beside the still waters."],
    ["He makes me new.", "He fixes my heart and shows me the right way.", "He restores my soul; he leads me on good paths.", "He restoreth my soul: he leadeth me in the paths of righteousness.",
     "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake."],
    ["I am not afraid; God is with me.", "Even in the dark valley I fear nothing, because you are with me.", "Though I walk through the dark valley, I fear no evil; you are with me; your rod and staff comfort me.",
     "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me.",
     "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me."],
    ["God feeds me and blesses me.", "You set a table for me, even near my enemies.", "You prepare a table before me with my enemies near; you put oil on my head; my cup is full.",
     "Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil.",
     "Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over."],
    ["Good things follow me, and I live with God.", "Goodness and mercy follow me all my life.", "Goodness and mercy shall follow me all my days, and I will live in the Lord's house forever.",
     "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD.",
     "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever."]
  ];
  function addPsalm23() {
    const lines = ["Psalm 23 (KJV)"].concat(PSALM.map((_, i) => "Verse " + (i + 1)));
    const pageText = lines.join("\n");
    const page = T.createNode({ parentId: null, text: pageText });
    const groups = [];
    PSALM.forEach((levels, vi) => {
      const w = "Verse " + (vi + 1), at = pageText.indexOf("\n" + w) + 1;
      const vText = levels.map((_, li) => "Level " + (li + 1)).join("\n");
      const verse = T.createNode({ parentId: page.id, text: vText, anchor: T.makeAnchor(pageText, at, at + w.length) });
      const g = [];
      levels.forEach((t, li) => {
        const lw = "Level " + (li + 1), la = vText.indexOf(lw);
        g.push(T.createNode({ parentId: verse.id, text: t, anchor: T.makeAnchor(vText, la, la + lw.length) }).id);
      });
      groups.push(g);
    });
    T.refreshList();
    return make(page.id, { name: "Psalm 23, verse by verse", groups });
  }

  /* ---------------- Claude can build, change and run drills ---------------- */
  if (T.agent) {
    const S = d => ({ type: "string", description: d });
    const opts = { name: S("name"), rule_n: { type: "number", description: "how many right in a row before it grows (default 3)" }, rule: S("streak | accuracy | speed"),
                   order: S(ORDERS.map(o => o[0]).join(" | ")), direction: S("fwd | back | both"), hint: S("first | shape | alt | blank"), fade: { type: "boolean" }, show_first: { type: "boolean" }, spaced_review: { type: "boolean" } };
    const apply = (inp, o) => { if (inp.name) o.name = inp.name; if (inp.rule || inp.rule_n) o.rule = { type: inp.rule || "streak", n: inp.rule_n || 3 }; if (inp.order) o.order = inp.order; if (inp.direction) o.dir = inp.direction;
      if (inp.hint) o.cue = inp.hint; if (inp.fade !== undefined) o.fade = inp.fade; if (inp.show_first !== undefined) o.show = inp.show_first; if (inp.spaced_review !== undefined) o.srs = inp.spaced_review; return o; };
    T.agent.tool("make_drill", "Make a drill (a practice loop) over the folds in a page or fold. By default each fold directly in it is a group, and the folds inside each are its items in order (e.g. a verse and its levels, simplest first). Or give groups explicitly as arrays of fold ids. It loops until mastery, then extends, then chains groups.",
      Object.assign({ root_id: S("page or fold id"), groups: { type: "array", items: { type: "array", items: { type: "string" } }, description: "optional explicit groups of fold ids" } }, opts), ["root_id"], (inp, ctx) => {
        const d = make(inp.root_id, apply(inp, { groups: inp.groups }));
        ctx.mem.push(["drills", d.id, null]);
        return { data: { id: d.id, groups: d.groups.length, items: d.groups.reduce((s, g) => s + g.length, 0) }, summary: `Made the drill “${d.name}” (${d.groups.length} group${d.groups.length === 1 ? "" : "s"})` };
      });
    T.agent.tool("edit_drill", "Change a drill's settings.", Object.assign({ id: S("drill id") }, opts), ["id"], (inp, ctx) => {
      const d = getD(inp.id); if (!d) throw new Error("no such drill");
      T.agent.snapMem(ctx, "drills", d.id);
      const o = apply(inp, {}); if (o.rule) d.rule = Object.assign({}, d.rule, o.rule); delete o.rule; Object.assign(d, o); d.progress.need = d.rule.n; put(d);
      return { summary: `Changed the drill “${d.name}”` };
    });
    T.agent.tool("list_drills", "List the drills (id, name, progress).", {}, [], () => ({ data: drills().map(d => ({ id: d.id, name: d.name, progress: progressText(d), groups: d.groups.length })) }));
    T.agent.tool("run_drill", "Start a drill now.", { id: S("drill id") }, ["id"], inp => {
      if (!getD(inp.id)) throw new Error("no such drill");
      setTimeout(() => { T.agent.close(); run(inp.id); }, 400); return { summary: "Starting the drill" };
    });
    T.agent.tool("add_sample_psalm_23", "Add the Psalm 23 (King James Version) sample: a page with a fold per verse, 5 levels per verse (level 5 = the KJV words), and its verse-by-verse drill.", {}, [], (inp, ctx) => {
      const before = new Set(T.allNodes().map(n => n.id));
      const d = addPsalm23(); T.allNodes().forEach(n => { if (!before.has(n.id)) ctx.nodes[n.id] = null; }); ctx.mem.push(["drills", d.id, null]);
      return { data: { drill: d.id, page: d.rootId }, summary: "Added Psalm 23 (KJV) and its drill" };
    });
  }

  T.drills = { make, run, arrange, list: drills, get: getD, groupsFrom, addPsalm23, due: dueDrills, _after: () => afterRound(), _state: () => R, edit: openEditor };
  T.refreshList();
})();
