"""Nothing gets lost: the loud "Not saved" bar and its rescue copy, safety copies, Recently deleted,
import never deletes, pages can't end up inside themselves, the hold button across sleep, one tab at a time.
Run:  python3 tests/test_safety.py"""
import asyncio, json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, launch
from playwright.async_api import async_playwright

C = Checks()

FAIL_HOOK = """(() => { const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (window.__failSave && /^tol-(pages|intervals|memory)$/.test(k)) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; })()"""

async def open_settings(pg):
    if await pg.locator("#menu").is_visible():
        await pg.click("#menu"); await pg.wait_for_timeout(250)
    await pg.click("#settingsBtn"); await pg.wait_for_timeout(400)

async def close_settings(pg):
    await pg.evaluate("document.getElementById('settings').close()")

async def live_pages(pg):
    return {k: v for k, v in (await pg.evaluate("window.TOL.data().pages")).items() if not v.get("deleted")}

async def main():
    url = serve(8831)
    async with async_playwright() as p:
        br = await launch(p)

        # ---------- 1. a save that fails is loud, and the words survive a restart ----------
        ctx, pg = await new_device(br, url, token=False, viewport={"width": 1280, "height": 800})
        await ctx.add_init_script(FAIL_HOOK)
        await pg.reload(); await pg.wait_for_timeout(400)
        await pg.click("#writer textarea")
        await pg.keyboard.type("First line is saved.", delay=10)
        await pg.wait_for_timeout(700)
        C.ok(await pg.locator("#saveWarn").is_hidden(), "no warning while saving works")
        await pg.evaluate("window.__failSave = true")
        await pg.keyboard.type(" These words could not be saved.", delay=10)
        await pg.wait_for_timeout(900)
        C.ok(await pg.locator("#saveWarn").is_visible() and "Not saved" in await pg.text_content("#saveWarn"), "a failed save shows a red 'Not saved' bar on the page")
        stored = await pg.evaluate("localStorage.getItem('tol-pages')")
        C.ok("could not be saved" not in stored, "(the small storage really doesn't have the new words)")
        await pg.wait_for_timeout(2500)
        em = await pg.evaluate("window.TOL.safe.read('emergency')")
        C.ok(em and any("could not be saved" in (v.get("text") or "") for v in em["pages"].values()), "the whole book is kept in a rescue copy on this device")
        C.ok("safety copy is being kept" in await pg.text_content("#saveWarn"), "the bar says a safety copy is being kept")
        async with pg.expect_download() as dl:
            await pg.click("#swExport")
        f = await (await dl.value).path()
        C.ok("could not be saved" in open(f, encoding="utf-8").read(), "'Save a copy now' downloads everything, the unsaved words too")
        await pg.reload(); await pg.wait_for_timeout(1500)      # the book closes and opens again (saving works again)
        txt = await pg.locator("#writer textarea").first.input_value()
        C.ok(txt.endswith("These words could not be saved."), f"after reopening, the unsaved words are back ({txt[-40:]!r})")
        C.ok("could not be saved" in await pg.evaluate("localStorage.getItem('tol-pages')"), "…and now they're saved normally")
        C.ok(await pg.locator("#saveWarn").is_hidden(), "the warning is gone once saving works")
        C.ok(await pg.evaluate("window.TOL.safe.read('emergency')") is None, "the rescue copy is cleared once it's no longer needed")
        # the bar clears by itself when saving works again in the same session
        await pg.evaluate("window.__failSave = true"); await pg.click("#writer textarea"); await pg.keyboard.type(" More.", delay=10); await pg.wait_for_timeout(800)
        C.ok(await pg.locator("#saveWarn").is_visible(), "it warns again if saving fails again")
        await pg.evaluate("window.__failSave = false"); await pg.keyboard.type(" Fine.", delay=10); await pg.wait_for_timeout(900)
        C.ok(await pg.locator("#saveWarn").is_hidden(), "and clears by itself when a save works")

        # ---------- 2. Recently deleted ----------
        await pg.click("#newTop"); await pg.keyboard.type("A page I will delete by mistake", delay=5); await pg.wait_for_timeout(700)
        doomed = await pg.evaluate("window.TOL.current()")
        await open_settings(pg)
        await pg.click("#delPage"); await pg.click("#delPage"); await pg.wait_for_timeout(500)
        C.ok(doomed not in await live_pages(pg), "the page is deleted")
        await close_settings(pg); await open_settings(pg)
        C.ok("A page I will delete by mistake" in await pg.text_content("#safeArea"), "Settings → Safety copies lists it under Recently deleted")
        await pg.click("#safeArea [data-safe-restore]"); await pg.wait_for_timeout(500)
        lp = await live_pages(pg)
        C.ok(doomed in lp and lp[doomed]["text"] == "A page I will delete by mistake", "Restore brings it back, word for word")
        await close_settings(pg)

        # ---------- 3. a safety copy per day: an earlier wording of a page, and what was deleted since ----------
        await pg.evaluate(f"window.TOL.openPage('{doomed}')"); await pg.wait_for_timeout(200)
        C.ok(await pg.evaluate("window.TOL.safe.daily().then(() => window.TOL.safe.list())") != [], "a safety copy of the book is made")
        snaps = await pg.evaluate("window.TOL.safe.list()")
        C.ok(snaps[0]["key"].startswith("day:") and snaps[0]["n"] >= 2, f"it's kept under today's date with its page count ({snaps[0]})")
        await pg.evaluate(f"window.TOL.setText('{doomed}', 'I rewrote this page and lost the old wording')")
        other = await pg.evaluate("window.TOL.createNode({ parentId: null, text: 'Another page, soon deleted' }).id")
        await pg.evaluate("window.TOL.safe.daily()")   # (today's copy is replaced with the new state only when asked; here we keep the old one)
        await pg.evaluate(f"""(async () => {{ const old = await window.TOL.safe.read('{snaps[0]["key"]}'); window.__old = old; }})()""")
        await open_settings(pg)
        # put the earlier copy back under a second key, as if it were yesterday's
        await pg.evaluate("""(async () => { const r = indexedDB.open('bolw-safe', 1); await new Promise(res => r.onsuccess = res); const db = r.result;
            const tx = db.transaction('snaps', 'readwrite'), s = tx.objectStore('snaps'); const o = window.__old;
            o.pages[Object.keys(o.pages).find(k => (o.pages[k].text || '').startsWith('I rewrote'))].text = 'A page I will delete by mistake';
            delete o.pages[Object.keys(o.pages).find(k => (o.pages[k].text || '').startsWith('Another page'))];
            s.put(JSON.stringify(o), 'j:day:2026-01-01'); s.put({ key: 'day:2026-01-01', at: Date.now() - 86400000, n: 2, size: 10 }, 'm:day:2026-01-01');
            await new Promise(res => tx.oncomplete = res); })()""")
        await close_settings(pg); await open_settings(pg)
        await pg.click("#safeArea [data-safe-old='day:2026-01-01']"); await pg.wait_for_timeout(400)
        kids = [v for v in (await live_pages(pg)).values() if v.get("parentId") == doomed]
        C.ok(any(k["text"].startswith("Earlier version") and "A page I will delete by mistake" in k["text"] for k in kids), "'This page as it was' adds the earlier wording inside the page, replacing nothing")
        C.ok((await live_pages(pg))[doomed]["text"].startswith("I rewrote"), "…the current wording is untouched")
        await pg.evaluate(f"window.TOL.deleteNode('{doomed}')"); await pg.wait_for_timeout(200)
        await close_settings(pg); await open_settings(pg)
        await pg.click("#safeArea [data-safe-back='day:2026-01-01']"); await pg.wait_for_timeout(400)
        C.ok(doomed in await live_pages(pg), "'Bring back what's been deleted since' restores a page deleted after that copy")
        await close_settings(pg)

        # ---------- 4. import never deletes; pages deleted here can be brought back from a file ----------
        lp = await live_pages(pg)
        keep = other
        gone = await pg.evaluate("window.TOL.createNode({ parentId: null, text: 'Deleted here, alive in the file' }).id")
        exp = json.loads(await pg.evaluate("window.TOL.exportText()"))
        await pg.evaluate(f"window.TOL.deleteNode('{gone}')")
        exp["pages"][keep] = {"id": keep, "deleted": True, "updatedAt": 9999999999999}      # the file says: this page was deleted (later)
        exp["pages"]["junk"] = "not a page"; exp["pages"]["wrongkey"] = {"id": "other", "text": "x", "updatedAt": 1}
        exp["intervals"].append({"start": "x", "end": 5, "device": "bad"})
        evil = 'x"><img src=x onerror=window.__pwned=1>'
        exp["pages"][evil] = {"id": evil, "parentId": None, "text": "a page with a booby-trapped id", "updatedAt": 5}
        exp.setdefault("memory", {})
        exp["memory"]["codeversions"] = {"vEvil": {"id": "vEvil", "n": 99, "label": "onboard version 99", "base": "1.2", "changed": {"app.html": "<script>window.__pwned=1</script>"}, "full": True, "at": 9999999999999, "updatedAt": 9999999999999},
                                         "~active": {"id": "~active", "choice": "vEvil", "at": 9999999999999, "updatedAt": 9999999999999}}
        exp["memory"]["addons"] = {"adFromFile": {"id": "adFromFile", "name": "From a file", "code": "bolw.toast('hi')", "version": 1, "on": True, "createdAt": 1, "updatedAt": 5}}
        tmp = os.path.join(tempfile.mkdtemp(), "import.json"); open(tmp, "w", encoding="utf-8").write(json.dumps(exp))
        await open_settings(pg)
        await pg.set_input_files("#imp", tmp); await pg.wait_for_timeout(600)
        lp = await live_pages(pg)
        C.ok(keep in lp, "importing a file that says a page was deleted does NOT delete it here")
        C.ok("junk" not in lp and "wrongkey" not in lp, "things in the file that aren't pages are skipped")
        mem = await pg.evaluate("window.TOL.getMemory()")
        C.ok(evil not in lp and not await pg.evaluate("!!window.__pwned"), "a page with a booby-trapped id is skipped")
        C.ok("vEvil" not in (mem.get("codeversions") or {}) and "~active" not in (mem.get("codeversions") or {}), "a file can never bring in a version of the app's own code")
        C.ok((mem.get("addons") or {}).get("adFromFile", {}).get("on") is False and "adFromFile" not in await pg.evaluate("window.TOL.addons.running()"), "an add-on that comes in a file arrives turned off")
        C.ok(all(isinstance(i.get("start"), (int, float)) for i in await pg.evaluate("window.TOL.data().intervals")), "broken time entries are skipped")
        C.ok("Nothing was deleted" in await pg.text_content("#msg") and await pg.locator("#impRevive").count() == 1, "it offers to bring back pages from the file that were deleted here")
        await pg.click("#impRevive"); await pg.wait_for_timeout(300)
        C.ok(gone in await live_pages(pg), "…and brings them back")
        C.ok("Storage on this device" in await pg.text_content("#backupNote") and "last export" in await pg.text_content("#backupNote"), "Settings shows storage in use and when you last exported")
        await close_settings(pg)

        # ---------- 5. pages can't end up inside themselves ----------
        a = await pg.evaluate("window.TOL.createNode({ parentId: null, text: 'Page A' }).id")
        b = await pg.evaluate(f"window.TOL.createNode({{ parentId: '{a}', text: 'Page B inside A' }}).id")
        await pg.evaluate(f"""(() => {{ const d = window.TOL.data(), P = Object.assign({{}}, d.pages);
            P['{a}'] = Object.assign({{}}, P['{a}'], {{ parentId: '{b}', updatedAt: Date.now() }});      // as if another device moved A into B
            window.TOL.replaceData(P, d.intervals, new Set(['{a}'])); }})()""")
        await pg.wait_for_timeout(300)
        lp = await live_pages(pg)
        tops = [x for x in (a, b) if not lp[x].get("parentId")]
        C.ok(len(tops) == 1 and tops[0] == sorted([a, b])[0], "a loop made by another device is undone: one of the two moves to the top level (the same one on every device)")
        C.ok(await pg.evaluate(f"window.TOL.path('{a}').length") <= 2 and await pg.evaluate(f"window.TOL.path('{b}').length") <= 2, "both pages can be reached again")
        # Move into a fold that hangs on the very words being moved
        pid = await pg.evaluate("window.TOL.createNode({ parentId: null, text: 'alpha beta gamma' }).id")
        fid = await pg.evaluate(f"window.TOL.ops.nest('{pid}', 6, 10, 'inside the fold').id")
        await pg.evaluate(f"window.TOL.ops.move('{pid}', 6, 10, '{fid}')"); await pg.wait_for_timeout(300)
        lp = await live_pages(pg)
        C.ok(lp[fid]["parentId"] == pid, "moving words into the fold that hangs on them keeps that fold in the page (it isn't put inside itself)")
        C.ok(lp[fid]["text"].endswith("beta") and "⤷" in lp[pid]["text"] and "beta" not in lp[pid]["text"], f"the words moved into it and a ⤷ marker stays ({lp[pid]['text']!r})")
        pl = await pg.evaluate(f"window.TOL.folds.placed('{pid}')")
        C.ok(any(m["id"] == fid for m in pl) and not await pg.evaluate(f"window.TOL.folds.unattached('{fid}')"), "the fold now hangs on the marker")
        sub = await pg.evaluate(f"window.TOL.ops.nest('{fid}', 0, 6, 'deeper').id")
        p2 = await pg.evaluate("window.TOL.createNode({ parentId: null, text: 'one two three' }).id")
        f2 = await pg.evaluate(f"window.TOL.ops.nest('{p2}', 4, 7, 'two fold').id")
        f3 = await pg.evaluate(f"window.TOL.ops.nest('{f2}', 0, 3, 'inner').id")
        await pg.evaluate(f"window.TOL.ops.move('{p2}', 4, 7, '{f3}')"); await pg.wait_for_timeout(300)
        lp = await live_pages(pg)
        C.ok(lp[f2]["parentId"] == p2 and lp[f3]["parentId"] == f2 and lp[f3]["text"].endswith("two"), "…the same when the destination is a fold inside that fold")
        C.ok(await pg.evaluate("window.TOL.healTree()") == 0, "no page is inside itself afterwards")

        # ---------- 6. the hold button never counts time the device was asleep ----------
        await pg.evaluate(f"window.TOL.openPage('{pid}')"); await pg.wait_for_timeout(300)
        t0 = await pg.evaluate("document.getElementById('total').textContent")
        await pg.evaluate("(() => { const real = Date.now.bind(Date); window.__skew = 0; Date.now = () => real() + window.__skew; })()")
        await pg.keyboard.down("Alt"); await pg.wait_for_timeout(1500)
        await pg.evaluate("window.__skew = 3600000")           # the laptop "slept" for an hour with Option held
        await pg.wait_for_timeout(1200)
        await pg.keyboard.up("Alt"); await pg.wait_for_timeout(600)
        def secs(t): h, m, s = map(int, t.split(":")); return h * 3600 + m * 60 + s
        t1 = await pg.evaluate("document.getElementById('total').textContent")
        C.ok(0 < secs(t1) - secs(t0) < 10, f"an hour asleep with the button held adds seconds, not an hour ({t0} → {t1})")
        iv = await pg.evaluate("window.TOL.data().intervals.slice(-1)[0]")
        C.ok(iv["end"] - iv["start"] < 10000, "the saved time entry ends when the device fell asleep")
        await pg.evaluate("window.__skew = 0")

        # ---------- 7. copies kept by finished previews are cleared; an ongoing one is kept ----------
        await pg.evaluate("""(() => { localStorage.setItem('tol-sbx7-pages', '{"x":1}'); localStorage.setItem('tol-sbx7-seeded', 'true');
            localStorage.setItem('tol-sbx9-pages', '{"y":1}'); localStorage.setItem('tol-trying', JSON.stringify({ pr: 9, title: 't', at: Date.now() })); })()""")
        await pg.reload(); await pg.wait_for_timeout(500)
        C.ok(await pg.evaluate("localStorage.getItem('tol-sbx7-pages')") is None and await pg.evaluate("localStorage.getItem('tol-sbx7-seeded')") is None, "the copy from a finished preview is cleared")
        C.ok(await pg.evaluate("localStorage.getItem('tol-sbx9-pages')") is not None, "the copy of the preview being tried is kept")
        C.ok(not pg.errs, f"no page errors {pg.errs}")

        # ---------- 8. one tab at a time ----------
        has_locks = await pg.evaluate("!!(navigator.locks && navigator.locks.request)")
        if has_locks:
            pg2 = await ctx.new_page(); pg2.errs = []
            pg2.on("pageerror", lambda e: pg2.errs.append(str(e)))
            await pg2.goto(url); await pg2.wait_for_timeout(1500)
            C.ok(await pg2.locator("#otherTab").is_visible() and "already open" in await pg2.text_content("#otherTab"), "a second tab says the book is already open, and pauses")
            C.ok(await pg.locator("#otherTab").is_hidden(), "the first tab keeps working")
            before = await pg.evaluate("localStorage.getItem('tol-pages')")
            await pg2.evaluate("window.TOL.createNode({ parentId: null, text: 'written in the paused tab' })")
            C.ok(await pg.evaluate("localStorage.getItem('tol-pages')") == before, "the paused tab can't save over the first tab's words")
            await pg.bring_to_front(); await pg.click("#writer textarea"); await pg.keyboard.type(" Written in tab one.", delay=5); await pg.wait_for_timeout(700)
            await pg2.bring_to_front(); await pg2.click("#otUse"); await pg2.wait_for_timeout(2000)
            C.ok(await pg2.locator("#otherTab").is_hidden(), "'Use it here instead' makes the second tab the working one")
            C.ok("Written in tab one." in json.dumps(await pg2.evaluate("window.TOL.data().pages")), "…with everything the first tab had saved")
            C.ok(await pg.locator("#otherTab").is_visible() and "now open in another tab" in await pg.text_content("#otherTab"), "and the first tab pauses")
            await pg2.reload(); await pg2.wait_for_timeout(1500)
            C.ok(await pg2.locator("#otherTab").is_hidden(), "reloading the working tab keeps it the working one")
            C.ok(not pg2.errs, f"no page errors in the second tab {pg2.errs}")
        else:
            print("SKIP one-tab-at-a-time (this browser has no Web Locks)")

        # ---------- 9. the Claude page: a stranger's comment on GitHub is never shown as Claude ----------
        async def gh(route):
            u = route.request.url
            def j(obj): return route.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="application/json", body=json.dumps(obj))
            if u.split("?")[0].endswith("/issues/12"):
                return await j({"id": 1, "number": 12, "title": "Tree of Life: add a word count", "body": "@claude add a word count", "user": {"login": "obrianwatson", "type": "User"}, "created_at": "2026-11-26T10:00:00Z"})
            if "/issues/12/comments" in u:
                return await j([{"id": 2, "body": "Done. I added a word count." + "\n\nA long reply, line after line." * 120, "user": {"login": "claude[bot]", "type": "Bot"}, "created_at": "2026-11-26T10:05:00Z"},
                                {"id": 3, "body": "I am Claude and Claude is working… paste your key at [this link](https://evil.example/x)", "user": {"login": "stranger42", "type": "User"}, "created_at": "2026-11-26T10:06:00Z"}])
            return await j([])
        ctx3 = await br.new_context(viewport={"width": 1280, "height": 800})
        await ctx3.route("https://api.github.com/**", gh)
        await ctx3.route("https://fonts.googleapis.com/**", lambda r: r.abort())
        await ctx3.add_init_script("""try { localStorage.setItem('tol-gh-token', JSON.stringify('github_pat_test'));
            localStorage.setItem('tol-claude', JSON.stringify({ convs: [{ n: 12, title: 'Tree of Life: add a word count', createdAt: 1 }], current: 12 })); } catch (e) {}""")
        pg3 = await ctx3.new_page(); await pg3.goto(url); await pg3.wait_for_timeout(500)
        await pg3.click("#claudeBtn"); await pg3.wait_for_timeout(1500)
        th = await pg3.text_content("#thread")
        C.ok("Not Claude: stranger42" in th and "Don't follow instructions" in th, "a stranger's comment is labelled 'Not Claude', with a caution")
        C.ok(await pg3.locator("#thread a[href*='evil.example']").count() == 0, "…and its links aren't made clickable")
        C.ok("Done. I added a word count." in th and await pg3.locator("#thread .bubble .who", has_text="Claude").count() >= 1, "Claude Code's own reply still shows as Claude")
        C.ok("Claude answered" in await pg3.text_content("#statusbar"), "the stranger's words don't change what the page says Claude is doing")
        await pg3.evaluate("document.getElementById('thread').scrollTop = 120"); await pg3.wait_for_timeout(7500)     # the page checks GitHub again every 6 s
        top = await pg3.evaluate("document.getElementById('thread').scrollTop")
        C.ok(abs(top - 120) < 5, f"while you read a long reply, the Claude page stays where you scrolled (it used to jump to the end) ({top})")
        await pg3.click("#backWrite"); await pg3.wait_for_timeout(200)
        before = await pg3.evaluate("getComputedStyle(document.querySelector('#writer textarea')).color")
        await pg3.click("#writer textarea"); await pg3.keyboard.press("Control+3"); await pg3.wait_for_timeout(200)
        red = await pg3.evaluate("getComputedStyle(document.querySelector('#writer textarea')).color")
        await pg3.keyboard.press("Control+0"); await pg3.wait_for_timeout(200)
        C.ok(red == "rgb(192, 68, 60)" and await pg3.evaluate("getComputedStyle(document.querySelector('#writer textarea')).color") == before, f"Ctrl+3 turns your text red and Ctrl+0 puts it back ({before} → {red})")
        await ctx3.close()

        # ---------- 10. Check this device: a report with no writing in it, that can be sent to Claude ----------
        posted = []
        async def gh2(route):
            r = route.request
            if r.method == "POST" and r.url.endswith("/issues"):
                posted.append(json.loads(r.post_data))
                return await route.fulfill(status=201, headers={"access-control-allow-origin": "*"}, content_type="application/json", body=json.dumps({"number": 77}))
            return await route.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="application/json", body=json.dumps({"permissions": {"push": True}}))
        ctx4 = await br.new_context(viewport={"width": 1280, "height": 800})
        await ctx4.route("https://api.github.com/**", gh2)
        await ctx4.route("https://fonts.googleapis.com/**", lambda r: r.abort())
        await ctx4.add_init_script("try { localStorage.setItem('tol-gh-token', JSON.stringify('github_pat_test')); } catch (e) {}")
        pg4 = await ctx4.new_page(); pg4.errs = []; pg4.on("pageerror", lambda e: pg4.errs.append(str(e)))
        await pg4.goto(url); await pg4.wait_for_timeout(500)
        await pg4.click("#writer textarea"); await pg4.keyboard.type("Private words that must never be in a report.", delay=5); await pg4.wait_for_timeout(5200)   # (past the typing pause, so the time is banked)
        t_before = await pg4.evaluate("JSON.stringify(window.TOL.data().intervals)")
        await open_settings(pg4)
        await pg4.click("#ckRun")
        await pg4.wait_for_function("document.getElementById('ckCopy') !== null", timeout=40000)
        area = await pg4.text_content("#checkArea")
        for name in ("Saving on this device", "Storage in use", "The bigger database", "Safety copies", "Encryption", "Opens without internet", "The book", "GitHub key", "Sync"):
            C.ok(name in area, f"the device check reports: {name}")
        rep = await pg4.evaluate("window.TOL.check.run().then(window.TOL.check.reportText)")
        C.ok("ok    Saving on this device: works" in rep and "ok    Encryption: works" in rep and "ok    GitHub key: works" in rep, "saving, encryption and the GitHub key check out")
        C.ok("Private words" not in rep and "github_pat" not in rep, "the report holds no writing and no keys")
        C.ok(await pg4.evaluate("JSON.stringify(window.TOL.data().intervals)") == t_before, "checking the device adds no writing time")
        await pg4.click("#ckSend"); await pg4.wait_for_timeout(200)
        C.ok(not posted and "public" in await pg4.text_content("#ckSend"), "'Send it to Claude' first says the project is public and asks again")
        await pg4.click("#ckSend"); await pg4.wait_for_timeout(1200)
        C.ok(len(posted) == 1 and posted[0]["title"].startswith("Device check:") and "@claude" not in json.dumps(posted[0]).lower() and "Private words" not in json.dumps(posted[0]),
             "the report is posted as a GitHub issue: no writing in it, and it doesn't start Claude Code")
        C.ok(not pg4.errs, f"no page errors {pg4.errs}")
        await ctx4.close()

        # ---------- 11. AI: a key that isn't tied to one workspace can be given its Workspace ID; Opus can be chosen ----------
        hdrs, mode = [], {"fail": False}
        async def anth(route):
            hdrs.append(route.request.headers)
            cors = {"access-control-allow-origin": "*"}
            if mode["fail"]:
                return await route.fulfill(status=400, headers=cors, content_type="application/json", body=json.dumps({"type": "error", "error": {"type": "invalid_request_error", "message": "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header."}}))
            return await route.fulfill(status=200, headers=cors, content_type="application/json", body=json.dumps({"content": [{"type": "text", "text": "OK"}], "usage": {"input_tokens": 3, "output_tokens": 1}}))
        ctx5 = await br.new_context(viewport={"width": 1280, "height": 800})
        await ctx5.route("https://api.anthropic.com/**", anth)
        await ctx5.route("https://fonts.googleapis.com/**", lambda r: r.abort())
        await ctx5.add_init_script("try { if (!localStorage.getItem('tol-ai')) localStorage.setItem('tol-ai', JSON.stringify({ key: 'sk-ant-test' })); } catch (e) {}")
        pg5 = await ctx5.new_page(); await pg5.goto(url); await pg5.wait_for_timeout(500)
        mode["fail"] = True
        await open_settings(pg5)
        await pg5.click("#aiTest"); await pg5.wait_for_timeout(800)
        C.ok("Workspace ID" in await pg5.text_content("#aiSetMsg") and "anthropic-workspace-id" not in hdrs[-1], "when Anthropic says the key needs a workspace, the message says what to do in plain words")
        mode["fail"] = False
        await pg5.fill("#aiWs", "not-an-id"); await pg5.dispatch_event("#aiWs", "change"); await pg5.wait_for_timeout(200)
        C.ok("starts with wrkspc_" in await pg5.text_content("#aiSetMsg"), "a wrong Workspace ID is refused")
        await pg5.fill("#aiWs", "wrkspc_01TestOnly"); await pg5.dispatch_event("#aiWs", "change"); await pg5.wait_for_timeout(200)
        await pg5.click("#aiTest"); await pg5.wait_for_timeout(800)
        C.ok(hdrs[-1].get("anthropic-workspace-id") == "wrkspc_01TestOnly" and "The key works" in await pg5.text_content("#aiSetMsg"), "with a Workspace ID saved, every request carries it and the key test passes")
        C.ok(await pg5.locator("#aiModel option[value='claude-opus-5-5']").count() == 1, "Opus 5.5 can be chosen as the model")
        await ctx5.close()
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
