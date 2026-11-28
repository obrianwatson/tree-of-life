# AGENTS.md: how to work on BOLW Core

For any coding AI (Claude Code, Codex, another agent) or person changing the **Book of Living Waters (BOLW)**.
Read this before you change anything. `CLAUDE.md` is the short version of the same rules.

## 1. What BOLW is

One writer's own book. He is a writer and songwriter, not a programmer. Writing is "to enscribe oneself into life"
(keep that spelling).

> Leaves of lines. Branches to grow them, folds to gather them, webs to connect them, and one map to see it all.
> A fast AI inside the book, a slow AI outside it, and commands that keep working offline.

- **A leaf** is a page of lines. **A line** indented under another grows from it: **a branch**. A branch can be
  **lifted** into its own leaf, attached to the line it grew from. The book starts from one **trunk** leaf. No folders.
- **A fold** hides lines behind a gate. Folds overlap. **Naming** a fold makes it **gather** across the book: every fold
  of that name is one gathering. Named folds carry **details** (Status, Key…).
- **A link** joins any line to any other, with an optional label. Both ends know.
- **The Map** is one view centered on where you are: branches up and down, links to the sides.
- **The fast AI** lives in the book and acts only through the book's own actions. **The slow AI** is you: a coding AI
  outside the app, working from a **request** the writer wrote in the app.
- **Commands** (`;song`) are the writer's own moves, saved as plain steps; they run on the device with no AI.
  **Automations** are "when this happens, run that command".
- **The harvest** is a joint debrief of a finished project, made from **the record of every move**.

The plan is `claude/core-v1.md` in the writer's BOLW project (it wins over every older plan). The floor is
`claude/unchangeables.md`. What was built, and the choices made, is in `claude/core-as-built.md`.

## 2. Where things are

| Path | What | Status |
|---|---|---|
| `docs/core/` | **BOLW Core**: the app being built now. Live at `/tree-of-life/core/` | work here |
| `docs/core/test/` | The guided tests: the real app on its own sample book, with Show me | keep in step |
| `docs/core/safe/` | Safe mode: one plain file that only reads the book | never make it depend on the app |
| `docs/bolw/` | BOLW Essentials, the build before Core | **leave untouched** |
| `docs/` (root), `docs/trial/` | The old book and the trial | **leave untouched** |
| `tests/test_core.py` | Core's browser tests (Playwright) | add checks with every change |
| `tools/core-version.py` | Sets Core's version everywhere it is written | run it on every change |
| `.github/workflows/core.yml` | Runs Core's tests in Safari's engine and Firefox on every push | |

The site is GitHub Pages publishing `docs/` from `main` at `https://obrianwatson.github.io/tree-of-life/`.
The repository is **public**. The repository and web address keep the old name `tree-of-life`.

## 3. The eight unchangeables (never weaken one)

1. **Writing is never lost.** Every change keeps the earlier version; anything deleted can be brought back.
2. **The way back always works.** Every version is kept; safe mode lives at its own address.
3. **Export** in an open, readable format, always.
4. **Writing is locked with the passphrase before it leaves the device.**
5. **Keys stay unreachable.** The AI key, the GitHub key and the passphrase can never be read by the AI, a command, or a change.
6. **Nothing goes to an AI unless the writer asked.**
7. **The book always knows who wrote what**, and that record can't be faked.
8. **Only the writer can lock and unlock.**

What that means in the code:
- Never delete, rewrite or move the writer's writing or his writing-time data. Deleting is `prune` (kept in `pruned`, can be restored).
- Never put anything readable on the `tol-data` branch, and never touch that branch by hand. Sync files are sealed
  (PBKDF2-SHA256, 600,000 rounds → AES-GCM-256). Never weaken that; never store the passphrase.
- Keys are read in exactly one place each: the AI keys in `socket.js`, the GitHub key and the lock in `lock.js`.
  Never pass a key to a tool, a command, the record, a report, or the page.
- Nothing in the repository may hold the writer's words or any secret. Anything the app posts to the public
  repository (a test report, "Something's off") carries no writing, no keys, no "@", and asks first.
- **Who** made a move is stamped inside the book (section 5). No caller can pass it in.

## 4. How Core is put together

Plain files, **no build step, no libraries**. `docs/core/index.html` lists the scripts in order; `tools/core-version.py`
copies that list to the guided test page and the offline list in `sw.js`.

**Core (always on)**

| File | What it is |
|---|---|
| `keep.js` | Storage on the device (`core-…` drawers, IndexedDB `core-keep`), the rescue copy, **rings** (earlier versions of a leaf), export (.txt, .json) |
| `book.js` | **The book and its one door**: the data, actions, who, guards, Undo, trials. Core actions: `write`, `leaf`, `move`, `prune`, `restore` |
| `mods.js` | The module switches (`Mods.add`, `Mods.on`) |
| `page.js` | The page: one editable surface, the bar, menus, sheets, the cursor, going from leaf to leaf |
| `log.js` | **The record of every move**: who, what, where, when, and time spent. It only listens |
| `settings.js` | Settings: the switches, export, the way back, "Something's off" |
| `update.js` | Takes a new version only when the writer isn't typing, and returns him to the same spot |
| `lock.js` | The lock and encrypted sync through GitHub (`core/<deviceId>.json` on `tol-data`) |

