"""Memory practice and shared words between two devices through (fake) GitHub, encrypted.
Run:  python3 tests/test_memory_sync.py"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, FakeGitHub, CHROME
from test_folds import nest_new, select
from test_folds_sync import settle, sync, open_settings, pages, PASS
from playwright.async_api import async_playwright

C = Checks()

async def grade_once(pg, fold_id, answer, g):
    await pg.evaluate(f"window.TOL.memoryStart('{fold_id}', 'order')")
    await pg.wait_for_selector("#tAns")
    await pg.click("#tAns"); await pg.keyboard.type(answer, delay=5)
    await pg.click("[data-t=submit]"); await pg.wait_for_selector(".t-grades")
    await pg.click(f'.grade[data-grade="{g}"]')
    while await pg.locator("#tAns").count():      # skip any other prompts in this fold
        await pg.click("[data-t=skip]"); await pg.wait_for_timeout(50)
    await pg.click("[data-t=quit]"); await pg.wait_for_timeout(100)

async def main():
    url = serve(8822)
    fake = FakeGitHub()
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ctxA, A = await new_device(br, url, fake, viewport={"width": 1280, "height": 800})
        ctxB, B = await new_device(br, url, fake, **p.devices["iPhone 13"])

        await A.click("#writer textarea")
        await A.keyboard.type("I still set the table for two.\nYour chair still faces the window.", delay=2)
        await nest_new(A, "set the table", inner="Two plates, one cold.")
        root = await A.evaluate("JSON.parse(localStorage.getItem('tol-ui')).last")
        tbl = next(v for v in (await pages(A)).values() if v.get("anchor", {}).get("text") == "set the table")
        # memory on A: a question, a practice setting, a graded answer, a changed setting
        await A.evaluate(f"window.TOL.memoryApi.addPrompts('{tbl['id']}', [{{q: 'How many plates?', a: 'Two'}}], 'mine')")
        await A.evaluate(f"window.TOL.memoryApi.setFold('{tbl['id']}', {{practice: true, cue: 'shape'}})")
        await grade_once(A, tbl["id"], "Two plates, one warm", 2)
        await A.evaluate("(() => { const m = JSON.parse(JSON.stringify(window.TOL.getMemory())); m.settings = Object.assign({}, m.settings, {retention: .85, updatedAt: Date.now()}); window.TOL.setMemory(m); })()")
        # shared words on A
        await A.evaluate(f"window.TOL.openPage('{root}', true)"); await A.wait_for_timeout(150)
        await select(A, "Your chair")
        await A.click("#foldbar [data-b=nestin]"); await A.click("#foldbar [data-b=wrapnew]"); await A.wait_for_timeout(150)
        await A.keyboard.type("In the kitchen, ", delay=3); await A.wait_for_timeout(200)
        wrap = next(v for v in (await pages(A)).values() if v.get("share"))

        # sync on, B joins
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

        mb = await B.evaluate("window.TOL.getMemory()")
        ck = f"peg:{tbl['id']}|fwd"
        C.ok(ck in mb.get("cards", {}) and mb["cards"][ck]["history"][0]["g"] == 2, "the graded answer (and its schedule) arrives on the other device")
        C.ok(any(x.get("q") == "How many plates?" for x in mb.get("prompts", {}).values()), "my question arrives")
        C.ok(mb.get("folds", {}).get(tbl["id"], {}).get("practice") and mb["folds"][tbl["id"]]["cue"] == "shape", "practice settings arrive")
        C.ok(abs(mb.get("settings", {}).get("retention", 0) - 0.85) < 1e-9, "memory settings arrive")
        pb = await pages(B)
        C.ok(pb[wrap["id"]]["text"] == "In the kitchen, Your chair" and pb[wrap["id"]]["share"]["src"] == root, "the shared-words fold arrives, still pointing at its source")

        # B answers the same prompt → histories merge on both, nothing lost
        await B.wait_for_timeout(300)
        await grade_once(B, tbl["id"], "Two plates, one cold.", 3)
        await sync(B); await sync(A)
        for name, pg in (("laptop", A), ("iPhone", B)):
            h = (await pg.evaluate("window.TOL.getMemory()"))["cards"][ck]["history"]
            C.ok(sorted(x["g"] for x in h) == [2, 3], f"{name}: both answers are in the history ({[x['g'] for x in h]})")
        # answering on both devices while apart → still both kept
        await grade_once(A, tbl["id"], "x", 1)
        await grade_once(B, tbl["id"], "Two plates, one cold.", 4)
        for _ in range(2):
            await sync(A); await sync(B)
        for name, pg in (("laptop", A), ("iPhone", B)):
            h = (await pg.evaluate("window.TOL.getMemory()"))["cards"][ck]["history"]
            C.ok(sorted(x["g"] for x in h) == [1, 2, 3, 4], f"{name}: answers given on both devices at once are all kept ({sorted(x['g'] for x in h)})")
        sa = await A.evaluate(f"window.TOL.memoryFSRS.cardState(window.TOL.getMemory().cards['{ck}']).due")
        sb = await B.evaluate(f"window.TOL.memoryFSRS.cardState(window.TOL.getMemory().cards['{ck}']).due")
        C.ok(sa == sb, "both devices agree when it's due next")

        # B changes the shared words inside the wrapper → A's page changes too
        await B.wait_for_timeout(3200)
        await B.evaluate(f"window.TOL.goTo('{root}', 0, Date.now())"); await B.wait_for_timeout(200)
        await B.evaluate(f"window.TOL.openFold('{wrap['id']}', true); window.TOL.rerender()"); await B.wait_for_timeout(150)
        await B.evaluate("""() => { const t = [...document.querySelectorAll('#writer .fold textarea')].find(x => x.value.startsWith('In the kitchen'));
            t.focus(); const i = t.value.indexOf('chair'); t.setSelectionRange(i, i); }""")
        await B.keyboard.type("old ", delay=5); await B.wait_for_timeout(3500)
        await sync(B); await sync(A)
        pa = await pages(A)
        C.ok("Your old chair still faces" in pa[root]["text"] and pa[wrap["id"]]["text"] == "In the kitchen, Your old chair",
             f"shared words changed on the iPhone change both places on the laptop ({pa[root]['text'].splitlines()[1]!r})")

        # nothing readable reaches GitHub
        blob = b"".join(v[0] for v in fake.files.values())
        C.ok(all(w not in blob for w in (b"plates", b"How many", b"history", b"kitchen", b"retention", b"cards")), "no memory, questions or shared words are readable in the synced files")
        for name, pg in (("laptop", A), ("iPhone", B)):
            C.ok(not pg.errs, f"no page errors on the {name} {pg.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
