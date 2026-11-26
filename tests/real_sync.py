"""Sync against the REAL GitHub (not the fake one in the other tests), on a scratch branch.
It runs in GitHub Actions (see .github/workflows/tests.yml), where a short-lived key for this
project exists; it is not part of the normal test loop. The app itself is untouched: the test
only swaps the branch name tol-data for a scratch branch in the app's requests, so the real
sync data is never touched. Only made-up text is written, sealed with a made-up passphrase,
and the scratch branch is deleted afterwards (by the workflow, even if this test crashes).
Needs: GH_REAL_TOKEN (a key that can write to the project), SCRATCH_BRANCH (a name to use).
Run:  GH_REAL_TOKEN=… SCRATCH_BRANCH=tol-selftest-1 python3 tests/real_sync.py"""
import asyncio, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, launch, FakeGitHub
from playwright.async_api import async_playwright

TOKEN = os.environ.get("GH_REAL_TOKEN", "")
BR = os.environ.get("SCRATCH_BRANCH", "")
REPO = "obrianwatson/tree-of-life"          # the project the app is built for (its address is fixed inside the app)
PASS = "lantern orchard velvet river copper moth"
C = Checks()
calls = []
FAKE = FakeGitHub() if os.environ.get("REAL_SYNC_FAKE") else None      # REAL_SYNC_FAKE=1: rehearse this script against the fake GitHub
if FAKE and not TOKEN:
    TOKEN = "github_pat_test"

async def rewrite(route):
    req = route.request
    url = req.url.replace("tol-data", BR)
    body = req.post_data
    if body:
        try:
            j = json.loads(body)
            if j.get("branch") == "tol-data": j["branch"] = BR
            if isinstance(j.get("ref"), str): j["ref"] = j["ref"].replace("tol-data", BR)
            body = json.dumps(j)
        except Exception:
            pass
    if body is not None:
        await route.continue_(url=url, post_data=body)
    else:
        await route.continue_(url=url)

async def device(br, url, **kw):
    kw.pop("default_browser_type", None)
    ctx = await br.new_context(**kw)
    await ctx.route("https://api.github.com/**", FAKE.handle if FAKE else rewrite)
    await ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
    await ctx.add_init_script("try { localStorage.setItem('tol-gh-token', JSON.stringify(%s)); } catch (e) {}" % json.dumps(TOKEN))
    ctx.on("response", lambda r: calls.append((r.request.method, r.url.split("?")[0][-56:], r.status)) if "api.github.com" in r.url else None)
    pg = await ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    await pg.goto(url); await pg.wait_for_timeout(500)
    return ctx, pg

async def settle(pg):
    for _ in range(900):
        s = await pg.evaluate("window.__tolSync.state()")
        if not s["running"]:
            return s
        await pg.wait_for_timeout(100)

async def sync(pg):
    await settle(pg); await pg.evaluate("window.__tolSync.syncNow('resume')"); return await settle(pg)

async def open_settings(pg):
    if await pg.locator("#menu").is_visible():
        await pg.click("#menu"); await pg.wait_for_timeout(250)
    await pg.click("#settingsBtn"); await pg.wait_for_timeout(300)

async def turn_on(pg, first):
    await open_settings(pg); await pg.click("#syncOn")
    if first:
        await pg.wait_for_selector("#sp1", timeout=60000)
        await pg.fill("#sp1", PASS); await pg.fill("#sp2", PASS); await pg.click("#spGo")
        await pg.wait_for_function("/Sync is on|went wrong|couldn't|didn't/i.test(document.getElementById('syncArea').textContent)", timeout=120000)
    else:
        await pg.wait_for_selector("#jp", timeout=60000)
        await pg.fill("#jp", PASS); await pg.click("#jpGo")
        await pg.wait_for_function("/Unlocked|went wrong|couldn't|didn't|doesn't match/i.test(document.getElementById('syncArea').textContent)", timeout=120000)
    said = (await pg.text_content("#syncArea"))[:200]
    await pg.evaluate("document.getElementById('settings').close()"); await settle(pg)
    return said

