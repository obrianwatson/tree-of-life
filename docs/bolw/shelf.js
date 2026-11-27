/* shelf.js · THE SHELF: what sits around the writing without being the writing.
   Projects (a name, their own instructions, which notes belong), chats (history, drafts), the "How BOLW works"
   instructions that go with every chat, and the breath's settings (model, riverbanks).
   None of this changes your words, so none of it is a joint: the six actions stay six.
   Deleted chats and projects are only marked deleted, so they can be brought back. */
(function (g) {
"use strict";
const { K, lsGet, lsSet } = g.Keep;
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const HOW = `You are the breath inside the Book of Living Waters (BOLW), one writer's own book. He is a writer and songwriter. He calls writing "to enscribe oneself into life".

What BOLW is: a book made of text. Notes hold lines. Any line can be folded, so more writing lives inside it, and folds go inside folds without end. Folding gives the text depth; you give it life. Both exist so the book can meet its author. It serves songwriting, journaling and scripture memorization.

How to be here:
- Speak plainly and briefly, like a good editor sitting beside him. No headings or bullet lists unless he asks.
- His words are his. Add your own writing only when he asks you to write, and put it inside a fold or on new lines rather than over his lines.
- Before you act on the note, read it. Say in a few words what you did after you did it.
- You can only act on the note that is open, and only when he asks.`;
function fresh() { const now = Date.now(), mk = name => { const id = "p" + uid(); return { id, name, instructions: "", at: now, updatedAt: 0 }; }, P = {};
  [mk("Songs"), mk("Journal"), mk("Scripture")].forEach((p, i) => { p.at = now + i; P[p.id] = p; });
  P[Object.keys(P)[0]].instructions = "This project is for songs. Think in lines, images, rhyme and rhythm. Offer options rather than finished verses unless asked.";
  P[Object.keys(P)[1]].instructions = "This project is my journal. Listen first. Ask one good question rather than giving advice, unless I ask for advice.";
  P[Object.keys(P)[2]].instructions = "This project is for scripture I am learning by heart. Quote scripture exactly (King James Version unless I say otherwise) and never paraphrase it as if it were the text.";
  return { v: 1, projects: P, noteProject: {}, chats: {}, how: { text: HOW, updatedAt: 0 }, set: { model: "", thisNoteOnly: true, askFirst: true, updatedAt: 0 }, current: null }; }
let S = lsGet(K.shelf); if (!S || S.v !== 1) S = fresh();
const subs = []; let t = null, kept = true;
const flush = () => { clearTimeout(t); t = null; kept = lsSet(K.shelf, S); };
const save = quiet => { if (!t) t = setTimeout(flush, 250); if (!quiet) subs.forEach(fn => { try { fn(); } catch (e) {} }); };
const live = o => Object.values(o).filter(x => !x.deleted);
const Shelf = {
  get S() { return S; }, get kept() { return kept; }, HOW, flush, save, on: fn => subs.push(fn),
  replace(d) { S = d; save(true); },
  /* projects */
  projects: () => live(S.projects).sort((a, b) => a.at - b.at),
  project: id => (S.projects[id] && !S.projects[id].deleted) ? S.projects[id] : null,
  newProject(name) { const id = "p" + uid(), now = Date.now(); S.projects[id] = { id, name: name || "New project", instructions: "", at: now, updatedAt: now }; save(); return S.projects[id]; },
  setProject(id, ch) { const p = S.projects[id]; if (!p) return; Object.assign(p, ch, { updatedAt: Date.now() }); save(); },
  projectOf: note => { const r = S.noteProject[note]; return r && r.p && Shelf.project(r.p) ? r.p : null; },
  putNote(note, proj) { S.noteProject[note] = { p: proj || null, updatedAt: Date.now() }; save(); },
  /* chats */
  chats(q) { q = (q || "").trim().toLowerCase(); return live(S.chats).filter(c => c.msgs.length || c.draft).filter(c => !q || (c.title || "").toLowerCase().indexOf(q) >= 0 || c.msgs.some(m => ((m.text || "") + (m.parts || []).map(p => p.text || "").join(" ")).toLowerCase().indexOf(q) >= 0)).sort((a, b) => b.updatedAt - a.updatedAt); },
  deleted: () => Object.values(S.chats).filter(c => c.deleted && c.msgs.length).sort((a, b) => b.deleted - a.deleted),
  chat: id => S.chats[id] || null,
  newChat(project, note) { const id = "c" + uid(), now = Date.now(); S.chats[id] = { id, title: "", project: project || null, note: note || null, attach: [], model: "", at: now, updatedAt: now, draft: "", msgs: [] }; S.current = id; save(); return S.chats[id]; },
  touch(c, quiet) { c.updatedAt = Date.now(); save(quiet); },
  rename(id, title) { const c = S.chats[id]; if (c) { c.title = title; c.named = true; Shelf.touch(c); } },
  remove(id) { const c = S.chats[id]; if (c) { c.deleted = Date.now(); c.updatedAt = Date.now(); if (S.current === id) S.current = null; save(); } },
  bringBack(id) { const c = S.chats[id]; if (c) { delete c.deleted; c.updatedAt = Date.now(); save(); } },
  setHow(text) { S.how = { text, updatedAt: Date.now() }; save(); },
  set(ch) { Object.assign(S.set, ch, { updatedAt: Date.now() }); save(); }
};
addEventListener("pagehide", flush); document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
g.Shelf = Shelf;
})(window);
