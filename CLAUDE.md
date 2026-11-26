# Notes for Claude working on The Tree of Life

The owner is a writer and songwriter, not a programmer. Reply in plain words: what changed, what they'll see, and exactly what to try. No code in replies unless asked.

Writing is "to enscribe oneself into life". Keep the spelling "enscribe".

## The app (current focus: the web app)
- `docs/` is the Tree of Life web app, used on an iPhone 16e (Home Screen app, Safari) and a 2011 MacBook (Firefox on macOS Catalina, so no newest-only browser features).
  - `docs/index.html`: pages (pages can hold pages), the writing clock, settings, export/import, look-and-feel theme.
  - `docs/claude.js`: the in-app Claude page (talks to GitHub issues/pull requests), instant look-and-feel changes, Looks, previews.
  - `docs/sync.js`: encrypted sync between the owner's devices through GitHub (branch `tol-data`, folder `sync/`).
  - `docs/sw.js`: offline support. If you add a file the app needs, add it to `SHELL` and bump `CACHE`.
  - `docs/board/`: the big-screen Board (on hold).
- `.github/workflows/pages.yml` publishes `docs/` to https://obrianwatson.github.io/tree-of-life/ and publishes every open pull request's `docs/` as a preview at `/tree-of-life/preview/<PR number>/`.
- The owner asks for changes from inside the app. Each request is a GitHub issue that starts with `@claude`. Work on your branch; the app opens the pull request for you and shows the preview. Follow-ups arrive as comments on the pull request.
- The native iPad app (`Sources/`, `project.yml`, `build.yml`) is ON HOLD until the Apple Pencil is replaced. Don't change it unless asked.

## Rules that must never break
- Never delete, rewrite or move the owner's writing or writing-time data. Storage names `tol-pages`, `tol-intervals`, `tol-ui`, `tol-theme`, `tol-looks`, `tol-sync` (and the `tol-vault` IndexedDB) keep their shape; only add fields. Previews use `tol-sbx<N>-…` copies automatically; keep that working.
- Writing time: typing counts, and the clock keeps running through a pause up to the "typing pause" setting; a longer pause stops it at the last key. Holding Option (laptop) or the thumb button (phone) counts. Each second counts once. Claude's activity never adds time.
- Look-and-feel choices belong in the theme (`THEME_DEFAULT` / `applyTheme` in index.html) so they can be changed instantly from the Claude page.
- Never put secrets in the repository. The GitHub key lives only on the owner's devices.
- SYNC IS SACRED (`docs/sync.js`): never write anything readable to the repository; never weaken the encryption (PBKDF2-SHA256 600,000 rounds → AES-GCM-256, fresh IV per write, AAD `tol-state:<deviceId>` / `tol-check`); never remove fields from `sync/meta.json` (`tol-vault`), the sealed files (`tol-sealed`: format, v, iv, ct, updatedAt) or the state inside (`tol-state`: deviceId, deviceName, savedAt, spot, prefs, pages, intervals) — only add. Never store the passphrase. Each device writes only its own `sync/<deviceId>.json`. Merging must never lose writing (conflicts become an "Other version" page inside the page). Deleted pages are markers `{id, deleted:true, updatedAt}` and must stay hidden everywhere. Previews (`/preview/`) must never sync. Don't touch the `tol-data` branch by hand.
- Synced between devices (newest wins): pages, writing time, theme, Looks, typing pause, daily goal. Stays per device: hold-button spot, device name, GitHub key, sync key.

## How to work
- Keep each change small and safe. Read the related code first. You can't run the app on a phone, so keep changes simple and test what you can (e.g. `node --check` on scripts).
- Bump `APP_VERSION` in `docs/index.html` with each change.
- Add a short checklist for the change to `TESTING.md` (concrete steps on the iPhone/laptop and what should happen) and tick off items in `ROADMAP.md` you finish.
- End with a plain-words reply: what changed, what to try in the preview, and anything to watch for.