async def book(pg):
    return await pg.evaluate("""(() => { const d = window.TOL.data(), P = {};
        for (const [k, v] of Object.entries(d.pages)) { const c = Object.assign({}, v); delete c.cursor; P[k] = c; } return P; })()""")

def same(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)

async def crossed(dev, oth, first, tail):
    """Sync dev then oth; GitHub can lag a moment behind a write, so look up to six times (about 15 s)."""
    n = len(calls)
    s1 = await sync(dev)
    for look in range(6):
        s2 = await sync(oth)
        if (await book(oth))[first]["text"].endswith(tail):
            return True, look, s1, s2
        await oth.wait_for_timeout(2500)
    print("   did not cross. The receiving device says:", json.dumps({k: s2.get(k) for k in ("phase", "detail", "lagging", "seen", "mySha", "myDeltaSha")}))
    print("   requests during this round:", [(c[0], c[1][-30:], c[2]) for c in calls[n:]])
    return False, 6, s1, s2

async def main():
    if not FAKE and (not TOKEN or not re.match(r"^tol-selftest-[\w-]+$", BR)):
        print("SKIP real-GitHub sync check (needs GH_REAL_TOKEN and SCRATCH_BRANCH=tol-selftest-…)"); return 0
    url = serve(8861)
    async with async_playwright() as p:
        br = await launch(p)
        ctxA, A = await device(br, url, viewport={"width": 1280, "height": 800})
        ctxB, B = await device(br, url, **p.devices["iPhone 13"])
        await A.evaluate("""(() => { const w = 'made up test words only '.repeat(40); for (let i = 0; i < 40; i++) window.TOL.createNode({ parentId: null, text: 'Test page ' + i + '\\n' + w }); })()""")
        first = await A.evaluate("Object.values(window.TOL.data().pages).find(p => (p.text || '').startsWith('Test page 0\\n')).id")
        said = await turn_on(A, True)
        sA = await sync(A)
        C.ok("Sync is on" in said and sA["phase"] == "ok" and bool(sA["mySha"]), f"REAL GitHub: the first device makes the branch and the vault, and writes its base ({said[:80]!r} {sA['phase']} {sA['detail']})")
        said = await turn_on(B, False)
        sB = await sync(B)
        C.ok("Unlocked" in said and sB["phase"] == "ok", f"the second device unlocks with the passphrase and syncs ({said[:80]!r} {sB['phase']} {sB['detail']})")
        a, b = await book(A), await book(B)
        C.ok(first in b and all(same(a[k], b.get(k)) for k in a), "the book arrives on the second device")
        n0 = len(calls); lags = 0
        for i in range(4):
            dev, oth = (A, B) if i % 2 == 0 else (B, A)
            await dev.evaluate(f"window.TOL.setText('{first}', window.TOL.node('{first}').text + '\\nreal round {i}')"); await dev.wait_for_timeout(300)
            ok, look, s1, s2 = await crossed(dev, oth, first, f"real round {i}"); lags += look
            C.ok(ok and s1["phase"] == "ok" and s2["phase"] == "ok", f"round {i + 1}: an edit crosses through real GitHub ({s1['phase']}/{s2['phase']} {s1['detail']} {s2['detail']})")
        puts = [c for c in calls[n0:] if c[0] == "PUT"]
        C.ok(puts and all(c[1].endswith(".d.json") and c[2] in (200, 201) for c in puts), f"those edits went up as delta files ({[(c[1][-14:], c[2]) for c in puts]})")
        print(f"   (extra looks needed because GitHub's list lagged: {lags})")
        # both devices write at nearly the same moment (GitHub may answer 409 to one: the app retries)
        await A.evaluate(f"window.TOL.setText('{first}', window.TOL.node('{first}').text + '\\nA at once')")
        other = await B.evaluate("window.TOL.createNode({ parentId: null, text: 'B at the same moment' }).id")
        await asyncio.gather(sync(A), sync(B))
        for _ in range(3):
            await sync(A); await sync(B); await A.wait_for_timeout(1500)
        a, b = await book(A), await book(B)
        C.ok(same(a, b) and other in a and a[first]["text"].endswith("A at once"), "two devices writing at the same moment both get through and end up the same")
        print(f"   (conflicts GitHub answered: {[(c[0], c[1][-22:], c[2]) for c in calls if c[2] in (409, 422)]})")
        # a fresh base, then a delta on top; a third device joins from the two together
        await A.evaluate("window.__tolSync._newBase()")
        await A.evaluate(f"window.TOL.setText('{first}', window.TOL.node('{first}').text + '\\nafter a new base')"); await sync(A)
        await A.evaluate(f"window.TOL.setText('{first}', window.TOL.node('{first}').text + '\\nand a delta on top')"); await sync(A)
        ctxC, Cd = await device(br, url, viewport={"width": 1000, "height": 700})
        said = await turn_on(Cd, False)
        for _ in range(3):
            await sync(Cd)
            if (await book(Cd)).get(first, {}).get("text", "").endswith("and a delta on top"):
                break
            await Cd.wait_for_timeout(2500)
        C.ok((await book(Cd)).get(first, {}).get("text", "").endswith("after a new base\nand a delta on top"), f"a third device joins and reads base + delta from real GitHub ({said[:60]!r})")
        C.ok(not any((v.get("text") or "").startswith("Other version") for v in (await book(Cd)).values()), "…with no needless 'Other version' pages")
        # leaving the app: the closing-app request really reaches GitHub
        n1 = len(calls)
        await A.evaluate(f"window.TOL.setText('{first}', window.TOL.node('{first}').text + '\\nleaving now')"); await A.wait_for_timeout(300)
        await A.evaluate("(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); })()")
        await A.wait_for_timeout(6000)
        C.ok(any(c[0] == "PUT" and c[1].endswith(".d.json") and c[2] in (200, 201) for c in calls[n1:]), f"the leave-the-app save is accepted by real GitHub ({[c for c in calls[n1:] if c[0] == 'PUT']})")
        ok = False
        for _ in range(3):
            await sync(B)
            if (await book(B))[first]["text"].endswith("leaving now"):
                ok = True; break
            await B.wait_for_timeout(2500)
        C.ok(ok, "…and the other device picks up from there")
        # what is stored on GitHub: only sealed text
        files = await A.evaluate("""async br => { const t = JSON.parse(localStorage.getItem('tol-gh-token'));
            const h = { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' };
            const list = await (await fetch('https://api.github.com/repos/obrianwatson/tree-of-life/contents/sync?ref=tol-data', { headers: h, cache: 'no-store' })).json();
            const out = [];
            for (const f of list) { const r = await fetch('https://api.github.com/repos/obrianwatson/tree-of-life/git/blobs/' + f.sha, { headers: Object.assign({}, h, { Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' }); out.push({ name: f.name, size: f.size, text: await r.text() }); }
            return out; }""", BR)
        names = sorted(f["name"] for f in files)
        C.ok("meta.json" in names and sum(bool(re.match(r"^[0-9a-f]{16}\.json$", n)) for n in names) == 3 and sum(n.endswith(".d.json") for n in names) >= 2, f"on GitHub: the vault, three base files, and delta files ({[(f['name'][-14:], f['size']) for f in files]})")
        blob = "".join(f["text"] for f in files)
        C.ok(all(w not in blob for w in ("made up test words", "real round", "Test page", "leaving now", "deviceName")), "nothing readable is stored on GitHub")
        for name, pg in (("A", A), ("B", B), ("C", Cd)):
            C.ok(not pg.errs, f"no page errors on {name} {pg.errs}")
        st = sorted(set(c[2] for c in calls))
        print(f"   (requests to GitHub: {len(calls)}; answers seen: {st})")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    return 1 if C.fails else 0

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
