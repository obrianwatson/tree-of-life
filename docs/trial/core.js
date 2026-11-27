/* The body's joints: ONE shared action layer for the Book Phase (Trial #01).
   The six actions of the Six-Action Card live here and nowhere else:
     write · open_note · fold_line · open_fold · remove_fold · trace_parent
   Every button, menu and key calls Book.act(name, needs). Nothing else changes the book.
   - Every action passes ONE checkpoint first (Book.checkpoint). For now it lets everything through.
     Later the AI's riverbanks plug in there (Book.banks is the list they will read).
   - Every action that changes something gives back how to undo it. Undo is a rule, not an action.
   - The book remembers who wrote each line ("by": "me" for now) and who made each fold.
   - Hold and the writing clock are NOT here: they belong to the writer alone.
   No screen code in this file: it runs the same under a finger, a test, or (later) the breath.

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
  const save = () => { if (!saveT) saveT = setTimeout(flush, 150); };

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
  B.checkpoint = function (name, needs, by) { return true; };     // for now: everything through. Give back a sentence (why not) to refuse.
  B.act = function (name, needs, by) {
    by = by || "me"; needs = needs || {};
    if (!ACTIONS[name]) return { ok: false, why: "There's no such action." };
    const pass = B.checkpoint(name, needs, by);
    if (pass !== true) return { ok: false, why: typeof pass === "string" ? pass : "That isn't allowed." };
    const now = Date.now(), last = undos[undos.length - 1];
    // steady typing in one place is one step to undo
    const co = name === "write" && last && last.name === "write" && last.where === needs.where && last.by === by && now - last.t < 1500 && now - last.t0 < 20000 && !/\n/.test(needs.words || "") && !last.sealed;
    let out; try { out = ACTIONS[name](needs, by, co); } catch (e) { if (e.plain) return { ok: false, why: e.message }; throw e; }
    if (co) last.t = now;
    else if (out.undo) { undos.push({ name, where: needs.where, by, t: now, t0: now, undo: out.undo, sealed: name === "write" && /\n/.test(needs.words || "") }); if (undos.length > 200) undos.shift(); }
    delete out.undo; out.ok = true;
    save(); emit({ type: "action", name, needs, by, result: out });
    return out;
  };
  /* Undo: one tap takes back the last thing done (by anyone). */
  B.undo = function () { const u = undos.pop(); if (!u) return null; u.undo(); save(); emit({ type: "undo", name: u.name, by: u.by }); return { name: u.name, where: u.where }; };
  B.canUndo = () => undos.length > 0;
  B.sealUndo = () => { const l = undos[undos.length - 1]; if (l) l.sealed = true; };
  B.clearUndo = () => { undos.length = 0; };
  /* A fold from Recently removed goes back where it was (the Undo rule, kept across closing the book). */
  B.putBack = function (foldId) { const rec = D.removed.find(r => r.fold.id === foldId); if (!rec) return { ok: false, why: "That fold isn't in Recently removed." };
    try { attach(rec); } catch (e) { return { ok: false, why: e.message }; } save(); emit({ type: "putback" }); return { ok: true, note: noteOf(rec.fold.host), fold: foldId }; };
  /* Housekeeping, like Apple Notes: a note left empty disappears. */
  B.tidy = function (keep) { let n = 0; Object.keys(D.notes).forEach(id => { if (id !== keep && !hasWriting(id)) { purgeNote(id); n++; } }); if (n) save(); return n; };
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
