/* The pieces of Trial #01 · Book Phase. Each piece turns on a little more of the same body (flags),
   starts from its own sample (seed), and has a short test: tasks with "Show me" (a finger doing it through the same layer). */
(function () {
"use strict";
const PSALM = "Psalm 23\nThe Lord is my shepherd; I shall not want.\nHe maketh me to lie down in green pastures:\nhe leadeth me beside the still waters.\nHe restoreth my soul.";
const note = (B, text) => { const r = B.act("open_note", { note: "new" }); B.act("write", { where: r.where, words: text }); return r.where; };
const fold = (B, where, a, b, text, open) => { const bx = B.D.boxes[where], r = B.act("fold_line", { where, from: bx.lines[a], to: bx.lines[b == null ? a : b] }); if (text) B.act("write", { where: r.where, words: text }); if (open === false) B.act("open_fold", { fold: r.fold, open: false }); return r.fold; };
const three = B => { const a = note(B, "Groceries\nRice\nBeans\nCoffee"), b = note(B, "Song idea\nA river that remembers every stone it passed."), c = note(B, PSALM); const t = Date.now();
  B.D.notes[a].updatedAt = t - 3 * 864e5; B.D.notes[b].updatedAt = t - 36e5; B.D.notes[c].updatedAt = t; return { a, b, c }; };
const ALL = { notes: 1, fold: 1, deep: 1, overlap: 1, remove: 1, clock: 1 };
const toList = async f => { if (f.view() !== "list") await f.notes(); };
const P = {};
P["1a"] = { title: "Writing in one note", flags: {}, seed: B => note(B, PSALM), tasks: [
  { t: "Open and write", d: "Tap at the very end of the text and write a few lines of your own. Use Return for new lines.", n: "Notice: did the keyboard and the blinking cursor come up the moment you tapped? Is the cursor exactly where you tapped?",
    show: async f => { await f.caret(f.find("restoreth")); await f.type("\nMy own line, written at the end."); } },
  { t: "The cursor", d: "Tap in the middle of a word and add a few letters. Then tap between two words and add a word.", n: "Notice: does the cursor land between the exact letters you aimed for? Is anything jumpy or slow?",
    show: async f => { let s = f.find("shepherd"); await f.caret(s, f.B.D.lines[s.line].text.indexOf("shepherd") + 4); await f.type("-", 400); s = f.find("green"); await f.caret(s, f.B.D.lines[s.line].text.indexOf("green")); await f.type("soft "); } },
  { t: "Always in view", d: "Keep writing new lines at the end until your writing reaches the keyboard, and keep going.", n: "Notice: is the line you're typing always visible above the keyboard and the bar? Does the page move smoothly?",
    show: async f => { await f.caret(f.find("restoreth")); for (let i = 1; i <= 7; i++) await f.type("\nLine " + i + " of a long passage that keeps going", 22); } },
  { t: "Undo", d: "Write a line you don't want. Tap Undo in the bar.", dLaptop: "Write a line you don't want. Click Undo in the bar at the top, or press ⌘Z / Ctrl+Z.", n: "Notice: does the line go back to how it read before? Steady typing is undone as one step.",
    show: async f => { await f.caret(f.find("restoreth")); await f.type("\nA line I regret."); await f.undo(); } },
  { t: "Always kept", d: "Close this page completely (swipe it away, or close the tab), then open the link again.", n: "Notice: is every word still there? You should land on the line you left off on, and it glows for a moment. (The iPhone only raises the keyboard when you tap.) There is no save button anywhere.",
    show: async f => { await f.away(); } },
  { t: "Send your answers", d: "That's piece 1a. Check your answers below, then send them. Then just tell Claude “done.”", n: "" }] };
P["1b"] = { title: "The list of notes", flags: { notes: 1 }, startList: true, seed: three, tasks: [
  { t: "The list", d: "Tap a note to open it. Tap ‹ Notes (top left) to come back.", n: "Notice: newest on top; the first line is the title. When you come back to a note, are you where you left off?",
    show: async f => { await toList(f); const n = f.B.notes(); await f.open(n[1].id); await f.sleep(700); await f.notes(); } },
  { t: "New note", d: "Tap New note and write a first line, then a second. Go back to the list.", n: "Notice: did the keyboard come up at once? Your first line became the title, with no naming step.",
    show: async f => { await toList(f); await f.newNote(); await f.type("A new song\nfirst words of the verse"); await f.notes(); } },
  { t: "Empty notes vanish, edited notes rise", d: "Tap New note, write nothing, go back: it's gone. Then open the oldest note, add a word, and go back.", n: "Notice: the note you just touched is now on top.",
    show: async f => { await toList(f); await f.newNote(); await f.sleep(500); await f.notes(); const n = f.B.notes(); await f.open(n[n.length - 1].id); await f.caret(f.find("Coffee")); await f.type("\nBread"); await f.notes(); } },
  { t: "Search", d: "In the list, type a word into Search.", n: "Notice: only notes with that word stay. One more thing: Undo right after opening a note takes you back to the note before." },
  { t: "Send your answers", d: "That's piece 1b. Check your answers below, then send them. Then just tell Claude “done.”", n: "" }] };
P["1c"] = { title: "Making a fold", flags: { notes: 1, fold: 1 }, seed: B => { three(B); }, tasks: [
  { t: "Fold a line", d: "Tap anywhere in a line. Tap Fold in the bar above the keyboard. Write inside the fold.", dLaptop: "Click anywhere in a line. Click Fold in the bar at the top (or press Tab). Write inside the fold.",
    n: "Notice: no highlighting needed, so Apple's Copy/Paste menu never shows up. The fold opens right under the line, with the cursor inside. The line gets a thin underline and a ▾ at its end.",
    show: async f => { await f.caret(f.find("my shepherd")); await f.fold(); await f.type("A shepherd guides, feeds and guards his sheep."); } },
  { t: "Fold several lines", d: "Highlight from one line into the next (press and hold a word, then drag the handle down). The button says “Fold 2 lines”. Tap it.", dLaptop: "Drag a highlight across two or more lines. The button says “Fold 2 lines”. Click it (or press Tab).",
    n: "Notice: the fold takes every line the highlight touches, and opens under the last one. Is the button easy to reach while Apple's menu is showing?",
    show: async f => { await f.select(f.find("green pastures"), f.find("still waters")); await f.fold(); await f.type("Rest, and quiet water."); } },
  { t: "What's held back for now", d: "Try to fold a line that already has a fold. Try to fold a line inside a fold.", n: "Notice: both are refused with one plain sentence. They arrive in pieces 1f and 1e. Is the sentence clear?" },
  { t: "Send your answers", d: "That's piece 1c. Check your answers below, then send them. Then just tell Claude “done.”", n: "" }] };
P["1d"] = { title: "The hinge", flags: { notes: 1, fold: 1 }, seed: B => { const n = three(B); fold(B, n.c, 1, 1, "A shepherd guides, feeds and guards his sheep.\nHe walks ahead of them.", false); }, tasks: [
  { t: "Open and close", d: "Tap the ▸ at the end of the underlined line. Tap the ▾ to close it again.", n: "Notice: is the hinge easy to hit with your thumb? Does the fold open right under its line, and close without anything jumping?",
    show: async f => { const x = f.folds(f.B.D.current)[0]; await f.hinge(x.id); await f.hinge(x.id); } },
  { t: "The thread", d: "Open the fold. Tap the colored line running down its left side.", n: "Notice: the thread closes the fold too. Handy when the hinge has scrolled off the top.",
    show: async f => { const x = f.folds(f.B.D.current)[0]; if (!x.open) await f.hinge(x.id); await f.thread(x.id); } },
  { t: "Reading and writing", d: "With the keyboard down, tap the hinge: the keyboard should stay down. Then tap inside the open fold, write, and close it with the ▾.", dLaptop: "Click inside the open fold, write, then press Esc.",
    n: "Notice: closing a fold you're writing in leaves the cursor waiting at the end of its line, right by the hinge." },
  { t: "From the ⌄ menu", d: "Tap in the underlined line, tap ⌄ in the bar, and choose Open or Close.", n: "Notice: the menu names the fold by its line's first words.",
    show: async f => { await f.caret(f.find("my shepherd")); await f.menu("Open"); await f.menu("Close"); } },
  { t: "Send your answers", d: "That's piece 1d. Check your answers below, then send them. Then just tell Claude “done.”", n: "" }] };
P["1e"] = { title: "Infinite folds, and tracing back", flags: { notes: 1, fold: 1, deep: 1 }, seed: B => { const n = three(B), a = fold(B, n.c, 1, 1, "A shepherd guides, feeds and guards his sheep.\nHe walks ahead of them."); fold(B, a, 0, 0, "He knows each one by name."); }, tasks: [
  { t: "Fold inside a fold, and keep going", d: "Tap the innermost line and tap Fold. Write a few words. Fold that line too. Go at least six folds deep.", n: "Notice: is it always clear which fold is inside which?",
    show: async f => { await f.caret(f.find("by name")); await f.fold(); await f.type("Each name is a story."); await f.fold(); await f.type("Each story has a root."); await f.fold(); await f.type("And the root drinks."); } },
  { t: "Threads", d: "Look at the colored lines on the left: one color per depth. Tap a thread near the top.", n: "Notice: on the iPhone the indent stops growing after four levels and only the color changes, so your words keep their room. Is four the right number? Tapping a thread closes that fold and everything inside it.",
    show: async f => { const x = f.folds(f.B.D.current)[0]; await f.thread(x.id); await f.hinge(x.id); } },
  { t: "Trace back", d: "Tap a line deep inside. Tap ⌄ in the bar, then Trace back. Tap a name in the path. Then keep writing.", dLaptop: "Click a line deep inside, then ⌄ → Trace back (or ⌘-click / Ctrl-click the line). Click a name in the path. Then keep writing.",
    n: "Notice: the path reads Note › fold › fold. Tapping a name jumps to it and flashes it. The path disappears as soon as you write.",
    show: async f => { await f.caret(f.find("by name")); await f.menu("Trace back"); await f.sleep(900); await f.crumb(1); } },
  { t: "Send your answers", d: "That's piece 1e. Check your answers below, then send them. Then just tell Claude “done.”", n: "" }] };
P["1f"] = { title: "Overlapping folds", flags: { notes: 1, fold: 1, deep: 1, overlap: 1 }, seed: B => { const n = three(B); fold(B, n.c, 1, 2, "Trust, and rest.", false); }, tasks: [
  { t: "Overlap", d: "Lines 2 and 3 already share a fold. Now highlight from line 3 into line 4 and tap Fold.", n: "Notice: line 3 now belongs to both folds. Each fold has its own underline (solid, then dotted) and its own hinge at the end of its own last line.",
    show: async f => { await f.select(f.find("green pastures"), f.find("still waters")); await f.fold(); await f.type("Rest, and quiet water."); } },
  { t: "Two folds on one line", d: "Tap in line 2 (“The Lord is my shepherd…”) and tap Fold.", n: "Notice: a line can carry more than one fold. Each has its own hinge.",
    show: async f => { await f.caret(f.find("my shepherd")); await f.fold(); await f.type("Mine, not only everyone's."); } },
  { t: "Telling them apart", d: "Open and close each fold. Then tap a shared line and tap ⌄: every fold on that line is listed by name.", n: "Notice: can you always tell which hinge opens what? One limit: to highlight across a line that has an open fold under it, close that fold first." },
  { t: "Send your answers", d: "That's piece 1f. Check your answers below, then send them. Then just tell Claude “done.”", n: "" }] };
P["1g"] = { title: "Remove a fold, and Undo", flags: { notes: 1, fold: 1, deep: 1, overlap: 1, remove: 1 }, seed: B => { const n = three(B), a = fold(B, n.c, 1, 1, "A shepherd guides, feeds and guards his sheep."); fold(B, a, 0, 0, "He knows each one by name."); }, tasks: [
  { t: "Remove a fold, then Undo", d: "Tap the underlined line. Tap ⌄, then Remove fold. Then tap Undo.", n: "Notice: the fold leaves, and Undo brings it back with everything inside it, folds and all.",
    show: async f => { await f.caret(f.find("my shepherd")); await f.menu("Remove fold"); await f.undo(); } },
  { t: "Undo anything, step by step", d: "Write a line, fold it, write inside, close the fold. Now tap Undo several times.", n: "Notice: each tap takes back one thing, newest first.",
    show: async f => { await f.caret(f.find("restoreth")); await f.type("\nA new line."); await f.fold(); await f.type("Inside."); await f.undo(); await f.undo(); await f.undo(); } },
  { t: "Never lost", d: "Remove the fold again. Close this page completely and open it again. Tap ‹ Notes: under “Recently removed folds”, tap Put back.", n: "Notice: a removed fold that holds writing is always kept, even after the page was closed.",
    show: async f => { await f.caret(f.find("my shepherd")); const id = f.folds(f.B.D.current)[0].id; await f.menu("Remove fold"); await f.notes(); await f.putBack(id); } },
  { t: "Send your answers", d: "That's piece 1g. Check your answers below, then send them. Then just tell Claude “done.”", n: "" }] };
P["1h"] = { title: "The clock and Hold", flags: ALL, seed: B => { three(B); }, tasks: [
  { t: "Typing counts", d: "Write for a little while and watch the clock at the top. Then stop.", n: "Notice: ● while you write. A pause of up to 5 seconds still counts; after that it stops (○) at your last key." },
  { t: "Hold", d: "Stop typing. Press and hold the round Hold button at the right of the bar while you think.", dLaptop: "Stop typing. Hold the Option key (or press and hold the Hold button) while you think.", n: "Notice: the clock counts for as long as you hold, and stops when you let go. Each second counts once." },
  { t: "Yours alone", d: "Tap Show me and watch the clock while the finger types.", n: "Notice: the clock doesn't move. Only your own typing and your own Hold add time.",
    show: async f => { await f.caret(f.find("restoreth")); await f.type("\nThese words are typed by the demo, not by you."); await f.fold(); await f.type("So the clock stays still."); } },
  { t: "Send your answers", d: "That's piece 1h, the last one. Check your answers below, then send them. Then just tell Claude “done.”", n: "" }] };
P["book"] = { title: "The whole Book Phase", flags: ALL, startList: true, seed: B => { three(B); }, tasks: [
  { t: "The full test", d: "Everything from pieces 1a to 1h together. Use it for real: write your own notes, fold them as deep as you like, close it, come back.", n: "Tell Claude anything you had to work around. This page keeps what you write (on this device only, apart from your real book)." }] };
Object.keys(P).forEach(k => { P[k].id = k; });
window.PIECES = P;
})();
