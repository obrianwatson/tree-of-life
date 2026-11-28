# Browser tests for the Book of Living Waters

They open the app (`docs/`) in a real browser through Playwright, on a laptop-sized window and an
iPhone 13-sized one, and check that things behave. GitHub is faked in memory for sync, so
nothing touches the real repository (the one exception, `real_sync.py`, is described below).

GitHub runs all of these by itself on every change, in three browser engines, and keeps the
outcome on the `test-results` branch: see `.github/workflows/tests.yml` and `TESTPLAN.md`.

## Run

```
pip install playwright        # once (and `playwright install chromium` if Chrome isn't installed)
python3 tests/test_core.py        # BOLW Core (docs/core/): all seven stages; `python3 tests/test_core.py 7` runs one (see AGENTS.md)
python3 tests/test_basics.py      # pages, writing clock, hold, Claude page look changes
python3 tests/test_folds.py       # folds: create, overlap, picker, edits, staircase, focus view, resume, export/import, alignment
python3 tests/test_folds_sync.py  # folds between two devices through encrypted sync
python3 tests/test_memory.py      # Nest in (wrap/move), memory tests, practice, FSRS, AI (Anthropic faked), old data
python3 tests/test_memory_sync.py # memory history, settings and shared words between two devices
python3 tests/test_onboard.py     # onboard code: bootloader + vault, try/keep/undo with self-test, isolation, offline, fallback, safe mode, rollback, diff, version sync, publish
python3 tests/test_anywhere.py    # fold anywhere (placements, cycles, also-in-N) and code-folds (The App, notes, place, Claude Code hand-off, offline), two-device sync
python3 tests/test_drill.py       # drills: Psalm 23 sample, loop/extend/chain, adapting, orders, directions, rules, spaced review, Claude's drill tools
python3 tests/test_drill_sync.py  # drills, conversations and add-ons between two devices (encrypted)
python3 tests/test_addons.py      # add-ons: made by Claude, sealed (no storage/keys/network/removing words), versions, off, safe mode
python3 tests/test_agent.py       # Claude in the book: streaming, tools, ask-first, undo, per-page conversations, offline (Anthropic faked)
python3 tests/test_safety.py      # nothing gets lost: the "Not saved" bar and its rescue copy, safety copies, Recently deleted, import never deletes, no page inside itself, hold across sleep, one tab at a time, strangers' comments, Check this device, AI workspace
python3 tests/test_sync_delta.py  # sync sends only what changed (delta files), a bad file never locks a device, version 1.1 still syncs with this one, the leave-the-app save fits
python3 tests/test_boot.py        # opening: sealed frames can't reach another website, a slow network doesn't block opening, late updates are offered, opens offline
```

`BROWSER=webkit` or `BROWSER=firefox` runs any of them in Safari's engine or Firefox (after
`playwright install webkit firefox`); the default is Chrome.

`tests/real_sync.py` is different: it syncs three devices through the REAL GitHub. It only runs
inside GitHub Actions (it needs a key that can write to the project), swaps the branch name
`tol-data` for a scratch branch in the app's requests, writes only made-up text, and the workflow
deletes the scratch branch afterwards. `REAL_SYNC_FAKE=1 python3 tests/real_sync.py` rehearses it
against the fake GitHub.

Set `CHROME=/path/to/chrome` if Chrome isn't at `/usr/bin/google-chrome` (leave it empty to use Playwright's own Chromium), and `SHOTS=/some/folder`
to choose where `test_folds.py` and `test_memory.py` save their screenshots. Each script prints PASS/FAIL lines and
exits non-zero if anything failed. `helpers.py` holds the shared local server and fake GitHub.
