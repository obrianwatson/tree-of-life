"""Add-ons (addons.js): Claude makes an add-on that works at once; it runs sealed (no storage,
no keys, no network, no removing words); buttons, panels, toasts, cue styles; versions; turn off;
safe mode; undo of a made add-on. Anthropic is faked. Run:  python3 tests/test_addons.py"""
import asyncio, json, os, re, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, launch
from test_folds import pages, root_id
from test_agent import FakeClaude, tool_call, say, ask, KEY
from playwright.async_api import async_playwright

C = Checks()
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())

WORDCOUNT = """
bolw.addButton("Words", "wc");
bolw.on("button", async () => { const n = await bolw.read(); const c = n.text.split(/\\s+/).filter(Boolean).length; bolw.toast("Words on this page: " + c); });
bolw.registerCue("vowels gone", t => t.replace(/[aeiou]/gi, "_"));
"""
SNOOP = """
let leak = [];
try { leak.push("ls:" + localStorage.getItem("tol-ai")); } catch (e) { leak.push("ls-blocked"); }
try { leak.push("parent:" + parent.document.title); } catch (e) { leak.push("parent-blocked"); }
try { leak.push("cookie:" + document.cookie); } catch (e) { leak.push("cookie-blocked"); }
fetch("https://example.com/steal").then(() => leak.push("net-ok")).catch(() => leak.push("net-blocked")).finally(async () => {
  const n = await bolw.read();
  try { await bolw.addText(n.id, "", "end"); leak.push("emptyadd-ok"); } catch (e) { leak.push("emptyadd-err"); }
  bolw.addButton("Report", "r");
  bolw.on("button", () => bolw.showPanel("<p id=r>" + leak.join("|") + "</p>"));
});
"""
APPEND = """bolw.addButton("Sign", "s"); bolw.on("button", async () => { const n = await bolw.read(); await bolw.addText(n.id, "\\n— signed", "end"); });"""


