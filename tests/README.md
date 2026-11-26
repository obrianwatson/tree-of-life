# Browser tests for the Tree of Life web app

They open the app (`docs/`) in Chrome through Playwright, on a laptop-sized window and an
iPhone 13-sized one, and check that things behave. GitHub is faked in memory for sync, so
nothing touches the real repository.

## Run

```
pip install playwright        # once (and `playwright install chromium` if Chrome isn't installed)
python3 tests/test_basics.py      # pages, writing clock, hold, Claude page look changes
python3 tests/test_folds.py       # folds: create, overlap, picker, edits, staircase, focus view, resume, export/import, alignment
python3 tests/test_folds_sync.py  # folds between two devices through encrypted sync
python3 tests/test_memory.py      # Nest in (wrap/move), memory tests, practice, FSRS, AI (Anthropic faked), old data
python3 tests/test_memory_sync.py # memory history, settings and shared words between two devices
```

Set `CHROME=/path/to/chrome` if Chrome isn't at `/usr/bin/google-chrome`, and `SHOTS=/some/folder`
to choose where `test_folds.py` and `test_memory.py` save their screenshots. Each script prints PASS/FAIL lines and
exits non-zero if anything failed. `helpers.py` holds the shared local server and fake GitHub.
