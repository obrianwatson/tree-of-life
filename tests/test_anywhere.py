"""Fold anywhere + code-folds (index.html placements, codefolds.js): place a page or fold under words in
another page (it stays where it is; one node, edits through any place edit it), cycle-safe (a page inside
itself, two pages inside each other, the same node twice on screen → "↻ already open above"), the page
list shows a node once with "also in N places", remove a placement, a deleted target; Claude's place_here
with undo. The App: the app's own files split into foldable parts, notes, placing a part in a page and
under selected words, "Change this with Claude Code", Claude's code tools, offline. Two devices: placements
and notes sync. Run:  python3 tests/test_anywhere.py"""
import asyncio, os, re, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, FakeGitHub, CHROME
from test_folds import select, pages, nest_new, by_text, root_id
from test_folds_sync import settle, sync, open_settings, PASS
from test_agent import FakeClaude, tool_call, say, ask, KEY
from playwright.async_api import async_playwright

C = Checks()
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())


async def place(pg, needle, target_title, frm=0):
    assert await select(pg, needle, frm), needle
    await pg.wait_for_selector("#foldbar [data-b=nest]", state="visible")
    await pg.click("#foldbar [data-b=nest]")
    await pg.click("#foldbar [data-b=place]")
    await pg.wait_for_timeout(100)
    await pg.locator("#pickList [data-pick]", has_text=re.compile("^" + re.escape(target_title))).first.click()
    await pg.wait_for_timeout(200)


