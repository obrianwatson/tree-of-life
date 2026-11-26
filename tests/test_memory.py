"""Memory testing, Nest in… (wrap here / move into), AI feedback, AI questions, AI folds,
FSRS scheduling, practice cues, old data. One device; Anthropic is faked.
Run:  python3 tests/test_memory.py"""
import asyncio, json, os, re, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, launch
from test_folds import nest_new, select, pages, root_id
from playwright.async_api import async_playwright

C = Checks()
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())


class FakeAnthropic:
    """Answers like the Anthropic Messages API, with canned JSON chosen by what's asked."""
    def __init__(self):
        self.mode = "ok"      # ok | malformed | fail
        self.calls = []

    async def handle(self, route):
        req = route.request
        cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS"}
        if req.method == "OPTIONS":
            return await route.fulfill(status=204, headers=cors)
        if self.mode == "fail":
            return await route.abort("timedout")
        body = json.loads(req.post_data)
        self.calls.append({"system": body.get("system", ""), "user": body["messages"][0]["content"], "key": req.headers.get("x-api-key"),
                           "browser": req.headers.get("anthropic-dangerous-direct-browser-access"), "model": body.get("model")})
        sysm = body.get("system", "")
        if self.mode == "malformed":
            text = "Sorry, I can't format that right now."
        elif "memory test" in sysm:
            text = json.dumps({"got": ["two plates"], "missed": ["one cold"], "meaning": "partly", "tip": "Picture one plate steaming, one not.", "grade": 2})
        elif "memory-test questions" in sysm:
            text = "Here you go:\n```json\n" + json.dumps({"questions": [{"q": "How many plates?", "a": "Two"}, {"q": "Which one is cold?", "a": "one"}]}) + "\n```"
        elif "unfolds beneath" in sysm:
            text = json.dumps({"text": "Grandfather planted it the year I was born, by the old fence.", "chunks": ["the year I was born", "old fence", "not in the text"]})
        elif "Pick up to N" in sysm:
            text = json.dumps({"chunks": ["plates"]})
        else:
            text = "OK"
        return await route.fulfill(status=200, headers=cors, content_type="application/json",
                                   body=json.dumps({"content": [{"type": "text", "text": text}], "usage": {"input_tokens": 1000, "output_tokens": 200}}))


async def fold_by_anchor(pg, words):
    ps = await pages(pg)
    return next(v for v in ps.values() if v.get("anchor") and v["anchor"]["text"] == words)

async def type_in(pg, needle, at_end=True):
    """Click into the text box that holds `needle` and put the caret at its end."""
    await pg.evaluate("""n => { const t = [...document.querySelectorAll('#writer textarea')].find(x => x.value.includes(n));
        t.focus(); const i = t.value.indexOf(n) + n.length; t.setSelectionRange(i, i); }""", needle)

async def clock(pg):
    return await pg.evaluate("(() => { const [h,m,s] = document.getElementById('total').textContent.split(':').map(Number); return h*3600+m*60+s; })()")

async def wait_idle(pg, ms=4800):
    await pg.wait_for_timeout(ms)   # longer than the typing pause, so the clock stops

async def run_test_flow(pg, answer, grade_label):
    await pg.wait_for_selector("#tAns", state="visible")
    await pg.click("#tAns"); await pg.keyboard.type(answer, delay=8)
    await pg.click("[data-t=submit]")
    await pg.wait_for_selector(".t-grades", state="visible")


