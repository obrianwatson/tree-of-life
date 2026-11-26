"""Sync sends only what changed (a small delta file), not the whole book each time; a base is rewritten
only when the delta has grown. Also: a file that can't be read never locks a device, the previous
version of the app still syncs with this one, and the leave-the-app save is small enough to go through.
Run:  python3 tests/test_sync_delta.py"""
import asyncio, base64, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, FakeGitHub, launch, ROOT
from playwright.async_api import async_playwright

C = Checks()
PASS = "lantern orchard velvet river copper moth"
OLD = "2494231"   # the last version before delta files (1.1): it must keep syncing with this one

async def settle(pg):
    for _ in range(300):
        s = await pg.evaluate("window.__tolSync.state()")
        if not s["running"]:
            return s
        await pg.wait_for_timeout(100)

async def sync(pg):
    await settle(pg)
    await pg.evaluate("window.__tolSync.syncNow('resume')")
    return await settle(pg)

async def open_settings(pg):
    if await pg.locator("#menu").is_visible():
        await pg.click("#menu"); await pg.wait_for_timeout(250)
    await pg.click("#settingsBtn"); await pg.wait_for_timeout(300)

async def turn_on(pg, first):
    await open_settings(pg)
    await pg.click("#syncOn"); await pg.wait_for_timeout(300)
    if first:
        await pg.fill("#sp1", PASS); await pg.fill("#sp2", PASS); await pg.click("#spGo")
        await pg.wait_for_function("document.getElementById('syncArea').textContent.includes('Sync is on')", timeout=60000)
    else:
        await pg.fill("#jp", PASS); await pg.click("#jpGo")
        await pg.wait_for_function("document.getElementById('syncArea').textContent.includes('Unlocked')", timeout=60000)
    await pg.evaluate("document.getElementById('settings').close()")
    await settle(pg)

async def book(pg):
    """The book as other devices should see it: live pages without the per-device cursor, time entries, memory."""
    return await pg.evaluate("""(() => { const d = window.TOL.data(), P = {};
        for (const [k, v] of Object.entries(d.pages)) { const c = Object.assign({}, v); delete c.cursor; P[k] = c; }
        const M = {}; for (const [k, v] of Object.entries(d.memory || {})) if (!(v && typeof v === 'object' && !Object.keys(v).length)) M[k] = v;   // (an empty part and a missing part are the same thing)
        return { pages: P, time: d.intervals.map(i => i.start + ':' + i.end + ':' + i.device).sort(), memory: M }; })()""")

def same(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)

def why(a, b):
    out = []
    for part in ("pages", "memory"):
        for k in set(a[part]) | set(b[part]):
            if json.dumps(a[part].get(k), sort_keys=True) != json.dumps(b[part].get(k), sort_keys=True):
                out.append(f"{part}.{k}: {json.dumps(a[part].get(k), sort_keys=True)[:160]} | {json.dumps(b[part].get(k), sort_keys=True)[:160]}")
    if a["time"] != b["time"]:
        out.append(f"time: {sorted(set(a['time']) ^ set(b['time']))[:4]}")
    return out[:4]

async def others(pg):
    return [v for v in (await pg.evaluate("window.TOL.data().pages")).values() if not v.get("deleted") and (v.get("text") or "").startswith("Other version")]

def sizes(fake, since=0):
    return fake.puts[since:]

