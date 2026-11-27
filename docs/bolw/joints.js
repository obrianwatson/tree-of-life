/* joints.js · THE JOINTS of the Book of Living Waters (Essentials).
   The six actions of the Six-Action Card live here and nowhere else:
     write · open_note · fold_line · open_fold · remove_fold · trace_parent
   - A finger moves them through Book.act(name, needs). The breath (the AI) moves the SAME joints through the one
     hand it is given (Book.breath(), handed out once). Who did it is stamped HERE, never passed in by the caller,
     so the record of who wrote what can't be set by the breath, a command, or a change.
   - Every action passes ONE checkpoint first (Book.checkpoint): the riverbanks (banks.js) plug in there.
   - Every action that changes something gives back how to undo it. Undo is a rule, not an action.
     A whole reply of the breath is ONE Undo (Book.begin / Book.end).
   - Before a note is changed, Book.before(note) is told, so the earlier version can be kept (keep.js).
   - Hold and the writing clock are NOT here: they belong to the writer alone.
   No screen code in this file.

   The book:  notes{id}  boxes{id: {kind: note|fold, lines:[line ids]}}  lines{id: {text, by}}
              folds{id: {host: box id, from: line id, to: line id, open, by}}   (a fold's own lines are boxes[fold id])
              removed[] (folds taken away that still hold writing: never lost)  current (the open note) */
