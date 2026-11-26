"""Drills (drill.js): the Psalm 23 (KJV) sample, the loop (show → hide → recall → review) until 3 perfect
in a row, extending (next level, next verse, chaining verses), fading hints, adapting (a word missed twice
gets a hint, three misses step back, fast runs extend sooner), directions, orders (incl. Claude's), rules,
editing, spaced review of a mastered drill, Claude building drills from plain words, undo, the writing
clock, screenshots. Anthropic is faked. Run:  python3 tests/test_drill.py"""
import asyncio, json, os, re, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, launch
from test_folds import pages
from test_agent import FakeClaude, tool_call, say, ask, KEY, clock
from playwright.async_api import async_playwright

C = Checks()
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
KJV1 = "The LORD is my shepherd; I shall not want."
ST = "window.TOL.drills._state()"


async def drill(pg, did):
    return await pg.evaluate(f"window.TOL.drills.get('{did}')")


async def answer(pg, fn=None, fast=False):
    """Answer the current item: fn(expected) -> what to type (default: exactly right)."""
    await pg.wait_for_selector("#drillView [data-d=hide], #drillView #dAns", timeout=4000)
    if await pg.locator("#drillView [data-d=hide]").count():
        await pg.click("#drillView [data-d=hide]")
        await pg.wait_for_selector("#drillView #dAns", timeout=4000)
    exp = await pg.evaluate(f"{ST}.items[{ST}.i].expected")
    await pg.fill("#dAns", fn(exp) if fn else exp)
    if fast:
        await pg.evaluate(f"{ST}.firstKey = Date.now() - 1500")
    await pg.click("#drillView [data-d=submit]")
    await pg.wait_for_selector("#drillView [data-d=next]", timeout=4000)
    await pg.click("#drillView [data-d=next]")
    return exp


async def round_(pg, fn=None, fast=False):
    """Answer every item in this round, then go on to the next round. Returns the expected texts."""
    seen = []
    while True:
        st = await pg.evaluate(f"(() => {{ const r = {ST}; return r ? [r.i, r.items.length] : null; }})()")
        if st[0] >= st[1]:
            break
        seen.append(await answer(pg, fn, fast))
        await pg.wait_for_timeout(30)
    return seen


async def again(pg):
    await pg.wait_for_selector("#drillView [data-d=again], #drillView [data-d=restart]", timeout=4000)
    if await pg.locator("#drillView [data-d=again]").count():
        await pg.click("#drillView [data-d=again]")
        await pg.wait_for_timeout(60)


