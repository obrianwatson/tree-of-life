# The Tree of Life

A book of pages and a timer. Writing is to enscribe oneself into life.

## What's here (version 0.1)

- **One page** using Apple's PencilKit. Only the Pencil writes. Fingers scroll and pinch to zoom. The page is saved on the iPad.
- **Apple's tool palette**: pen, pencil, marker, eraser, lasso, ruler, widths, colors.
- **The writing clock**: it runs while the Pencil tip is down with a pen, pencil or marker, or while your thumb holds the floating button. Erasing and lasso don't count. When both are active, each second counts once. Today's total shows at the top, out of 5:00:00, and carries over between launches.
- **The thumb button**: hold the circle to count time. Drag the small bar above it to move the button, and it stays where you put it.

## How it gets built

Every push to GitHub builds the app on GitHub's Mac (`.github/workflows/build.yml`).

- **Until the Apple secrets are added**, the build only checks that the app compiles.
- **Once the four secrets are added** (Settings → Secrets and variables → Actions: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`), each build is signed and sent to TestFlight. Install and update it on the iPad through the TestFlight app.
