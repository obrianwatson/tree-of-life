# The Book of Living Waters: Build Checklists

**Start with `TESTPLAN.md`.** Robots now test everything they can on every change, and each device can check itself
(Settings → Check this device). The lists below are for trying a feature by hand when you want to.

---

## BOLW Core (`/tree-of-life/core/`): try it with the guided tests

Each stage has a short guided test: the real app on its own sample book (never your real book, never synced). Each check has **Show me** (a finger does it slowly, then everything is put back), then you try it and tap **Works** or **Something's off**.

Open `https://obrianwatson.github.io/tree-of-life/core/test/?s=1` and change the number at the end for the stage:

1. The core, the writing clock and Hold
2. Fold: what's within (closing and opening, a space within a line, trace back, sharing one fold in two places, gates, names)
3. Link and the Map
4. Bookmarks
5. The fast AI and requests
6. Commands and Automations
7. The harvest

By hand, on the real app (`/tree-of-life/core/`), the things a robot can't feel:
- [ ] iPhone: type a long paragraph fast. Nothing lags, the bar stays above the keyboard, the page never jumps.
- [ ] MacBook (Firefox): the same, in a leaf with a few hundred lines.
- [ ] Both: leave the app open while a new version is published. It never reloads while you're typing; when you stop, it updates and you're back on the same line.
- [ ] Both: turn on sync with your passphrase on one device, then the other. A line written on one arrives on the other.
- [ ] iPhone: Airplane Mode. Open the app from the Home Screen, write, run `;today`. Turn the internet back on: it syncs.
- [ ] `/tree-of-life/core/safe/` opens and shows your book even if the app itself won't start.

---

## H · Hardening (versions 1.2–1.3): nothing lost, sync that lasts
**Nothing gets lost**
- [ ] Laptop: open the book in a second tab. It says the book is already open and pauses. "Use it here instead" swaps them
- [ ] Delete a page (Settings → Delete this page…, twice). Settings → Safety copies → Recently deleted → Restore: it's back, word for word
- [ ] A few seconds after writing, Settings → Safety copies shows today's copy. "This page as it was" adds an "Earlier version" page inside the page; nothing is replaced
- [ ] Bottom of Settings shows "Backups: …" and "Storage on this device: …"
- [ ] iPhone: Settings → Export everything opens the share sheet. Choose Save to Files
- [ ] Import an old export: nothing disappears, even pages you deleted in that old file's time

