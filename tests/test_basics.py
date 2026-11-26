"""The basics still work: pages, the writing clock, hold, Claude page design changes. Run:  python3 tests/test_basics.py"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, CHROME
from playwright.async_api import async_playwright

C = Checks()

async def main():
    url = serve(8816)
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ctx, pg = await new_device(br, url, token=False, viewport={"width": 1280, "height": 800})
        await pg.click("#writer textarea")
        await pg.keyboard.type("I still set the table for two\nYour chair still faces the window", delay=60)
        await pg.wait_for_timeout(300)
        t1 = await pg.text_content("#total")
        await pg.wait_for_timeout(5500); tA = await pg.text_content("#total")
        await pg.wait_for_timeout(2000); tB = await pg.text_content("#total")
        C.ok(t1 in ("0:00:03", "0:00:04", "0:00:05"), f"about 4 s of typing counts about 4 s ({t1})")
        C.ok(tA == tB, f"a long pause adds nothing ({tA} = {tB})")
        await pg.keyboard.down("Alt"); await pg.wait_for_timeout(3000); await pg.keyboard.up("Alt")
        await pg.wait_for_timeout(300); tC = await pg.text_content("#total")
        def secs(t): h, m, s = map(int, t.split(":")); return h * 3600 + m * 60 + s
        C.ok(secs(tC) - secs(tB) in (2, 3, 4), f"holding Option 3 s adds about 3 s ({tB} → {tC})")
        await pg.click("#list .add")
        await pg.keyboard.type("Chorus idea", delay=30)
        await pg.wait_for_timeout(1000)
        C.ok("Chorus idea" in await pg.text_content("#crumbs"), "a page inside a page opens, path shown")
        C.ok(await pg.locator("#writer textarea").first.input_value() == "Chorus idea", "no first letter lost on a new page")
        await pg.reload(); await pg.wait_for_timeout(500)
        C.ok(await pg.locator("#writer textarea").first.input_value() == "Chorus idea", "reopens on the last page")
        cur = await pg.evaluate("document.activeElement.selectionStart")
        C.ok(cur == 11, f"…with the cursor where you left it ({cur})")
        # Claude page: instant design change and undo
        await pg.click("#claudeBtn"); await pg.wait_for_timeout(300)
        C.ok(await pg.locator("#writer").is_hidden(), "the Claude page replaces the writing")
        await pg.fill("#ask", "make the text bigger and warmer"); await pg.click("#sendBtn"); await pg.wait_for_timeout(300)
        C.ok("Changed instantly" in await pg.text_content("#thread"), "a look change happens instantly")
        size = await pg.evaluate("getComputedStyle(document.querySelector('#writer textarea')).fontSize")
        await pg.click("[data-d=undo]"); await pg.wait_for_timeout(200)
        size2 = await pg.evaluate("getComputedStyle(document.querySelector('#writer textarea')).fontSize")
        C.ok(size != size2, f"…and Undo puts it back ({size} → {size2})")
        await pg.click("#backWrite"); await pg.wait_for_timeout(200)
        C.ok(await pg.locator("#writer").is_visible(), "Back to writing shows the page again")
        C.ok(not pg.errs, f"no page errors {pg.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
