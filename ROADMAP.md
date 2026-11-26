# The Book of Living Waters: Roadmap

The Book of Living Waters (formerly the Tree of Life). A book of pages and a timer. Writing is to enscribe oneself into life.

How we work: one milestone at a time. Each build ends with its checklist in `TESTING.md`. A box is ticked only after it's been tried on the real device.

Status key: ✅ done · 🔨 in progress · ⬜ not started · ⏸ on hold

---

# ▶ NOW: Text Tree of Life on the iPhone 16e + the laptop

The Pencil is broken, so the focus is **writing in text**, on the **iPhone 16e** and the **2011 MacBook**, synced through the cloud so you can pick up where you left off on either one.

**How it's built:** one web app, used on both devices.
- iPhone: open it in Safari → Share → **Add to Home Screen**. It opens full-screen like an app. No Apple fees, no cable, no TestFlight.
- Laptop: open it in **Firefox** (Chrome no longer updates on Catalina).
- Hosted free on GitHub Pages from this repository.
- Every device keeps working offline and syncs when it's back online.

## T1 · Pages of text ✅ (built in `docs/`, waiting for you to try)
- ✅ A page you can type on (comfortable on the phone keyboard and the laptop)
- ✅ Many pages + a page list, newest first; first line is the page's name
- ✅ Pages inside pages (every page is a folder); deleting a page moves its inner pages up a level
- ✅ Saves itself as you type; opens with no internet once loaded
- ✅ Reopens to the last page with the cursor where you left it
- ✅ Export everything to a file; import merges (newer version of each page wins, nothing deleted)

## T2 · The writing clock for typing ✅ (built, waiting for you to try)
- ✅ Typing counts; the clock runs through pauses up to 4 s (adjustable 1–15 s in Settings); a longer pause stops it at your last key
- ✅ Hold button: on the iPhone, a thumb button just above the keyboard; on the laptop, hold the Option key
- ✅ Each second counts once; daily total "of 5:00:00" (goal adjustable)
- ✅ Time saved as start/stop moments marked "iPhone" or "Laptop", so both devices merge without double-counting