**Sync (after it's on for both devices)**
- [ ] Write a line on the phone; it shows on the laptop within about 15 seconds (at once when you click into the laptop)
- [ ] Leave the phone mid-sentence (go to the Home Screen). Open the laptop: the sentence is there
- [ ] Settings → Check this device: Sync says "Synced" with "base file up, delta file up"

**Opening**
- [ ] Airplane mode on: the book opens from the Home Screen and you can write. Airplane mode off: it syncs
- [ ] On a weak connection the book still opens within a few seconds; if an update arrives late, a small note offers it

**Small things you asked for**
- [ ] Laptop: Ctrl+1 … Ctrl+5 turn your text blue, green, red, purple, gold; Ctrl+0 goes back
- [ ] Claude page: scroll up in a long reply and wait; it stays where you are

---

## O · Onboard, self-changing code
- [ ] Open the app as usual: it opens as before (it now starts through a tiny starter page).
- [ ] ✦ Claude: "put a little flower on the New page button". A full-screen "Trying: …" opens with the self-test list (all ✓) and the app below, running on a copy. Type there: your real book doesn't change.
- [ ] **What changed**: plain words (which part, lines added/removed). **Keep**: the app restarts with the flower. Your writing is all there.
- [ ] Settings → App versions: "Running: onboard version 1". **What changed**, **Return to published version** (no flower), **Use this** on version 1 (flower back).
- [ ] Airplane mode, then reopen: it still opens, with your version.
- [ ] Add `?safe` to the address (or hold Shift while it opens on the laptop, or tap "Start safely instead"): the published version with no add-ons. Remove it: your version is back.
- [ ] With sync on: keep a change on the laptop; on the iPhone a message offers "Reload"; after reloading it has the change. Tick "Keep this device on this version" on the iPhone: later changes from the laptop don't move it.
- [ ] Settings → App versions → **Publish to GitHub…** → pull request: GitHub shows a pull request with only the changed file.
- [ ] If anything ever goes wrong while starting, you'll see "A change didn't work, so I started the last good version. Undo it?" — tap **Undo it**.

## P · Fold anywhere
- [ ] Make a fold in page A. In page B select a word → **Nest** → **Place here too…** → pick that fold. It opens in B too, with a ⇄ head "the same writing, also in 1 place".
- [ ] Type in it inside B. Go to page A and open the fold: your new words are there too.
- [ ] Page list: the fold shows once, saying "also in 1 place".
- [ ] In page A, place page A itself under one of its words: it says "↻ already open above" (no endless loop).
- [ ] **Remove from here**: the placement goes; the fold and its writing stay.
- [ ] With sync on: the placement shows on the other device (open it there); writing through it there reaches the laptop.

## K · Code-folds
- [ ] Page list → **The App**: the app's files, each opens into parts. "Find in the code": type "writing clock".
- [ ] Open a part: the code shows, read-only. Write a note under it; leave and come back: the note is kept (and syncs).
- [ ] **Place in a page…** → pick a page: a "⌘ file · part" line appears at the end with the code folded under it.
- [ ] Select words in a page → **Nest** → **App code…** → pick a part: it folds under your words.
- [ ] **Change this with Claude Code**: the Claude page opens with that code in the request box, ending "What I'd like changed:".
- [ ] Airplane mode: The App still opens (after you've opened it once online).

## D · Drills
- [ ] Open Memory (top of the page list) → **Add sample: Psalm 23 (KJV)**. A page "Psalm 23 (KJV)" appears with Verse 1–6; each verse opens to Level 1–5 (Level 5 is the King James words). The drill's steps open in plain words.
- [ ] **Save and drill.** You see "God cares for me." → **Hide it** → a hint (G c f m.) → type it → **Check** → Perfect. The clock counts while you type.
- [ ] Do it 3 times right in a row: a line says Level 2 joins. The next round asks Level 1, then Level 2. The hint fades as you get it.
- [ ] Leave one word out twice: a line says that word now keeps its first letter. Get it wrong 3 rounds in a row: a line says it steps back.
- [ ] Hold **Hold to peek**: the words show while you hold. A right answer after a peek isn't counted as perfect.
- [ ] **Edit drill**: change "3" to 1, the order, or "Backward" (it then shows the verse and asks "Level 1"). Save. It drills the new way.
- [ ] Ask ✦ Claude: "make a drill for verse 4, two in a row, both ways" → a new drill in Memory → Drills. **Undo Claude's changes** removes it.
- [ ] When it's all mastered (try with 1 in a row), it chains the verses, then says Mastered; later "Drills · 1 due today" shows in the page list, and a review is the whole psalm once.
- [ ] With sync on: the drill and how far you got show on the other device.

## A · Add-ons

- [ ] Ask Claude: "add a word count button" — within seconds a **Words** button appears in the header; tapping it shows the count
- [ ] Settings → **Add-ons** lists it; **View code** shows it; **Turn off** removes its button at once
- [ ] Ask Claude to change it ("call the button Count") — the new version runs; Settings shows v2
- [ ] Right after Claude makes one, **Undo Claude's changes** removes it
- [ ] With sync on, the add-on appears on your other device too
- [ ] If something goes wrong: Settings → Add-ons → **Restart in safe mode** (or add `?safe` to the address) — the book opens with no add-ons

---

## C · Claude in the book

**Switch it on (once per device)**
- [ ] Settings → AI has your key (with Claude Max: claude.ai → Settings → Billing → API credits → Link organization; then platform.claude.com → API Keys → Create)
- [ ] Tap **✦ Claude** in the header (laptop: or press Ctrl/⌘ K). A panel opens.

**Talk and act**
- [ ] Ask "what is this page about?" — the reply appears as it's written
- [ ] Say "fold a memory under the word tree" — a fold appears under "tree", and a line like "Folded under “tree”" shows in the panel
- [ ] Tap **Undo Claude's changes** — the fold is gone; your words are untouched
- [ ] Say "change brown to green" — Claude asks first; **Don't** keeps your words, **Allow** changes them
- [ ] Say "make the text a little bigger" — the look changes at once; Undo puts it back
- [ ] Select some words → **Ask Claude** — the panel shows "About: …"
- [ ] Your writing clock doesn't move while Claude works
- [ ] Close and reopen the app: the conversation for that page is still there (and on your other device, with sync on)
- [ ] Turn on Airplane Mode and try: "You're offline…", and your book still works
- [ ] Ask for something big ("rebuild the sidebar") — it hands off to the Claude Code page (marked Deep)


## N · Nest in… (wrapping words outward)

**Wrap here (shared)**
- [ ] Select a few words (e.g. "Your chair") → **Nest in…** → **Wrap here: new**
- [ ] A fold opens under the line holding the same words, softly tinted, with the caret before them
- [ ] Type before or after the tinted words inside the fold: the page above doesn't change
- [ ] Change a tinted word inside the fold (e.g. add "old"): the page above changes the same way
- [ ] Change those words in the page: the fold changes too
- [ ] Delete those words from the page: the fold stays, shows "source removed: a saved copy", and keeps its words
- [ ] **Wrap here: existing…** on other words: pick a page; that page moves here, around the words, with the words added at its end (tinted)

**Move into**
- [ ] Select a sentence → **Nest in…** → **Move into: new page**: the sentence leaves, a ⤷ stays, and a new page holds it (in the page list, inside this page)
- [ ] A fold that was inside the moved words goes with them
- [ ] Tap the ⤷ → **Go to "…"** opens where the words went
- [ ] Right after a move, **Undo** (bottom of the screen) puts everything back
- [ ] **Move into: existing…** adds the words to the end of the page you pick

## M · Memory (folds as pegs)

**Test me**
- [ ] Make a fold on a few words and write something inside it
- [ ] On the fold, tap **More…** → **Test me on this**: you see the fold's words, and what's inside is hidden
- [ ] Type what you remember (the writing clock counts it), tap **Submit** (laptop: Command+Enter)
- [ ] The correct answer is beside yours: missed words in amber, extra words struck in pink, changed words in blue
- [ ] Each grade button says when it comes back (Missed: in 10 min; Easy: much later)
- [ ] Grade it; at the end you see a score, the weak pegs, and **Practice the weak ones now**
- [ ] **More… → In tests, hide → The words it's folded under**: now the test shows what's inside and asks for the words
- [ ] **More… → My questions**: add "How many …?" with an answer (or leave the answer empty to use the fold); it comes up in the next test
- [ ] Page list → **Memory** → **Test this page**: every fold and question in the page comes up; choose **Shuffled** to mix them

**Practice**
- [ ] **More… → Practice: hide what's inside**: the fold shows first letters only (e.g. "T p, o c.")
- [ ] Press and hold **Hold to peek**: the words show; let go: hidden again
- [ ] **Hints while practicing**: try Word shapes, Every other word, Blank lines
- [ ] **Stop practicing** shows the words again

**Spaced review**
- [ ] After a test, the page list says "Memory · N to review today" (or "Nothing due today")
- [ ] The next day (or after Missed, 10 minutes later), folds due show a pink **due** badge
- [ ] **Memory → Review what's due** runs only what's due today
- [ ] **Settings → Memory**: change "How sure you want to be" (higher = more reviews), reviews per day, new per day, longest gap
- [ ] With sync on: answer on the iPhone, then open the laptop: the answer is there, and the same things are due on both

## A · AI (feedback, questions, AI folds)

**Get a key (once)**
1. In a browser, go to **console.anthropic.com** and sign in (or sign up).
2. **Billing** → add a small amount of credit (e.g. $5) and set a monthly limit there too.
3. **API Keys** → **Create Key** → name it "Tree of Life" → copy it (it starts with `sk-ant-`).
4. In the Tree of Life: **Settings → AI** → paste it → **Save** → **Test key** (should say "The key works").
5. Do steps 4 on each device (the key stays on each device; it isn't synced).

**Checks**
- [ ] Take a test on a fold: after Submit, an **AI feedback** box shows what you got, missed, the meaning, and a tip; one grade button is outlined as "AI suggests"; you can still choose another
- [ ] **More… → Reviewing my answers → Only me**: no AI box any more
- [ ] **More… → Make questions with AI**: about 5 questions appear; edit one, untick one, **Keep checked**; the kept ones come up in tests
- [ ] Select words → **Write deeper with AI**: it shows the cost first; type what you want (optional) → **Write it**: a new fold with an "AI" mark and a dashed line, and a few dashed phrases inside it
- [ ] Open a dashed phrase: nothing is written until you tap **Write this with AI**; or write in it yourself; or **Remove this fold**
- [ ] Edit an AI fold: its "AI" mark and dashed line go away (it's yours now)
- [ ] The writing clock doesn't move while the AI writes
- [ ] **Settings → AI** shows about how much has been used this month; set the monthly limit low to see AI pause
- [ ] Turn on Airplane Mode and take a test: you can still grade; the AI box says it isn't available


## F · Folds in the text

**Make folds**
- [ ] Write "The tree is brown." Select the whole sentence → **Nest** (the green button just below your selection) → **New text**. A box opens right under the line, stepped in, with a colored line on its left; the sentence gets a colored underline. Type inside it.
- [ ] Back in the page, select just "tree" → Nest → New text. A second underline appears in a different color.
- [ ] Select just the "b" of "brown" → Nest → New text. One letter can be a fold too.
- [ ] Make two folds that overlap ("tree is" and "is brown"): the words in the middle show both lines, stacked, in different colors.

**Open and close**
- [ ] Tap into folded words: a small bar appears above the line, listing each fold there with its color dot. Tap one to open it; tap "Fold away" on it (or in the bar) to close it.
- [ ] The switch at the bottom of the page list: **Folds hidden** removes the lines; **Folds shown** brings them back.

**Writing around folds**
- [ ] Type before a folded word: the underline stays on the same word.
- [ ] Type in the middle of a folded word: the underline grows to include it.
- [ ] Delete all of a fold's words: the fold isn't lost — in the page list it shows as "unattached fold".
- [ ] With a fold open in the middle of a page, Backspace at the start of the line below it joins the lines; Enter splits them again. Arrow keys move in and out of the open fold.

**Staircase and focus**
- [ ] Inside a fold, select words and nest again, and again: three steps in, each further right. Write in the deepest one; the clock counts.
- [ ] On a fold, tap **Open on its own**: it becomes the page; the path at the top shows Book › page › fold.
- [ ] Tap **‹ Step out**: you're one level up, with the fold you were in open in place. Tap a name in the path to jump further out.
- [ ] Close the app while writing in a fold and reopen: you're back in that fold, cursor where you left it.

**Between devices (with sync on)**
- [ ] Make a fold on the laptop; on the iPhone, open the same page: the same words are underlined (open/closed is per device).
- [ ] Type before the fold on one device; on the other, the underline is still on the same word.

**Existing pages**
- [ ] Select words → Nest → **Existing page or fold…** → search → pick a page. It moves under those words (it disappears from where it was in the list).


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

## T3 · Sync between your iPhone and laptop

**Turn it on (laptop first)**
- [ ] Laptop: Settings → Sync between your devices → **Turn on sync**
- [ ] Tap **Suggest one** (or type five or six words of your own) and **write the passphrase down on paper**
- [ ] Type it in both boxes → **Turn on sync**. After a few seconds: "Sync is on…" and the top bar says **Synced**
- [ ] iPhone (the Home Screen app): Settings → **Turn on sync** → type the same passphrase → **Unlock**. Capitals don't matter
- [ ] Within a few seconds your laptop pages appear on the iPhone

**Wrong passphrase**
- [ ] On one device, Settings → Turn off on this device, then Turn on sync with a wrong passphrase: it says it doesn't match, and nothing changes. Then use the right one

**Write on one, see it on the other**
- [ ] Type a line on the laptop and stop. Within about 15 seconds it shows on the iPhone (no tapping needed)
- [ ] Type on the iPhone, then switch to another app or lock the phone. Open the laptop's Firefox tab: the line is there almost at once
- [ ] Open the app on the iPhone after writing on the laptop: it opens on the page you were writing, cursor where you stopped

**Your look follows you**
- [ ] On the iPhone's Claude page say "make the text bigger and warmer" → Keep it. On the laptop, within a few seconds, the page shows the same look
- [ ] Save a Look in Settings on one device: it appears in Looks on the other

**Offline**
- [ ] Turn on Airplane Mode on the iPhone and write a line. The top bar says "Offline — will sync later"
- [ ] Turn Airplane Mode off: it says Synced, and the line reaches the laptop

**Both devices at once (conflict)**
- [ ] Turn on Airplane Mode on the iPhone. Change the same page on both devices
- [ ] Turn Airplane Mode off and wait a few seconds: the page has the newer writing, and inside it there's a page called "Other version (…)" holding the other writing. Nothing is lost

**Delete**
- [ ] Delete a page on one device: within about 15 seconds it's gone on the other too

**Safety check (optional)**
- [ ] On GitHub, switch the branch to `tol-data` and open a file in `sync/`: it's only scrambled letters, none of your words

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

## BOLW Essentials (/bolw/)
Use the guided test page: https://obrianwatson.github.io/tree-of-life/bolw/test/ (the real app on a sample book). It walks through the 11 checks with Show me, then you try it, answer Works / Something's off, and send.
The real app is https://obrianwatson.github.io/tree-of-life/bolw/ . First time there: Notes → Settings → paste the AI key (and, for sync, the GitHub key and your passphrase).
