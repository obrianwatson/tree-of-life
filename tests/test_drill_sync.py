"""Drills, Claude conversations and add-ons between two devices through (fake) GitHub, encrypted:
the Psalm 23 sample and its drill progress, a conversation, an add-on all arrive on the other device;
progress made on the phone comes back to the laptop (newest wins per record); nothing readable reaches
GitHub. Run:  python3 tests/test_drill_sync.py"""
import asyncio, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, FakeGitHub, launch
from test_folds_sync import settle, sync, open_settings, pages, PASS
from test_agent import FakeClaude, tool_call, say, ask, KEY
from test_drill import round_, again
from playwright.async_api import async_playwright

C = Checks()
ADDON = 'bolw.addButton("Hi", "h"); bolw.on("button", () => bolw.toast("hi there"));'


async def main():
    url = serve(8835)
    fake, claude = FakeGitHub(), FakeClaude()
    async with async_playwright() as p:
        br = await launch(p)
        ctxA, A = await new_device(br, url, fake, viewport={"width": 1280, "height": 800})
        ctxB, B = await new_device(br, url, fake, **p.devices["iPhone 13"])
        for c in (ctxA, ctxB):
            await c.add_init_script(KEY)
            await c.route("https://api.anthropic.com/**", claude.handle)
        await A.reload(); await B.reload(); await A.wait_for_timeout(400)

        await A.click("#writer textarea"); await A.keyboard.type("A page of my own.", delay=3)
        # the sample + some drill progress on the laptop
        did = await A.evaluate("window.TOL.drills.addPsalm23().id")
        await A.evaluate("document.getElementById('drillDlg').close()")
        await A.evaluate(f"window.TOL.drills.run('{did}')"); await A.wait_for_timeout(150)
        await round_(A); await again(A); await round_(A)
        await A.click("#drillView [data-d=quit]")
        # a conversation and an add-on made by Claude
        await A.click("#claudeHere")
        claude.queue = [tool_call("make_addon", {"name": "Hello", "description": "says hi", "code": ADDON}), say("Added a Hi button.")]
        await ask(A, "add a hi button")
        await A.click("#agClose")
        convA = await A.evaluate("window.TOL.memoryApi.getPart('convos')")

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
        await settle(B); await B.wait_for_timeout(300)

        dB = await B.evaluate(f"window.TOL.drills.get('{did}')")
        C.ok(dB and len(dB["groups"]) == 6 and dB["progress"]["streak"] == 2, "the drill and its progress (2 of 3 in a row) arrive on the iPhone")
        pb = await pages(B)
        C.ok(any((v.get("text") or "").startswith("Psalm 23 (KJV)") for v in pb.values()) and all(pid in pb for g in dB["groups"] for pid in g), "the Psalm 23 page and all 30 level folds arrive")
        convB = await B.evaluate("window.TOL.memoryApi.getPart('convos')")
        C.ok(convB.keys() == convA.keys() and any("Added a Hi button." in (m.get("t") or "") for c in convB.values() for m in c["msgs"]), "the conversation with Claude arrives")
        await B.wait_for_selector("#addonBar button", timeout=5000)
        C.ok(await B.text_content("#addonBar button") == "Hi", "the add-on arrives and runs on the iPhone")
        C.ok(await B.evaluate("localStorage.getItem('tol-ai')") and "sk-ant-test" not in (await B.evaluate("JSON.stringify(window.TOL.getMemory())")), "the AI key is not in synced memory")

        # progress on the phone → back on the laptop
        await B.evaluate(f"window.TOL.drills.run('{did}')"); await B.wait_for_timeout(150)
        await round_(B)
        await B.click("#drillView [data-d=quit]")
        await B.wait_for_timeout(300)
        await sync(B); await sync(A)
        dA = await A.evaluate(f"window.TOL.drills.get('{did}')")
        C.ok(dA["progress"]["k"] == 2 and "adding the next one" in dA["log"][-1], "the level reached on the iPhone comes back to the laptop")
        # a setting changed on the laptop wins over the older one
        await A.evaluate(f"(() => {{ const d = window.TOL.drills.get('{did}'); d.order = 'shuffle'; window.TOL.memoryApi.putRecord('drills', d.id, d); }})()")
        await A.wait_for_timeout(200)
        await sync(A); await sync(B)
        C.ok((await B.evaluate(f"window.TOL.drills.get('{did}')"))["order"] == "shuffle", "a drill edit on the laptop arrives on the iPhone")

        blob = b"".join(v[0] for v in fake.files.values())
        C.ok(all(w not in blob for w in (b"shepherd", b"Psalm", b"drills", b"Hi button", b"bolw", b"convos")), "nothing readable (psalm, drills, conversation, add-on code) reaches GitHub")
        for name, pg in (("laptop", A), ("iPhone", B)):
            C.ok(not pg.errs, f"no page errors on the {name} {pg.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