async def main():
    url = serve(8821)
    ai = FakeAnthropic()
    async with async_playwright() as p:
        br = await launch(p)
        ctx, pg = await new_device(br, url, viewport={"width": 1280, "height": 800})
        await ctx.route("https://api.anthropic.com/**", ai.handle)

        # ---------- writing to work with
        await pg.click("#writer textarea")
        await pg.keyboard.type("I still set the table for two.\nYour chair still faces the window.\nThe kettle hums.", delay=2)
        await nest_new(pg, "set the table", inner="Two plates, one cold.")
        root = await root_id(pg)
        tbl = await fold_by_anchor(pg, "set the table")
        C.ok(bool(tbl) and tbl["text"] == "Two plates, one cold.", "a fold to remember: 'set the table' → 'Two plates, one cold.'")
        C.ok(await pg.locator(f'[data-more="{tbl["id"]}"]').count() == 1, "each open fold has a More… button")

        # ---------- Nest in… → Wrap here (shared)
        await select(pg, "Your chair")
        await pg.click("#foldbar [data-b=nestin]")
        await pg.wait_for_selector("#foldbar [data-b=wrapnew]", state="visible")
        await pg.screenshot(path=os.path.join(SHOTS, "mem-nestin-laptop.png"))
        await pg.click("#foldbar [data-b=wrapnew]")
        await pg.wait_for_timeout(200)
        w = await fold_by_anchor(pg, "Your chair")
        C.ok({k: w.get("share", {}).get(k) for k in ("s", "e")} == {"s": 0, "e": 10} and w["share"].get("src") == root and w["text"] == "Your chair", f"Wrap here makes a fold holding the same words, shared ({w.get('share')})")
        C.ok(await pg.locator("#writer span.sh").count() >= 1, "the shared words are tinted inside the wrapper")
        await pg.keyboard.type("In the kitchen, ", delay=3)     # caret starts before the shared words
        await pg.wait_for_timeout(150)
        ps = await pages(pg)
        C.ok(ps[w["id"]]["text"] == "In the kitchen, Your chair" and (ps[w["id"]]["share"]["s"], ps[w["id"]]["share"]["e"]) == (16, 26), f"writing around the shared words keeps them shared ({ps[w['id']]['text']!r} {ps[w['id']].get('share')})")
        C.ok("Your chair still faces" in ps[root]["text"], "…and doesn't change the page")
        # edit the shared words inside the wrapper → the page changes too
        await pg.evaluate("""() => { const t = [...document.querySelectorAll('#writer .fold textarea')].find(x => x.value.startsWith('In the kitchen'));
            t.focus(); const i = t.value.indexOf('chair'); t.setSelectionRange(i, i); }""")
        await pg.keyboard.type("old ", delay=3); await pg.wait_for_timeout(250)
        ps = await pages(pg)
        C.ok("Your old chair still faces" in ps[root]["text"], f"changing the shared words in the wrapper changes them in the page ({ps[root]['text'].splitlines()[1]!r})")
        C.ok(await pg.evaluate("[...document.querySelectorAll('#writer > .node > .chunk textarea')].some(t => t.value.includes('Your old chair'))"), "…and the page on screen shows it")
        # edit the shared words in the page → the wrapper changes
        await select(pg, "chair")     # the page's own line comes first on screen
        await pg.keyboard.type("seat", delay=3); await pg.wait_for_timeout(250)
        ps = await pages(pg)
        C.ok(ps[w["id"]]["text"] == "In the kitchen, Your old seat" and "Your old seat still" in ps[root]["text"], f"changing them in the page changes the wrapper ({ps[w['id']]['text']!r})")
        # delete the source words → the wrapper keeps a copy
        await select(pg, "Your old seat"); await pg.keyboard.press("Backspace"); await pg.wait_for_timeout(300)
        ps = await pages(pg)
        C.ok(ps[w["id"]]["share"].get("frozen") and ps[w["id"]]["text"] == "In the kitchen, Your old seat", f"deleting the words in the page leaves the wrapper's copy ({ps[w['id']].get('share')})")
        C.ok(w["id"] in ps, "…and the wrapper is kept (unattached)")

        # ---------- Nest in… → Move into: new page (folds inside travel, undo)
        await nest_new(pg, "kettle", inner="steam on the window")
        k = await fold_by_anchor(pg, "kettle")
        await select(pg, "The kettle hums.")
        await pg.click("#foldbar [data-b=nestin]"); await pg.click("#foldbar [data-b=movenew]")
        await pg.wait_for_timeout(250)
        ps = await pages(pg)
        dest = next(v for v in ps.values() if v.get("text") == "The kettle hums.")
        portal = next((v for v in ps.values() if v.get("portal") == dest["id"]), None)
        C.ok("⤷" in ps[root]["text"] and "kettle" not in ps[root]["text"], "Move into: the words leave the page and a ⤷ marker stays")
        C.ok(portal and portal["anchor"]["text"] == "⤷", "the marker is a link to where they went")
        C.ok(ps[k["id"]]["parentId"] == dest["id"] and ps[k["id"]]["anchor"]["text"] == "kettle", "a fold inside the moved words travels with them")
        C.ok(await pg.locator("#toast:not([hidden]) #toastAct").count() == 1, "an Undo button appears")
        # tapping the marker goes there
        await type_in(pg, "⤷"); await pg.evaluate("document.activeElement.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))")
        await pg.wait_for_selector("#foldbar [data-b=toggle]", state="visible")
        C.ok("Go to" in await pg.locator("#foldbar").inner_text(), "the marker offers 'Go to …'")
        await pg.click("#toastAct")      # undo
        await pg.wait_for_timeout(250)
        ps = await pages(pg)
        C.ok("The kettle hums." in ps[root]["text"] and "⤷" not in ps[root]["text"], "Undo puts the words back")
        C.ok(ps[k["id"]]["parentId"] == root and dest["id"] not in ps and portal["id"] not in ps, "…with their fold, and the new page and marker are gone")
        # Move into an existing page via the picker
        await pg.evaluate("document.querySelector('#newTop').click()")
        await pg.keyboard.type("Kitchen notes", delay=2); await pg.wait_for_timeout(200)
        other = await root_id(pg)
        await pg.evaluate(f"window.TOL.openPage('{root}', true)"); await pg.wait_for_timeout(200)
        await select(pg, "The kettle hums.")
        await pg.click("#foldbar [data-b=nestin]"); await pg.click("#foldbar [data-b=moveold]")
        await pg.wait_for_selector("#pickDlg[open]")
        C.ok("Move these words into" in await pg.locator("#pickTitle").inner_text(), "Move into: existing… asks where")
        await pg.click(f'#pickList [data-pick="{other}"]'); await pg.wait_for_timeout(250)
        ps = await pages(pg)
        C.ok(ps[other]["text"] == "Kitchen notes\n\nThe kettle hums.", f"the words are added to the end of the chosen page ({ps[other]['text']!r})")

        # ---------- memory test on the 'set the table' fold, no AI key
        before = await clock(pg)
        await pg.click(f'[data-more="{tbl["id"]}"]'); await pg.wait_for_selector("#memDlg[open]")
        await pg.screenshot(path=os.path.join(SHOTS, "mem-foldmenu-laptop.png"))
        await pg.click("#memDlg [data-act=test]")
        await pg.wait_for_selector("#testView:not([hidden])")
        C.ok("set the table" in await pg.locator(".t-q").inner_text() and "What's folded under" in await pg.locator(".t-prompt").inner_text(), "Test me shows the peg and hides what's inside")
        await pg.screenshot(path=os.path.join(SHOTS, "mem-test-laptop.png"))
        await run_test_flow(pg, "Two plates, one warm", "Almost")
        C.ok(await pg.locator(".t-text mark.ch").count() >= 1 and await pg.locator(".t-text .w.ok").count() >= 3, "the review marks matched and changed words")
        C.ok("cold" in await pg.locator(".t-cols").inner_text(), "the correct answer is shown")
        C.ok(await pg.locator(".t-ai").count() == 0, "with no AI key there's no AI box")
        C.ok(await pg.locator(".grade").count() == 4 and "next" in await pg.locator(".grade").first.inner_text(), "four grades, each saying when it comes back")
        await pg.screenshot(path=os.path.join(SHOTS, "mem-review-laptop.png"))
        await pg.click('.grade[data-grade="2"]'); await pg.wait_for_timeout(200)
        C.ok("%" in await pg.locator(".t-score").inner_text() and "need work" in await pg.locator("#testView").inner_text(), "the end shows the score and the weak pegs")
        m = await pg.evaluate("window.TOL.getMemory()")
        card = m["cards"].get("peg:" + tbl["id"] + "|fwd")
        C.ok(card and card["history"][0]["g"] == 2, "the answer is recorded in the history")
        C.ok(await clock(pg) - before >= 1, "typing the answer counted on the writing clock")
        await pg.click("[data-t=quit]"); await pg.wait_for_timeout(200)

        # ---------- word comparison details
        d = await pg.evaluate("window.TOL.memoryDiff('I still set the table, for two.', 'i still set a table for TWO')")
        C.ok(d["matched"] == 6 and d["changed"] == 1 and d["missed"] == 0, f"comparison ignores capitals and punctuation, spots a changed word ({d['matched']},{d['changed']},{d['missed']})")
        d = await pg.evaluate("window.TOL.memoryDiff('one two three four', 'one three four five')")
        C.ok(d["missed"] == 1 and d["added"] == 1, "missed and added words are told apart")

        # ---------- own question; peg-hidden mode; shuffled
        await pg.click(f'[data-more="{tbl["id"]}"]'); await pg.wait_for_selector("#memDlg[open]")
        await pg.fill("#qQ", "How many plates?"); await pg.click("#memDlg [data-act=addq]"); await pg.wait_for_timeout(100)
        C.ok("How many plates?" in await pg.locator("#memDlg .qlist").inner_text(), "my own question is added to the fold")
        await pg.select_option('#memDlg select[data-set="hide"]', "peg"); await pg.wait_for_timeout(100)
        await pg.click("#memDlg [data-act=test]"); await pg.wait_for_selector("#testView:not([hidden])")
        C.ok("Which words" in await pg.locator(".t-prompt").inner_text() and "Two plates" in await pg.locator(".t-q").inner_text(), "'hide the words it's folded under' shows what's inside and asks for the peg")
        await run_test_flow(pg, "set the table", "Got it")
        C.ok("set the table" in await pg.locator(".t-cols").inner_text(), "…and checks the peg")
        await pg.click('.grade[data-grade="3"]')
        await pg.wait_for_selector("#tAns")
        C.ok("How many plates?" in await pg.locator(".t-q").inner_text(), "my own question comes up in the same test")
        await run_test_flow(pg, "two", "Got it"); await pg.click('.grade[data-grade="3"]')
        await pg.click("[data-t=quit]")
        await pg.evaluate(f"window.TOL.memoryApi.setFold('{tbl['id']}', {{hide: 'contents'}})")
        await pg.evaluate(f"window.TOL.memoryStart('{root}', 'shuffle')"); await pg.wait_for_selector("#testView:not([hidden])")
        n_items = int(re.search(r"of (\d+)", await pg.locator(".t-top").inner_text()).group(1))
        C.ok(n_items >= 3, f"Test this page (shuffled) gathers every fold and question inside it, even a fold whose words are gone ({n_items})")
        await pg.click("[data-t=quit]")

        # ---------- practice: hide what's inside, hold to peek
        await pg.click(f'[data-more="{tbl["id"]}"]'); await pg.wait_for_selector("#memDlg[open]")
        await pg.check("#memDlg [data-act=practice]"); await pg.click("#memDlg [data-act=close]"); await pg.wait_for_timeout(200)
        cue = await pg.locator(f'[data-fold="{tbl["id"]}"] .cue').inner_text()
        C.ok(cue.strip() == "T p, o c.", f"practice hides what's inside behind first letters ({cue!r})")
        await pg.locator(f'[data-fold="{tbl["id"]}"] .peek').dispatch_event("pointerdown")
        C.ok("Two plates, one cold." in await pg.locator(f'[data-fold="{tbl["id"]}"] .cue').inner_text(), "pressing Hold to peek shows it")
        await pg.locator(f'[data-fold="{tbl["id"]}"] .peek').dispatch_event("pointerup")
        C.ok("Two plates" not in await pg.locator(f'[data-fold="{tbl["id"]}"] .cue').inner_text(), "letting go hides it again")
        for style, want in (("shape", "___ ______, ___ ____."), ("alt", "Two ______, one ____."), ("blank", "_")):
            got = await pg.evaluate(f"window.TOL.memoryCue('Two plates, one cold.', '{style}')")
            C.ok(got.startswith(want), f"hint style {style}: {got!r}")
        await pg.click(f'[data-stop-practice="{tbl["id"]}"]'); await pg.wait_for_timeout(150)
        C.ok(await pg.locator(f'[data-fold="{tbl["id"]}"] .cue').count() == 0, "Stop practicing shows the words again")

        # ---------- FSRS scheduling
        r = await pg.evaluate("""(() => { const F = window.TOL.memoryFSRS, set = {retention: .9, maxInterval: 365}, t = Date.UTC(2026, 0, 1);
            const first = [1,2,3,4].map(g => F.step({reps:0}, g, t, set));
            const later = [1,2,3,4].map(g => F.step(first[2], g, t + 3*86400000, set));
            const hi = F.step(first[2], 3, t + 3*86400000, {retention: .95, maxInterval: 365}), lo = F.step(first[2], 3, t + 3*86400000, {retention: .8, maxInterval: 365});
            const cap = F.step(F.step(F.step(first[3], 4, t + 20*86400000, {retention:.9, maxInterval: 30}), 4, t + 60*86400000, {retention:.9, maxInterval: 30}), 4, t+100*86400000, {retention:.9, maxInterval:30});
            return { first: first.map(s => (s.due - t)/86400000), later: later.map(s => (s.due - (t + 3*86400000))/86400000), hi: (hi.due - t)/86400000, lo: (lo.due - t)/86400000,
                     lapse: later[0].lapses, capGap: (cap.due - (t+100*86400000))/86400000, dEasy: later[3].D, dAgain: later[0].D }; })()""")
        C.ok(r["first"][0] < 0.01 and r["first"][1] <= r["first"][2] <= r["first"][3], f"first answer: Missed comes back in minutes, then Almost ≤ Got it ≤ Easy ({[round(x,2) for x in r['first']]})")
        C.ok(r["later"][0] < 0.01 and r["later"][1] < r["later"][2] < r["later"][3], f"later answers: gaps grow with the grade ({[round(x,2) for x in r['later']]})")
        C.ok(r["hi"] < r["lo"], f"wanting to be surer brings it back sooner (95%: {r['hi']:.0f} d, 80%: {r['lo']:.0f} d)")
        C.ok(r["lapse"] == 1 and r["dAgain"] > r["dEasy"], "missing it counts a lapse and makes it 'harder'")
        C.ok(r["capGap"] <= 30, f"the longest-gap limit is respected ({r['capGap']} d)")

        # ---------- Due today
        await pg.evaluate(f"""(() => {{ const m = JSON.parse(JSON.stringify(window.TOL.getMemory()));
            m.cards['peg:{tbl["id"]}|fwd'] = {{ id: 'peg:{tbl["id"]}|fwd', prompt: 'peg:{tbl["id"]}', dir: 'fwd', history: [{{ id: 'old1', t: Date.now() - 20*86400000, g: 3 }}], updatedAt: Date.now() }};
            window.TOL.setMemory(m); window.TOL.refreshList(); }})()""")
        n_due = await pg.evaluate("window.TOL.memoryApi.dueItems().reviews.length")
        C.ok(n_due >= 1, f"a prompt last seen 20 days ago is due today ({n_due})")
        C.ok("to review today" in await pg.locator(".memrow:has([data-listtop=memory])").inner_text(), "the page list shows what's due")
        await pg.evaluate("window.TOL.rerender()")
        C.ok(await pg.locator(f'[data-fold="{tbl["id"]}"] .duebadge').count() == 1, "the fold shows a 'due' badge")
        await pg.click(".memrow [data-listtop]"); await pg.wait_for_selector("#memHub[open]")
        C.ok("Review what's due" in await pg.locator("#memHub").inner_text(), "the Memory hub offers today's review")
        await pg.click('#memHub [data-hub="due"]'); await pg.wait_for_selector("#testView:not([hidden])")
        C.ok("Due today" in await pg.locator(".t-top").inner_text(), "…and starts it")
        await pg.click("[data-t=quit]")
        await pg.evaluate("""(() => { const m = JSON.parse(JSON.stringify(window.TOL.getMemory())); m.settings = Object.assign({}, m.settings, {newPerDay: 0, dailyReviews: 10, updatedAt: Date.now()}); window.TOL.setMemory(m); })()""")
        C.ok(await pg.evaluate("window.TOL.memoryApi.dueItems().news.length") == 0, "'new prompts per day' = 0 adds no new ones")

        # ---------- AI: key, feedback, suggested grade
        await pg.evaluate("localStorage.setItem('tol-ai', JSON.stringify({key: 'sk-ant-test', model: 'claude-haiku-5-5', cap: 5}))")
        await pg.evaluate(f"window.TOL.memoryStart('{tbl['id']}', 'order')"); await pg.wait_for_selector("#tAns")
        await run_test_flow(pg, "two plates", "x")
        await pg.wait_for_selector(".t-ai >> text=You missed")
        call = ai.calls[-1]
        C.ok(call["key"] == "sk-ant-test" and call["browser"] == "true" and call["model"] == "claude-haiku-5-5", "AI feedback calls Anthropic from the browser with the key and model")
        C.ok("Two plates, one cold." in call["user"] and "two plates" in call["user"], "it sends the correct text and the answer")
        C.ok("one cold" in await pg.locator(".t-ai").inner_text() and "Picture" in await pg.locator(".t-ai").inner_text(), "the AI's feedback is shown: what was missed, a tip")
        C.ok(await pg.locator('.grade.sug[data-grade="2"]').count() == 1, "the AI's suggested grade is highlighted (you can still pick another)")
        await pg.screenshot(path=os.path.join(SHOTS, "mem-review-ai-laptop.png"))
        await pg.click('.grade[data-grade="3"]'); await pg.wait_for_timeout(100)
        await pg.click("[data-t=quit]")
        # malformed reply, failed request
        ai.mode = "malformed"
        await pg.evaluate(f"window.TOL.memoryStart('{tbl['id']}', 'order')"); await pg.wait_for_selector("#tAns")
        await run_test_flow(pg, "two", "x"); await pg.wait_for_selector(".t-ai >> text=couldn't be read")
        C.ok(True, "an unreadable AI reply → 'grade it yourself'")
        await pg.click("[data-t=quit]")
        ai.mode = "fail"
        await pg.evaluate(f"window.TOL.memoryStart('{tbl['id']}', 'order')"); await pg.wait_for_selector("#tAns")
        await run_test_flow(pg, "two", "x"); await pg.wait_for_selector(".t-ai >> text=isn't available")
        C.ok(await pg.locator(".grade").count() == 4, "a failed AI request still lets you grade")
        await pg.click("[data-t=quit]")
        ai.mode = "ok"
        # 'only me' review mode → no AI call
        n_calls = len(ai.calls)
        await pg.evaluate(f"window.TOL.memoryApi.setFold('{tbl['id']}', {{review: 'self'}})")
        await pg.evaluate(f"window.TOL.memoryStart('{tbl['id']}', 'order')"); await pg.wait_for_selector("#tAns")
        await run_test_flow(pg, "two", "x"); await pg.wait_for_timeout(300)
        C.ok(len(ai.calls) == n_calls and await pg.locator(".t-ai").count() == 0, "'Only me' never asks the AI")
        await pg.click("[data-t=quit]")
        await pg.evaluate(f"window.TOL.memoryApi.setFold('{tbl['id']}', {{review: 'ai'}})")

        # ---------- AI questions: keep / edit / drop
        await pg.evaluate("window.TOL.rerender()")
        await pg.click(f'[data-more="{tbl["id"]}"]'); await pg.wait_for_selector("#memDlg[open]")
        await pg.click("#memDlg [data-act=aiq]")
        await pg.wait_for_selector('#aiDlg [data-q="0"]')
        await pg.fill('#aiDlg [data-q="0"]', "How many plates are set?")
        await pg.uncheck('#aiDlg [data-keep="1"]')
        await pg.click('#aiDlg [data-ai="keepq"]'); await pg.wait_for_timeout(150)
        prom = [v for v in (await pg.evaluate("window.TOL.getMemory().prompts")).values() if v.get("source") == "ai" and not v.get("deleted")]
        C.ok(len(prom) == 1 and prom[0]["q"] == "How many plates are set?" and prom[0]["a"] == "Two", f"AI questions: the edited one is kept, the unchecked one dropped ({[x['q'] for x in prom]})")

        # ---------- AI folds: write deeper on a selection, unfold on demand, no clock time
        await pg.evaluate(f"window.TOL.openPage('{root}', true)"); await pg.wait_for_timeout(200)
        await wait_idle(pg)
        clock_before = await clock(pg)
        await select(pg, "the window")
        await pg.click("#foldbar [data-b=ai]")
        await pg.wait_for_selector("#aiDlg[open] #aiEst")
        est = await pg.locator("#aiEst").inner_text()
        C.ok("This step" in est and "up to" in est, f"before writing, it shows the cost of this step and of going deeper ({est[:80]}…)")
        await pg.fill("#aiInstr", "the memory behind this")
        await pg.screenshot(path=os.path.join(SHOTS, "mem-ai-deeper-laptop.png"))
        await pg.click('#aiDlg [data-ai="go"]'); await pg.wait_for_timeout(500)
        ps = await pages(pg)
        aif = next(v for v in ps.values() if v.get("ai") and not v["ai"].get("pending") and v.get("anchor", {}).get("text") == "the window")
        pend = [v for v in ps.values() if v.get("ai", {}).get("pending") and v.get("parentId") == aif["id"]]
        C.ok(aif["text"].startswith("Grandfather planted"), "the AI writes a new fold under the selected words")
        C.ok(len(pend) == 2 and all(v["text"] == "" for v in pend), f"it marks phrases inside as folds to write later, skipping ones not in the text ({len(pend)})")
        C.ok("the memory behind this" in ai.calls[-1]["user"], "your instruction is sent")
        dashed = await pg.evaluate(f"""[...document.querySelectorAll('[data-node="{aif['id']}"] span.fm')].some(s => s.style.background.includes('repeating-linear-gradient'))""")
        C.ok(dashed, "AI-marked phrases have dashed lines")
        C.ok(await pg.locator(f'[data-fold="{aif["id"]}"] .aimark').count() == 1, "the AI fold shows an 'AI' mark")
        C.ok(abs(await clock(pg) - clock_before) <= 1, "AI writing adds no time to the writing clock")
        await pg.screenshot(path=os.path.join(SHOTS, "mem-ai-fold-laptop.png"))
        # open a marked phrase: nothing is written until asked
        n_calls = len(ai.calls)
        pid = pend[0]["id"]
        await pg.evaluate(f"window.TOL.openFold('{pid}', true); window.TOL.rerender()"); await pg.wait_for_timeout(150)
        C.ok(len(ai.calls) == n_calls and await pg.locator(f'[data-aigen="{pid}"]').count() == 1, "opening a marked phrase asks first; nothing is generated silently")
        await pg.click(f'[data-aigen="{pid}"]'); await pg.wait_for_timeout(500)
        child = (await pages(pg))[pid]
        C.ok(child["text"].startswith("Grandfather") and not child["ai"].get("pending"), "Write this with AI fills that fold")
        C.ok(not any(v.get("parentId") == pid for v in (await pages(pg)).values()), "the depth limit stops it marking deeper (2 levels)")
        C.ok(abs(await clock(pg) - clock_before) <= 1, "still no clock time from AI writing")
        # editing an AI fold makes it yours
        await type_in(pg, "by the old fence.")
        await pg.keyboard.type(" Mine now.", delay=3); await pg.wait_for_timeout(200)
        aiv = (await pages(pg))[aif["id"]]
        C.ok(aiv["ai"]["edited"] and aiv["text"].endswith("Mine now.") and await pg.locator(f'[data-fold="{aif["id"]}"] > .fold-head .aimark').count() == 0, f"after you edit it, the AI mark goes away ({aiv['ai']}, {aiv['text'][-20:]!r})")
        # write deeper on an existing fold: AI marks phrases in it
        await pg.evaluate(f"window.TOL.openPage('{root}', true)"); await pg.wait_for_timeout(150)
        await pg.click(f'[data-more="{tbl["id"]}"]'); await pg.wait_for_selector("#memDlg[open]")
        await pg.click("#memDlg [data-act=aideep]"); await pg.wait_for_selector("#aiDlg[open] #aiEst")
        await pg.click('#aiDlg [data-ai="go"]'); await pg.wait_for_timeout(400)
        mk = [v for v in (await pages(pg)).values() if v.get("parentId") == tbl["id"] and v.get("ai", {}).get("pending")]
        C.ok(len(mk) == 1 and mk[0]["anchor"]["text"] == "plates", "Write deeper on a fold marks phrases inside it")
        # spending limit
        await pg.evaluate("localStorage.setItem('tol-ai-usage', JSON.stringify({month: new Date().toISOString().slice(0,7), usd: 9, calls: 3}))")
        lim = await pg.evaluate("window.TOL.ai.feedback({prompt:'a', expected:'b', answer:'c'}).then(() => 'went', e => e.message)")
        C.ok("limit" in lim, f"the monthly limit pauses AI ({lim})")
        await pg.evaluate("localStorage.removeItem('tol-ai-usage')")

        # ---------- settings screens
        await pg.click("#settingsBtn"); await pg.wait_for_selector("#settings[open]")
        st = await pg.locator("#settings").inner_text()
        C.ok("How sure you want to be" in st and "New prompts per day" in st and "Longest gap" in st, "Settings → Memory has the simple limits")
        C.ok("Anthropic" in st and "key saved" in st and "Monthly limit" in st, "Settings → AI shows the key state, model and limit")
        await pg.locator("#memArea").screenshot(path=os.path.join(SHOTS, "mem-settings-laptop.png"))
        await pg.fill("#aiKey", "nope"); await pg.click("#aiSave")
        C.ok("doesn't look like" in await pg.locator("#aiSetMsg").inner_text(), "a wrong-looking key is refused")
        await pg.click("#aiTest"); await pg.wait_for_selector("#aiSetMsg >> text=works")
        C.ok(True, "Test key works with a good key")
        await pg.evaluate("document.getElementById('settings').close()")

        # ---------- export includes memory; merging keeps all history
        exp = await pg.evaluate("""new Promise(r => { const orig = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(r); return orig(b); }; document.getElementById('exp').click(); })""")
        ex = json.loads(exp)
        C.ok("memory" in ex and ex["memory"]["cards"], "Export everything includes memory")
        mm = await pg.evaluate("""(() => { const A = {cards: {x: {id:'x', history:[{id:'a',t:1,g:3}], updatedAt: 1}}, prompts: {}, folds: {}, settings: {}};
            const B = {cards: {x: {id:'x', history:[{id:'b',t:2,g:1}], updatedAt: 2}}, prompts: {p: {id:'p', q:'?', updatedAt: 5}}, folds: {}, settings: {retention: .85, updatedAt: 9}};
            const ch = window.TOL.mergeMemory(A, B); return {ch, n: A.cards.x.history.length, p: !!A.prompts.p, r: A.settings.retention}; })()""")
        C.ok(mm["ch"] and mm["n"] == 2 and mm["p"] and mm["r"] == 0.85, "merging memory unites review history and takes newer settings")

        # ---------- iPhone screenshots
        ctxM, M = await new_device(br, url, **p.devices["iPhone 13"])
        await ctxM.route("https://api.anthropic.com/**", ai.handle)
        await M.evaluate("localStorage.setItem('tol-ai', JSON.stringify({key: 'sk-ant-test'}))")
        await M.click("#writer textarea"); await M.keyboard.type("I still set the table for two.", delay=2)
        await nest_new(M, "the table", inner="Two plates, one cold.")
        await select(M, "I still"); await M.click("#foldbar [data-b=nestin]"); await M.wait_for_timeout(150)
        await M.screenshot(path=os.path.join(SHOTS, "mem-nestin-iphone.png"))
        await M.click("#foldbar [data-b=x]")
        mf = next(v for v in (await pages(M)).values() if v.get("anchor"))
        await M.evaluate(f"window.TOL.memoryStart('{mf['id']}', 'order')"); await M.wait_for_selector("#tAns")
        await M.screenshot(path=os.path.join(SHOTS, "mem-test-iphone.png"))
        await M.click("#tAns"); await M.keyboard.type("Two plates", delay=5); await M.click("[data-t=submit]")
        await M.wait_for_selector(".t-ai >> text=You missed")
        await M.screenshot(path=os.path.join(SHOTS, "mem-review-iphone.png"), full_page=True)
        g = await M.locator(".t-grades").bounding_box()
        C.ok(g and g["width"] <= 390, f"on the iPhone the grade buttons fit the screen ({g and round(g['width'])})")
        await M.click("[data-t=quit]")
        await M.click("#menu"); await M.wait_for_timeout(250); await M.click("#settingsBtn"); await M.wait_for_selector("#settings[open]")
        await M.locator("#aiArea").scroll_into_view_if_needed()
        await M.screenshot(path=os.path.join(SHOTS, "mem-settings-iphone.png"))
        await M.evaluate("document.getElementById('settings').close()")

        # ---------- old data (before memory existed) still opens
        ctxO = await br.new_context(viewport={"width": 1280, "height": 800})
        await ctxO.add_init_script("""if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('tol-pages', JSON.stringify({a: {id:'a', parentId:null, text:'Old page\\nwith words', cursor:0, createdAt:1, updatedAt:2},
            f: {id:'f', parentId:'a', text:'inside', cursor:0, createdAt:1, updatedAt:2, anchor:{start:4, end:8, text:'page', before:'Old ', after:'\\nwith'}, anchorAt:2}}));
            localStorage.setItem('tol-ui', JSON.stringify({last:'a'})); }""")
        O = await ctxO.new_page(); O.errs = []; O.on("pageerror", lambda e: O.errs.append(str(e)))
        await O.goto(url); await O.wait_for_timeout(600)
        C.ok("Old page" in await O.locator("#writer").inner_text() and await O.locator(".memrow:has([data-listtop=memory])").count() == 1, "data from before memory opens fine, with the Memory row")
        await O.evaluate("window.TOL.memoryStart('a', 'order')"); await O.wait_for_selector("#tAns")
        C.ok("page" in await O.locator(".t-q").inner_text(), "an old fold can be tested right away")

        for name, x in (("laptop", pg), ("iPhone", M), ("old data", O)):
            C.ok(not x.errs, f"no page errors ({name}) {x.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
