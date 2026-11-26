# The Book of Living Waters (BOLW): Full Specification

Status as of 2026-11-26. This is the authoritative description of what the app is, how it must behave, and what is live, in progress, or planned. Any AI or person changing the app must read this, `CLAUDE.md`, `ROADMAP.md` and `TESTING.md` first. Where this file and the code disagree, raise it with the owner instead of guessing.

---

## 0. How to use this document (for AI builders)

1. Treat every **MUST** as a hard requirement and every **SHOULD** as a strong default you may change only with a stated reason.
2. Never break an invariant in §3. If a request seems to require it, stop and ask the owner.
3. Work in small, testable phases. After each phase, run the full test suite (`tests/`), fix failures, then commit and publish. Never leave `main` broken.
4. Additive data changes only (§6). Old data must always load.
5. Explain results to the owner in plain words: what changed, what to try, what's not done. The owner is a writer, not a programmer.
6. When a choice is genuinely the owner's (taste, cost, privacy, irreversible actions), ask with 2–4 concrete options and a recommendation.

---

## 1. Purpose and vision

- **Definition of writing (owner's own):** "to enscribe oneself into life." Keep the spelling *enscribe*.
- **What BOLW is:** a book of text whose every part can fold into, around and beside every other part, plus a writing clock that honors real creative time, plus a memory system that turns the book into a memory palace, with Claude living inside as its active intelligence.
- **The metaphor:** BOLW is the vessel; Claude is the breath of life in it. Interacting with the app should feel like interacting with a living, reshapeable book. Changes happen in place, finely, and are always undoable.
- **The sandbox principle:** a small set of strong building blocks (**nodes/folds**), **actions** (hide, show, prompt, type, review, grade, generate, schedule, link, nest), and **recipes** (sequences of actions, e.g. drills). Humans and AI combine these without limit. New blocks and actions can be added by Claude (add-ons, onboard code).
- **Name and look:** "Book of Living Waters" (Home Screen label "Living Waters"). The logo is a baobab tree rooted in a pool of living water, with a stream flowing behind and around it (`docs/logo.svg`).

---

## 2. Owner, devices, constraints

| Device | Role | Constraints |
|---|---|---|
| iPhone 16e | Main | Safari Home Screen web app; on-screen keyboard; thumb button must sit above the keyboard |
| MacBook Pro 13" Late 2011, macOS Catalina 10.15.7 | Main | Firefox only (Chrome stuck at 128); slow GPU/CPU (heavy sites freeze it); hold key = Option |
| Shadow PC (cloud Windows) | Helper | For heavy websites and command-line tasks |
| iPad 6th gen + Apple Pencil 1 | ON HOLD | Native iPad app exists; Pencil broken |

- **Subscriptions:** Claude Max (includes monthly API credits via a linked Claude Console organization, usable with an API key in the app), ChatGPT, Venice AI.
- **Accounts:** GitHub `obrianwatson`, repo `tree-of-life` (public; holds code only, never readable writing).
- **Build environment limits:** no npm/pip downloads in the cloud workspace, so libraries must be hand-written or loaded from CDNs at runtime (and cached for offline use).

---

## 3. Invariants (MUST never break)

1. **Never lose the owner's text.** No operation may delete text without explicit confirmation. Conflicts keep both versions. Deleted anchors leave folds "unattached", never deleted. Every Claude/AI change is undoable as one group.
2. **Privacy.** Writing leaves the device only (a) end-to-end encrypted for sync, or (b) sent to the AI provider the owner configured, for the specific feature used. Nothing readable about writing (text, titles, counts, device names) is ever written to GitHub.
3. **Keys stay local.** The AI key, GitHub key and sync key are stored only on the device. They are never synced, logged, shown again after saving, or reachable by add-ons or previews.
4. **Writing clock integrity** (§7). AI activity never adds time. Each second counts once.
5. **Sync format is sacred.** Never rename/remove `tol-vault`, `tol-sealed`, the check string `tree-of-life`, or existing fields. Only add.
6. **Offline-first.** Everything except AI calls and GitHub actions works offline after first load.
7. **Safety boxes.** Add-ons and previews run isolated and cannot read keys or permanently alter real data except through the app's own undoable action layer with owner approval.
8. **Owner control.** Anything that costs money, publishes, deletes, or changes code requires a visible Keep/Approve.

---

## 4. Architecture

- **Web app** in `docs/` (plain HTML/CSS/JS, no framework), published by GitHub Pages workflow `.github/workflows/pages.yml` to `https://obrianwatson.github.io/tree-of-life/`. A service worker (`docs/sw.js`) caches the app for offline use; bump its cache name on every release.
- **Modules (current):** `index.html` (shell, editor, folds, views, clock), `sync.js` (encrypted sync), `claude.js` (Claude Code over GitHub), `memory.js` (tests, practice, FSRS), `ai.js` (Anthropic client, AI features), plus files added by in-progress phases (Claude-in-book, add-ons, drills, code vault).
- **Board prototype:** `docs/board/` (TV + IR touch frame); on hold.
- **Native iPad app:** `Sources/`, `project.yml` (XcodeGen), `.github/workflows/build.yml` (unsigned .ipa; TestFlight path prepared). ON HOLD.
- **Three speeds of change:**
  1. **Instant:** Claude in the app uses tools over app primitives (seconds).
  2. **Add-ons:** Claude writes sandboxed extensions (seconds).
  3. **Deep:** code changes. Target: **onboard** (code vault, seconds). Fallback/backup: Claude Code on GitHub (minutes).
- **Onboard code (Phase 5):** a tiny stable bootloader loads the app from an on-device, versioned code vault, seeded from the published files. Edits are previewed in a sandbox on a copy of the data, checked by a built-in self-test, then Kept or Undone. Version history, rollback, automatic safe-mode fallback to the last version that booted, and synced versions across devices. Publishing to GitHub is optional.

---

## 5. Building blocks

### 5.1 Node (page = nest = fold)
Every page, nest and fold is one node type. Core fields: `id`, `text`, `createdAt`, `updatedAt`, `parentId` (list placement), optional `anchor {start,end}` (continuous range in the parent's text), optional `share` (Wrap-here shared span reference), optional `portal` (Move-into link), optional `ai` marker, `deleted` tombstone. Phase 4 adds **placements** (one node in many places), **lateral links**, and **self-containment**.

### 5.2 Folds on text
- Created from any continuous selection, from 1 character to a whole passage. MUST support unlimited overlapping folds on the same text.
- Each fold shows its own colored underline beneath its words; overlaps stack as separate lines; a toggle hides all lines.
- Tapping folded words lists the folds covering that spot (color + first words) to open or close.
- **Anchors follow edits:** insertion before shifts the fold; insertion inside grows it; insertion at the end grows it only while actively editing that fold; deleting all its words makes it unattached. Remote edits re-locate anchors by matching the anchored text with surrounding context.
- **Staircase view:** an open fold unfolds beneath the line/paragraph where its anchor ends, indented one step with a rail in its color; recursive; all levels editable.
- **Focus view:** "Open on its own"; breadcrumbs; "Step out" opens the parent with this fold expanded.
- **Nest forward:** "Nest" → New text / Existing page or fold (moves it; cycle-safe).
- **Nest in (outward):**
  - **Wrap here:** the words stay in place and are shared live with a wrapper fold (edit either, both change; source deleted → frozen copy, "source removed").
  - **Move into:** the words move to a destination; a ⤷ portal marker remains; undo available.
- **Fold anywhere (Phase 4):** cross-folds (same node in many places), lateral links, self-containment rendered once with "↻ already open above", and code-folds (the app's own code as read-only foldable nodes, annotatable; changes only through Claude).

---

## 6. Data, storage and sync

- **Local:** localStorage (pages, intervals, UI/settings) plus IndexedDB (sync key, code vault). Per-device only: thumb-button position, device name, open/closed fold state, keys.
- **Export/import:** full JSON; import merges (newest wins per item; nothing deleted).
- **Sync (live):** branch `tol-data`, one sealed file per device `sync/<deviceId>.json`, plus `sync/meta.json` (salt, iterations, encrypted check). PBKDF2-SHA256 600k → AES-GCM-256, fresh IV per write. Merge rules: per node newest wins; same-node concurrent edits → keep newer, save the other as "Other version (<device>, <time>)" inside it; tombstones for deletions; intervals unioned. Synced: nodes, intervals, looks/theme, typing pause, goal, memory data, conversations, add-ons, code versions (additive fields).
- **Timing:** push ~5 s after typing stops (max one write per ~6 s; forced every ~10–30 s during long typing), immediately on hide/blur/pagehide; pull on show/focus and every ~10 s; back off on GitHub 403/429. Respect GitHub content-creation limits (~80/min, ~500/hr).

---

## 7. Writing clock (exact rules)

- **Typing** (text changes) runs the clock. It continues through pauses up to *P* seconds (default 4, adjustable 1–15). A longer pause stops the stretch at the last keystroke (plus ~0.4 s); the pause is not counted.
- **Hold:** Option key (laptop) or the on-screen thumb button (iPhone) runs the clock while held.
- **Union:** overlapping typing/hold time counts once. Stored as intervals `{start, end, device}`; daily total = union of intervals within the local day, split at midnight.
- **Never counts:** AI generation, Claude actions, sync, time with the app hidden (release on hide/blur).
- **Goal:** daily target (default 5:00:00). Long-term: 40 days × 5 h = 200 h (view planned).
- **Native iPad version (on hold):** Pencil tip down with an inking tool counts; eraser/lasso don't; thumb hold counts; union.

---

## 8. Memory system

### 8.1 Prompts
Sources: a fold's peg with contents hidden (**default**), the reverse (per fold), the owner's own questions (expected answer defaults to the fold contents), and AI questions (kept only after the owner keeps/edits them). Directions: **forward**, **backward**, **both**. State is keyed per (prompt, direction).

### 8.2 Test flow
Choose a scope (fold and everything inside / page / due today) and an order. For each prompt: show it → owner types an answer (counts as writing) → Submit → review: the correct answer beside theirs with word-by-word marks (matched/missed/added/changed; case- and punctuation-insensitive), optional AI feedback (what was right, missed, meaning kept?, one tip, suggested grade), then the owner's grade **Missed / Almost / Got it / Easy** (defaulting to the AI suggestion; can be overruled). Each grade button shows its next due time. The end summary shows the score, weakest pegs, and "practice the weak ones." Review mode per fold: AI / AI feedback + self grade / self only.

### 8.3 Practice cues
Blank, first letters, word shapes, every other word; press-and-hold to peek.

### 8.4 Spaced review
FSRS v5 with default weights. Simple controls: desired recall (default 90%), daily review limit, new-prompts-per-day, maximum interval. Shows "N due today" and due badges.

### 8.5 Drill engine (Phase 3)
- **Drill** = a saved recipe of steps (show, hide, recall-type, review/grade, peek, cue level, chain previous, add next) over a set of folds.
- **Orders:** front-to-back, back-to-front, shuffled, weakest-first, interleaved, chain-building (cumulative), AI-arranged (with a one-line reason).
- **Loop to mastery:** repeat until the mastery rule is met (default 3 perfect in a row; options: accuracy %, typing speed), then **extend** (add the next level, verse or chunk; cumulative chains), with fading cues.
- **Adaptive:** repeated misses on the same word add a cue or tighten the loop; fast perfect runs extend sooner. Each adaptation is explained in one line.
- **Saved drills:** editable as plain steps, buildable by Claude from plain words, runnable any time, schedulable in FSRS (item = the final full recall).
- **Reference sample, Psalm 23 (KJV):** a meta fold per verse; under each verse, 5 levels (level 1 simplest and childlike → level 5 the original KJV). Drill: level 1 show→hide→recall until 3 perfect; add level 2 (recall 1 then 2); … level 5; next verse; then chain verses until the whole psalm is fluent.

---

## 9. AI

- **Provider (live):** Anthropic Messages API, called directly from the browser with the owner's key (header `anthropic-dangerous-direct-browser-access: true`). Models: `claude-haiku-5-5` (default; $0.10/M input, $0.50/M output for prompts ≤100K) and `claude-sonnet-5-5` ($2/$10). Monthly soft cap plus a running estimate. Powered by Claude Max monthly API credits through a linked Console organization.
- **Live features:** answer feedback (JSON, robust parsing, timeouts, offline-safe), "Make questions", "Write deeper with AI" (AI folds generated when opened; cost preview; depth ≤5, chunks ≤5; dashed "AI" mark until edited).
- **Claude in the book (Phase 1):** summon anywhere (Cmd/Ctrl+K; iPhone button); streaming; tool use over all primitives (read context/selection/structure within bounds, search, edit text, create/move/wrap folds, open/focus, hide/cues, prompts/tests, drills, looks/settings, write deeper, add-ons, code vault). Actions shown live as step lines and undoable as a group. Asks before deleting writing. Per-node conversations synced encrypted. Labels each request's tier (Instant / Add-on / Deep) and hands off to Deep when needed.
- **Future providers:** Venice (including uncensored models), OpenAI, the owner's own models, behind one AI setting (needs API keys).
- **Future onboard mind:** a small on-device model for basic offline help; Claude takes over online.

---

## 10. Claude Code on GitHub (Deep tier, live; becomes optional after Phase 5)

- Owner-only workflow `.github/workflows/claude.yml` (plan token secret `CLAUDE_CODE_OAUTH_TOKEN`, line breaks stripped; `ANTHROPIC_API_KEY` accepted as an alternative).
- The in-app Claude page creates `@claude` issues, shows progress, opens PRs, publishes previews at `/preview/<n>/` running in a sandbox copy, then Keep (merge) / Undo (close) / Ask for a fix. It keeps a Changes list with undo-by-revert. Page text is attached only when the owner ticks it (the repo is public).
- Requires a fine-grained GitHub token (this repo only; Contents, Issues, Pull requests: read/write; Actions: read/write for Stop) stored on-device.

---

## 11. Add-ons (Phase 2)

Small JS extensions written by Claude, run in a sandboxed iframe/Worker with no same-origin access, talking only through a message API: read node text/structure; propose edits through the undoable action layer; add UI in designated slots; register test steps and cue styles. They have versions, on/off, one-tap Turn off, safe mode (`?safe`), and sync. They can never read keys or delete writing.

---

## 12. UX principles

- Plain language everywhere; short lists; a "why" for each step the owner must do.
- Calm, writerly design; Literata for writing, Hanken Grotesk for the interface; 44 px touch targets; legible light and dark themes.
- iPhone: thumb button above the keyboard; nothing covers Send/Submit; selection actions must not fight the iOS selection menu.
- Laptop: performant on a 2011 GPU (avoid heavy effects).
- Status always visible but quiet: clock, sync state, Claude activity.

---

## 13. Testing and release discipline

- Playwright (Python) suites in `tests/` (see `tests/README.md`); mock GitHub and Anthropic. Test laptop (1280×800) and iPhone 13 sizes. Look at screenshots. No page errors.
- Every feature gets a plain-words checklist in `TESTING.md` for the owner to run on real devices (iPhone 16e, Firefox on Catalina).
- Release = all suites pass → commit → push → confirm the Pages workflow succeeds (retry GitHub's transient "artifact metadata" failures).

---

## 14. Status

**Live:** pages; writing clock; folds (overlap, staircase, focus); Nest in (wrap/move); memory tests, cues, FSRS; AI feedback/questions/AI folds; looks; encrypted sync; Claude Code page with previews; rename and logo; Claude in the book (Phase 1); add-ons (Phase 2); drill engine with the Psalm 23 sample (Phase 3).

**In progress:** Phase 4 (fold anywhere, code-folds); Phase 5 (onboard self-changing code).

**Planned / back pocket:** more AI providers; onboard small model; chained timers anywhere; 40-day / 200-hour view; Board hardware; native iPad (when the Pencil is replaced: draw-and-hold shapes, Goodnotes-style toolbar); MIDI piano roll / channel rack (FL Studio). Dropped: AI drawing beside writing.

## 15. Open decisions (owner)
- Mastery default per drill type (currently 3 perfect in a row).
- Private repo later (needs GitHub Pro for Pages).
- Preferred AI models per task; Venice/OpenAI keys.

## 16. Glossary
- **Peg:** visible words a fold hangs on.
- **Fold / nest / page:** the same node type.
- **Staircase view:** inline recursive unfolding.
- **Focus view:** a fold opened as the whole page.
- **Wrap here / Move into:** outward nesting modes.
- **Drill:** a looping recipe to mastery.
- **Tier:** Instant / Add-on / Deep.
- **Code vault:** the on-device versioned app code.
- **Safe mode:** start without add-ons, or with the last good code version.
