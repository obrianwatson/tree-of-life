/* book.js · CORE · THE BOOK: leaves of lines, and the one door every move goes through.

   The book:
     leaves{id}  { id, lines:[line ids in order], folds:[fold ids], parent: line id it grew from (null for the trunk), at, updatedAt }
     lines{id}   { id, text, d: depth (how far it is indented = which line it grows from), by: who wrote it, in: its leaf, leaf?: a leaf lifted from it }
     folds{id}   (Fold module)   links{id} (Link module)   marks{id} (Bookmarks)   names{name} (named folds)   more{} (other modules)
     pruned[]    what was deleted, whole, so it can always be brought back
     trunk       the id of the one leaf the book starts from

   Every move is an ACTION: Book.act(name, needs). Modules add their own with Book.action(name, fn, module).
   - WHO made the move is stamped here, never passed in: Book.act is the writer's hand; the fast AI, commands and
     automations each get one hand of their own from Book.hand(kind), handed out once.
   - Every action passes ONE checkpoint first (Book.checkpoint): limits for the AI, commands and automations plug in there.
   - Undo is a rule, not an action: before an action touches a leaf it calls T.leaf(id), which keeps the leaf as it was;
     Undo puts those leaves back. Book.begin/end make many actions one Undo (a reply, a command, an automation).
   - Before a leaf changes, Book.before(leaf) is told (keep.js keeps a ring: the earlier version).
   - Every action is told to Book.on listeners (the record of every move listens there).
   No screen code in this file. */