## T3 · Sync between iPhone and laptop ✅ (built and tested in a browser; waiting for you to try on the real devices)
Instead of Firebase, sync goes through the GitHub project you already have, locked with your passphrase.
- ✅ Turn on once per device: choose a passphrase on the first, type the same one on the second (capitals and spaces don't matter)
- ✅ Your writing is encrypted on the device before it leaves (GitHub only stores scrambled text, in the `tol-data` branch)
- ✅ Pages, folders, deletions and writing time sync; your look, saved Looks, typing pause and daily goal follow you too
- ✅ Pick up where you left off: opening the app jumps to the page and cursor you were last writing on, on either device
- ✅ Works offline; catches up when back online
- ✅ Same page changed on both devices: the newer stays, the other is kept inside it as "Other version (device, time)". Writing is never lost
- ✅ Timing: saves to the cloud about 5 s after you stop typing (and every ~10 s while you keep typing), at once when you switch away or lock the phone, and checks your other device every 10 s and the moment you come back
- ✅ Export everything to a file, and restore (from T1)

## F · Folds in the text ✅ (built, waiting for you to try)
- ✅ Select any continuous stretch (one character up to a whole passage) → **Nest** → **New text** or **Existing page or fold** (it moves under those words)
- ✅ As many folds as you like, overlapping the same words; each has its own colored line, stacked under the words
- ✅ Tap into folded words → choose which fold to open or fold away (when several share a spot)
- ✅ "Folds shown / hidden" switch for the lines
- ✅ Folds follow edits: typing before/after moves them, typing inside grows them; deleting all their words keeps the fold as "unattached"
- ✅ **Staircase view:** an open fold unfolds right under the line its words end on, one step in; folds inside fold further in; write in any of them directly (the clock counts)
- ✅ **Focus view:** "Open on its own" makes any fold the page; "‹ Step out" and the path at the top (Book › … › here) go back out, with the way back unfolded
- ✅ Pages and folds are the same thing; folds show in the page list with a ⌁ mark
- ✅ Reopening puts you back in the fold you were writing in; folds sync (encrypted) and export/import
- ✅ **Nest in… (going outward)** — both ways (built, waiting for you to try):
  - **Wrap here (shared):** the words stay where they are and a fold forms around them holding the same words; change them in either place and both change; write around them inside the fold. If the words are deleted in the page, the fold keeps a copy ("source removed").
  - **Move into:** the words move to a new page or one you already have (folds in them travel along); a ⤷ marker stays and takes you there. Undo right after.
- ⬜ Later: several separate pieces in one fold; the same fold in several places (cross-folds); open a fold as a tab or side by side

## T4 · The book, in text ⬜
- ⬜ Fold inward / outward
- ⬜ Rearrange pages; links keep working
- ⬜ Cross-fold, cross-reference with backlinks, branch, tags
- ⬜ Open a fold in place, as a tab, or side by side (laptop)

## T5 · Timers anywhere ⬜
- ⬜ Set a timer at any moment; active or elapsed; chain them; fold them

## T6 · Claude in the app 🔨 (built; switches on once the Claude Code token is added)
- ✅ Claude page in the app: one conversation per request, Claude's replies and progress, status (Sent → Working → Ready to try → Kept / Undone)
- ✅ Vibe design, instant: text size, paper warmth, typewriter/book/clean type, dark/light, page width, line spacing, hold-button size; Keep / Undo; saved **Looks** in Settings
- ✅ Code changes go to Claude Code on GitHub; the app opens the change and shows a live preview
- ✅ Try it on a **copy** of your pages (sandbox); Keep it / Undo from the app or from the preview banner
- ✅ Changes list with "Undo this change"
- ✅ GitHub key kept only on the device; page text sent only when you tick "Include the page I was on"
- ⬜ Add the Claude Code token on the Shadow PC (`CLAUDE_CODE_OAUTH_TOKEN`)
- ⬜ Make the app's GitHub key (steps in the app) and save it on the iPhone and the laptop
- ⬜ First real run: "show a word count at the bottom" → try → keep → undo

---

## C · Claude is the book (instant tier) ✅ built
- ✅ ✦ Claude in the header (iPhone: ✦), Ctrl/⌘ K anywhere, "Ask Claude" on selected words
- ✅ Streaming replies with tools over the book: read, search, add text, change words (asks first), new pages, folds, nest, wrap, move (asks first), open/focus, memory settings, questions, tests, looks, settings
- ✅ Each action shows as a step line; "Undo Claude's changes" undoes a whole reply
- ✅ Conversations kept per page or fold, synced encrypted
- ✅ Marked Instant / Add-on / Deep; big app changes hand off to Claude Code
- ✅ Offline and no-key messages; never counts on the writing clock

## A · Add-ons (fast tier) ✅ built
- ✅ Claude builds small abilities that work in seconds (buttons, panels, hint styles), sealed: no keys, no storage, no internet, can only add words
- ✅ Versions kept; Settings → Add-ons: turn on/off, view code, remove, turn all off; problems shown in plain words
- ✅ Safe mode (`?safe`); synced between devices; undo of a just-made add-on

## P · Fold anywhere ✅ built
- ✅ Place any page or fold under words anywhere else (Nest → Place here too…): one writing, many places; edit it anywhere
- ✅ Cycle-safe: a page inside itself, pages inside each other → "↻ already open above"; the page list shows each once with "also in N places"
- ✅ "Remove from here" removes only the placement; Claude can place things too (undo works)

## K · Code-folds ✅ built
- ✅ "The App": the app's own code, read-only, folded into parts; search; notes on any part (synced); works offline
- ✅ Place a part of the code in a page or under selected words; "Change this with Claude Code" sends that code to Claude Code

## D · Drills (loop until natural, then grow) ✅ built
- ✅ A drill = saved steps over a set of folds: show it → hide it (with a hint) → type it → review word by word; loop until a rule is met (3 perfect in a row by default; or a score, or perfect and fast), then extend: the next level, the next group, then chain the groups (1+2, 1+2+3…)
- ✅ Hints fade as you get it; a word missed twice keeps a first-letter hint; three misses step back; fast perfect runs extend sooner. Each change is said in one line
- ✅ Directions: forward, backward, both. Orders: front to back, back to front, shuffled, weakest first, interleaved, chain-building, arranged by Claude (with a one-line reason)
- ✅ Edit the steps in plain words; Claude builds, changes and starts drills from plain words; a mastered drill joins spaced review and shows "due today"
- ✅ Sample: "Add sample: Psalm 23 (KJV)" in the Memory menu (6 verses × 5 levels, level 5 = the King James words)

## M · Memory palace (folds as pegs) ✅ (built and tested in a browser; waiting for you to try)
- ✅ M1 Practice: hide what's inside a fold with hints (first letters, word shapes, every other word, blank lines); press and hold to peek
- ✅ M2 Test me: on any fold or page (it and everything inside), walked in order room by room or shuffled. Prompt = the fold's words with what's inside hidden (default), or the other way round (per fold), or your own questions, or questions the AI suggested and you kept
- ✅ M3 Type it from memory → Submit → the correct answer beside yours, word by word (matched / missed / added / changed); AI feedback if you've added a key; you grade Missed / Almost / Got it / Easy (the AI's suggestion is highlighted; you can overrule). Per fold: AI suggests the grade, AI feedback but you grade, or only you. End: score, weak pegs, next review
- ✅ M4 Spaced review with FSRS (the modern open scheduler): each prompt comes back right before you'd likely forget it. Simple limits in Settings → Memory: how sure you want to be (80–95%), most reviews per day, new prompts per day, longest gap. "N to review today" in the page list; a "due" badge on folds
- ✅ Typing answers counts on the writing clock; holding counts; AI never does. Everything syncs encrypted; answers given on two devices are all kept
- ✅ The same fold in many places (Phase 4)

