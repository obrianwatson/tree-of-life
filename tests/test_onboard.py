"""Onboard, self-changing code (bootloader index.html + code.js): boots from the published files and saves
them in the code vault; Claude proposes a change, it's TRIED in a sealed preview on a copy of the book with
the self-test, then kept (boots from the vault) or undone; preview isolation; a failing self-test can't be
kept; locked files / keys refused; offline boot from the vault; a broken version falls back to the last good
one with a calm banner (and Undo it); a start that never finished falls back too; rollback and "Return to
published version"; safe mode (?safe, Shift); plain-words diff; versions sync between two devices (and pin);
publish to GitHub (pull request, or main after confirming); a newer published version is noticed.
Anthropic and GitHub are faked. Run:  python3 tests/test_onboard.py"""
import asyncio, json, os, re, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, FakeGitHub, launch
from test_folds import pages
from test_folds_sync import settle, sync, open_settings, PASS
from test_agent import FakeClaude, tool_call, say, ask, KEY
from playwright.async_api import async_playwright

C = Checks()
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
NEWPAGE = '<button class="btn primary" id="newTop" style="flex:1">New page</button>'
FLOWER = '<button class="btn primary" id="newTop" style="flex:1">New page ✿</button>'


class GitHub(FakeGitHub):
    """Adds what publishing needs: files per branch and pull requests."""
    def __init__(self):
        super().__init__()
        self.puts, self.pulls = [], []

    async def handle(self, route):
        req = route.request
        m = re.match(r"^https://api\.github\.com/repos/obrianwatson/tree-of-life(/contents/docs/[^?]+|/pulls)(\?.*)?$", req.url)
        if not m:
            return await super().handle(route)
        cors = {"access-control-allow-origin": "*"}
        j = lambda code, obj: route.fulfill(status=code, headers=cors, content_type="application/json", body=json.dumps(obj))
        if m.group(1) == "/pulls":
            body = json.loads(req.post_data); self.pulls.append(body)
            return await j(201, {"html_url": "https://github.com/obrianwatson/tree-of-life/pull/77", "number": 77})
        if req.method == "GET":
            return await j(200, {"sha": "old" * 10})
        body = json.loads(req.post_data); self.puts.append((m.group(1), body))
        return await j(200, {"content": {"sha": "new"}})


async def boot(pg):
    return await pg.evaluate("({id: __bolwBoot.id, origin: __bolwBoot.origin, label: __bolwBoot.label, ok: __bolwBoot.ok, fell: __bolwBoot.fell, safe: __bolwBoot.safe})")


async def vault(pg, what):
    return await pg.evaluate(f"window.__bolwVault().then(v => {what})")


