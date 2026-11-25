# The Tree of Life: Roadmap

A book of pages and a timer. Writing is to enscribe oneself into life.

How we work: one milestone at a time. Each build ends with its checklist in `TESTING.md`. A box is ticked only after it's been tried on the iPad.

Status key: ✅ done · 🔨 in progress · ⬜ not started · ⏸ on hold

---

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