## AI ✅ (built; switches on when you add an Anthropic key in Settings → AI)
- ✅ Feedback on memory answers (what you got, what you missed, meaning kept, a tip, a suggested grade)
- ✅ Make questions with AI on any fold: keep, edit or drop each
- ✅ Write deeper with AI: on selected words, the AI writes a new fold and marks up to 5 phrases in it with dashed lines; each is written only when you open it and ask (you choose up to 5 levels deep). On a fold, it marks phrases inside it. Shows the cost first. AI-written folds show a dashed line and "AI" until you edit them. No writing-clock time
- ✅ Your key stays on your device; model choice (Haiku 5.5 / Sonnet 5.5); a monthly soft limit with a running estimate
- Later: Venice, ChatGPT and your own models (the code is ready for more providers)

# ⏸ ON HOLD: iPad + Apple Pencil (resume when the Pencil is replaced)
Everything below is kept. The native iPad app still builds on GitHub.



## M0 · First page and the writing clock ✅ (built, not yet on the iPad)
- ✅ One page: Pencil writes, fingers scroll and zoom
- ✅ Apple ink tools (pen, pencil, marker, eraser, lasso, ruler, widths, colors)
- ✅ Writing clock: Pencil tip down with an ink tool, or thumb held; each second counts once
- ✅ Daily total, shown "of 5:00:00", kept across launches, split at midnight
- ✅ Floating thumb button, movable, remembers its spot
- ✅ Page saves itself
- ✅ App icon
- ⬜ **Install on the iPad** (Sideloadly + cable), then run `TESTING.md → M0`

