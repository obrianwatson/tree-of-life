# The Tree of Life

A book of pages and a timer. Writing is to enscribe oneself into life.

## What's here (version 0.1)

- **One page** using Apple's PencilKit. Only the Pencil writes. Fingers scroll and pinch to zoom. The page is saved on the iPad.
- **Apple's tool palette**: pen, pencil, marker, eraser, lasso, ruler, widths, colors.
- **The writing clock**: it runs while the Pencil tip is down with a pen, pencil or marker, or while your thumb holds the floating button. Erasing and lasso don't count. When both are active, each second counts once. Today's total shows at the top, out of 5:00:00, and carries over between launches.
- **The thumb button**: hold the circle to count time. Drag the small bar above it to move the button, and it stays where you put it.

## How it gets built

Your Mac (Catalina, Xcode 12.4) can't install apps on an iPad running iPadOS 17, so a Mac rented from GitHub builds the app instead.

1. Every push to GitHub builds the app and saves `TreeOfLife.ipa` as a download on the run's page (Actions tab → latest run → Artifacts).
2. **Installing for free (now):** on the iPad, turn on Settings → Privacy & Security → Developer Mode and restart. On the Mac, open Sideloadly (sideloadly.io), plug in the iPad, drop in `TreeOfLife.ipa`, enter your Apple ID and press Start. Then on the iPad go to Settings → General → VPN & Device Management and trust your Apple ID. With a free Apple ID the app stops opening after 7 days. Run Sideloadly again to renew it. Your pages stay saved.
3. **Later, with the membership:** add a step that signs the app and sends it to TestFlight, so installing no longer needs the Mac.
