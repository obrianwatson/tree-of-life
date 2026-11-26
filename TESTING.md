# The Tree of Life: Build Checklists

---

## T6 · Claude inside the app

**Before you start (once)**
- [ ] Claude Code token added to GitHub (Shadow PC: `claude setup-token`, then repo Settings → Secrets and variables → Actions → `CLAUDE_CODE_OAUTH_TOKEN`)
- [ ] App's GitHub key made: GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
  - Name: Tree of Life app · Expiration: 1 year
  - Repository access: **Only select repositories** → tree-of-life
  - Repository permissions: **Contents**, **Issues**, **Pull requests** → each **Read and write**
  - Generate, copy (starts with `github_pat_`)
- [ ] Pasted into the app (Claude page or Settings → Claude Code key) on the **iPhone** and the **laptop**: it says "Connected. Claude Code is ready."

**Instant design (works even before the keys)**
- [ ] Tap **Claude** (top of the page list). Type "make the text bigger and warmer" → the page changes right away and a card says what changed
- [ ] **Look at my page** shows it; back on Claude, **Undo** puts it back; try again and **Keep it**
- [ ] Try "typewriter", "dark mode", "wider page", "more space between lines", "bigger hold button", "original look"
- [ ] Settings → Looks: name and **Save this look**, switch to another, **Use** it again; **Original look** resets
- [ ] On the iPhone, the hold button is hidden on the Claude page and comes back on your writing

**A real change from Claude Code**
- [ ] Type "show a word count at the bottom of the page" → status **Sent**, then **Claude is working…** within a minute or two
- [ ] Claude's reply appears in plain words; status becomes **Getting your preview ready…**, then **Ready to try**
- [ ] **Try it**: a green banner says "Trying…"; the word count is there; your pages are there (a copy)
- [ ] Type something in the preview, tap **Back to my real app**: your real page does NOT have that typing
- [ ] Try it again → **Keep it** in the banner → back in the real app, a banner says "Kept…"; after a minute or two, **Reload** shows the word count
- [ ] Claude → **Changes** lists it; **Undo this change** starts a new conversation that removes it (try → keep)
- [ ] Ask for something, then **Undo** while it's preparing: status **Undone**, nothing changes
- [ ] Ask for a fix while a change is **Ready to try** ("make the count smaller"): Claude works on the same change; try again

**Privacy**
- [ ] Ticking "Include the page I was on" shows the public-project warning; untick it and your page isn't sent

---

## T1 + T2 · Text app on the iPhone 16e and the laptop