async def main():
    url = serve(8832)
    fake = FakeClaude()
    async with async_playwright() as p:
        br = await launch(p)
        ctx = await br.new_context(viewport={"width": 1280, "height": 800})
        await ctx.add_init_script(KEY)
        await ctx.route("https://api.anthropic.com/**", fake.handle)
        await ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
        pg = await ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_timeout(400)
        await pg.click("#writer textarea")
        await pg.keyboard.type("one two three four", delay=3)
        root = await root_id(pg)

        # ---------- Claude makes an add-on; it works at once ----------
        await pg.click("#claudeHere")
        fake.queue = [tool_call("make_addon", {"name": "Word count", "description": "Counts words", "code": WORDCOUNT}), say("Added a Words button.")]
        await ask(pg, "add a word count button")
        C.ok((await pg.locator("#agent .ag-tier").all_text_contents())[-1] == "Add-on", "the reply is marked Add-on")
        await pg.wait_for_selector("#addonBar button", timeout=4000)
        C.ok(await pg.text_content("#addonBar button") == "Words", "its button appears in the header within seconds")
        await pg.click("#agClose")
        await pg.click("#addonBar button")
        await pg.wait_for_timeout(400)
        C.ok("Words on this page: 4" in await pg.text_content("#toast"), "the add-on read the page and answered")
        cues = await pg.evaluate("window.TOL.addons.cueList()")
        C.ok(any(c["name"] == "vowels gone" for c in cues), "it registered a new hint style")
        out = await pg.evaluate("(async () => { const c = window.TOL.addons.cueList()[0]; return await window.TOL.addons.cue(c.id, c.name, 'banana bread'); })()")
        C.ok(out == "b_n_n_ br__d", f"the hint style works ({out})")
        ad = await pg.evaluate("Object.values(window.TOL.getMemory().addons)[0]")
        C.ok(ad and ad["version"] == 1 and ad["on"], "it's saved in memory.addons (synced), version 1, on")

        # ---------- update keeps the old version ----------
        await pg.click("#claudeHere")
        fake.queue = [tool_call("update_addon", {"id": ad["id"], "code": WORDCOUNT.replace("Words", "Count")}), say("Renamed.")]
        await ask(pg, "rename the button to Count")
        await pg.wait_for_function("document.querySelector('#addonBar button') && document.querySelector('#addonBar button').textContent === 'Count'", timeout=4000)
        ad2 = await pg.evaluate("Object.values(window.TOL.getMemory().addons)[0]")
        C.ok(ad2["version"] == 2 and len(ad2["versions"]) == 1 and "Words" in ad2["versions"][0]["code"], "a new version runs and the old one is kept")
        await pg.click("#agClose")

        # ---------- sealed: no storage, no parent, no network; cannot remove words ----------
        await pg.evaluate(f"window.TOL.addons.save({{name: 'Snoop', code: {json.dumps(SNOOP)}, on: true}})")
        await pg.wait_for_function("[...document.querySelectorAll('#addonBar button')].some(b => b.textContent === 'Report')", timeout=5000)
        await pg.wait_for_timeout(1200)
        await pg.click("#addonBar button:has-text('Report')")
        await pg.wait_for_timeout(400)
        fr = pg.frame_locator("#apFrame")
        rep = await fr.locator("#r").text_content()
        C.ok("ls-blocked" in rep and "sk-ant" not in rep, f"an add-on can't read your storage or keys ({rep})")
        C.ok("parent-blocked" in rep, "it can't reach into the app's page")
        C.ok("net-blocked" in rep, "it can't reach the internet")
        await pg.click("#apClose")
        before = (await pages(pg))[root]["text"]
        await pg.evaluate(f"window.TOL.addons.save({{name: 'Sign', code: {json.dumps(APPEND)}, on: true}})")
        await pg.wait_for_function("[...document.querySelectorAll('#addonBar button')].some(b => b.textContent === 'Sign')", timeout=5000)
        await pg.wait_for_timeout(300)
        await pg.click("#addonBar button:has-text('Sign')")
        await pg.wait_for_timeout(400)
        after = (await pages(pg))[root]["text"]
        C.ok(after == before + "\n— signed", "an add-on can add words (and only add)")
        C.ok(await pg.evaluate("typeof window.bolw") == "undefined", "the add-on API never exists in the app's own page")

        # ---------- settings: list, turn off, view code, problem shown ----------
        await pg.evaluate("window.TOL.addons.save({name: 'Broken', code: 'throw new Error(\"oops here\")', on: true})")
        await pg.wait_for_timeout(800)
        await pg.click("#settingsBtn")
        txt = await pg.text_content("#addonArea")
        C.ok("Word count" in txt and "Snoop" in txt and "oops here" in txt, "Settings → Add-ons lists them and shows a problem in plain words")
        await pg.click("#addonArea [data-ad-toggle]:near(:text('Word count'))")
        await pg.wait_for_timeout(300)
        C.ok(not any(b == "Count" for b in await pg.locator("#addonBar button").all_text_contents()), "Turn off stops it at once (its button goes)")
        await pg.click("#adAllOff"); await pg.wait_for_timeout(300)
        C.ok(await pg.evaluate("window.TOL.addons.running().length") == 0, "Turn all off stops every add-on")
        await pg.click("#closeSet")

        # ---------- undo of a made add-on ----------
        await pg.click("#claudeHere")
        fake.queue = [tool_call("make_addon", {"name": "Temp", "code": "bolw.addButton('Temp','t')"}), say("Made Temp.")]
        await ask(pg, "make a temp add-on")
        await pg.wait_for_function("[...document.querySelectorAll('#addonBar button')].some(b => b.textContent === 'Temp')", timeout=4000)
        await pg.click("#agUndo"); await pg.wait_for_timeout(500)
        C.ok(not any(b == "Temp" for b in await pg.locator("#addonBar button").all_text_contents()), "undo removes an add-on Claude just made")
        await pg.click("#agClose")

        # ---------- safe mode ----------
        await pg.evaluate("Object.values(window.TOL.getMemory().addons).filter(a => !a.deleted && a.name === 'Sign').forEach(a => window.TOL.addons.save({id: a.id, on: true}))")
        await pg.wait_for_timeout(500)
        C.ok(await pg.evaluate("window.TOL.addons.running().length") >= 1, "an add-on is on")
        await pg.goto(url + "?safe"); await pg.wait_for_timeout(600)
        C.ok(await pg.evaluate("window.TOL.addons.running().length") == 0 and await pg.evaluate("window.TOL.addons.safe"), "?safe starts with no add-ons running")
        await pg.click("#settingsBtn")
        C.ok("Safe mode" in await pg.text_content("#addonArea"), "Settings says safe mode is on")
        await pg.screenshot(path=os.path.join(SHOTS, "addons-settings.png"))
        await pg.click("#closeSet")

        C.ok(not pg.errs, f"no page errors {pg.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)


if __name__ == "__main__":
    asyncio.run(main())
