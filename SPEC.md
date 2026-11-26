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
- **Modules (current):** `index.html` (the bootloader), `app.html` (shell, editor, folds, placements, views, clock), `sync.js` (encrypted sync), `claude.js` (Claude Code over GitHub), `memory.js` (tests, practice, FSRS), `ai.js` (Anthropic client, AI features), `agent.js` (Claude in the book), `addons.js` (sealed add-ons), `drill.js` (drills), `code.js` (onboard versions), `codefolds.js` (The App / code-folds).
- **Board prototype:** `docs/board/` (TV + IR touch frame); on hold.
- **Native iPad app:** `Sources/`, `project.yml` (XcodeGen), `.github/workflows/build.yml` (unsigned .ipa; TestFlight path prepared). ON HOLD.
- **Three speeds of change:**
  1. **Instant:** Claude in the app uses tools over app primitives (seconds).
  2. **Add-ons:** Claude writes sandboxed extensions (seconds).
  3. **Deep:** code changes. Target: **onboard** (code vault, seconds). Fallback/backup: Claude Code on GitHub (minutes).
- **Onboard code (Phase 5, live):**
  - **Bootloader** `docs/index.html` (tiny, stable; never in the vault). It reads the CODE VAULT (IndexedDB `bolw-code`: store `versions` {id, n, origin published|onboard, label, base, parent, files{name:text}, note, by, at} and store `meta`: active, pinned, lastGood, booting, bad, choiceAt). It starts the pinned or active version; otherwise it fetches the published `app.html` plus every script it names, saves them as `pub-<APP_VERSION>`, and starts them. Offline with nothing reachable, it starts the newest saved published copy. Previews (`/preview/N/`) always use their own files.
  - **Starting a version:** parse `app.html`, put its head and body in place, and run its scripts in order (`window.__bolwRun`). It writes `booting=<id>` first and clears it on success (window.TOL and #writer exist, with no errors while starting). If there are errors, or `booting` is still set on the next start (it froze), the version is marked bad and the last good one starts, with the banner "A change didn't work, so I started the last good version. Undo it?" (Undo it / Try it again).
  - **Safe mode:** `?safe`, Shift held while it opens, or "Start safely instead" on the opening screen. These start the published files with no add-ons.
  - **The app's side** `docs/code.js`:
    - Settings → App versions: history, Use this (rollback or forward), Return to published version, pin on this device, Restart in safe mode, What changed (plain words + lines), Publish to GitHub….
    - Claude's tool `propose_change` (exact find/replace edits, or base "published" to carry changes onto a newer published version) opens a sealed preview: an iframe `sandbox="allow-scripts"` (opaque origin) with a CSP that has no network. It runs the change on an in-memory COPY of the book (pages, time, ui, theme, looks, memory; never keys). IndexedDB and caches are absent.
    - Built-in self-test: the app starts; all your writing is still there; pages open; the writing clock counts; folds show; sync code loads; no errors while starting.
    - **Keep** (only when the self-test passes) or **Undo**. Claude cannot keep.
    - Claude's changes may not touch `sync.js` or `code.js`, nor mention keys, sync or the vault.
    - Other tools: `list_versions`, `onboard_changes`.
  - **Sync:** `memory.codeversions` (additive). Each kept version carries only its files that differ from its published base, and the 5 newest are kept. `~active` = the newest choice and wins on every unpinned device (with a "Reload to use it" offer). A pinned device keeps its version but still receives the history.
  - **Publish (optional, existing GitHub key):** a branch `onboard-v<n>-…` with only the changed files plus a pull request, or a commit straight to main after a second confirming tap. Writing is never sent. When the published version is newer than the onboard base, the app says so and offers "Use the published version" or "Bring my changes over with Claude".

---

## 5. Building blocks

### 5.1 Node (page = nest = fold)
Every page, nest and fold is one node type. Core fields: `id`, `text`, `createdAt`, `updatedAt`, `parentId` (list placement), optional `anchor {start,end}` (continuous range in the parent's text), optional `share` (Wrap-here shared span reference), optional `portal` (Move-into link), optional `ai` marker, `deleted` tombstone. **Placements (Phase 4, live):** a placement is a fold-shaped node with `ref: <nodeId>` anchored to words in its parent; it shows that node right there, holds no copy, and every edit through it edits the one node. Lateral links and self-containment are placements too. A **code-fold** is a placement with `code: {file, key, title}` instead of `ref`. Notes on code parts live in `memory.codenotes[key]` (synced).

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
- **Fold anywhere (Phase 4, live):** select words → Nest → **Place here too…** picks any page or fold (even the page itself or an ancestor). It stays where it is and also opens here. A node is drawn at most once per screen; any other place (including a page inside itself, or two pages inside each other) shows "↻ already open above". The page list shows each node once, with "also in N places". "Remove from here" removes only the placement. A placement of a deleted node says so.
- **Code-folds (Phase 4, live):** "The App" (page list) shows the app's own files, read-only, split into foldable parts at section comments, functions and Claude's tools. You can search, note any part (synced), place a part in a page (a "⌘ file · part" line is added with the code folded under it) or under selected words (Nest → App code…), and use "Change this with Claude Code" to open the Deep tier with that code attached. Files are cached for offline use. Claude tools: `list_code`, `read_code`, `place_code`, `note_code`, `place_here`. Code-folds read through `T.code.source`, which Phase 5 points at the onboard version.

---

## 6. Data, storage and sync

- **Local:** localStorage (pages, intervals, UI/settings, memory) plus IndexedDB (sync key and base fingerprints `tol-vault`, code vault `bolw-code`, safety copies `bolw-safe`). Per-device only: thumb-button position, device name, open/closed fold state, keys, safety copies.
- **A save that fails is loud:** a red "Not saved" bar on the page until a save works again; meanwhile the whole book is kept in a rescue copy (IndexedDB) and merged back at the next start. Settings shows storage in use; a warning appears near 80%.
- **Safety copies (device only):** the book at the end of each of the last 7 days written; Recently deleted (30 days) with Restore; "This page as it was"; "Bring back what's been deleted since". They guard against mistakes, not against losing the device (that's what sync and export are for).
- **One tab at a time:** the first tab holds a Web Lock; a second tab is paused (cannot save) until the owner chooses it.
- **A page can never be inside itself:** loops of parents (possible when two devices move pages into each other) are broken deterministically at start, after sync and after import.
- **Export/import:** full JSON (share sheet on the phone); import merges (newest wins per item; nothing is ever deleted; a file can't bring app code; add-ons from a file arrive off; pages deleted here can be brought back from the file).
- **Sync (live):** branch `tol-data`, two sealed files per device, plus `sync/meta.json` (salt, iterations, encrypted check): the BASE `sync/<deviceId>.json` (the whole book) and the DELTA `sync/<deviceId>.d.json` (only what changed since that base: changed pages, changed memory records, time entries added; `kind: "delta"`, `baseSha`). An ordinary save writes the delta (a few KB); the base is rewritten when the delta outgrows it. Readers combine a device's base and delta before merging and ignore a delta left over from an older base. Version 1.1 reads bases only. A file that can't be opened is skipped, never a reason to lock. PBKDF2-SHA256 600k → AES-GCM-256, fresh IV per write. Merge rules: per node newest wins; same-node concurrent edits → keep newer, save the other as "Other version (<device>, <time>)" inside it; tombstones for deletions; intervals unioned. Synced: nodes, intervals, looks/theme, typing pause, goal, memory data, conversations, add-ons, code versions (additive fields).
- **Timing:** push ~5 s after typing stops (at most one write per 15 s; at least every 60 s during long typing), immediately on hide/blur/pagehide (as a `keepalive` request when under 60 KB, which a delta normally is); pull on show/focus and every ~10 s (the check never pushes early); back off on GitHub 403/429. Respect GitHub content-creation limits (~80/min, ~500/hr).

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
- GitHub Actions (`tests.yml`) runs every suite on each change in Chromium, WebKit and Firefox, plus a three-device sync through the real GitHub on a scratch branch; outcomes are kept on the `test-results` branch.
- Each device can check itself: Settings → Check this device → a report with no writing in it, copied or sent as a GitHub issue.
- What only a person can judge (keyboard feel, share sheet, Home Screen) is a short list in `TESTPLAN.md`; feature checklists stay in `TESTING.md`.
- Release = all suites pass → commit → push → confirm the Pages and Tests workflows succeed (retry GitHub's transient "artifact metadata" failures).

---

## 14. Status

**Live:** pages; writing clock; folds (overlap, staircase, focus); Nest in (wrap/move); memory tests, cues, FSRS; AI feedback/questions/AI folds; looks; encrypted sync; Claude Code page with previews; rename and logo; Claude in the book (Phase 1); add-ons (Phase 2); drill engine with the Psalm 23 sample (Phase 3); fold anywhere and code-folds (Phase 4); onboard self-changing code with bootloader, code vault, sealed tries with self-test, versions, safe-mode fallback, version sync and optional publishing (Phase 5).

**Hardening (1.2+):** loud save failures with rescue copy; safety copies and Recently deleted; one tab at a time; loop-free pages; delta sync; complete-set boot with timeout; sealed frames can't navigate out; device check; three-engine CI and real-GitHub sync test.

**In progress:** nothing; Phases 1–5 are live.

**Next (in order):** a compact, exact archive for writing-time entries (they are the largest thing that grows in localStorage); onboard versions kept as small patches instead of whole files; then the back pocket.

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
