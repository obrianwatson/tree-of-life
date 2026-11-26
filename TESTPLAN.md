# The test plan: how we keep the book working

The book is built. From here on we polish. This is how we do that without breaking what works, and with as
little of your time as possible.

## The short version

1. **Robots test everything they can, on every change.** I read the results. You do nothing.
2. **Each device checks itself with one tap** and sends me the report.
3. **You check the few things only a hand and an eye can judge.** About 10 minutes, once.

---

## 1. What the robots do (my part)

- **What:** 14 test files with about 500 checks. They open the book in a real browser and use it like you would:
  type, fold, nest, test memory, run drills, talk to Claude (a stand-in), sync two and three "devices", go
  offline, fill the storage, open two tabs, delete and restore, import and export.
- **Where:** in three browser engines: Chrome's, Safari's (your iPhone) and Firefox (your laptop).
- **When:** every time the app changes, by themselves, on GitHub. Nobody has to start them.
- **Sync, for real:** one more test syncs three devices through the real GitHub, on a scratch branch that is
  deleted afterwards. Your real sync data is never touched.
- **Where the results go:** a small branch of the project named `test-results`. I read it at the start of
  every session. If something is red, I fix it before anything else.
- **Why:** so a change can never quietly break something you rely on.

## 2. What each device does (one tap, your part)

**Settings → Check this device → Send it to Claude** (or **Copy the report** and paste it to me).

- **What it checks:** saving, storage in use, safety copies, encryption, opening without internet, sync, your
  keys (only whether they work, never their values), and the health of the book.
- **What's in the report:** yes/no results, counts and sizes. **None of your writing.**
- **When:** after an update where I say "please run the device check", or any time something feels off.
- **Why:** only your iPhone and your laptop know their own storage, their offline helper and their keys.

## 3. What only you can judge (10 minutes, once)

| # | Do this | You should see | Why it's yours |
|---|---------|----------------|----------------|
| 1 | Laptop: Settings → Sync → Turn on sync → Suggest one. **Write the passphrase down.** Turn on. | "Sync is on." | Only you may know the passphrase. |
| 2 | iPhone: Settings → Sync → Turn on sync → type the same passphrase. | "Unlocked." Your pages appear. | Same. |
| 3 | Write a line on the phone. Look at the laptop. Then the other way round. | The line shows up within about 15 seconds (at once when you click into the laptop). | Proves your two real devices talk. |
| 4 | iPhone: tap in your text so the keyboard comes up. Type. | You can see the line you're typing, and the round hold button sits above the keyboard. | Only a hand can feel a keyboard. |
| 5 | iPhone: Settings → Export everything. | The share sheet opens. Choose **Save to Files**. | Robots can't see the share sheet. |
| 6 | iPhone: Airplane mode on. Open the book from the Home Screen. Write a line. Airplane mode off. | It opens and you can write. When you're back online it says Synced. | Only a real phone can lose its signal. |
| 7 | On both: Settings → Check this device → Send it to Claude. | "Sent." | So I can see what your devices see. |

If any step doesn't do what the table says, tell me the step number. That's all I need.

---

## How we work together from here

1. **You:** one line. What felt wrong, or what you want.
2. **Me:** I change it. The robots run in three engines, plus the real-GitHub sync.
3. **Me:** I tell you what changed and, at most, three things to look at.
4. **You:** tap **Check this device** if I ask. Nothing else.

You never need to open GitHub, a terminal or a settings page somewhere else for this.

## What's next, in order, and why

1. **Your 10-minute list above.** Why: sync is your real backup, and it's the one thing I can't turn on for you.
2. **A compact archive for your writing time** (mine). Why: every typing burst is saved as one entry. At five
   hours a day they would fill the phone's small storage in a month or two. The archive keeps every second,
   exactly, in a fraction of the space. Until it's built, Settings shows how full the storage is and warns you
   long before it matters.
3. **Then we learn the book by using it.** Psalm 23, one verse, one drill.

## What the robots can't promise (the honest list)

- They use Safari's engine on a test machine, not a real iPhone. The keyboard, the share sheet and the Home
  Screen are yours to judge (steps 4 to 6).
- They can't know how full your phone's storage is, or whether your keys work. The device check can.
- Claude in the book is tested with a stand-in for Anthropic. The real thing needs your key (Settings → AI).
  If the key test asks for a workspace, there is now a box for the Workspace ID.
- The safety copies live on the device. If a device is lost or its browser data is cleared, only sync or an
  exported file brings the book back. That's why step 1 matters most.