async def main():
    url = serve(8841)
    fake = FakeGitHub()
    async with async_playwright() as p:
        br = await launch(p)
        ctxA, A = await new_device(br, url, fake, viewport={"width": 1280, "height": 800})
        ctxB, B = await new_device(br, url, fake, **p.devices["iPhone 13"])

        # a book big enough to matter: 150 pages of about 1,500 characters
        await A.evaluate("""(() => { const words = 'river stone lantern orchard velvet copper moth harbor willow ember '.repeat(22);
            for (let i = 0; i < 150; i++) window.TOL.createNode({ parentId: null, text: 'Page ' + i + '\\n' + words }); })()""")
        first = await A.evaluate("Object.values(window.TOL.data().pages).find(p => (p.text || '').startsWith('Page 0\\n')).id")
        await turn_on(A, True); await turn_on(B, False)
        await sync(A); await sync(B)
        idA = next(k.split("/")[1][:16] for k in fake.files if re.match(r"sync/[0-9a-f]{16}\.json$", k) and len(fake.files[k][0]) > 100000)
        base_path, delta_path = f"sync/{idA}.json", f"sync/{idA}.d.json"
        base_size = len(fake.files[base_path][0])
        C.ok(same((await book(A))["pages"], (await book(B))["pages"]), "the whole book reaches the other device")
        C.ok(base_size > 200000, f"(the laptop's base file is the whole book: {base_size // 1000} KB)")

        # 1. an ordinary edit sends a small delta, not the book
        n0 = len(fake.puts)
        await A.evaluate(f"window.TOL.openPage('{first}')"); await A.wait_for_timeout(300)
        await A.click("#writer textarea"); await A.keyboard.press("Control+End"); await A.keyboard.type(" One new line tonight.", delay=5)
        await A.wait_for_timeout(700)
        await sync(A); await sync(B)
        new = sizes(fake, n0)
        C.ok(all(pth != base_path for pth, _ in new), f"after a small edit the base file is not written again ({[(a.split('/')[1][-9:], b) for a, b in new]})")
        dl = [n for pth, n in new if pth == delta_path]
        C.ok(dl and max(dl) < 8000, f"what's sent is a small delta file ({dl} bytes instead of {base_size})")
        C.ok("One new line tonight." in (await book(B))["pages"][first]["text"], "…and the edit arrives on the other device")

        # 2. many rounds of all kinds of changes: both devices always end up with the same book, and little is sent
        n0 = len(fake.puts)
        for i in range(6):
            dev, oth = (A, B) if i % 2 == 0 else (B, A)
            await dev.evaluate(f"""(() => {{ const T = window.TOL, all = T.allNodes().filter(n => !n.anchor && !n.ref);
                const pg = all[{i} * 7 % all.length];
                T.setText(pg.id, (pg.text || '') + '\\nround {i}');                                  // an edit
                const f = T.ops.nest(pg.id, 0, 4, 'fold made in round {i}');                           // a new fold
                T.memoryApi.addPrompts(f.id, [{{ q: 'question {i}?', a: 'answer {i}' }}], 'mine');     // a memory question
                T.memoryApi.record(T.memoryApi.cardKey('peg:' + f.id, 'fwd'), 'peg:' + f.id, 'fwd', 3); // a graded test
                if ({i} === 3) T.deleteNode(all[(({i} * 7) + 1) % all.length].id);                     // a deleted page
                T.typed(); setTimeout(() => T.endTyping(), 30);                                        // some writing time
            }})()""")
            await dev.wait_for_timeout(500)
            await sync(dev); await sync(oth); await sync(dev)
            a, b = await book(A), await book(B)
            ok = same(a["pages"], b["pages"]) and same(a["time"], b["time"]) and same(a["memory"], b["memory"])
            C.ok(ok, f"round {i + 1}: pages, writing time and memory are the same on both devices" + ("" if ok else f" {why(a, b)}"))
        sent = sum(n for _, n in sizes(fake, n0))
        C.ok(sent < 150000, f"six rounds on two devices sent {sent // 1000} KB in all (the old way: about {12 * base_size // 1000} KB)")
        C.ok(not await others(A) and not await others(B), "no needless 'Other version' pages were made")

        # 3. when the delta has grown to a good part of the book, the base is written once and the delta starts over
        n0 = len(fake.puts)
        await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\n' + 'a long new chapter '.repeat(9000))"); await A.wait_for_timeout(300)
        await sync(A)
        C.ok([pth for pth, _ in sizes(fake, n0)].count(base_path) == 1, "a very large change rewrites the base once")
        await sync(B)
        C.ok(same((await book(A))["pages"], (await book(B))["pages"]), "…and the other device gets it")
        n0 = len(fake.puts)
        await A.evaluate(f"window.TOL.setText('{first}', window.TOL.node('{first}').text + ' The end.')"); await A.wait_for_timeout(200)
        await sync(A)
        C.ok([pth for pth, _ in sizes(fake, n0)] == [delta_path], "after that, edits go in the delta again")
        # a device that joins now reads the new base plus that delta, put together first: nothing odd appears
        await A.evaluate(f"window.TOL.setText('{first}', window.TOL.node('{first}').text + ' P.S.')"); await A.wait_for_timeout(200); await sync(A)
        ctxC, Cdev = await new_device(br, url, fake, viewport={"width": 1000, "height": 700})
        await turn_on(Cdev, False); await sync(Cdev)
        C.ok((await book(Cdev))["pages"][first]["text"].endswith("The end. P.S."), "a device that joins later reads base and delta together and has the newest words")
        C.ok(not await others(Cdev), "…with no 'Other version' pages")
        await ctxC.close()

        # 4. a leftover delta from an older base is ignored (the base already holds it)
        stale_sha = fake.files[delta_path][1]                           # the delta as it is now: it belongs to the base about to be replaced
        await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\n' + 'rewritten again '.repeat(300))"); await A.wait_for_timeout(200)
        await A.evaluate("window.__tolSync._newBase()")                 # (as when the delta has grown, or ten minutes have passed)
        await sync(A)                                                   # → a new base; the old delta is still there on GitHub
        C.ok(fake.puts[-1][0] == base_path and fake.files[delta_path][1] == stale_sha, "(a new base was written; GitHub still shows the old delta next to it)")
        await sync(B)
        C.ok((await book(B))["pages"][first]["text"].startswith("Page 0\nrewritten again"), "the other device keeps the newer base's words")
        C.ok(not await others(B), "…and the leftover delta makes no 'Other version' page")
        ctxD, Dd = await new_device(br, url, fake, viewport={"width": 1000, "height": 700})      # a device that has read neither
        await turn_on(Dd, False); await sync(Dd)
        C.ok((await book(Dd))["pages"][first]["text"].startswith("Page 0\nrewritten again"), "a device that joins now takes the new base's words, not the leftover delta's older ones")
        C.ok(not await others(Dd), "…with no 'Other version' page")
        await ctxD.close()

        # 4b. GitHub's list a moment behind: it shows the OLD base next to a delta that belongs to the NEW base.
        #     The delta must not be thrown away for good; it is used as soon as the list shows the new base.
        await sync(A); await sync(B)
        old_base = fake.files[base_path][1]
        await A.evaluate("window.__tolSync._newBase()")
        await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\nwritten into the new base')"); await A.wait_for_timeout(200); await sync(A)
        await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\nwritten into the new base\\nand this line is only in the delta')"); await A.wait_for_timeout(200); await sync(A)
        C.ok(fake.files[base_path][1] != old_base and fake.puts[-1][0] == delta_path, "(a new base, then a delta on top of it)")
        fake.lag[base_path] = old_base                                  # the list still shows the old base
        await sync(B)
        C.ok("only in the delta" not in (await book(B))["pages"][first]["text"], "(with the list behind, the delta isn't applied to the wrong base)")
        fake.lag.clear()                                                # the list catches up
        await sync(B)
        C.ok((await book(B))["pages"][first]["text"].endswith("and this line is only in the delta"), "when the list catches up, the delta is read again and nothing is missed")
        C.ok(not await others(B), "…with no 'Other version' page")

        # 5. a file that can't be read is skipped; the device stays unlocked and keeps syncing
        junk = json.dumps({"format": "tol-sealed", "v": 1, "iv": base64.b64encode(os.urandom(12)).decode(), "ct": base64.b64encode(os.urandom(200)).decode(), "updatedAt": 1}).encode()
        fake.plant("sync/aaaaaaaaaaaaaaaa.json", junk)
        fake.plant("sync/bbbbbbbbbbbbbbbb.json", b"this is not even JSON")
        fake.plant("sync/cccccccccccccccc.d.json", b'{"format":"tol-sealed","v":1,"iv":"!!","ct":"??"}')
        await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\nshort again')"); await A.wait_for_timeout(200); await sync(A)
        st = await sync(B)
        C.ok(not st["locked"] and st["phase"] == "ok", f"three unreadable files don't lock the device or stop sync ({st['phase']})")
        C.ok((await book(B))["pages"][first]["text"] == "Page 0\nshort again", "…the readable devices' changes still arrive")
        await open_settings(B)
        C.ok("couldn't be read" in await B.text_content("#syncArea"), "Settings → Sync says some files were skipped")
        await B.evaluate("document.getElementById('settings').close()")
        for k in ("sync/aaaaaaaaaaaaaaaa.json", "sync/bbbbbbbbbbbbbbbb.json", "sync/cccccccccccccccc.d.json"):
            del fake.files[k]
        # GitHub lists a new version before it can hand it over, and reading by path gives the OLDER copy: nothing is taken from it
        older = fake.files[delta_path][0]
        await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\nlisted before it could be read')"); await A.wait_for_timeout(200); await sync(A)
        fake.late[fake.files[delta_path][1]] = 1; fake.old_by_path[delta_path] = older
        st = await sync(B)
        C.ok((await book(B))["pages"][first]["text"] != "Page 0\nlisted before it could be read" and st["phase"] == "ok" and st["lagging"] >= 1, "(the newest delta is listed but only an older copy can be read: it's checked against its fingerprint and not used)")
        await B.wait_for_timeout(4200); await settle(B)                 # the app looks again by itself a few seconds later
        C.ok((await book(B))["pages"][first]["text"] == "Page 0\nlisted before it could be read", "…a few seconds later the app looks again by itself and has it")
        # a read that went wrong once is tried again, not given up on
        await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\nsent while the download was garbled')"); await A.wait_for_timeout(200); await sync(A)
        fake.garble.add(fake.files[delta_path][1])
        st = await sync(B)
        C.ok("garbled" not in (await book(B))["pages"][first]["text"] and not st["locked"], "(one download arrives garbled: nothing is taken from it, and the device stays unlocked)")
        await sync(B)
        C.ok((await book(B))["pages"][first]["text"] == "Page 0\nsent while the download was garbled", "…the next look reads it properly, so nothing is missed")

        # 6. GitHub refusing the read-by-fingerprint call: the app reads by path instead
        fake.no_blobs = True
        await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\nread by path')"); await A.wait_for_timeout(200); await sync(A); await sync(B)
        C.ok((await book(B))["pages"][first]["text"] == "Page 0\nread by path", "sync still works when files can only be read by path")
        fake.no_blobs = False

        # 7. leaving the app sends a small closing-app request (keepalive); checking for changes never pushes early
        await A.evaluate("""(() => { const f = window.fetch; window.__puts = [];
            window.fetch = (u, o) => { if (o && o.method === 'PUT') window.__puts.push({ url: String(u), keepalive: !!o.keepalive, size: (o.body || '').length, at: Date.now() }); return f(u, o); }; })()""")
        await A.wait_for_timeout(15500)                                   # (past the 15 s gap after the last write)
        await A.evaluate(f"window.TOL.openPage('{first}')"); await A.wait_for_timeout(300)
        await A.click("#writer textarea"); await A.keyboard.press("Control+End")
        t0 = await A.evaluate("Date.now()")
        for _ in range(46):                                               # 14 s of steady typing: the 10 s check comes round, and must not push
            await A.keyboard.type("x"); await A.wait_for_timeout(290)
        typed_for = await A.evaluate("Date.now()") - t0
        during = await A.evaluate("window.__puts.length")
        C.ok(during == 0, f"{typed_for / 1000:.0f} s of steady typing: nothing is pushed while you type ({during})")
        await A.wait_for_timeout(7500)
        after = await A.evaluate("window.__puts")
        C.ok(len(after) == 1 and after[0]["url"].endswith(".d.json"), f"about 5 s after you stop, one small delta goes up ({[(x['url'][-12:], x['size']) for x in after]})")
        await A.keyboard.type(" leaving now"); await A.wait_for_timeout(600)
        await A.evaluate("(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); })()")
        await A.wait_for_timeout(1500)
        last = (await A.evaluate("window.__puts"))[-1]
        C.ok(last["keepalive"] and last["size"] < 60000 and last["url"].endswith(".d.json"), f"leaving the app sends the delta as a closing-app request that fits ({last['size']} bytes, keepalive {last['keepalive']})")
        await A.evaluate("(() => { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); })()")
        await sync(B)
        C.ok((await book(B))["pages"][first]["text"].endswith("leaving now"), "…and the phone picks up right where the laptop left off")

        # 8. nothing readable is ever stored
        blob = b"".join(fake.blobs.values())
        C.ok(all(w not in blob for w in (b"lantern orchard", b"round 3", b"question", b"leaving now", b"Page 0", b"anchor", b"deviceName")), "no words, questions or structure are readable in any file ever written (bases and deltas)")
        for k, (data, _) in fake.files.items():
            if k.endswith(".d.json"):
                box = json.loads(data)
                C.ok(box.get("format") == "tol-sealed" and set(box) <= {"format", "v", "kind", "iv", "ct", "updatedAt"}, "a delta file is the same sealed envelope (format, v, iv, ct, updatedAt) plus kind")
                break

        # 9. the previous version of the app (1.1) keeps syncing with this one
        old_dir = tempfile.mkdtemp()
        try:
            subprocess.run(f"git -C '{ROOT}' archive {OLD} docs | tar -x -C '{old_dir}'", shell=True, check=True, stderr=subprocess.DEVNULL)
            have_old = os.path.exists(os.path.join(old_dir, "docs", "sync.js"))
        except Exception:
            have_old = False
        if have_old:
            old_url = serve(8842, os.path.join(old_dir, "docs"))
            for _ in range(2):
                await sync(A); await sync(B)
            ctxO, O = await new_device(br, old_url, fake, viewport={"width": 1100, "height": 760})
            await turn_on(O, False); await sync(O)
            C.ok(await O.evaluate("window.TOL.APP_VERSION") == "1.1", "(a device still running version 1.1 joins)")
            C.ok((await book(O))["pages"].get(first, {}).get("text", "").startswith("Page 0"), "the old version reads this version's base file")
            await O.evaluate("window.TOL.createNode({ parentId: null, text: 'Written on the device with the old version' })"); await O.wait_for_timeout(300)
            await sync(O); await sync(A)
            C.ok(any((v.get("text") or "") == "Written on the device with the old version" for v in (await book(A))["pages"].values()), "this version reads the old version's file")
            await A.evaluate("window.TOL.createNode({ parentId: null, text: 'Newer words, sent as a delta' })"); await A.wait_for_timeout(300)
            await sync(A); await sync(O)
            C.ok(not O.errs and (await settle(O))["phase"] == "ok", f"the old version isn't upset by delta files (it doesn't read them) {O.errs}")
            await A.evaluate(f"window.TOL.setText('{first}', 'Page 0\\n' + 'big enough to rewrite the base '.repeat(9000))"); await A.wait_for_timeout(200)
            await sync(A); await sync(O)
            C.ok(any((v.get("text") or "") == "Newer words, sent as a delta" for v in (await book(O))["pages"].values()), "…and it catches up whenever the base is rewritten")
            await ctxO.close()
        else:
            print("SKIP old-version check (the old version's files aren't in this copy of the project)")

        for name, pg in (("laptop", A), ("iPhone", B)):
            C.ok(not pg.errs, f"no page errors on the {name} {pg.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