**Open it**
- [ ] Laptop: open **obrianwatson.github.io/tree-of-life/** in **Firefox**
- [ ] iPhone: open the same address in **Safari** → Share → **Add to Home Screen** → open it from the Home Screen icon (use only this icon from now on; Safari tabs keep separate pages until sync arrives)
- [ ] The tree icon shows on the Home Screen and the app opens full-screen

**Pages**
- [ ] Typing works; the first line becomes the page's name in the list
- [ ] New page makes a page and the keyboard opens right away (iPhone) with no lost first letter
- [ ] "+" beside a page makes a page inside it; the arrow shows and hides inner pages
- [ ] The line at the top shows where you are (e.g. Lyrics › Chorus idea)
- [ ] iPhone: ☰ opens the page list; tapping outside closes it
- [ ] Close the app completely and reopen: same page, cursor where you left it
- [ ] Turn on Airplane Mode and reopen: it still opens and you can write

**Writing clock**
- [ ] Typing turns the dot green and counts (compare to a stopwatch)
- [ ] Pause for less than 4 s: the clock keeps going; pause longer: it stops, and the pause isn't added
- [ ] Laptop: holding Option counts; releasing stops
- [ ] iPhone: the hold button sits just above the keyboard; holding it counts, releasing stops
- [ ] Typing while holding counts each second once
- [ ] Settings → "Typing pause that still counts" changes the 4 s; "Daily goal" changes "of 5:00:00"

**Keeping your work**
- [ ] Settings → Export everything saves a file (iPhone: Files app → Downloads)
- [ ] Settings → Import that file on the other device: pages appear; "Nothing was deleted"
- [ ] Settings → Delete this page… needs a second tap; its inner pages move up a level


After every build: install it, go down that build's list on the iPad, and tick each box only when it worked. Anything that fails, note what you did and what happened, then tell Claude.

## Before the first test session (gather once)

**Things**
- [ ] Lightning to USB-A cable that carries data (Apple's own cable does; some cheap "charging only" cables don't)
- [ ] iPad charged above 50%, with at least 1 GB free (Settings → General → iPad Storage)
- [ ] Apple Pencil charged (plug it into the iPad's Lightning port for a few minutes)
- [ ] Goodnotes open on the iPad, for side-by-side ink comparison
- [ ] A phone stopwatch, to check the writing clock against real time
- [ ] 45 minutes without interruptions

**On the Mac (can be done now)**
- [ ] Sideloadly downloaded from sideloadly.io and opened once (allow it in System Preferences → Security & Privacy if macOS blocks it)
- [ ] Latest TreeOfLife.ipa downloaded from GitHub (Actions → newest green run → Artifacts → TreeOfLife-ipa) and unzipped
- [ ] Your Apple ID email and password at hand, plus a device that receives your two-factor codes

**On the iPad**
- [ ] Screen recording in Control Center (Settings → Control Center → add Screen Recording), so problems can be recorded and shown to Claude
- [ ] Note: the Developer Mode switch only appears in Settings → Privacy & Security **after** Sideloadly has tried installing the app once. So the order is: install → turn on Developer Mode → restart → trust your Apple ID → open the app.

**How to report a problem**
- What you did (step by step), what you expected, what happened, and a screen recording if you can.

---

## Every build (always run these first)
- [ ] The build on GitHub (Actions tab) shows a green check
- [ ] The app installs and opens without crashing
- [ ] Your existing pages are still there
- [ ] Today's writing total is the same as before you updated
- [ ] The thumb button is where you left it
- [ ] Quick clock check: write for about 10 seconds → the total goes up about 10 seconds

---

## M0 · First page and the writing clock

**Install**
- [ ] On the iPad: Settings → Privacy & Security → Developer Mode is on
- [ ] Sideloadly installs TreeOfLife.ipa
- [ ] Settings → General → VPN & Device Management → trusted your Apple ID
- [ ] "Tree of Life" appears on the Home Screen with the tree icon and opens

**Pencil and page**
- [ ] Pencil writes; a finger does **not** draw
- [ ] One finger scrolls; two fingers pinch to zoom in and out
- [ ] Fast cursive keeps up (compare against Goodnotes)
- [ ] Tiny dots appear
- [ ] Very light strokes appear
- [ ] Pressure changes line weight with the pen
- [ ] Tilting the pencil tool shades
- [ ] Resting your palm while writing leaves no marks
- [ ] Tool palette works: pen, pencil, marker, eraser, lasso, ruler, width, color

**Writing clock**
- [ ] Clock starts the moment the tip touches with pen/pencil/marker (dot goes green)
- [ ] Clock stops the moment the tip lifts
- [ ] A single dot adds time
- [ ] Holding the tip still at the end of a stroke keeps counting
- [ ] Erasing does **not** add time
- [ ] Lasso selecting does **not** add time
- [ ] Holding the thumb button counts; releasing stops
- [ ] Thumb down + Pencil writing together: about 10 seconds adds about 10 seconds, not 20
- [ ] Thumb down before lifting the Pencil: the clock keeps running with no gap

**Remembering**
- [ ] Drag the bar above the thumb button to a new spot → it moves
- [ ] Fully close the app (swipe it away), reopen: page, total, and button spot are all kept
- [ ] Leave the app while holding the thumb button: the clock does not keep running in the background

**Notes from this build**
- How the ink felt compared to Goodnotes:
- Anything wrong:

---

## M1 · Backup and restore

**Export**
- [ ] Write something recognizable on the page (e.g. today's date and a small drawing)
- [ ] Tap the box icon (top right) → Export backup… → save to On My iPad or iCloud Drive
- [ ] "Backup saved." appears
- [ ] The file shows in the Files app, named TreeOfLife-backup-(date)-(time)

**Restore**
- [ ] Draw something new after the backup (e.g. a big X)
- [ ] Box icon → Restore from backup… → pick the file
- [ ] The app asks "Restore this backup?" first; Cancel changes nothing
- [ ] Restore again and confirm: the page goes back to before the X
- [ ] Today's writing total goes back to what it was in the backup
- [ ] The thumb button moves back to its spot in the backup
- [ ] "Backup restored." appears

**Bad files**
- [ ] Try restoring any other .json file (or a copy of the backup edited in Files): "That file isn't a Tree of Life backup… Nothing was changed." and the page is untouched

**After reinstalling (do this once, when you next re-sideload)**
- [ ] Export a backup first, reinstall, then restore: everything comes back

---

## M2.1 · Live tuning panel

- [ ] Tap the sliders icon (top right): the Tuning panel opens beside the page
- [ ] **Daily goal:** move it to 3 h → the top reads "of 3:00:00" right away
- [ ] **Thumb button size:** slide it → the button grows and shrinks live
- [ ] **Thumb button visibility:** slide it low → the button fades; holding it still turns it green
- [ ] **Page warmth:** 0% = white paper, 100% = warm cream, changes live
- [ ] **Maximum zoom:** set 2× → pinching stops at 2×; set 10× → you can zoom much further
- [ ] **Fingers can draw:** on → a finger draws (and the clock counts it); off → a finger scrolls again
- [ ] Close and reopen the app: every tuning value is kept
- [ ] **Reset everything to defaults** puts all values back (goal 5 h, size 88, etc.)
- [ ] With tuning changed, writing-time rules still hold (erasing doesn't count, both inputs count once)

---

## B1 · The Board (test with a mouse or any touchscreen)

**Open it**
- [ ] Opens in Chrome or Edge on the Shadow PC or the Mac
- [ ] More → Full screen fills the screen (or press F11)

**Drawing**
- [ ] Marker draws a thick line; Pen draws a thin one
- [ ] A single click/tap makes a dot
- [ ] All 6 colors work; More → Switch to slate turns the board dark (and black marker becomes white)
- [ ] Eraser removes any line it touches
- [ ] Undo and Redo work (also Ctrl+Z / Ctrl+Shift+Z)
- [ ] Move tool (or mouse wheel) scrolls the board up and down
- [ ] More → Clear page… asks for a second tap; Undo brings the page back

**Writing clock**
- [ ] Drawing with Marker or Pen runs the clock (dot goes green); lifting stops it
- [ ] Erasing and Move don't run the clock
- [ ] Holding the round "hold" button runs the clock; releasing stops it
- [ ] Holding the button while drawing counts each second once (compare to a stopwatch)
- [ ] Drag the small bar above the button to move it; reload the page and it stays there

**Keeping your work**
- [ ] Reload the page: the drawing and today's total are still there
- [ ] More → Export page saves a file (on the GitHub Pages version) or shows the data to copy (on the claude.ai preview)
- [ ] More → Import page with that file brings the page back; Undo returns to what was there

**On the real touch frame (later)**
- [ ] A finger or stylus draws; a second hand on the board doesn't draw
- [ ] Holding the thumb button with one hand while writing with the other works