(function (g) {
"use strict";
g.makeBook = function (store) {
  const uid = p => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const plain = msg => Object.assign(new Error(msg), { plain: true });
  const copy = o => JSON.parse(JSON.stringify(o));
  function fresh() {
    const now = Date.now(), t = uid("t"), l = uid("l");
    return { v: 1, trunk: t, leaves: { [t]: { id: t, lines: [l], folds: [], parent: null, at: now, updatedAt: now } },
      lines: { [l]: { id: l, text: "", d: 0, by: "me", in: t } }, folds: {}, names: {}, links: {}, marks: {}, pruned: [], more: {} };
  }
  let D = store.load();
  if (!D || D.v !== 1 || !D.leaves || !D.leaves[D.trunk]) D = fresh();
  const B = { uid, plain };
  Object.defineProperty(B, "D", { get: () => D });

  /* ---------- saving: once your hands rest (0.4 s), at least every 3 s while you type, and at once when you leave ---------- */
  let saveT = null, saveFirst = 0, kept = true;
  const flush = () => { clearTimeout(saveT); saveT = null; kept = store.save(D) !== false; };
  const save = () => { const now = Date.now(); if (!saveT) saveFirst = now; clearTimeout(saveT); saveT = setTimeout(flush, Math.max(0, Math.min(400, saveFirst + 3000 - now))); };
  B.flush = flush; B.save = save;
  Object.defineProperty(B, "kept", { get: () => kept });
  const subs = []; B.on = fn => subs.push(fn);
  const emit = ev => subs.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } });
  B.emit = emit;

  /* ---------- reading the book ---------- */
  const leafOf = line => D.lines[line] && D.lines[line].in;
  const title = id => id === D.trunk ? "Trunk" : ((D.leaves[id] && D.lines[D.leaves[id].parent] && D.lines[D.leaves[id].parent].text.trim()) || "Untitled");
  const parentLeaf = id => { const lf = D.leaves[id]; return lf && lf.parent && D.lines[lf.parent] ? D.lines[lf.parent].in : null; };
  function alive(id) { let n = 0; while (id && n++ < 500) { if (id === D.trunk) return true; const lf = D.leaves[id]; if (!lf || !lf.parent || !D.lines[lf.parent] || D.lines[lf.parent].leaf !== id) return false; id = D.lines[lf.parent].in; } return false; }
  function path(id) { const out = []; let n = 0; while (id && n++ < 500) { out.unshift(id); id = parentLeaf(id); } return out; }
  function leaves() {                       // every living leaf, walking out from the trunk
    const out = [], walk = id => { const lf = D.leaves[id]; if (!lf || out.indexOf(id) >= 0) return; out.push(id); lf.lines.forEach(l => { const L = D.lines[l]; if (L && L.leaf && D.leaves[L.leaf]) walk(L.leaf); }); };
    walk(D.trunk); return out;
  }
  const depth = (lf, i) => D.lines[lf.lines[i]].d;
  function branchEnd(lf, i) { let j = i + 1; const d = depth(lf, i); while (j < lf.lines.length && depth(lf, j) > d) j++; return j; }     // a branch = a line and every line after it that is indented deeper
  function parentLine(lf, i) { const d = depth(lf, i); for (let k = i - 1; k >= 0; k--) if (depth(lf, k) < d) return k; return -1; }
  function textOf(id, pad, deep, seen) {    // a leaf as plain words: branches indented, lifted leaves under their line
    pad = pad || ""; seen = seen || {}; const lf = D.leaves[id]; if (!lf || seen[id]) return ""; seen[id] = 1; const out = [];
    lf.lines.forEach(l => { const L = D.lines[l]; if (!L) return; const p = pad + "    ".repeat(L.d); out.push(p + L.text); if (deep && L.leaf && D.leaves[L.leaf]) { const t = textOf(L.leaf, p + "    ", true, seen); if (t.trim()) out.push(t); } });
    return out.join("\n");
  }
  function search(q, max) {
    q = String(q || "").toLowerCase().trim(); const out = []; if (!q) return out;
    for (const id of leaves()) for (const l of D.leaves[id].lines) { const L = D.lines[l]; if (L && L.text.toLowerCase().indexOf(q) >= 0) { out.push({ leaf: id, line: l, text: L.text }); if (out.length >= (max || 200)) return out; } }
    return out;
  }
  const hasWriting = id => { const lf = D.leaves[id]; return !!lf && lf.lines.some(l => D.lines[l] && (D.lines[l].text.trim() || D.lines[l].leaf)); };
  Object.assign(B, { leafOf, title, parentLeaf, alive, path, leaves, branchEnd, parentLine, textOf, search, hasWriting });

  /* ---------- keeping things whole (at start, and after another device's book is merged in) ---------- */
  function heal() {
    if (!D.leaves[D.trunk]) { const f = fresh(); D.trunk = f.trunk; Object.assign(D.leaves, f.leaves); Object.assign(D.lines, f.lines); }
    ["folds", "names", "links", "marks", "more"].forEach(k => { if (!D[k] || typeof D[k] !== "object") D[k] = {}; }); if (!Array.isArray(D.pruned)) D.pruned = [];
    const prunedLines = {}; D.pruned.forEach(p => (p.lines || []).forEach(r => { prunedLines[r.id] = 1; }));
    const seen = {};
    Object.values(D.leaves).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? -1 : 1)).forEach(lf => {     // (a line two leaves both claim stays in the one changed last)
      lf.lines = (lf.lines || []).filter(l => D.lines[l] && !seen[l] && (seen[l] = 1)); lf.lines.forEach(l => { D.lines[l].in = lf.id; });
      if (!lf.lines.length) { const l = uid("l"); D.lines[l] = { id: l, text: "", d: 0, by: "me", in: lf.id }; lf.lines.push(l); }
      if (D.lines[lf.lines[0]].d !== 0) D.lines[lf.lines[0]].d = 0;
      for (let i = 1; i < lf.lines.length; i++) { const L = D.lines[lf.lines[i]], max = D.lines[lf.lines[i - 1]].d + 1; if (!(L.d >= 0)) L.d = 0; if (L.d > max) L.d = max; }
      lf.folds = (lf.folds || []).filter(f => { const F = D.folds[f]; if (!F) return false; const a = lf.lines.indexOf(F.from), b = lf.lines.indexOf(F.to); if (a < 0 || b < 0 || a > b) { delete D.folds[f]; return false; } F.leaf = lf.id; return true; });
    });
    Object.values(D.leaves).forEach(lf => {                       // a leaf that lost the line it grew from (and wasn't deleted with it) goes back on the trunk
      if (lf.id === D.trunk) return; const P = D.lines[lf.parent];
      if (P && P.leaf === lf.id) return; if (prunedLines[lf.parent]) return; if (!hasWriting(lf.id)) return;
      if (P && !P.leaf) { P.leaf = lf.id; return; }
      const l = uid("l"), tr = D.leaves[D.trunk]; D.lines[l] = { id: l, text: lf.name || "Found leaf", d: 0, by: "me", in: tr.id, leaf: lf.id }; tr.lines.push(l); lf.parent = l;
    });
    Object.values(D.lines).forEach(L => { if (L.leaf && (!D.leaves[L.leaf] || D.leaves[L.leaf].parent !== L.id)) delete L.leaf; });
  }
  heal(); B.heal = heal;

  /* ---------- Undo: the leaves an action touches are kept as they were ---------- */
  const undos = []; let cur = null, group = null;
  /* a leaf as it is right now, kept apart from the book (line records are flat, so a plain copy of each is a whole copy: quick even for a long leaf) */
  const pieceOf = id => { const lf = D.leaves[id]; if (!lf) return null; const p = { leaf: Object.assign({}, lf, { lines: lf.lines.slice(), folds: (lf.folds || []).slice() }), lines: {}, folds: {} };
    lf.lines.forEach(l => { if (D.lines[l]) p.lines[l] = Object.assign({}, D.lines[l]); }); (lf.folds || []).forEach(f => { if (D.folds[f]) p.folds[f] = copy(D.folds[f]); }); return p; };
  const T = {
    leaf(id) { if (cur && !cur.leaves.has(id)) cur.leaves.set(id, pieceOf(id)); if (D.leaves[id]) { D.leaves[id].updatedAt = Date.now(); try { B.before(id); } catch (e) {} } return D.leaves[id]; },
    table(name) { if (cur && !(name in cur.tables)) cur.tables[name] = Array.isArray(D[name]) ? D[name].slice() : Object.assign({}, D[name]); return D[name]; },     // (records in tables are replaced, never changed in place)
    rec(table, id) { const k = "rec:" + table + ":" + id; if (cur && !(k in cur.tables)) cur.tables[k] = D[table][id] === undefined ? undefined : copy(D[table][id]); return D[table][id]; },     // one record, kept as it was (a light Undo that doesn't mark its leaf as changed)
    more(name) { if (cur && !("more:" + name in cur.tables)) cur.tables["more:" + name] = D.more[name] === undefined ? undefined : copy(D.more[name]); }
  };
  function putBack(snap) {
    snap.leaves.forEach((p, id) => { const lf = D.leaves[id]; if (!lf) return; lf.lines.forEach(l => { if (D.lines[l] && D.lines[l].in === id) delete D.lines[l]; }); (lf.folds || []).forEach(f => delete D.folds[f]); delete D.leaves[id]; });
    snap.leaves.forEach((p, id) => { if (!p) return; D.leaves[id] = p.leaf; Object.assign(D.lines, p.lines); Object.assign(D.folds, p.folds); });      // (a kept leaf is put back once and never used again)
    Object.keys(snap.tables).forEach(k => { if (k.indexOf("rec:") === 0) { const p = k.split(":"); if (snap.tables[k] === undefined) delete D[p[1]][p[2]]; else if (p[1] !== "folds" || D.leaves[snap.tables[k].leaf]) D[p[1]][p[2]] = copy(snap.tables[k]); } else if (k.indexOf("more:") === 0) { const n = k.slice(5); if (snap.tables[k] === undefined) delete D.more[n]; else D.more[n] = copy(snap.tables[k]); } else D[k] = snap.tables[k]; });
  }
  B.before = function (leaf) {};                      // told before a leaf changes (keep.js keeps a ring)
  /* the checkpoint: every guard is asked. true = go · a sentence = refused (why) · { ask } = the writer must allow it first */
  const guards = []; B.guard = fn => guards.push(fn);
  B.checkpoint = function (name, needs, who, grant) { for (const gd of guards) { const r = gd(name, needs, who, grant); if (r !== true && r !== undefined) return r; } return true; };
  B.modOn = function (mod) { return true; };          // (mods.js answers: is this module switched on?)

  /* ---------- the one door ---------- */
  const ACTIONS = {};
  B.action = function (name, fn, mod) { ACTIONS[name] = { fn, mod: mod || null }; };
  B.actions = () => Object.keys(ACTIONS);
  function act(name, needs, who, grant) {
    needs = needs || {}; const A = ACTIONS[name];
    if (!A) return { ok: false, why: "There's no such action." };
    if (A.mod && !B.modOn(A.mod)) return { ok: false, why: "That module is switched off (Settings)." };
    const pass = B.checkpoint(name, needs, who, grant);
    if (pass !== true) return pass && pass.ask ? { ok: false, ask: pass.ask, why: "This needs your OK first." } : { ok: false, why: typeof pass === "string" ? pass : "That isn't allowed." };
    const now = Date.now(), last = undos[undos.length - 1];
    // steady typing on one line is one step to undo
    const co = !group && name === "write" && last && last.name === "write" && !last.sealed && last.key === needs.line && last.who === who && now - last.t < 1500 && now - last.t0 < 20000 && !/\n/.test(needs.words || "");
    const snap = co ? last.snap : { leaves: new Map(), tables: {} };
    cur = snap; let out;
    try { out = A.fn(needs, who, T) || {}; }
    catch (e) { cur = null; if (!co) putBack(snap); if (e.plain) return { ok: false, why: e.message }; throw e; }
    cur = null;
    if (co) last.t = now;
    else if (!out.look) { const step = { name, key: name === "write" ? needs.line : null, who, t: now, t0: now, snap, sealed: name === "write" && (/\n/.test(needs.words || "") || !!out.structural) };
      if (group) group.list.push(step); else { undos.push(step); if (undos.length > 120) undos.shift(); } }
    const log = out.log; delete out.log; out.ok = true;
    if (!out.look) save();
    emit({ type: "action", name, needs, who, result: out, log, group: group && group.tag, dry: B.dry });
    return out;
  }
  B.act = (name, needs) => act(name, needs, "me");                         // the writer's hand
  const HANDS = { ai: 0, cmd: 0, auto: 0 };
  B.hand = function (kind) {                                                // one hand each for the fast AI, commands and automations
    if (!(kind in HANDS) || HANDS[kind]) throw new Error("That hand was already given out."); HANDS[kind] = 1;
    return (name, needs, o) => act(name, needs, kind + (o && o.as ? ":" + String(o.as).replace(/[^\w;.-]/g, "").slice(0, 30) : ""), o && o.grant);
  };
  /* many actions, one Undo */
  B.begin = function (tag, who) { if (group) group.depth++; else group = { tag, who: who || "me", list: [], depth: 1 }; return true; };       // (begin/end pairs can sit inside one another: the outermost pair is the Undo)
  B.end = function () { if (!group) return 0; if (--group.depth > 0) return 0; const gp = group; group = null; if (!gp.list.length) return 0;
    undos.push({ name: "group", group: gp.tag, who: gp.who, t: Date.now(), t0: 0, sealed: true, n: gp.list.length, list: gp.list }); if (undos.length > 120) undos.shift(); return gp.list.length; };
  B.groupDepth = tag => { for (let i = undos.length - 1; i >= 0; i--) if (undos[i].group === tag) return undos.length - 1 - i; return -1; };
  B.undo = function () {
    const u = undos.pop(); if (!u) return null;
    if (u.list) for (let i = u.list.length - 1; i >= 0; i--) putBack(u.list[i].snap); else putBack(u.snap);
    save(); emit({ type: "undo", name: u.name, who: u.who, group: u.group, dry: B.dry }); return { name: u.name, group: u.group, key: u.key };
  };
  /* A TRIAL: fn's moves really happen, are read, and are then put back exactly, whatever else is going on. Nothing is kept:
     not in the Undo list, not in the record, not in sync (the moves are marked dry). This is how a command "runs on a copy first". */
  B.trial = function (fn) { const saved = group, tg = group = { tag: "trial", who: "trial", list: [], depth: 1 }; B.dry = true; let out;
    try { out = fn(); } finally { group = saved; for (let i = tg.list.length - 1; i >= 0; i--) putBack(tg.list[i].snap); B.dry = false; save(); } return out; };
  B.dry = false;                                      // a TRIAL: moves made while this is on are marked, so the record, sync and the page ignore them (they are undone straight after)
  B.canUndo = () => undos.length > 0;
  B.sealUndo = () => { const l = undos[undos.length - 1]; if (l) l.sealed = true; };
  B.clearUndo = () => { undos.length = 0; };

  /* ---------- helpers the actions share ---------- */
  const newLine = (leaf, text, d, who) => { const id = uid("l"); D.lines[id] = { id, text: text || "", d: d || 0, by: who || "me", in: leaf }; return id; };
  /* lines are leaving a leaf's order (typed away, moved, deleted): its folds let go of them, or go with them */
  function refold(lf, oldLines, gone, dest) {       // gone: {lineId: true}; dest: a leaf the gone lines are moving to (or null)
    (lf.folds || []).slice().forEach(fid => {
      const F = D.folds[fid]; if (!F) return; let a = oldLines.indexOf(F.from), b = oldLines.indexOf(F.to); if (a < 0 || b < 0) return;
      let inside = true; for (let k = a; k <= b; k++) if (!gone[oldLines[k]]) { inside = false; break; }
      if (inside) { lf.folds = lf.folds.filter(x => x !== fid); if (dest) { F.leaf = dest.id; dest.folds = (dest.folds || []).concat(fid); } else delete D.folds[fid]; return; }
      while (a <= b && gone[oldLines[a]]) a++; while (b >= a && gone[oldLines[b]]) b--;
      F.from = oldLines[a]; F.to = oldLines[b];
    });
  }
  function fixDepths(lf) { if (!lf.lines.length) lf.lines.push(newLine(lf.id, "", 0, "me")); D.lines[lf.lines[0]].d = 0; for (let i = 1; i < lf.lines.length; i++) { const L = D.lines[lf.lines[i]], max = D.lines[lf.lines[i - 1]].d + 1; if (L.d > max) L.d = max; } }
  const leafIdsUnder = ids => { const out = {}; const walk = id => { if (out[id] || !D.leaves[id]) return; out[id] = 1; D.leaves[id].lines.forEach(l => { if (D.lines[l] && D.lines[l].leaf) walk(D.lines[l].leaf); }); }; ids.forEach(l => { if (D.lines[l] && D.lines[l].leaf) walk(D.lines[l].leaf); }); return out; };
  Object.assign(B, { newLine, refold, fixDepths, T });

  /* ================= the core's own actions: write · move · prune · restore ================= */

  /* WRITE: put words on a line. needs: line, at (where in the line; default its end), remove (how many letters to take
     away there, across lines if it must), words. A Return in the words makes new lines. Gives back the line as it reads. */
  B.action("write", function (needs, who, T) {
    const L = D.lines[needs.line]; if (!L) throw plain("That line isn't there.");
    const lf = T.leaf(L.in), i = lf.lines.indexOf(L.id), words = String(needs.words == null ? "" : needs.words).replace(/\r\n?/g, "\n");
    const at = Math.max(0, Math.min(L.text.length, needs.at == null ? L.text.length : needs.at)); let rem = Math.max(0, needs.remove | 0);
    if (at === 0 && !rem && words === "\n" && L.text) {         // Return at the very start of a line: the new empty line goes ABOVE, so the line keeps what hangs on it
      lf.lines.splice(i, 0, newLine(lf.id, "", L.d, who)); return { line: L.id, reads: L.text, caret: { leaf: lf.id, line: L.id, at: 0 }, structural: true, log: { what: "write", leaf: lf.id, line: L.id, n: 0 } };
    }
    let j = i, end = at + rem;
    while (j < lf.lines.length - 1 && end > D.lines[lf.lines[j]].text.length) { end -= D.lines[lf.lines[j]].text.length + 1; j++; }
    const last = D.lines[lf.lines[j]]; end = Math.max(0, Math.min(end, last.text.length));
    const head = L.text.slice(0, at), tail = last.text.slice(end), mid = words.split("\n"), extra = [0];
    for (let k = 1; k < mid.length; k++) { const m = /^\t+/.exec(mid[k]); extra[k] = m ? m[0].length : 0; if (m) mid[k] = mid[k].slice(m[0].length); }      // pasted lines that start with tabs come in as branches
    const texts = mid.slice(); texts[0] = head + texts[0]; texts[texts.length - 1] += tail;
    const old = lf.lines.slice(), next = D.lines[old[j + 1]], childD = (!tail && next && next.d > L.d) ? next.d : L.d;
    const keepLast = j > i && texts.length > 1;   // when lines are joined around new lines, the last line keeps its own id (and what hangs on it)
    const tailWins = j > i && texts.length === 1 && at === 0;      // the first line gave nothing to the join: the last line is the one that lives on
    const ids = [tailWins ? last.id : L.id];
    for (let k = 1; k < texts.length; k++) { if (k === texts.length - 1 && keepLast) ids.push(last.id); else ids.push(newLine(lf.id, "", childD + extra[k], who)); }
    const gone = {}; old.slice(i, j + 1).forEach(l => { if (ids.indexOf(l) < 0) gone[l] = true; });
    const lost = Object.keys(gone);
    if (lost.length) {
      const S = D.lines[ids[0]];
      lost.forEach(l => { const G = D.lines[l]; if (!G.leaf || !D.leaves[G.leaf]) return;
        // a plain join (the line's words live on in the line that's left): its leaf simply hangs there now
        if (!S.leaf && texts.length === 1 && ((l === last.id && tail) || (tailWins && l === L.id && !L.text))) { T.leaf(G.leaf); S.leaf = G.leaf; D.leaves[G.leaf].parent = S.id; delete G.leaf; return; }
        T.table("pruned"); D.pruned.push({ id: uid("p"), at: Date.now(), who, leaf: lf.id, after: i > 0 ? old[i - 1] : null, name: G.text.trim() || title(G.leaf), lines: [copy(G)] });
      });
      refold(lf, old, gone, null); lost.forEach(l => delete D.lines[l]);
    }
    lf.lines.splice(i, j - i + 1, ...ids);
    ids.forEach((id, k) => { const R = D.lines[id]; if (R.text !== texts[k]) { R.text = texts[k]; R.by = who; } });
    if (lost.length) fixDepths(lf);
    if (tailWins) D.lines[last.id].d = Math.min(D.lines[last.id].d, L.d);
    const first = D.lines[ids[0]]; if (first.leaf && D.leaves[first.leaf]) D.leaves[first.leaf].name = first.text;
    const cl = ids[ids.length - 1], ct = D.lines[cl].text.length - tail.length;
    return { line: cl, reads: first.text, caret: { leaf: lf.id, line: cl, at: ct }, structural: ids.length > 1 || j > i,
      log: { what: "write", leaf: lf.id, line: L.id, n: words.replace(/\n/g, "").length, r: rem } };
  });

  /* MOVE (grafting): a line goes somewhere else, and its branch goes with it.
     needs: line, and either dir ("up" | "down": past the branch beside it) or leaf (+ after: a line there; without it, the end). */
  B.action("move", function (needs, who, T) {
    const L = D.lines[needs.line]; if (!L) throw plain("That line isn't there.");
    const src = D.leaves[L.in], i = src.lines.indexOf(L.id), e = branchEnd(src, i), d = L.d;
    if (needs.dir) {
      let to;
      if (needs.dir === "up") { let p = i - 1; while (p >= 0 && depth(src, p) > d) p--; if (p < 0 || depth(src, p) !== d) throw plain("It's already the first in its branch."); to = p; }
      else { if (e >= src.lines.length || depth(src, e) !== d) throw plain("It's already the last in its branch."); to = branchEnd(src, e) - (e - i); }
      T.leaf(src.id); const br = src.lines.splice(i, e - i); src.lines.splice(to, 0, ...br);
      return { line: L.id, leaf: src.id, structural: true, log: { what: "move", leaf: src.id, line: L.id, n: needs.dir } };
    }
    const dest = D.leaves[needs.leaf || src.id]; if (!dest || !alive(dest.id)) throw plain("That leaf isn't there.");
    const moving = src.lines.slice(i, e), under = leafIdsUnder(moving);
    if (path(dest.id).some(id => under[id])) throw plain("A branch can't be moved inside itself.");
    if (needs.after && (leafOf(needs.after) !== dest.id || moving.indexOf(needs.after) >= 0)) throw plain("It can't go there.");
    T.leaf(src.id); if (dest !== src) T.leaf(dest.id);
    const old = src.lines.slice(), gone = {}; moving.forEach(l => { gone[l] = true; });
    if (dest !== src) refold(src, old, gone, dest); else refold(src, old, gone, null);
    src.lines.splice(i, e - i);
    let pos = dest.lines.length, base = 0;
    if (needs.after) { const a = dest.lines.indexOf(needs.after); pos = branchEnd(dest, a); base = D.lines[needs.after].d; }
    else if (needs.first) pos = 0;
    moving.forEach(l => { const R = D.lines[l]; R.d = R.d - d + base; R.in = dest.id; });
    dest.lines.splice(pos, 0, ...moving); fixDepths(src); if (dest !== src) fixDepths(dest);
    return { line: L.id, leaf: dest.id, structural: true, log: { what: "move", leaf: dest.id, line: L.id, n: title(dest.id), from: src.id } };
  });

  /* PRUNE (delete): a line and its branch are taken out, whole, and kept so they can be brought back. needs: line. */
  B.action("prune", function (needs, who, T) {
    const L = D.lines[needs.line]; if (!L) throw plain("That line isn't there.");
    const lf = T.leaf(L.in), i = lf.lines.indexOf(L.id), e = branchEnd(lf, i), old = lf.lines.slice(), gone = {}, recs = [];
    old.slice(i, e).forEach(l => { gone[l] = true; recs.push(copy(D.lines[l])); });
    T.table("pruned"); const pid = uid("p");
    D.pruned.push({ id: pid, at: Date.now(), who, leaf: lf.id, after: i > 0 ? old[i - 1] : null, name: L.text.trim() || "(an empty line)", lines: recs });
    refold(lf, old, gone, null); lf.lines.splice(i, e - i); recs.forEach(r => delete D.lines[r.id]); fixDepths(lf);
    const near = lf.lines[Math.min(i, lf.lines.length - 1)];
    return { pruned: pid, line: near, leaf: lf.id, kept: recs.length, structural: true, log: { what: "prune", leaf: lf.id, n: L.text.slice(0, 60), k: recs.length } };
  });

  /* RESTORE: something deleted comes back where it was (or at the end of its leaf, or on the trunk if its leaf is gone). needs: id. */
  B.action("restore", function (needs, who, T) {
    const k = D.pruned.findIndex(p => p.id === needs.id); if (k < 0) throw plain("That isn't in the deleted list any more.");
    const P = D.pruned[k], lf = T.leaf(alive(P.leaf) ? P.leaf : D.trunk);
    let pos = lf.lines.length; const a = P.after ? lf.lines.indexOf(P.after) : -1; if (a >= 0) pos = a + 1; else if (P.after === null && lf.id === P.leaf) pos = 0;
    const base = lf.id === P.leaf ? 0 : -P.lines[0].d, ids = [];
    P.lines.forEach(r => { if (D.lines[r.id]) return; const R = copy(r); R.in = lf.id; R.d = Math.max(0, R.d + base); D.lines[R.id] = R; ids.push(R.id); });
    if (!ids.length) throw plain("It's already back.");
    if (lf.lines.length === 1 && !D.lines[lf.lines[0]].text && !D.lines[lf.lines[0]].leaf && pos >= 1) { delete D.lines[lf.lines[0]]; lf.lines = []; pos = 0; }
    lf.lines.splice(pos, 0, ...ids); fixDepths(lf);
    T.table("pruned"); D.pruned = D.pruned.filter(p => p.id !== P.id); T.more("unpruned"); (D.more.unpruned = D.more.unpruned || {})[P.id] = Date.now();
    return { line: ids[0], leaf: lf.id, structural: true, log: { what: "restore", leaf: lf.id, line: ids[0], n: P.name } };
  });

  /* ---------- whole leaves, lifted out and set in (rings, sync, export; not actions) ---------- */
  B.cut = function (id) { const p = pieceOf(id); if (!p) return null; p.title = title(id); return p; };
  B.graft = function (piece) {              // a leaf as another device has it takes this leaf's place (the caller keeps a ring first)
    const p = copy(piece), id = p.leaf.id, lf = D.leaves[id];
    if (lf) { lf.lines.forEach(l => { if (D.lines[l] && D.lines[l].in === id) delete D.lines[l]; }); (lf.folds || []).forEach(f => delete D.folds[f]); }
    D.leaves[id] = p.leaf; Object.assign(D.lines, p.lines); Object.assign(D.folds, p.folds || {});
  };
  B.copyIn = function (piece, mark) {        // a ring comes back as a NEW leaf beside the one you have: nothing is written over
    const p = copy(piece), map = {}, m = id => map[id] || (map[id] = id[0] + uid("").slice(1)), now = Date.now(), nid = uid("f");
    const host = D.leaves[p.leaf.id] && alive(p.leaf.id) && p.leaf.id !== D.trunk ? D.leaves[parentLeaf(p.leaf.id)] : D.leaves[D.trunk];
    const pl = newLine(host.id, ((p.title || "Leaf") + " " + (mark || "")).trim(), 0, "me"), at = host.lines.indexOf(p.leaf.parent);
    if (at >= 0) { D.lines[pl].d = D.lines[p.leaf.parent].d; host.lines.splice(branchEnd(host, at), 0, pl); } else host.lines.push(pl);
    D.lines[pl].leaf = nid; host.updatedAt = now;
    D.leaves[nid] = { id: nid, lines: p.leaf.lines.map(m), folds: (p.leaf.folds || []).map(m), parent: pl, at: now, updatedAt: now };
    Object.keys(p.lines).forEach(id => { const R = Object.assign({}, p.lines[id], { id: m(id), in: nid }); delete R.leaf; D.lines[R.id] = R; });
    Object.keys(p.folds || {}).forEach(id => { const F = p.folds[id]; D.folds[m(id)] = Object.assign({}, F, { id: m(id), leaf: nid, from: m(F.from), to: m(F.to) }); });
    heal(); undos.length = 0; save(); emit({ type: "replace" }); return nid;
  };
  B.replace = function (data) { D = data; heal(); undos.length = 0; group = null; save(); emit({ type: "replace" }); };
  B.changed = function () { undos.length = 0; heal(); save(); emit({ type: "replace" }); };     // (after sync has set leaves in)
  return B;
};
})(window);