async def main():
    url = serve(8836)
    fake, claude = FakeGitHub(), FakeClaude()
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ctxA, A = await new_device(br, url, fake, viewport={"width": 1280, "height": 800})
        await ctxA.add_init_script(KEY); await ctxA.route("https://api.anthropic.com/**", claude.handle)
        await A.reload(); await A.wait_for_timeout(400)

        # page A with a fold; page B elsewhere
        await A.click("#writer textarea"); await A.keyboard.type("Rivers and stones\nThe water knows the way.", delay=2)
        await nest_new(A, "stones", inner="Smooth grey stones.")
        pa = await root_id(A)
        stones = next(v for v in (await pages(A)).values() if (v.get("anchor") or {}).get("text") == "stones")
        await A.evaluate("window.TOL.openPage(null)") if False else None
        await A.click("#newTop") if await A.locator("#newTop").is_visible() else await A.evaluate("document.getElementById('newTop').click()")
        await A.wait_for_timeout(150)
        await A.keyboard.type("Elsewhere\nWords that remember.", delay=2)
        pb = await root_id(A)

        # ---------- place the fold under words in another page ----------
        await place(A, "remember", "Smooth grey")
        P = await pages(A)
        pl = next(v for v in P.values() if v.get("ref") == stones["id"])
        C.ok(pl["parentId"] == pb and pl["anchor"]["text"] == "remember" and P[stones["id"]]["parentId"] == pa, "the fold is placed under “remember” and also stays where it was")
        C.ok(await A.locator(f"#writer .fold.place[data-ref='{stones['id']}'] textarea").count() == 1, "it opens right there")
        C.ok(await A.input_value(f"#writer .fold.place[data-ref='{stones['id']}'] textarea") == "Smooth grey stones.", "showing the same writing")
        C.ok("also in 1 place" in await A.text_content(f"#writer .fold.place[data-ref='{stones['id']}'] .fold-head"), "its head says “also in 1 place”")
        ta = A.locator(f"#writer .fold.place[data-ref='{stones['id']}'] textarea")
        await ta.click(); await A.keyboard.press("End"); await A.keyboard.type(" Warm in the sun.", delay=3); await A.wait_for_timeout(400)
        P = await pages(A)
        C.ok(P[stones["id"]]["text"] == "Smooth grey stones. Warm in the sun.", "writing through the placement edits the one fold")
        C.ok(not any(v.get("ref") == stones["id"] and v.get("text") for v in P.values()), "the placement holds no copy")
        await A.evaluate(f"window.TOL.openPage('{pa}', true)"); await A.wait_for_timeout(150)
        await A.evaluate(f"(() => {{ const ui = JSON.parse(localStorage.getItem('tol-ui')); }})()")
        if not await A.locator(f"#writer [data-fold='{stones['id']}'] textarea").count():
            await A.evaluate(f"window.TOL.openFold && window.TOL.openFold('{stones['id']}')"); await A.wait_for_timeout(150)
        C.ok("Warm in the sun." in await A.input_value(f"#writer [data-fold='{stones['id']}'] textarea"), "the change shows in its first place too")
        C.ok("also in 1 place" in await A.text_content(f"#writer [data-fold='{stones['id']}'] .fold-head"), "its own head says it's also somewhere else")
        if not await A.locator(f"#list [data-open='{stones['id']}']").count():
            await A.click(f"#list [data-tw='{pa}']"); await A.wait_for_timeout(100)
        lst = await A.text_content("#list")
        C.ok(lst.count("Elsewhere") == 1 and "also in 1 place" in await A.text_content(f"#list [data-open='{stones['id']}']"), "the page list shows it once, with “also in 1 place”")

        # ---------- cycles: a page inside itself; two pages inside each other; twice on one screen ----------
        await place(A, "Rivers", "Rivers and stones")
        C.ok(await A.locator("#writer .fold.place .cyc", has_text="already open above").count() == 1, "a page placed inside itself says “↻ already open above”")
        await A.evaluate(f"window.TOL.openPage('{pb}', true)"); await A.wait_for_timeout(150)
        await place(A, "Elsewhere", "Rivers and stones")       # B now holds A (which holds stones and itself)
        await A.wait_for_timeout(150)
        C.ok(await A.locator("#writer .cyc").count() >= 1, "a cycle through two pages shows “already open above” instead of looping")
        C.ok(await A.locator(f"#writer textarea").count() < 40, "the screen stays small (no endless nesting)")
        # the same fold twice on one screen
        n_open = await A.evaluate(f"document.querySelectorAll(\"#writer .node[data-node='{stones['id']}']\").length")
        C.ok(n_open == 1, f"a node never appears twice on one screen ({n_open})")
        await A.screenshot(path=os.path.join(SHOTS, "anywhere-laptop.png"))

        # ---------- remove a placement; a deleted target ----------
        selfpl = next(v for v in (await pages(A)).values() if v.get("ref") == pa and v["parentId"] == pa)
        await A.evaluate(f"window.TOL.openPage('{pa}', true)"); await A.wait_for_timeout(150)
        await A.click(f"#writer [data-unplace='{selfpl['id']}']"); await A.wait_for_timeout(150)
        P = await pages(A)
        C.ok(selfpl["id"] not in P and "Rivers and stones" in P[pa]["text"], "“Remove from here” takes away only the placement; the writing is untouched")
        # a throwaway page placed in B, then deleted
        tmp = await A.evaluate("window.TOL.createNode({parentId: null, text: 'Throwaway'}).id")
        await A.evaluate(f"window.TOL.openPage('{pb}', true)"); await A.wait_for_timeout(150)
        await place(A, "Words", "Throwaway")
        await A.evaluate(f"window.TOL.deleteNode('{tmp}'); window.TOL.rerender()"); await A.wait_for_timeout(150)
        C.ok(await A.locator("#writer .cyc", has_text="was deleted").count() == 1, "a placement of a deleted page says so")

        # ---------- Claude places things; undo ----------
        await A.click("#claudeHere")
        claude.queue = [tool_call("place_here", {"node_id": pa, "words": "water", "target_id": pb}), say("Placed Elsewhere under “water”.")]
        await ask(A, "put the Elsewhere page under water too")
        C.ok(any(v.get("ref") == pb and v["parentId"] == pa and v["anchor"]["text"] == "water" for v in (await pages(A)).values()), "Claude can place a page under words (a cross-fold)")
        await A.click("#agUndo"); await A.wait_for_timeout(200)
        C.ok(not any(v.get("ref") == pb and v["parentId"] == pa for v in (await pages(A)).values()), "Undo takes the placement away")
        await A.click("#agClose")

        # ---------- The App: code-folds ----------
        await A.evaluate("window.TOL.hooks.listTopClick('app')"); await A.wait_for_timeout(1200)
        C.ok(await A.is_visible("#appView") and await A.locator("#appView details[data-file]").count() >= 9, "The App lists the app's own files")
        C.ok("published version" in await A.text_content("#appView") and "read-only" in await A.text_content("#appView"), "it says which version and that it's read-only")
        n_parts = await A.evaluate("window.TOL.code.chunks('app.html').then(c => c.length)")
        C.ok(n_parts > 20, f"app.html is split into foldable parts ({n_parts})")
        await A.fill("#appQ", "renderPlacement"); await A.wait_for_timeout(800)
        part = A.locator("#appView details[data-key='app.html#function-renderplacement']")
        C.ok(await part.count() == 1, "finding words in the code shows the part")
        await part.locator("summary").click()
        C.ok("function renderPlacement" in await part.locator("pre").text_content(), "opening a part shows its code")
        C.ok(await A.locator("#appView pre[contenteditable], #appView pre textarea").count() == 0, "the code itself can't be edited here")
        await part.locator(".cf-note").fill("This is where placements show."); await part.locator(".cf-note").blur(); await A.wait_for_timeout(600)
        notes = await A.evaluate("window.TOL.memoryApi.getPart('codenotes')")
        C.ok(notes.get("app.html#function-renderplacement", {}).get("text") == "This is where placements show.", "a note on a part is kept")
        await part.locator("[data-cf-place]").click(); await A.wait_for_timeout(150)
        await A.locator("#cfPick [data-cf-to]", has_text="Elsewhere").first.click(); await A.wait_for_timeout(400)
        P = await pages(A)
        C.ok(P[pb]["text"].endswith("⌘ app.html · function renderPlacement") and any((v.get("code") or {}).get("key") == "app.html#function-renderplacement" for v in P.values()), "placing a part adds a line to the page with the code folded under it")
        await A.click("#appView [data-a=quit]")
        await A.evaluate(f"window.TOL.openPage('{pb}', true)"); await A.wait_for_timeout(800)
        cf = A.locator("#writer .fold.place .cf-body")
        C.ok(await cf.count() == 1 and "function renderPlacement" in await cf.locator("pre").text_content(), "in the page, the code-fold shows the code")
        C.ok(await cf.locator(".cf-note").input_value() == "This is where placements show.", "and the note")
        await cf.locator("[data-cf-claude]").click(); await A.wait_for_timeout(300)
        C.ok(await A.is_visible("#chatView") and "function renderPlacement" in await A.input_value("#ask") and "What I'd like changed" in await A.input_value("#ask"), "“Change this with Claude Code” opens Claude Code with that code attached")
        await A.evaluate("window.TOL.showView('write')")
        # under selected words: Nest → App code…
        await A.evaluate(f"window.TOL.openPage('{pa}', true)"); await A.wait_for_timeout(150)
        assert await select(A, "knows")
        await A.click("#foldbar [data-b=nest]"); await A.click("#foldbar [data-b=code]"); await A.wait_for_timeout(300)
        await A.fill("#cfQ", "writing clock"); await A.wait_for_timeout(1000)
        C.ok(await A.locator("#cfPick [data-cf-chunk]").count() >= 1, "Nest → App code… finds parts by words")
        await A.locator("#cfPick [data-cf-chunk]").first.click(); await A.wait_for_timeout(600)
        C.ok(any(v.get("code") and v["parentId"] == pa and v["anchor"]["text"] == "knows" for v in (await pages(A)).values()), "a part of the code can be folded under selected words")
        # Claude's code tools
        await A.click("#claudeHere")
        pkey = await A.evaluate("window.TOL.code.chunks('drill.js').then(L => L.find(c => c.title.includes('Psalm 23')).key)")
        claude.queue = [tool_call("list_code", {"file": "drill.js"}), tool_call("read_code", {"key": pkey}, "t2"), say("It's the Psalm sample.")]
        await ask(A, "what's in the drill code?")
        sent = [m for c in claude.calls if c.get("stream") for m in c["messages"]]
        blob = str(sent)
        C.ok("drill.js#" in blob and "PSALM" in blob, "Claude can list and read the app's code")
        await A.click("#agClose")

        # ---------- offline: The App still opens ----------
        await ctxA.set_offline(True)
        await A.evaluate("window.TOL.code.forget(); window.TOL.code.open()"); await A.wait_for_timeout(1500)
        await A.fill("#appQ", ""); await A.wait_for_timeout(1500)
        C.ok(await A.locator("#appView details[data-file]").count() >= 9 and await A.locator("#appView details[data-file] > summary small", has_text="couldn't load").count() == 0, "offline, The App still opens from what's saved")
        await ctxA.set_offline(False)
        await A.evaluate("window.TOL.showView('write')")

        # ---------- two devices: placements and notes sync ----------
        ctxB, B = await new_device(br, url, fake, **p.devices["iPhone 13"])
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
        await settle(B); await B.wait_for_timeout(300)
        PB = await pages(B)
        C.ok(any(v.get("ref") == stones["id"] and v["parentId"] == pb for v in PB.values()), "the placement arrives on the iPhone")
        C.ok((await B.evaluate("window.TOL.memoryApi.getPart('codenotes')")).get("app.html#function-renderplacement", {}).get("text") == "This is where placements show.", "the code note arrives")
        plb = next(v for v in PB.values() if v.get("ref") == stones["id"] and v["parentId"] == pb)
        await B.evaluate(f"window.TOL.openFold('{plb['id']}'); window.TOL.openPage('{pb}', true)"); await B.wait_for_timeout(1000)
        tb = B.locator(f"#writer .fold.place[data-ref='{stones['id']}'] textarea")
        C.ok(await tb.count() == 1, "on the iPhone it opens in its other place too")
        await tb.click(); await B.keyboard.press("End"); await B.keyboard.type(" Cool at night.", delay=5); await B.wait_for_timeout(3500)
        await sync(B); await sync(A)
        C.ok((await pages(A))[stones["id"]]["text"].endswith("Cool at night."), "writing through a placement on the iPhone reaches the one fold on the laptop")
        await B.screenshot(path=os.path.join(SHOTS, "anywhere-iphone.png"))
        await B.evaluate("window.TOL.code.open()"); await B.wait_for_timeout(1200)
        C.ok(await B.evaluate("document.getElementById('appView').scrollWidth <= innerWidth + 1"), "The App fits the iPhone's width")
        await B.screenshot(path=os.path.join(SHOTS, "app-iphone.png"))
        blob = b"".join(v[0] for v in fake.files.values())
        C.ok(all(w not in blob for w in (b"stones", b"renderPlacement", b"placements show")), "nothing readable reaches GitHub")
        for name, pg in (("laptop", A), ("iPhone", B)):
            C.ok(not pg.errs, f"no page errors on the {name} {pg.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
