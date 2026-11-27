/* banks.js · THE RIVERBANKS: what the breath (the AI) may and may not do.
   They sit at the one checkpoint every action passes (joints.js). Your own hand always passes.
   Starting banks (open settings on the shelf; you can change them, and later lock them):
     1. Only when asked: the breath can act only while it is answering a message you sent.
     2. Only the note that's open (thisNoteOnly).
     3. Asks first (askFirst): before changing or removing YOUR words, or removing a fold, you get a card
        with before and after, and Allow / Don't. Adding words is free. Changing its own unedited lines is free.
   An OK from you is a one-time pass for exactly that action; the breath cannot make one itself. */
(function (g) {
"use strict";
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const Banks = { replying: false };
const passes = new Map();
const keyOf = (name, needs) => name + " " + JSON.stringify(needs);
Banks.allow = function (name, needs) { const p = Math.random().toString(36).slice(2); passes.set(keyOf(name, needs), p); return p; };      // called only by the Allow button
Banks.attach = function (B, Shelf) {
  B.checkpoint = function (name, needs, by, grant) {
    if (by === "me") return true;
    const D = B.D, set = Shelf.S.set;
    if (!Banks.replying) return "The breath only acts when you ask it to.";
    let note = null;
    if (name === "open_note") { if (set.thisNoteOnly) return "I can only work in the note that's open. Open the other note yourself and ask me there."; return true; }
    if (name === "open_fold" || name === "remove_fold" || name === "trace_parent") { const f = D.folds[needs.fold]; if (!f) return true; note = B.noteOf(f.host); }
    else { if (!D.boxes[needs.where]) return true; note = B.noteOf(needs.where); }
    if (set.thisNoteOnly && note !== D.current) return "I can only work in the note that's open. Open the other note yourself and ask me there.";
    if (!set.askFirst) return true;
    let ask = null;
    if (name === "remove_fold") { const f = D.folds[needs.fold]; ask = { title: "Remove the fold on “" + B.foldName(f.id) + "”?", before: B.hasWriting(f.id) ? clip(B.textOf(f.id), 400) : "(the fold is empty)", after: "The fold is taken off its line. Its writing is kept under Recently removed.", note: "" }; }
    else if (name === "write" && (needs.remove || 0) > 0) {
      const bx = D.boxes[needs.where], T = bx.lines.map(id => D.lines[id].text), li = needs.line == null ? T.length - 1 : (typeof needs.line === "number" ? needs.line : bx.lines.indexOf(needs.line));
      if (li >= 0) { let abs = 0; for (let i = 0; i < li; i++) abs += T[i].length + 1; abs += needs.at == null ? T[li].length : Math.max(0, Math.min(T[li].length, needs.at));
        const text = T.join("\n"), end = Math.min(text.length, abs + needs.remove), a = text.slice(0, abs).split("\n").length - 1, b = text.slice(0, end).split("\n").length - 1;
        const mine = bx.lines.slice(a, b + 1).some(id => D.lines[id].by === "me" && D.lines[id].text.trim());
        if (mine) { const ls = text.lastIndexOf("\n", abs - 1) + 1; let le = text.indexOf("\n", end); if (le < 0) le = text.length;
          const before = text.slice(ls, le), after = text.slice(ls, abs) + (needs.words || "") + text.slice(end, le);
          ask = { title: after.trim() ? "Change your words?" : "Remove your words?", before: clip(before, 400), after: after.trim() ? clip(after, 400) : "(removed)" }; } }
    }
    if (!ask) return true;
    const k = keyOf(name, needs); if (grant && passes.get(k) === grant) { passes.delete(k); return true; }
    return { ask };
  };
};
g.Banks = Banks;
})(window);