**Modules (each has a switch in Settings; off hides it and refuses its moves; its data always stays)**

| Switch id | File | What it adds | Actions it owns |
|---|---|---|---|
| `grow` | `grow.js` | Branches by indenting; lifting a branch into its own leaf | `grow`, `lift` |
| `clock` | `clock.js` | The writing clock, Hold, the daily goal | (none: it never changes the book) |
| `search` | `search.js` | Search across the book | (none) |
| `fold` | `fold.js` | Folds, gates, names that gather, details, the fold list | `fold`, `gate`, `unfold`, `name`, `detail`, `stretch`, `gather`, `teach` |
| `link` | `link.js` | Links with labels and colors | `link`, `unlink`, `relabel` |
| `map` | `map.js` | The Map | (none) |
| `marks` | `marks.js` | Bookmarks 🔖 | `mark`, `markedit`, `markdone` |
| `ai` | `socket.js` + `ai.js` | The fast AI: where an AI plugs in, and its window | (it uses the others' actions through its own hand) |
| `requests` | `requests.js` | Requests to a coding AI | `request`, `requestdone` |
| `commands` | `commands.js` | `;` commands | (it runs the others' actions through its own hand) |
| `autos` | `autos.js` | Automations | (same) |
| `harvest` | `harvest.js` | The harvest; lessons into "Ways of mine" | `harvest`, `lesson` |

Not built yet: Views (table, board, calendar) and Seeds as a module (a Seeds leaf is simply put on a new trunk).

## 5. The rules of the book (`book.js`)

**One door.** Everything that changes the book is an **action**, run through `Book.act(name, needs)`. That is what
makes Undo, the record, rings and sync work without each module thinking about them. Never change `Book.D` from
outside an action.

```js
B.action("mark", function (needs, who, T) {
  const L = D().lines[needs.line]; if (!L) throw B.plain("That line isn't there.");   // a plain sentence the writer can read
  T.table("marks");                       // say what you are about to change, BEFORE changing it (that is the Undo)
  D().marks[id] = { id, line: L.id, by: who, at: Date.now(), updatedAt: Date.now() };
  return { mark: id, structural: true, log: { what: "mark", leaf: L.in, line: L.id } };   // `log` becomes the record's entry
}, "marks");                               // the module that owns it: switched off, the action is refused
```

- **Say before you change:** `T.leaf(id)` (a leaf and its lines and folds), `T.table(name)` (a whole table: records are
  replaced, never edited in place), `T.rec(table, id)` (one record, without marking its leaf changed), `T.more(name)`
  (a table inside `D.more`). Undo puts back exactly what you named.
- **Who.** `Book.act` is the writer's hand (`"me"`). Four other hands exist, each given out **once**, by `Book.hand(kind)`:
  `ai` (ai.js), `cmd` (commands.js), `auto` (autos.js), `book` (harvest.js: the facts of a harvest). The hand stamps
  who made the move; nothing can pass a "who" in. Lines keep `by`, and the page colors the AI's lines purple and the
  book's grey. **Do not add a way around this.**
- **Guards.** `Book.guard((name, needs, who, grant) => true | "a refusal sentence" | { ask })` is asked before every
  move. That is where each hand is limited: the AI only acts while replying and asks first before changing or removing
  the writer's words; commands add and arrange but never delete or rewrite; automations only add, only in the open
  leaf; the book's hand only writes a harvest's facts.
- **One Undo for many moves:** `Book.begin(tag, who)` … `Book.end()` (pairs can nest; the outermost is the Undo).
  A whole AI reply, a command run, an automation run: one Undo each.
- **A trial:** `Book.trial(fn)` really runs moves, then puts everything back exactly, keeping nothing (no Undo entry,
  no record, no sync). This is how a command "runs on a copy first".
- **Data** (`Book.D`): `leaves`, `lines`, `folds`, `names`, `links`, `marks`, `pruned`, and `more` (a table per module:
  `more.requests`, `more.harvests`, …). **Only add fields; never rename or remove one.** Records in tables carry
  `updatedAt` (sync is newest-wins per record; a whole leaf is newest-wins, with a ring kept when both sides changed).

**The record (`log.js`)** listens to every action and to the writing clock. It never changes writing. An entry is
`{ who, what, leaf, lt (the leaf's title then), t, t2?, n?, k?, c?, r?, ms? }`. Add a sentence for a new `what` in `SAY`.

## 6. Adding to BOLW

**A new module**
1. One new file in `docs/core/`. Start it with a comment that says, in plain words, what it is and what it adds to the book.
2. `Mods.add({ id, name, about })`. Give its actions the module id (third argument of `Book.action`), and its menu
   items, views, keys and bar buttons the same id, so the switch hides all of it.
3. Keep its data in `D.more.<name>` or in ordinary lines and leaves. Switching it off must delete nothing.
4. It must not need another module to be on. Check with `Mods.on("other")` before using another module's things.
   (To make a leaf, use the core's `leaf` action, not Grow's `lift`.)
5. List the file in `docs/core/index.html` between `<!--MODULES-->` and `<!--END-->`, then run `tools/core-version.py`.
6. Add a stage to `tests/test_core.py` and a few guided checks to `docs/core/test/guide.js`.

**Reaching the page** (`window.Page`): `Page.bar(item)` a bar button · `Page.menu(fn, mod, order)` items in a line's ⌄
menu · `Page.view({ mod, order, label, open })` an entry under ☰ · `Page.top(el, mod, order)` a button at the top ·
`Page.key(fn, mod)` · `Page.marker(m)` a mark at the end of a line · `Page.on(what, fn)` hooks (`typed`, `enter`,
`leaf`, `drawn`…) · `Page.sheet(title, build)` · `Page.toast(text, label, fn)` · `Page.go(leaf, line)`.

**A tool for the fast AI:** `AI.tool({ name, mod, description, input_schema, run(a, env) })`. Inside `run`, change
the book only with `AI.act(name, needs, env)` (the AI's hand; it shows an ask-first card when a guard says so).
Anything the AI proposes that the writer must decide (a command, an automation, a lesson) is a **card** with
Keep / Don't: see `make_command` in `commands.js` and `keep_lesson` in `harvest.js`.

**A step for commands:** add it to `step()` in `commands.js`. A step may only do what the writer could do himself with
the book's actions, never delete or rewrite, and never touch BOLW's code.

**A "when" for automations:** add it to `KINDS` in `autos.js`. Automations only add, only in the open leaf, and only
the writer's own moves set them off.

## 7. Testing

```
python3 tests/test_core.py          # every stage, in Chromium, phone-sized and laptop-sized
python3 tests/test_core.py 2 7      # only stages 2 and 7
BROWSER=webkit python3 tests/test_core.py      # Safari's engine (or BROWSER=firefox)
```

- The tests open the real app in a real browser, with a fake GitHub (`tests/helpers.py`) and a fake AI (`FakeAI`:
  a stand-in for Claude and for an OpenAI-compatible AI). No key, no cost, nothing real is touched.
- Each stage has its own function (`stage1` … `stage7`, plus `sync`, `sync2`, `sync3`, `feel`, `guide`). Add checks
  where they belong; a new stage goes before the `#STAGES-BELOW` marker. Every check is one sentence the writer could read.
- `feel` checks speed on long leaves. **Smooth as butter is a requirement:** nothing heavy per key press, no reload
  while typing, motion ≤ 0.2 s and off with Reduce Motion.
- **The guided tests** (`/core/test/?s=N`) are how the writer tries a stage: a few short checks, each with **Show me**
  (a finger does it slowly on the sample book, then everything is put back) and **Works / Something's off**. Keep them
  in step with what you change: `STAGES[N]` in `docs/core/test/guide.js`. The `guide` test runs every Show me.
- GitHub runs the Core tests in Safari's engine and Firefox on every push that touches `docs/core/` (workflow
  **Core (quick)**). The writer uses an **iPhone (Safari)** and a **2011 MacBook (Firefox on macOS Catalina)**: use no
  newest-only browser features, and check both engines pass before telling him to try something.
- You can't hold his phone. Take screenshots at phone size when you change how something looks.

## 8. Every change

1. Read the module you're changing, and its tests.
2. Make the change small. One module per file.
3. Add or update checks in `tests/test_core.py`, and the guided check if the writer will see a difference.
4. Bump the version: `python3 tools/core-version.py 1.6.1` (it rewrites `version.txt`, `index.html`, the test page and `sw.js`).
5. Run the tests. Push. Check **Core (quick)** passed in both engines, and that **Publish web app** went through.
   (If publishing fails with "Fetching artifact metadata failed", that is GitHub's side: run that workflow again.)
6. Tell the writer in plain words: what changed, what he'll see, exactly what to try. Short lists, one thing at a time,
   and the "why" for each step. No code unless he asks.

When the writer asked for the change from inside the app, it arrives as a **request** (☰ → Requests → Copy for coding AI):
what he wants, what done looks like, why, which part of BOLW, and where he was. Build it on a branch. The app updates
itself when he isn't typing, and he marks the request Done or Not yet.

## 9. Never

- Never ask for, print, log, commit or paste a key or the passphrase. Never read one outside `socket.js` / `lock.js`.
- Never write anything readable to `tol-data`, and never edit that branch by hand.
- Never delete, rewrite or move the writer's writing or his writing-time data, on a device or in sync.
- Never change `docs/bolw/`, `docs/trial/` or the old book at the root of `docs/` while working on Core.
- Never make the app reload, jump, or lose the cursor while he is typing.
- Never let the AI, a command or an automation do something the writer couldn't do himself, or change BOLW's code.
- Never remove a field from the book's data or the sync files. Only add.