## M1 · Safety net ✅ (built, not yet on the iPad)
- ✅ Backup/export: save the page, writing-time history, tuning and thumb-button spot to the Files app
- ✅ Restore from that backup (checks the file first; changes nothing if it's damaged)

## M1.5 · One page language (needed for the Board)
So the iPad and the Board can read each other's pages.
- ⬜ Save every stroke in a simple shared form too (points, width, color, time), alongside Apple's own format
- ⬜ The iPad can open pages written in that shared form (Board pages appear as editable ink)
- ⬜ Writing time saved as start-and-stop moments (not just totals), each marked "iPad" or "Board", so the two devices merge without double-counting
- ⬜ Backup file carries the shared form, so the Board can open an iPad backup

## M2 · Claude Code in the app ★ priority one
Two speeds of change:
**instant** (adjust a setting, no rebuild) and **new feature** (Claude Code changes the code → GitHub builds → you install).

- ✅ **2.1 Live tuning panel** (built, not yet on the iPad): daily goal, thumb button size and visibility, page warmth, max zoom, fingers-can-draw. Every feel-setting the app has (e.g. how long before a shape locks, button size, ink smoothing) lives in one place you can change in the app, effective on the next stroke.
- ⬜ **2.2 Claude Code on GitHub.** Sign-in: Claude plan token (`CLAUDE_CODE_OAUTH_TOKEN`), made with `claude setup-token` on a computer running macOS 13+, Windows 10+ or Linux (the 2011 MacBook can't run it). Add the official Claude Code GitHub Action. Write `@claude …` in a GitHub issue and Claude Code edits the app, commits, and a new build starts. Owner-only, so strangers can't spend your account. Works from Safari on the iPad even before 2.3.
- ⬜ **2.3 "Ask Claude Code" inside the app.** A panel where you describe a change in your own words. It sends the request to GitHub, shows progress (working → building → ready to install), and Claude's reply.
- ⬜ **2.4 Claude chat inside the app.** Talk to Claude on a page. It can see the page you point at and change the live tuning values directly ("give me a little longer before the shape locks").
- ⬜ **2.5 Cable-free updates.** Needed so 2.2–2.3 can update the app without the Mac: TestFlight (Apple membership) or a UDID signing service with over-the-air install. Until then each new build is installed with Sideloadly + cable.

## B · The Board (big-screen Tree of Life)
TV + IR touch frame + cheap mini PC running the Board in a full-screen web browser. Marker-level, not Pencil-level.
- ✅ B1 Board page on the web (`docs/board/`): one page, marker, pen, eraser, move, 6 colors, undo/redo, white board or slate, the writing clock, a movable thumb button, export/import. Test with a mouse or any touchscreen before buying hardware
- ✅ B2 Palm handling: only the first touch draws, extra touches are ignored (wall-mounted)
- ⬜ B3 Move pages by file: open an iPad backup on the Board, and save a Board file the iPad can open
- ⬜ B4 Automatic sync between iPad and Board (pages + writing time), no files to carry
- ⬜ B5 Buy hardware only after B1 feels right: TV (have one or budget), IR touch frame (~$175 at 55"), N100-class Windows mini PC
- ⬜ B6 Board catches up with the iPad: folds, timers, links, tags as they're built
- Rule: one daily total across both devices; overlapping time counts once

## M3 · Timers anywhere
- ⬜ Place a timer at any moment, anywhere on a page
- ⬜ Each timer is **active** (follows the Pencil + thumb rule) or **elapsed** (ordinary clock)
- ⬜ **Chain** timers: when one ends, the next starts (e.g. 10 active min revise → 5 elapsed min sing)
- ⬜ Edit, pause, restart, reorder a chain at any time
- ⬜ A timer or a whole chain can live **inside a fold** (fold it away, open it later). *Needs M4 folds; until then timers sit on pages.*
- ⬜ Daily total keeps following the Pencil + thumb rule no matter which timers run

## M4 · The book
- ⬜ Many pages + a page list
- ⬜ Pages contain pages (every page is a folder)
- ⬜ Fold inward (new fold inside this one)
- ⬜ Fold outward (new fold *around* this one, from inside it)
- ⬜ A word, drawing or spot can hold a fold that opens and collapses in place
- ⬜ Rearrange: reorder, lift out of a fold, move elsewhere; contents travel along
- ⬜ Open a fold in place, as a tab, or in a floating window you can hide and call back

## M5 · Pencil feel
- ⬜ Draw-and-hold: pause at the end of a stroke → clean circle/line, adjustable while holding, set on lift (hold counts as writing)
- ⬜ Own minimal toolbar (pen, pencil, highlighter, eraser, lasso, width, favorite colors + full palette)
- ⬜ Partial-stroke and whole-stroke erasing
- ⬜ Thumb button: swipe up and hold

## M6 · Connections in the book
- ⬜ Cross-fold: one shared page opens in several places
- ⬜ Cross-reference: link a word/passage/drawing to another, with backlinks
- ⬜ Branch from here: independent version; decide how inner folds are shared
- ⬜ Tags on pages or selections; tapping a tag gathers them

## M7 · AI in the book
- ⬜ Show the AI a mark, a page, or a selection across folds
- ⬜ "Follow this page while I write"
- ⬜ AI types text, handwrites ink, annotates, uses folds/links/tags; its marks stay editable
- ⬜ Ask "why did you connect those two lines?"
- ⬜ Venice models and your own models alongside Claude
- ⬜ AI activity never adds to writing time

## M8 · The long view
- ⬜ 40-day / 200-hour view of daily totals

---

## ⏸ Back pocket
- MIDI controller / sequencer mode: piano roll + channel rack (MIDI channels, in and out), to the iPad itself or FL Studio over USB

## Dropped
- AI sketching beside the writing