async def main():
    url = serve(8834)
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
        await pg.click("#writer textarea"); await pg.keyboard.type("My own page.", delay=3)

        # ---------- the sample is offered in the Memory menu, not forced ----------
        before = len(await pages(pg))
        C.ok(not any("Psalm" in (v.get("text") or "") for v in (await pages(pg)).values()), "the book has no Psalm 23 until it's asked for")
        await pg.evaluate("window.TOL.memoryApi.hub()"); await pg.wait_for_timeout(150)
        C.ok(await pg.locator("#memHub [data-drill-sample]").count() == 1, "the Memory menu offers “Add sample: Psalm 23 (KJV)”")
        await pg.click("#memHub [data-drill-sample]"); await pg.wait_for_timeout(250)
        P = await pages(pg)
        page = next(v for v in P.values() if (v.get("text") or "").startswith("Psalm 23 (KJV)"))
        verses = [v for v in P.values() if v.get("parentId") == page["id"] and not v.get("deleted")]
        C.ok(len(verses) == 6 and all(v["anchor"]["text"].startswith("Verse ") for v in verses), "the sample has a fold for each of the 6 verses")
        lv = {v["id"]: sorted([x for x in P.values() if x.get("parentId") == v["id"]], key=lambda x: x["anchor"]["text"]) for v in verses}
        C.ok(all(len(L) == 5 for L in lv.values()), "each verse has 5 levels")
        v1 = next(v for v in verses if v["anchor"]["text"] == "Verse 1")
        C.ok(lv[v1["id"]][4]["text"] == KJV1 and lv[v1["id"]][0]["text"] == "God cares for me.", "level 5 is the KJV words; level 1 is the simplest")
        v4 = next(v for v in verses if v["anchor"]["text"] == "Verse 4")
        C.ok(lv[v4["id"]][4]["text"].endswith("thy rod and thy staff they comfort me."), "verse 4 level 5 is verbatim KJV")
        C.ok(await pg.evaluate("document.getElementById('drillDlg').open"), "its drill opens for editing")
        C.ok("perfect runs in a row" in await pg.text_content("#drillDlg") and await pg.input_value("#drillDlg [data-dr=n]") == "3", "the steps read in plain words; default: 3 perfect in a row")
        did = (await pg.evaluate("window.TOL.drills.list()"))[0]["id"]
        d = await drill(pg, did)
        C.ok(len(d["groups"]) == 6 and all(len(g) == 5 for g in d["groups"]), "the drill: 6 verses × 5 levels, simplest first")
        await pg.click("#drillDlg [data-dre=run]"); await pg.wait_for_timeout(200)

        # ---------- level 1: show → hide → recall ----------
        C.ok(await pg.is_visible("#drillView") and await pg.locator("#drillView [data-d=hide]").count() == 1, "the first time, it shows the words first")
        C.ok("God cares for me." in await pg.text_content("#drillView .d-q"), "it starts with verse 1, level 1")
        await pg.click("#drillView [data-d=hide]"); await pg.wait_for_timeout(100)
        C.ok("God cares for me." not in await pg.text_content("#drillView"), "after Hide the words are gone")
        C.ok(await pg.locator("#drillView .d-cue").count() == 1, "a hint shows while it's new")
        t0 = await clock(pg)
        await pg.click("#dAns"); await pg.keyboard.type("God cares for me.", delay=40)
        await pg.click("#drillView [data-d=submit]"); await pg.wait_for_timeout(1200)
        C.ok(await clock(pg) > t0, "typing a drill answer counts on the writing clock")
        C.ok("Perfect." in await pg.text_content("#drillView"), "a right answer is Perfect")
        await pg.click("#drillView [data-d=next]"); await pg.wait_for_timeout(100)
        C.ok("1/3 right in a row" in await pg.text_content("#drillView .d-prog"), "it counts 1 of 3 right in a row")
        await again(pg)
        C.ok(await pg.locator("#drillView [data-d=hide]").count() == 0, "once you've got it, it no longer shows it first")
        await round_(pg); await again(pg)
        hint_rounds = await pg.locator("#drillView .d-cue").count()
        C.ok(hint_rounds == 0, "the hint fades away as the streak grows")
        await round_(pg)
        d = await drill(pg, did)
        C.ok(d["progress"]["k"] == 2 and "adding the next one" in d["log"][-1], f"3 perfect in a row → level 2 joins, and it says why ({d['log'][-1]!r})")
        await again(pg)
        seen = await round_(pg)
        C.ok(seen == ["God cares for me.", "The Lord is my shepherd."], "the next round recalls level 1 then level 2")

        # ---------- adapting: a word missed twice gets a hint; 3 misses step back ----------
        drop = lambda e: e.replace("shepherd", "sheep")
        await again(pg); await round_(pg, drop)
        await again(pg); await round_(pg, drop)
        d = await drill(pg, did)
        C.ok(any("“shepherd” because it slipped twice" in l for l in d["log"]), "missing “shepherd” twice adds a first-letter hint, said in one line")
        await again(pg); await round_(pg)
        await again(pg); await round_(pg)
        await again(pg)
        await answer(pg)               # level 1: right
        await pg.wait_for_selector("#drillView #dAns")
        cue = await pg.text_content("#drillView .d-cue")
        C.ok(re.search(r"\bs_______\.", cue or "") is not None and "L" not in cue, f"after other hints fade, “shepherd” keeps its first letter ({cue!r})")
        await pg.fill("#dAns", "The Lord is my shepherd."); await pg.click("#drillView [data-d=submit]"); await pg.click("#drillView [data-d=next]")
        d = await drill(pg, did)
        C.ok(d["progress"]["k"] == 3, "then level 3 joins")
        for _ in range(3):
            await again(pg); await round_(pg, lambda e: "nope")
        d = await drill(pg, did)
        C.ok(d["progress"]["k"] == 2 and "stepping back" in d["log"][-1], "three misses in a row step back to fewer items, said in one line")

        # ---------- fast perfect runs extend sooner ----------
        await again(pg); await round_(pg, fast=True)
        await again(pg); await round_(pg, fast=True)
        d = await drill(pg, did)
        C.ok(d["progress"]["k"] == 3 and any("Fast and perfect twice" in l for l in d["log"]), "two fast perfect runs extend after 2 instead of 3, said in one line")

        # ---------- peeking doesn't count as perfect ----------
        await again(pg)
        await pg.wait_for_selector("#drillView [data-d=hide], #drillView #dAns")
        if await pg.locator("#drillView [data-d=hide]").count():
            await pg.click("#drillView [data-d=hide]")
        pk = pg.locator("#drillView [data-d=peek]")
        box = await pk.bounding_box()
        await pg.mouse.move(box["x"] + 5, box["y"] + 5); await pg.mouse.down(); await pg.wait_for_timeout(80)
        C.ok("God cares for me." in await pg.text_content("#drillView"), "holding Peek shows the words")
        await pg.mouse.up()
        await pg.fill("#dAns", "God cares for me."); await pg.click("#drillView [data-d=submit]")
        C.ok("peeked" in await pg.text_content("#drillView"), "after a peek, a right answer isn't counted as perfect")
        await pg.click("#drillView [data-d=next]")
        await pg.click("#drillView [data-d=quit]")

        # ---------- editing: the steps, rule, order, direction ----------
        await pg.evaluate(f"window.TOL.drills.edit('{did}')")
        await pg.fill("#drillDlg [data-dr=n]", "1")
        await pg.select_option("#drillDlg [data-dr=dir]", "back")
        await pg.click("#drillDlg [data-dre=save]"); await pg.wait_for_timeout(100)
        d = await drill(pg, did)
        C.ok(d["rule"]["n"] == 1 and d["dir"] == "back", "edits are saved (1 in a row, backward)")
        await pg.evaluate(f"window.TOL.drills.run('{did}')"); await pg.wait_for_timeout(150)
        it = await pg.evaluate(f"{ST}.items[0]")
        C.ok(it["expected"] == "Level 1" and it["prompt"] == "God cares for me.", "backward: it shows what's inside and asks which words it's under")
        await pg.click("#drillView [data-d=quit]")
        await pg.evaluate(f"window.TOL.drills.edit('{did}')")
        await pg.select_option("#drillDlg [data-dr=dir]", "fwd")
        await pg.click("#drillDlg [data-dre=reset]"); await pg.click("#drillDlg [data-dre=save]"); await pg.wait_for_timeout(100)

        # orders
        o = await pg.evaluate(f"""(() => {{ const D = window.TOL.drills, d = D.get('{did}'), ids = d.groups[0];
            const r = o => D.arrange(Object.assign({{}}, d, {{order: o, progress: Object.assign({{}}, d.progress, {{misses: {{[ids[3]]: {{a: 5}}}}}})}}), ids.slice());
            return {{ front: r('front'), back: r('back'), weak: r('weakest'), inter: r('interleave'), shuf: r('shuffle'), ids }}; }})()""")
        ids = o["ids"]
        C.ok(o["front"] == ids and o["back"] == ids[::-1], "orders: front to back, back to front")
        C.ok(o["weak"][0] == ids[3], "order: weakest first puts the most-missed first")
        C.ok(o["inter"] == [ids[0], ids[4], ids[1], ids[3], ids[2]] and sorted(o["shuf"]) == sorted(ids), "orders: interleaved spreads items out; shuffled keeps them all")
        fake.plain = [json.dumps({"order": [4, 3, 2, 1, 0], "reason": "The full verse first, so the simpler ones fall into place."})]
        await pg.evaluate(f"(() => {{ const d = window.TOL.drills.get('{did}'); d.order = 'ai'; window.TOL.memoryApi.putRecord('drills', d.id, d); }})()")
        await pg.evaluate(f"window.TOL.drills.run('{did}')"); await pg.wait_for_timeout(500)
        d = await drill(pg, did)
        C.ok(any(l.startswith("Claude's order: The full verse first") for l in d["log"]), "Claude arranges the order and gives a one-line reason")
        C.ok("Claude's order" in await pg.text_content("#drillView"), "the reason shows on the drill screen")
        await pg.click("#drillView [data-d=quit]")
        await pg.evaluate(f"(() => {{ const d = window.TOL.drills.get('{did}'); d.order = 'front'; window.TOL.memoryApi.putRecord('drills', d.id, d); }})()")

        # ---------- the whole thing, to mastery (1 in a row now, to keep it quick) ----------
        await pg.evaluate(f"window.TOL.drills.run('{did}')"); await pg.wait_for_timeout(150)
        chained = None
        for _ in range(80):
            seen = await round_(pg)
            d = await drill(pg, did)
            if d["progress"]["phase"] == "chain" and chained is None:
                chained = d["log"][-1]
            if d["progress"]["done"]:
                break
            if d["progress"]["phase"] == "chain" and d["progress"]["c"] == 3:
                nxt = seen
            await again(pg)
        C.ok(chained and "chaining" in chained, f"after every verse is mastered, it starts chaining them ({chained!r})")
        C.ok(d["progress"]["done"] and "Mastered" in await pg.text_content("#drillView"), "the drill reaches Mastered")
        C.ok(len(seen) == 6 and seen[0] == KJV1 and seen[5].endswith("for ever."), "the last round is the whole psalm in KJV, verse 1 to 6")
        mem = await pg.evaluate("window.TOL.getMemory()")
        ck = f"drill:{did}|fwd"
        C.ok(ck in mem["cards"] and len(mem["cards"][ck]["history"]) == 1, "the final full recall joins spaced review")
        await pg.click("#drillView [data-d=quit]")

        # ---------- due drills show up; a due mastered drill is one full recall ----------
        await pg.evaluate(f"""(() => {{ const m = window.TOL.getMemory(); m.cards['{ck}'].history.forEach(h => h.t -= 400 * 86400000); window.TOL.setMemory(m); window.TOL.refreshList(); }})()""")
        await pg.evaluate("window.TOL.drills.due().length")
        await pg.click("#menuBtn") if await pg.locator("#menuBtn").count() else None
        await pg.wait_for_timeout(150)
        C.ok("1 due today" in await pg.text_content("#list"), "a due drill shows “1 due today” in the page list")
        await pg.evaluate("window.TOL.memoryApi.hub()"); await pg.wait_for_timeout(100)
        C.ok("Due today" in await pg.text_content("#memHub"), "and in the Memory menu")
        await pg.click(f"#memHub [data-drill-run='{did}']"); await pg.wait_for_timeout(150)
        seen = await round_(pg)
        C.ok(len(seen) == 6 and "Still there!" in await pg.text_content("#drillView"), "a review is one full recall of the whole psalm")
        mem = await pg.evaluate("window.TOL.getMemory()")
        C.ok(len(mem["cards"][ck]["history"]) == 2 and not await pg.evaluate("window.TOL.drills.due().length"), "the review is graded and scheduled forward")
        await pg.screenshot(path=os.path.join(SHOTS, "drill-laptop.png"))
        await pg.click("#drillView [data-d=quit]")

        # ---------- accuracy rule ----------
        did2 = await pg.evaluate(f"window.TOL.drills.make('{v1['id']}', {{rule: {{type: 'accuracy', n: 1, pct: 50}}, show: false}}).id")
        await pg.evaluate(f"window.TOL.drills.run('{did2}')"); await pg.wait_for_timeout(150)
        await round_(pg, lambda e: " ".join(e.split()[:-1]))
        d2 = await drill(pg, did2)
        C.ok(d2["progress"]["g"] == 1, "an accuracy rule (50%) passes an answer that's mostly right")
        await pg.click("#drillView [data-d=quit]")

        # ---------- Claude builds a drill from plain words; undo ----------
        await pg.click("#claudeHere")
        fake.queue = [tool_call("make_drill", {"root_id": v4["id"], "name": "Verse 4 quick", "rule_n": 2, "order": "back", "direction": "both"}), say("Made it: verse 4, 2 in a row, back to front.")]
        await ask(pg, "make me a drill for verse 4, two in a row, hardest level first, both ways")
        L = await pg.evaluate("window.TOL.drills.list()")
        mine = next((x for x in L if x["name"] == "Verse 4 quick"), None)
        C.ok(mine and mine["rule"]["n"] == 2 and mine["order"] == "back" and mine["dir"] == "both", "Claude makes a drill from plain words with the asked settings")
        C.ok("Made the drill" in await pg.text_content("#agMsgs"), "its step shows in plain words")
        await pg.click("#agUndo"); await pg.wait_for_timeout(200)
        C.ok(not any(x["name"] == "Verse 4 quick" for x in await pg.evaluate("window.TOL.drills.list()")), "Undo removes the drill Claude made")
        fake.queue = [tool_call("add_sample_psalm_23", {}), say("Added.")]
        await ask(pg, "add the psalm 23 sample")
        n_ps = sum(1 for v in (await pages(pg)).values() if (v.get("text") or "").startswith("Psalm 23") and not v.get("deleted"))
        C.ok(n_ps == 2, "Claude can add the sample")
        await pg.click("#agUndo"); await pg.wait_for_timeout(200)
        n_ps = sum(1 for v in (await pages(pg)).values() if (v.get("text") or "").startswith("Psalm 23") and not v.get("deleted"))
        C.ok(n_ps == 1, "Undo takes the added sample away again")
        fake.queue = [tool_call("run_drill", {"id": did}), say("Here you go.")]
        await ask(pg, "drill psalm 23")
        await pg.wait_for_timeout(700)
        C.ok(await pg.is_visible("#drillView") and not await pg.evaluate("document.body.classList.contains('agent-open')"), "Claude can start a drill (the panel steps aside)")
        await pg.click("#drillView [data-d=quit]")

        # ---------- "Drill this fold" in the fold menu ----------
        await pg.evaluate(f"window.TOL.openPage('{page['id']}', true)"); await pg.wait_for_timeout(100)
        await pg.evaluate(f"window.TOL.hooks.foldMenu('{v1['id']}')"); await pg.wait_for_timeout(100)
        C.ok(await pg.locator("#memDlg [data-drill-new]").count() == 1, "the fold's More… menu offers “Drill this fold”")
        await pg.click("#memDlg [data-drill-new]"); await pg.wait_for_timeout(150)
        C.ok(await pg.evaluate("document.getElementById('drillDlg').open"), "it makes the drill and opens it for editing")
        await pg.click("#drillDlg [data-dre=close]")

        # ---------- phone ----------
        ph = await br.new_context(**p.devices["iPhone 13"])
        await ph.add_init_script(KEY)
        await ph.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
        q = await ph.new_page(); q.errs = []; q.on("pageerror", lambda e: q.errs.append(str(e)))
        await q.goto(url); await q.wait_for_timeout(400)
        await q.evaluate("window.TOL.drills.addPsalm23()"); await q.wait_for_timeout(100)
        await q.evaluate("document.getElementById('drillDlg').open && document.getElementById('drillDlg').close()")
        qd = (await q.evaluate("window.TOL.drills.list()"))[0]["id"]
        await q.evaluate(f"window.TOL.drills.run('{qd}')"); await q.wait_for_timeout(150)
        await q.click("#drillView [data-d=hide]"); await q.wait_for_timeout(100)
        await q.screenshot(path=os.path.join(SHOTS, "drill-iphone.png"))
        over = await q.evaluate("""(() => { const t = document.querySelector('.thumb'), b = document.querySelector('#drillView [data-d=submit]').getBoundingClientRect();
            if (!t || t.offsetParent === null) return false; const r = t.getBoundingClientRect(); return !(r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom); })()""")
        C.ok(not over, "on the iPhone the hold button doesn't cover Check")
        wide = await q.evaluate("document.getElementById('drillView').scrollWidth <= window.innerWidth + 1")
        C.ok(wide, "the drill fits the iPhone's width")

        C.ok(not pg.errs and not q.errs, f"no page errors {pg.errs} {q.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