(function (g) {
"use strict";
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
function makeBook(store) {
  let D = store.load();
  const fresh = () => ({ v: 1, notes: {}, boxes: {}, lines: {}, folds: {}, removed: [], current: null });
  if (!D || D.v !== 1 || !D.notes || !D.boxes) D = fresh();
  const B = { kept: true, banks: [] }, subs = [], undos = [];
  (function sweep() {            // when the book opens: clear away empty folds that were removed and can't be reached any more (nothing with writing is ever swept)
    const live = new Set(Object.keys(D.notes)); (D.removed || []).forEach(r => live.add(r.fold.id));
    let more = true; while (more) { more = false; Object.values(D.folds).forEach(f => { if (live.has(f.host) && !live.has(f.id)) { live.add(f.id); more = true; } }); }
    Object.keys(D.folds).forEach(id => { if (!live.has(id)) delete D.folds[id]; });
    Object.keys(D.boxes).forEach(id => { if (!live.has(id)) { D.boxes[id].lines.forEach(l => delete D.lines[l]); delete D.boxes[id]; } });
  })();
  let saveT = null;
  const fail = why => { throw Object.assign(new Error(why), { plain: true }); };
  const emit = ev => subs.forEach(fn => { try { fn(ev); } catch (e) { if (g.console) console.error(e); } });
  function flush() { clearTimeout(saveT); saveT = null; const ok = store.save(D) !== false; if (ok !== B.kept) { B.kept = ok; emit({ type: "kept" }); } }
  let saveFirst = 0;            // saved once your hands rest (0.4 s), and at least every 3 s while you keep typing; leaving the page saves at once
  const save = () => { const now = Date.now(); if (!saveT) saveFirst = now; clearTimeout(saveT); saveT = setTimeout(flush, Math.max(0, Math.min(400, saveFirst + 3000 - now))); };

  /* ---------- looking (these change nothing) ---------- */
  const newLine = (text, by) => { const id = "l" + uid(); D.lines[id] = { id, text: text || "", by: by || "me" }; return id; };
  const foldsIn = box => Object.values(D.folds).filter(f => f.host === box).sort((a, b) => a.at - b.at);
  const noteOf = box => { let id = box, n = 0; while (D.folds[id] && n++ < 1e4) id = D.folds[id].host; return D.notes[id] ? id : null; };
  const depth = box => { let id = box, n = 0; while (D.folds[id] && n < 1e4) { id = D.folds[id].host; n++; } return n; };
  const hasWriting = box => { const bx = D.boxes[box]; return !!bx && (bx.lines.some(id => D.lines[id] && D.lines[id].text.trim()) || foldsIn(box).length > 0); };
  const title = note => { const bx = D.boxes[note]; if (!bx) return ""; for (const id of bx.lines) { const t = D.lines[id].text.trim(); if (t) return t; } return "New note"; };
  const foldName = fold => { const f = D.folds[fold] || fold; const L = f && D.lines[f.from]; const t = L ? L.text.trim() : ""; return t ? (t.length > 28 ? t.slice(0, 27) + "…" : t) : "(empty line)"; };
  const lineIndex = (bx, line) => typeof line === "number" ? (line >= 0 && line < bx.lines.length ? line : -1) : bx.lines.indexOf(line);
  const touch = box => { const n = noteOf(box); if (n) D.notes[n].updatedAt = Date.now(); };

  /* ---------- a box as it was, for Undo ---------- */
  function snapBox(box) { const bx = D.boxes[box]; return { box, lines: bx.lines.slice(), recs: bx.lines.map(id => Object.assign({}, D.lines[id])), anchors: foldsIn(box).map(f => [f.id, f.from, f.to]) }; }
  function restoreBox(s) { const bx = D.boxes[s.box]; if (!bx) return; const keep = new Set(s.lines);
    bx.lines.forEach(id => { if (!keep.has(id)) delete D.lines[id]; }); s.recs.forEach(r => { D.lines[r.id] = Object.assign({}, r); }); bx.lines = s.lines.slice();
    s.anchors.forEach(a => { const f = D.folds[a[0]]; if (f) { f.from = a[1]; f.to = a[2]; } }); }

  /* ---------- taking a fold away and putting it back: its writing is never lost ---------- */
  function detach(id) { const f = D.folds[id]; if (!f) return null; const name = foldName(f), note = noteOf(f.host); delete D.folds[id];
    const rec = { fold: f, at: Date.now(), name, note }; if (hasWriting(id)) D.removed.push(rec); return rec; }
  function attach(rec) { const f = rec.fold, bx = D.boxes[f.host]; if (!bx) fail("The place this fold came from is gone."); if (!D.boxes[f.id]) fail("This fold's writing can't be found.");
    if (bx.lines.indexOf(f.to) < 0) f.to = bx.lines[bx.lines.length - 1]; if (bx.lines.indexOf(f.from) < 0 || bx.lines.indexOf(f.from) > bx.lines.indexOf(f.to)) f.from = f.to;
    D.folds[f.id] = f; D.removed = D.removed.filter(r => r.fold.id !== f.id); touch(f.host); }
  function purgeNote(id) { const bx = D.boxes[id]; if (bx) bx.lines.forEach(l => delete D.lines[l]); delete D.boxes[id]; delete D.notes[id]; if (D.current === id) D.current = null; }

  /* ================= THE SIX ACTIONS =================
     Each takes what it NEEDS and who is doing it, and gives back a result (+ undo, when it changed something). */
  const ACTIONS = {
    /* 1. Write: puts words on a line, in a note or inside a fold.
       needs: where (the note or fold), line (which line; left out = the last line), words,
              at (where in the line; left out = its end), remove (how many letters to take out there, a line break counts as one).
       gives back: the line as it now reads (and where the caret ends up). */
    write(n, by, co) {
      const bx = D.boxes[n.where]; if (!bx) fail("That note or fold isn't there.");
      const li = n.line == null ? bx.lines.length - 1 : lineIndex(bx, n.line); if (li < 0) fail("That line isn't there.");
      const T = bx.lines.map(id => D.lines[id].text);
      let abs = 0; for (let i = 0; i < li; i++) abs += T[i].length + 1;
      abs += n.at == null ? T[li].length : Math.max(0, Math.min(T[li].length, n.at));
      const text = T.join("\n"), remove = Math.max(0, Math.min(text.length - abs, n.remove || 0)), words = String(n.words == null ? "" : n.words).replace(/\r\n?/g, "\n");
      if (!remove && !words) return { line: bx.lines[li], reads: T[li], caret: { where: n.where, line: bx.lines[li], at: abs - (text.slice(0, abs).lastIndexOf("\n") + 1) } };
      const snap = co ? null : snapBox(n.where);
      const N = (text.slice(0, abs) + words + text.slice(abs + remove)).split("\n");
      let p = 0; while (p < T.length && p < N.length && T[p] === N[p]) p++;
      let q = 0; while (q < T.length - p && q < N.length - p && T[T.length - 1 - q] === N[N.length - 1 - q]) q++;
      const oldMid = bx.lines.slice(p, T.length - q), tail = bx.lines.slice(T.length - q), newMid = [];
      N.slice(p, N.length - q).forEach((t, j) => { let id = oldMid[j];
        if (id) { if (D.lines[id].text !== t) { D.lines[id].text = t; D.lines[id].by = by; } } else id = newLine(t, by);   // a line someone types into becomes theirs
        newMid.push(id); });
      const gone = oldMid.slice(newMid.length);
      bx.lines = bx.lines.slice(0, p).concat(newMid, tail);
      if (gone.length) {            // lines that were joined away: their folds move to the line that took their words
        const near = newMid.length ? newMid[newMid.length - 1] : (p > 0 ? bx.lines[p - 1] : bx.lines[0]);
        foldsIn(n.where).forEach(f => { if (gone.indexOf(f.to) >= 0) f.to = near; if (gone.indexOf(f.from) >= 0) f.from = near;
          if (bx.lines.indexOf(f.from) > bx.lines.indexOf(f.to)) f.from = f.to; });
        gone.forEach(id => delete D.lines[id]);
      }
      let c = abs + words.length, k = 0; while (k < N.length - 1 && c > N[k].length) { c -= N[k].length + 1; k++; }
      touch(n.where);
      return { line: bx.lines[k], reads: N[k], caret: { where: n.where, line: bx.lines[k], at: c }, undo: snap ? () => { restoreBox(snap); touch(snap.box); } : null };
    },
    /* 2. Open a note: opens a note from the list, or starts a new one.   needs: note (its id, or "new") */
    open_note(n, by) {
      const prev = D.current; let id = n.note, isNew = false;
      if (id === "new") { id = "n" + uid(); isNew = true; D.notes[id] = { id, at: Date.now(), updatedAt: Date.now() }; D.boxes[id] = { id, kind: "note", lines: [newLine("", by)] }; }
      else if (!D.notes[id]) fail("That note isn't there.");
      D.current = id;
      return { note: id, where: id, line: D.boxes[id].lines[0], isNew, title: title(id),
               undo: () => { if (isNew && !hasWriting(id)) purgeNote(id); D.current = D.notes[prev] ? prev : null; } };
    },
    /* 3. Fold this line: folds a whole line, or several lines, so new writing can live inside. Folds go inside folds, without end.
       needs: where (the note or fold the lines are in), from (the line), to (the last line, when it's several) */
    fold_line(n, by) {
      const bx = D.boxes[n.where]; if (!bx) fail("That note or fold isn't there.");
      const a = lineIndex(bx, n.from), b = n.to == null ? a : lineIndex(bx, n.to); if (a < 0 || b < 0) fail("That line isn't there.");
      const id = "f" + uid(); D.boxes[id] = { id, kind: "fold", lines: [newLine("", by)] };
      D.folds[id] = { id, host: n.where, from: bx.lines[Math.min(a, b)], to: bx.lines[Math.max(a, b)], open: true, by, at: Date.now() };
      touch(n.where);
      return { fold: id, where: id, line: D.boxes[id].lines[0], undo: () => {          // an empty fold just disappears; one that holds writing by then goes to Recently removed
        detach(id); if (!hasWriting(id) && D.boxes[id]) { D.boxes[id].lines.forEach(l => delete D.lines[l]); delete D.boxes[id]; } touch(n.where); } };
    },
    /* 4. Open or close a fold.   needs: fold, open (yes or no: the end state, not "toggle") */
    open_fold(n) {
      const f = D.folds[n.fold]; if (!f) fail("That fold isn't there.");
      const was = f.open; f.open = !!n.open;
      return { fold: f.id, open: f.open, undo: was === f.open ? null : () => { if (D.folds[f.id]) D.folds[f.id].open = was; } };
    },
    /* 5. Remove a fold: takes the fold away from its line. Its writing is kept (Recently removed) and Undo brings it all back.   needs: fold */
    remove_fold(n) {
      const f = D.folds[n.fold]; if (!f) fail("That fold isn't there.");
      const host = f.host, reads = D.lines[f.to] ? D.lines[f.to].text : "", rec = detach(f.id); touch(host);
      return { line: f.to, reads, kept: hasWriting(f.id), undo: () => attach(rec) };
    },
    /* 6. Trace a fold back to its parent: note → fold → fold → … → this fold. It only looks.   needs: fold */
    trace_parent(n) {
      if (!D.folds[n.fold]) fail("That fold isn't there.");
      const path = []; let id = n.fold, guard = 0;
      while (D.folds[id] && guard++ < 1e4) { path.unshift({ fold: id, name: foldName(id) }); id = D.folds[id].host; }
      if (D.notes[id]) path.unshift({ note: id, name: title(id) });
      return { path };
    }
  };

  /* ---------- the one checkpoint every action passes ---------- */
  B.checkpoint = function (name, needs, by, grant) { return true; };     // true = go. A sentence = refused (why). { ask: … } = the writer must allow it first.
  B.before = function (note) {};                                         // told before a note changes (keep.js keeps the earlier version)
  let group = null;
  function act(name, needs, by, grant) {
    needs = needs || {};
    if (!ACTIONS[name]) return { ok: false, why: "There's no such action." };
    const pass = B.checkpoint(name, needs, by, grant);
    if (pass !== true) return pass && pass.ask ? { ok: false, ask: pass.ask, why: "This needs your OK first." } : { ok: false, why: typeof pass === "string" ? pass : "That isn't allowed." };
    if (name === "write" || name === "fold_line" || name === "remove_fold") { const nt = name === "remove_fold" ? (D.folds[needs.fold] && noteOf(D.folds[needs.fold].host)) : noteOf(needs.where); if (nt) { try { B.before(nt); } catch (e) {} } }
    const now = Date.now(), last = undos[undos.length - 1];
    // steady typing in one place is one step to undo
    const co = !group && name === "write" && last && !last.group && last.name === "write" && last.where === needs.where && last.by === by && now - last.t < 1500 && now - last.t0 < 20000 && !/\n/.test(needs.words || "") && !last.sealed;
    let out; try { out = ACTIONS[name](needs, by, co); } catch (e) { if (e.plain) return { ok: false, why: e.message }; throw e; }
    if (co) last.t = now;
    else if (out.undo) { const u = { name, where: needs.where, by, t: now, t0: now, undo: out.undo, sealed: name === "write" && /\n/.test(needs.words || "") };
      if (group) group.list.push(u); else { undos.push(u); if (undos.length > 200) undos.shift(); } }
    delete out.undo; out.ok = true;
    save(); emit({ type: "action", name, needs, by, result: out });
    return out;
  }
  B.act = (name, needs) => act(name, needs, "me");                       // the writer's hand
  let handed = false;
  B.breath = function () { if (handed) throw new Error("The breath's hand was already given out."); handed = true; return (name, needs, grant) => act(name, needs, "ai", grant); };
  /* One reply of the breath = one Undo: everything between begin and end is taken back together. */
  B.begin = function (tag) { if (!group) group = { tag, list: [] }; };
  B.end = function () { const gp = group; group = null; if (!gp || !gp.list.length) return 0;
    undos.push({ name: "reply", group: gp.tag, by: "ai", t: Date.now(), t0: 0, sealed: true, n: gp.list.length, undo: () => { for (let i = gp.list.length - 1; i >= 0; i--) gp.list[i].undo(); } }); return gp.list.length; };
  B.groupDepth = tag => { for (let i = undos.length - 1; i >= 0; i--) if (undos[i].group === tag) return undos.length - 1 - i; return -1; };   // how many later steps sit on top of that reply (-1: it's gone)
  /* Undo: one tap takes back the last thing done (by anyone). */
  B.undo = function () { const u = undos.pop(); if (!u) return null; u.undo(); save(); emit({ type: "undo", name: u.name, by: u.by, group: u.group }); return { name: u.name, where: u.where, group: u.group }; };
  B.canUndo = () => undos.length > 0;
  B.sealUndo = () => { const l = undos[undos.length - 1]; if (l) l.sealed = true; };
  B.clearUndo = () => { undos.length = 0; };
  /* A fold from Recently removed goes back where it was (the Undo rule, kept across closing the book). */
  B.putBack = function (foldId) { const rec = D.removed.find(r => r.fold.id === foldId); if (!rec) return { ok: false, why: "That fold isn't in Recently removed." };
    try { attach(rec); } catch (e) { return { ok: false, why: e.message }; } save(); emit({ type: "putback" }); return { ok: true, note: noteOf(rec.fold.host), fold: foldId }; };
  /* Housekeeping, like Apple Notes: a note left empty disappears. */
  B.tidy = function (keep) { let n = 0; Object.keys(D.notes).forEach(id => { if (id !== keep && !hasWriting(id)) { purgeNote(id); n++; } }); if (n) save(); return n; };
  /* ---------- whole notes, lifted out and set in (for earlier versions, sync and export; not actions) ---------- */
  function reach(note) { const boxes = new Set([note]); let more = true; const rem = (D.removed || []).filter(r => r.note === note); rem.forEach(r => boxes.add(r.fold.id));
    while (more) { more = false; Object.values(D.folds).forEach(f => { if (boxes.has(f.host) && !boxes.has(f.id)) { boxes.add(f.id); more = true; } }); }
    return { boxes, rem }; }
  B.cut = function (note) { if (!D.notes[note]) return null; const r = reach(note), out = { v: 1, note: D.notes[note], boxes: {}, lines: {}, folds: {}, removed: r.rem };
    r.boxes.forEach(id => { const bx = D.boxes[id]; if (!bx) return; out.boxes[id] = bx; bx.lines.forEach(l => { out.lines[l] = D.lines[l]; }); if (D.folds[id]) out.folds[id] = D.folds[id]; });
    return JSON.parse(JSON.stringify(out)); };
  function drop(note) { const r = reach(note); r.boxes.forEach(id => { const bx = D.boxes[id]; if (bx) bx.lines.forEach(l => delete D.lines[l]); delete D.boxes[id]; delete D.folds[id]; });
    D.removed = D.removed.filter(x => x.note !== note); delete D.notes[note]; }
  B.graft = function (piece) {            // a note as another device has it takes this note's place (the caller keeps the earlier version first)
    piece = JSON.parse(JSON.stringify(piece)); const id = piece.note.id; if (D.notes[id]) drop(id);
    D.notes[id] = piece.note; Object.assign(D.boxes, piece.boxes); Object.assign(D.lines, piece.lines); Object.assign(D.folds, piece.folds); (piece.removed || []).forEach(r => D.removed.push(r));
    undos.length = 0; save(); emit({ type: "replace", note: id }); };
  B.copyIn = function (piece, mark) {      // an earlier version comes back as a NEW note beside the one you have: nothing is written over
    const map = {}, m = id => map[id] || (map[id] = id[0] + uid()), p = JSON.parse(JSON.stringify(piece)), now = Date.now();
    const nid = m(p.note.id); D.notes[nid] = { id: nid, at: now, updatedAt: now };
    Object.keys(p.boxes).forEach(id => { const bx = p.boxes[id]; D.boxes[m(id)] = { id: m(id), kind: bx.kind, lines: bx.lines.map(m) }; });
    Object.keys(p.lines).forEach(id => { D.lines[m(id)] = Object.assign({}, p.lines[id], { id: m(id) }); });
    Object.keys(p.folds).forEach(id => { const f = p.folds[id]; D.folds[m(id)] = Object.assign({}, f, { id: m(id), host: m(f.host), from: m(f.from), to: m(f.to) }); });
    if (mark) { const first = D.boxes[nid].lines[0]; if (first) D.lines[first].text = (D.lines[first].text + " " + mark).trim(); }
    save(); emit({ type: "replace", note: nid }); return nid; };
  B.textOf = function (box, pad) { pad = pad || ""; const bx = D.boxes[box]; if (!bx) return ""; const out = [];      // a note as plain words, folds indented under their line
    bx.lines.forEach(l => { out.push(pad + D.lines[l].text); foldsIn(box).filter(f => f.to === l).forEach(f => { out.push(B.textOf(f.id, pad + "    ")); }); }); return out.join("\n"); };
  B.notes = () => Object.values(D.notes).sort((a, b) => b.updatedAt - a.updatedAt);
  B.replace = function (data) { D = JSON.parse(JSON.stringify(data)); undos.length = 0; save(); };
  B.on = fn => subs.push(fn);
  B.flush = flush;
  Object.defineProperty(B, "D", { get: () => D });
  Object.assign(B, { foldsIn, noteOf, depth, hasWriting, title, foldName, actions: Object.keys(ACTIONS) });
  return B;
}
g.makeBook = makeBook;
if (typeof module !== "undefined" && module.exports) module.exports = { makeBook };
})(typeof window !== "undefined" ? window : globalThis);
