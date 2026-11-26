"""Folds travel between two devices through (fake) GitHub, encrypted.
Run:  python3 tests/test_folds_sync.py"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, FakeGitHub, CHROME
from test_folds import nest_new, select
from playwright.async_api import async_playwright

C = Checks()
PASS = "lantern orchard velvet river copper moth"

async def settle(pg):
    for _ in range(150):
        s = await pg.evaluate("window.__tolSync.state()")
        if not s["running"]:
            return s
        await pg.wait_for_timeout(100)

async def sync(pg):
    await settle(pg)
    await pg.evaluate("window.__tolSync.syncNow('resume')")
    return await settle(pg)

async def open_settings(pg):
    if await pg.locator("#menu").is_visible():
        await pg.click("#menu"); await pg.wait_for_timeout(250)
    await pg.click("#settingsBtn"); await pg.wait_for_timeout(200)

async def pages(pg):
    return {k: v for k, v in (await pg.evaluate("window.TOL.data().pages")).items() if not v.get("deleted")}

async def placed(pg, pid):
    return await pg.evaluate("id => window.TOL.folds.placed(id)", pid)

async def main():
    url = serve(8814)
    fake = FakeGitHub()
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ctxA, A = await new_device(br, url, fake, viewport={"width": 1280, "height": 800})
        ctxB, B = await new_device(br, url, fake, **p.devices["iPhone 13"])

        # A writes a page with a fold, turns sync on; B joins
        await A.click("#writer textarea")
        await A.keyboard.type("The tree is brown.\nSecond line.", delay=3)
        await nest_new(A, "tree", inner="roots under the porch")
        root = await A.evaluate("JSON.parse(localStorage.getItem('tol-ui')).last")
        fold = next(v for v in (await pages(A)).values() if v.get("anchor"))
        await open_settings(A)
        await A.click("#syncOn"); await A.wait_for_timeout(300)
        await A.fill("#sp1", PASS); await A.fill("#sp2", PASS); await A.click("#spGo")
        await A.wait_for_function("document.getElementById('syncArea').textContent.includes('Sync is on')", timeout=30000)
        await A.evaluate("document.getElementById('settings').close()")
        await settle(A)
        await open_settings(B)
        await B.click("#syncOn"); await B.wait_for_timeout(300)
        await B.fill("#jp", PASS); await B.click("#jpGo")
        await B.wait_for_function("document.getElementById('syncArea').textContent.includes('Unlocked')", timeout=30000)
        await B.evaluate("document.getElementById('settings').close()")
        await settle(B)
        pb = await pages(B)
        C.ok(fold["id"] in pb and pb[fold["id"]]["anchor"]["text"] == "tree", "the fold arrives on the other device with its words")
        await B.evaluate(f"window.TOL.goTo('{root}', 0, Date.now())"); await B.wait_for_timeout(200)
        pl = await placed(B, root)
        C.ok(len(pl) == 1 and pl[0]["s"] == 4, f"…and sits on 'tree' there too ({pl})")
        C.ok(await B.locator("#writer span.fm").count() >= 1, "the other device draws the fold line")

        # typing before the fold on A moves it on B
        await A.wait_for_timeout(3200)
        await A.locator("#writer > .node > .chunk textarea").first.click()
        await A.keyboard.press("Control+Home"); await A.keyboard.type("Yes, ", delay=5)
        await A.wait_for_timeout(500)
        await sync(A); await sync(B)
        pa, pb = await placed(A, root), await placed(B, root)
        C.ok(pa == pb and pa[0]["s"] == 9, f"after typing before the fold on the laptop, both devices agree where it is ({pa[0]['s']}, {pb[0]['s']})")

        # a parent edit that arrives without the fold's new position: the fold finds its words
        await A.wait_for_timeout(4600)   # not mid-typing, so the change is shown rather than kept as "Other version"
        await A.evaluate(f"""(() => {{ const d = window.TOL.data(); const p = d.pages['{root}'];
            const np = Object.assign({{}}, p, {{ text: 'Well now. ' + p.text, updatedAt: Date.now() }});
            const P = Object.assign({{}}, d.pages, {{ ['{root}']: np }});
            window.TOL.replaceData(P, d.intervals); document.dispatchEvent(new Event('tol:changed')); }})()""")
        await sync(A); await sync(B)
        pb = await placed(B, root)
        txt = (await pages(B))[root]["text"]
        C.ok(txt.startswith("Well now.") and pb and txt[pb[0]["s"]:pb[0]["e"]] == "tree", f"a fold whose stored position is out of date still finds 'tree' ({pb}, {txt[:20]!r})")

        # at the same time: A types in the page, B writes inside the fold → both kept, no 'Other version'
        await A.wait_for_timeout(3200); await B.wait_for_timeout(100)
        await B.evaluate(f"window.TOL.goTo('{fold['id']}', 0, Date.now())"); await B.wait_for_timeout(300)
        await B.locator("#writer > .node > .chunk textarea").first.click()
        await B.keyboard.press("Control+End"); await B.keyboard.type(" and the swing", delay=5)
        await A.locator("#writer > .node > .chunk textarea").first.click()
        await A.keyboard.press("Control+Home"); await A.keyboard.type("Oh. ", delay=5)
        await A.wait_for_timeout(3500); await B.wait_for_timeout(500)
        for _ in range(2):
            await sync(A); await sync(B)
        for name, pg in (("laptop", A), ("iPhone", B)):
            ps = await pages(pg)
            C.ok(ps[fold["id"]]["text"].endswith("and the swing"), f"{name}: the writing inside the fold is kept")
            C.ok(ps[root]["text"].startswith("Oh. Well now. Yes,"), f"{name}: the writing in the page is kept ({ps[root]['text'][:30]!r})")
            C.ok(not any(v.get("parentId") == fold["id"] and (v.get("text") or "").startswith("Other version") for v in ps.values()),
                 f"{name}: moving a fold's words doesn't count as a clash with writing inside it")
        pa, pb = await placed(A, root), await placed(B, root)
        ta_ = (await pages(A))[root]["text"]
        C.ok(pa == pb and ta_[pa[0]["s"]:pa[0]["e"]] == "tree", "both devices still agree the fold is on 'tree'")

        # deleting the fold's words on one device: unattached on both, kept
        await A.wait_for_timeout(3200)
        await select(A, "tree"); await A.keyboard.press("Backspace"); await A.wait_for_timeout(500)
        await sync(A); await sync(B)
        C.ok(await B.evaluate(f"window.TOL.folds.unattached('{fold['id']}')") and fold["id"] in await pages(B), "deleting the words on the laptop leaves the fold kept but unattached on the iPhone")

        # nothing readable reaches GitHub
        blob = b"".join(v[0] for v in fake.files.values())
        C.ok(b"roots" not in blob and b"swing" not in blob and b"tree" not in blob and b"anchor" not in blob, "no fold words, text or anchors are readable in the synced files")
        for name, pg in (("laptop", A), ("iPhone", B)):
            C.ok(not pg.errs, f"no page errors on the {name} {pg.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