async def main():
    url = serve(8837)
    gh, claude = GitHub(), FakeClaude()
    async with async_playwright() as p:
        br = await launch(p)
        ctxA, A = await new_device(br, url, gh, viewport={"width": 1280, "height": 800})
        await ctxA.add_init_script(KEY); await ctxA.route("https://api.anthropic.com/**", claude.handle)
        await A.reload()

        # ---------- first start: published files, saved in the vault ----------
        b = await boot(A)
        C.ok(b["origin"] == "published" and b["ok"] and b["id"].startswith("pub-"), f"the bootloader starts the published version ({b['id']})")
        ids = await A.evaluate("window.__bolwVault().then(v => v.all()).then(L => L.map(x => x.id + ':' + Object.keys(x.files).length))")
        C.ok(any(x.startswith(b["id"] + ":") and int(x.split(":")[1]) >= 10 for x in ids), f"…and saves all its files in the code vault ({ids})")
        await A.click("#writer textarea"); await A.keyboard.type("My song line.\nSecond line.", delay=3); await A.wait_for_timeout(600)
        mine = await pages(A)

        # ---------- Claude proposes a change; it's tried on a copy ----------
        await A.click("#claudeHere")
        claude.queue = [tool_call("propose_change", {"note": "A flower on New page", "edits": [{"file": "app.html", "find": NEWPAGE, "replace": FLOWER}]}), say("It's ready to try. Keep it if you like it.")]
        await ask(A, "put a little flower on the New page button")
        C.ok(await A.is_visible("#codeTry"), "the change opens in a preview")
        C.ok("Self-test passed" in await A.text_content("#ctRes"), f"the self-test runs on the copy and passes ({await A.text_content('#ctRes')})")
        for name in ("The app starts", "All your writing is still there", "Pages open", "The writing clock counts", "Folds show", "Sync code loads"):
            C.ok(f"✓ {name}" in await A.text_content("#ctRes"), f"self-test: {name}")
        C.ok(not await A.is_disabled("#ctKeep"), "Keep is ready")
        res = [m for c in claude.calls if c.get("stream") for m in c["messages"]]
        C.ok("passed" in json.dumps(res[-1]), "Claude gets the self-test results")
        C.ok(await A.get_attribute("#codeTry iframe", "sandbox") == "allow-scripts", "the preview is sealed (sandboxed, no same-origin)")
        fr = await (await A.query_selector("#codeTry iframe")).content_frame()
        C.ok("✿" in await fr.text_content("#newTop"), "the preview shows the change")
        iso = await fr.evaluate("""async () => { const r = {};
            try { r.parent = parent.document.title; } catch (e) { r.parent = 'blocked'; }
            r.ai = localStorage.getItem('tol-ai'); r.gh = localStorage.getItem('tol-gh-token');
            try { await fetch('https://api.github.com/'); r.net = 'ok'; } catch (e) { r.net = 'blocked'; }
            r.idb = typeof indexedDB; r.copy = !!localStorage.getItem('tol-pages');
            window.TOL.createNode({parentId: null, text: 'Written in the preview'}); return r; }""")
        C.ok(iso["parent"] == "blocked" and iso["net"] == "blocked" and iso["idb"] == "undefined", f"the preview can't reach the app, the network or the database ({iso})")
        doc = await A.evaluate("document.querySelector('#codeTry iframe').srcdoc")
        C.ok(iso["copy"] and "My song line" in doc and "sk-ant-test" not in doc and "github_pat_test" not in doc and "tol-ai" not in doc.split("FILES =")[0], "the preview gets a copy of the book but no keys")
        C.ok(not any("Written in the preview" in (v.get("text") or "") for v in (await pages(A)).values()), "writing in the preview never reaches the real book")
        await A.screenshot(path=os.path.join(SHOTS, "onboard-try-laptop.png"))
        await A.click("#ctKeep")
        await A.wait_for_function("window.__bolwBoot && __bolwBoot.origin === 'onboard'", timeout=15000)
        await A.wait_for_timeout(300)
        b = await boot(A)
        C.ok(b["label"] == "onboard version 1" and b["ok"], "Keep: it becomes the onboard version and starts from the vault")
        C.ok("✿" in await A.text_content("#newTop"), "the change is live")
        C.ok({k: v["text"] for k, v in (await pages(A)).items()} == {k: v["text"] for k, v in mine.items()}, "your writing is untouched")
        C.ok("New page ✿" in await A.evaluate("window.TOL.code.read('app.html')"), "code-folds read the current onboard version")
        v1 = b["id"]

        # ---------- a failing self-test can't be kept; locked files and keys are refused ----------
        r = await A.evaluate("""(async () => { const p = window.TOL.onboard.tryChange({note: 'stop the clock', edits: [{file: 'app.html', find: 'function typed() {', replace: 'function typed() { return;'}]});
            return await p; })()""")
        C.ok(not r["passed"] and any(x["name"] == "The writing clock counts" and not x["ok"] for x in r["results"]), "a change that stops the writing clock fails the self-test")
        C.ok(await A.is_disabled("#ctKeep"), "…and can't be kept")
        await A.click("#ctUndo"); await A.wait_for_timeout(100)
        C.ok(not await A.locator("#codeTry").count(), "Undo closes it; nothing changed")
        for edit, why in (({"file": "sync.js", "find": "a", "replace": "b"}, "sync.js"), ({"file": "memory.js", "find": "const DAY", "replace": "localStorage.getItem('tol-gh-token')"}, "keys")):
            err = await A.evaluate(f"window.TOL.onboard.tryChange({{note: 'x', edits: [{json.dumps(edit)}]}}).then(() => 'ran', e => e.message)")
            C.ok(err != "ran" and not await A.locator("#codeTry").count(), f"a change touching {why} is refused ({err})")

        # ---------- what changed, in plain words ----------
        await open_settings(A); await A.wait_for_timeout(300)
        C.ok("onboard version 1" in await A.text_content("#codeArea") and "running" in await A.text_content("#codeArea"), "Settings → App versions shows the history and what's running")
        await A.click(f"#codeArea [data-cv-diff='{v1}']"); await A.wait_for_timeout(200)
        C.ok(re.search(r"app\.html: changed .* 1 line added, 1 removed", await A.text_content(f"#cvd-{v1}")), f"“What changed” says it in plain words ({(await A.text_content(f'#cvd-{v1}'))[:120]!r})")
        await A.evaluate("document.getElementById('settings').close()")

        # ---------- offline: it starts from the vault ----------
        block = lambda r: r.abort()
        pat = re.compile(r"http://127\.0\.0\.1:8837/(app\.html|[\w-]+\.js)(\?.*)?$")
        await A.route(pat, block)
        await A.reload()
        b = await boot(A)
        C.ok(b["id"] == v1 and b["ok"], "with the app's files unreachable, the onboard version starts from the vault")
        await A.evaluate("window.TOL.onboard.returnToPublished()"); await A.wait_for_timeout(1500)
        b = await boot(A)
        C.ok(b["origin"] == "published" and b["ok"], "“Return to published version” offline starts the saved published copy")
        await A.unroute(pat, block)

        # ---------- rollback / forward ----------
        await A.evaluate(f"window.TOL.onboard.use('{v1}')"); await A.wait_for_timeout(1500)
        C.ok((await boot(A))["id"] == v1, "“Use this” switches to any version (and back)")

        # ---------- a broken version falls back to the last good one ----------
        await A.evaluate(f"""window.__bolwVault().then(async v => {{ const g = await v.get('{v1}');
            const files = Object.assign({{}}, g.files, {{'drill.js': 'throw new Error(\"boom\")'}});
            await v.put({{id: 'vbroken', n: 2, origin: 'onboard', label: 'onboard version 2', base: g.base, parent: g.id, note: 'broken', by: 'test', at: Date.now(), files}});
            await v.set('active', 'vbroken'); }})""")
        A.errs.clear()
        await A.reload(); await A.wait_for_timeout(1200)
        b = await boot(A)
        C.ok(b["id"] == v1 and b["fell"] == "vbroken", f"a version that fails while starting → the last good version starts ({b})")
        C.ok("A change didn't work, so I started the last good version. Undo it?" in await A.text_content(".bolw-banner"), "with a calm banner")
        await A.click(".bolw-banner button:has-text('Undo it')"); await A.wait_for_timeout(300)
        C.ok(await vault(A, "v.meta('active')") == v1, "“Undo it” makes the good version the chosen one")
        A.errs[:] = [e for e in A.errs if "boom" not in e]
        # a start that never finished (it froze) → next start falls back
        await A.evaluate("window.__bolwVault().then(async v => { const g = await v.get('vbroken'); g.id = 'vfrozen'; g.files['drill.js'] = '/* fine */'; await v.put(g); await v.set('active', 'vfrozen'); await v.set('booting', 'vfrozen'); })")
        await A.reload(); await A.wait_for_timeout(800)
        b = await boot(A)
        C.ok(b["id"] == v1 and b["fell"] == "vfrozen", "a version that never finished starting last time → the last good version starts")
        await A.evaluate(f"window.__bolwVault().then(v => v.set('active', '{v1}'))")

        # ---------- safe mode ----------
        await A.goto(url + "?safe")
        b = await boot(A)
        C.ok(b["origin"] == "published" and b["safe"] and await A.evaluate("window.TOL.addons.safe"), "?safe starts the published version with no add-ons")
        S = await br.new_context(viewport={"width": 1280, "height": 800})
        await S.add_init_script("(() => { let n = 0; const t = setInterval(() => { dispatchEvent(new KeyboardEvent('keydown', {key: 'Shift', shiftKey: true})); if (++n > 60) clearInterval(t); }, 5); })()")
        s = await S.new_page(); await s.goto(url); await s.wait_for_timeout(500)
        C.ok("safe" in s.url and (await boot(s))["safe"], f"holding Shift while it opens starts safely ({s.url})")
        await S.close()
        await A.goto(url)
        C.ok((await boot(A))["id"] == v1, "leaving safe mode returns to the onboard version")

        # ---------- publish to GitHub ----------
        await open_settings(A); await A.wait_for_timeout(300)
        await A.click(f"#codeArea [data-cv-pub='{v1}']"); await A.click("#codePub [data-p=pr]")
        await A.wait_for_function("document.getElementById('cpMsg').textContent.startsWith('Done')", timeout=8000)
        C.ok("pull request #77" in await A.text_content("#cpMsg") and gh.pulls and gh.pulls[0]["head"].startswith("onboard-v1-"), "Publish → a branch and a pull request")
        C.ok(len(gh.puts) == 1 and gh.puts[0][0] == "/contents/docs/app.html" and gh.puts[0][1]["branch"].startswith("onboard-v1-"), "only the changed file is sent, to the branch")
        sent = __import__("base64").b64decode(gh.puts[0][1]["content"]).decode()
        C.ok("New page ✿" in sent and "My song line" not in sent, "it sends the code, never the writing")
        await A.click("#codePub [data-p=main]")
        C.ok(len(gh.puts) == 1 and "Yes, commit to main" in await A.text_content("#codePub [data-p=main]"), "committing to main asks to confirm first")
        await A.click("#codePub [data-p=main]")
        await A.wait_for_function("document.getElementById('cpMsg').textContent.includes('main')", timeout=8000)
        C.ok(len(gh.puts) == 2 and gh.puts[1][1]["branch"] == "main", "…then commits to main")
        await A.click("#codePub [data-p=x]"); await A.evaluate("document.getElementById('settings').close()")

        # ---------- a newer published version is noticed ----------
        async def newer(route):
            r = await route.fetch(); t = await r.text()
            await route.fulfill(response=r, body=t.replace('const APP_VERSION = "', 'const APP_VERSION = "9.9-was-'))
        await A.route(re.compile(r".*/app\.html(\?.*)?$"), newer)
        await A.evaluate("window.TOL.onboard.checkPublished()"); await A.wait_for_timeout(500)
        C.ok("newer published version" in await A.text_content("#toast"), "a newer published version is noticed")
        await open_settings(A); await A.wait_for_timeout(300)
        C.ok(await A.locator("#codeArea [data-cv=merge]").count() == 1, "…with “Bring my changes over with Claude” and “Use the published version”")
        await A.evaluate("document.getElementById('settings').close()")
        await A.unroute(re.compile(r".*/app\.html(\?.*)?$"))

        # ---------- versions sync between two devices ----------
        ctxB, B = await new_device(br, url, gh, **p.devices["iPhone 13"])
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
        await settle(B); await B.wait_for_timeout(1500)
        C.ok(await vault(B, f"v.get('{v1}').then(x => !!x && x.files['app.html'].includes('New page ✿'))"), "the kept version arrives on the iPhone (rebuilt from its changed files)")
        rec = await A.evaluate(f"window.TOL.getMemory().codeversions['{v1}']")
        size = len(json.dumps(rec))
        C.ok("app.html" in (rec.get("patched") or {}) and "app.html" not in (rec.get("changed") or {}) and size < 3000, f"what's synced for a small change is a small patch, not the whole file ({size} characters)")
        same = await A.evaluate(f"(async () => {{ const v = await (await window.__bolwVault()).get('{v1}'); return v.files['app.html']; }})()") == await vault(B, f"v.get('{v1}').then(x => x.files['app.html'])")
        C.ok(same, "…and the other device rebuilds exactly the same file from it")
        C.ok(await vault(B, "v.meta('active')") == v1 and "Reload" in await B.text_content("#toast"), "the newest kept version is chosen there, with a Reload offer")
        await B.reload()
        C.ok((await boot(B))["id"] == v1 and "✿" in await B.text_content("#newTop"), "after reloading, the iPhone runs it")
        # pin on the iPhone; a new version on the laptop doesn't move it
        await B.evaluate("window.TOL.onboard.pin(true)")
        await A.evaluate(f"""(async () => {{ const p = window.TOL.onboard.tryChange({{note: 'Two flowers', edits: [{{file: 'app.html', find: {json.dumps(FLOWER)}, replace: {json.dumps(FLOWER.replace('✿', '✿✿'))}}}]}}); await p; }})()""")
        await A.click("#ctKeep")
        await A.wait_for_function("window.__bolwBoot && __bolwBoot.note === 'Two flowers'", timeout=15000)
        await A.wait_for_timeout(500)
        await sync(A); await sync(B); await B.wait_for_timeout(1200)
        C.ok(await vault(B, "v.all().then(L => L.some(x => x.note === 'Two flowers'))"), "the laptop's new version arrives on the pinned iPhone (in its history)")
        C.ok(await vault(B, "v.meta('active')") == v1, "…but the pinned iPhone stays on its version")
        blob = b"".join(v[0] for v in gh.files.values())
        C.ok(b"New page" not in blob and b"codeversions" not in blob, "versions sync encrypted (nothing readable on GitHub)")
        await B.evaluate("window.TOL.onboard.tryChange({note: 'look', edits: []})"); await B.wait_for_timeout(2500)
        await B.screenshot(path=os.path.join(SHOTS, "onboard-try-iphone.png"))
        await B.evaluate("window.TOL.onboard.undo()")
        await open_settings(B); await B.wait_for_timeout(400)
        await B.evaluate("document.getElementById('codeArea').scrollIntoView()")
        await B.screenshot(path=os.path.join(SHOTS, "onboard-versions-iphone.png"))

        for name, pg in (("laptop", A), ("iPhone", B)):
            errs = [e for e in pg.errs if "boom" not in e]
            C.ok(not errs, f"no page errors on the {name} {errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
