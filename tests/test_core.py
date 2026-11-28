"""BOLW Core (docs/core/): leaves, branches, folds, links, the map, bookmarks, the fast AI, commands, automations,
the harvest; with rings, export, sync and safe mode. Phone-sized and laptop-sized.
Run:  python3 tests/test_core.py            (one stage:  python3 tests/test_core.py 2)"""
import asyncio, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, launch, BROWSER, FakeGitHub
from playwright.async_api import async_playwright

C = Checks()
ONLY = [a for a in sys.argv[1:] if a.isdigit()]
HELP = """() => { const B = Book, D = () => B.D; window.T = {
  lines: leaf => D().leaves[leaf || Page.leaf].lines.map(l => D().lines[l].text),
  depths: leaf => D().leaves[leaf || Page.leaf].lines.map(l => D().lines[l].d),
  find: (txt, leaf) => D().leaves[leaf || Page.leaf].lines.find(l => D().lines[l].text.indexOf(txt) >= 0),
  at: (txt, off) => { const id = T.find(txt); return Page.setCaret({ line: id, at: off == null ? D().lines[id].text.length : off }); },
  dom: () => [...document.querySelectorAll('#pg > *')].map(e => e.classList.contains('gate') ? '[' + e.textContent + ']' : e.textContent),
  select: (a, ao, b, bo) => { const ea = Page.lineOf(T.find(a)), eb = Page.lineOf(T.find(b)), r = document.createRange(); r.setStart(ea.firstChild.nodeType === 3 ? ea.firstChild : ea, ao); r.setEnd(eb.firstChild.nodeType === 3 ? eb.firstChild : eb, bo == null ? eb.textContent.length : bo); const s = getSelection(); document.querySelector('#pg').focus(); s.removeAllRanges(); s.addRange(r); return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); },
  leafNamed: name => B.leaves().find(id => B.title(id) === name),
  text: leaf => B.textOf(leaf || Page.leaf),
  menu: label => { const it = Page.menuItems().find(i => i && i[0].indexOf(label) === 0); if (!it) return false; it[1](); return true; },
  log: () => Log.all().then(a => a.map(e => Log.say(e))) }; }"""

async def device(br, p, phone, gh=None, ai=None, sw=False):
    kw = dict(p.devices["iPhone 13"]) if phone else {"viewport": {"width": 1280, "height": 800}}
    kw.pop("default_browser_type", None)
    if BROWSER == "firefox": kw.pop("is_mobile", None)
    ctx = await br.new_context(accept_downloads=True, service_workers="allow" if sw else "block", **kw)
    await ctx.add_init_script("window.__bolwBoot = { ok: true };")       # (helpers waits for the old book's bootloader unless told the page is ready)
    if gh: await ctx.route("https://api.github.com/**", gh.handle)
    if ai: await ai.attach(ctx)
    return ctx

async def page(ctx, url, path="core/"):
    pg = await ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    await pg.goto(url + path); await ready(pg); return pg

async def ready(pg):
    await pg.wait_for_function("!!window.Settings && !!window.Page && !!window.Lock"); await pg.evaluate(HELP)

async def tap(pg, sel, phone):
    if phone and BROWSER != "firefox": await pg.tap(sel)
    else: await pg.click(sel)

async def settle(pg): await pg.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")

# ====================================================================== stage 1: the core plus Grow, the clock and Hold
async def stage1(br, p, url, phone):
    who = ("iPhone" if phone else "laptop") + " 1: "; ok = lambda c, m: C.ok(c, who + m)
    ctx = await device(br, p, phone); pg = await page(ctx, url); ev = pg.evaluate
    same = lambda: ev("JSON.stringify(T.dom()) === JSON.stringify(T.lines())")

    # ---- leaves that save as you type, and the trunk ----
    ok(await ev("Page.leaf === Book.D.trunk") and await ev("T.lines()") == ["Seeds", ""] and await ev("!!Book.D.lines[T.find('Seeds')].leaf"), "a new book starts from one trunk, with a Seeds leaf on it")
    await tap(pg, "#plus", phone); await pg.keyboard.type("River song"); await pg.keyboard.press("Enter")
    ok(await ev("Book.title(Page.leaf)") == "River song" and await ev("T.lines(Book.D.trunk)") == ["Seeds", "River song"], "＋ makes a new leaf: its name is a line on the trunk")
    await pg.keyboard.type("Verse one\nthe river is high\nand the banks are low\nChorus\ncarry me")
    ok(await ev("T.lines()") == ["Verse one", "the river is high", "and the banks are low", "Chorus", "carry me"] and await same(), "typing lands as lines, and the page matches the book")
    ok(await ev("Object.values(Book.D.lines).every(l => l.by === 'me')"), "every line knows the writer wrote it")
    ids = await ev("Book.D.leaves[Page.leaf].lines.slice()")
    await ev("T.at('the river is high', 9)"); await pg.keyboard.type(" Jordan"); await pg.keyboard.press("Backspace"); await pg.keyboard.type("n")
    ok(await ev("T.lines()[1]") == "the river Jordan is high" and await same(), "typing and Backspace in the middle of a line")
    await ev("T.at('the river Jordan', 9)"); await pg.keyboard.press("Enter")
    ok(await ev("T.lines().slice(1, 3)") == ["the river", " Jordan is high"] and await ev("Book.D.leaves[Page.leaf].lines[1]") == ids[1] and await same(), "Return splits a line; the first part keeps what hangs on it")
    await pg.keyboard.press("Backspace")
    ok(await ev("T.lines()[1]") == "the river Jordan is high" and await ev("T.lines().length") == 5 and await ev("Page.pos.at") == 9 and await same(), "Backspace at the start of a line joins it to the one above")
    await ev("T.at('Chorus', 0)"); await pg.keyboard.press("Enter")
    ok(await ev("T.lines().slice(3, 5)") == ["", "Chorus"] and await ev("Book.D.leaves[Page.leaf].lines[4]") == ids[3], "Return at the very start pushes the line down whole (it keeps its id)")
    await pg.keyboard.press("ArrowUp"); await settle(pg); await pg.keyboard.press("Delete")
    ok(await ev("T.lines().length") == 5 and await ev("Book.D.leaves[Page.leaf].lines[3]") == ids[3] and await same(), "Delete on an empty line removes it; the line below stays itself")
    await ev("T.select('the river Jordan', 4, 'and the banks', 8)"); await pg.keyboard.type("X")
    ok(await ev("T.lines()") == ["Verse one", "the Xbanks are low", "Chorus", "carry me"] and await same(), "typing over a selection that spans lines")
    await ev("Page.doUndo()"); await settle(pg)
    ok(await ev("T.lines()") == ["Verse one", "the river Jordan is high", "and the banks are low", "Chorus", "carry me"] and await same(), "Undo puts both lines back")
    await ev("T.at('carry me')"); await ev("""(() => { const e = new Event('paste', { bubbles: true, cancelable: true }); e.clipboardData = { getData: () => ' home\\n\\tover the water\\n\\t\\tslow\\nBridge' }; document.querySelector('#pg').dispatchEvent(e); })()""")
    pasted = await ev("[T.lines().slice(4), T.depths().slice(4)]")
    ok(pasted == [["carry me home", "over the water", "slow", "Bridge"], [0, 1, 2, 0]] and await same(), "pasting several lines; lines that start with tabs come in as branches " + json.dumps(pasted))
    await ev("Page.doUndo()"); await settle(pg)
    # reopen on the exact spot
    await ev("T.at('and the banks', 7)"); await pg.wait_for_timeout(750); await pg.reload(); await ready(pg)
    spot = await ev("Page.ui.spots[Page.leaf] || {}")
    ok(await ev("Book.title(Page.leaf)") == "River song" and spot.get("at") == 7 and await ev("Book.D.lines['%s'].text" % spot.get("line")) == "and the banks are low", "it reopens on the same leaf and the exact spot")
    await ctx.set_offline(True); await ev("T.at('carry me')"); await pg.keyboard.type(" home"); await ev("Book.flush()")
    ok("carry me home" in await ev("localStorage.getItem(Keep.K.book)"), "offline: writing is still saved on the device"); await ctx.set_offline(False)

    # ---- Grow: branches by indenting ----
    await ev("T.at('the river Jordan')"); await (tap(pg, "#b_in", phone) if phone else pg.keyboard.press("Tab"))
    await ev("T.at('and the banks')"); await (tap(pg, "#b_in", phone) if phone else pg.keyboard.press("Tab"))
    await ev("T.at('carry me home')"); await tap(pg, "#b_in", phone)
    ok(await ev("T.depths()") == [0, 1, 1, 0, 1] and await ev("T.text()") == "Verse one\n    the river Jordan is high\n    and the banks are low\nChorus\n    carry me home", "⇥ (or Tab) grows a line under the one above: a branch")
    pad = await ev("[...document.querySelectorAll('#pg > .l')].map(e => parseFloat(getComputedStyle(e).paddingLeft))")
    ok(pad[1] > pad[0] and pad[1] == pad[2] and pad[3] == pad[0], "a branch is drawn indented under its line")
    await ev("T.at('Verse one')"); r = await ev("Book.act('grow', { line: T.find('Verse one'), dir: 1 })")
    ok(r["ok"] is False and "nothing above" in r["why"], "the first line can't grow from anything: refused, with the reason")
    await ev("T.at('and the banks', 0)"); await pg.keyboard.press("Backspace")
    ok(await ev("T.depths()") == [0, 1, 0, 0, 1] and await ev("T.lines().length") == 5, "Backspace at the start of a grown line takes it back out first")
    await (tap(pg, "#b_in", phone) if phone else pg.keyboard.press("Tab"))
    await ev("T.at('Verse one')"); await ev("Book.act('grow', { line: T.find('Chorus'), dir: 1 })"); await ev("Book.act('grow', { line: T.find('Chorus'), dir: -1 })")
    ok(await ev("T.depths()") == [0, 1, 1, 0, 1], "a line grows and goes back with its whole branch")

    # ---- Move, with its branch ----
    await ev("Page.render()"); await ev("T.at('Chorus')"); await ev("T.menu('Move up')"); await settle(pg)
    ok(await ev("T.text()") == "Chorus\n    carry me home\nVerse one\n    the river Jordan is high\n    and the banks are low" and await same(), "Move up takes the branch past the one above it")
    await ev("T.menu('Move down')"); r = await ev("Book.act('move', { line: T.find('Chorus'), dir: 'down' })")
    ok(await ev("T.lines()[0]") == "Verse one" and r["ok"] is False and "last" in r["why"], "Move down brings it back; at the end it says so")

    # ---- Lift a branch into its own leaf ----
    await ev("T.at('Verse one')"); await ev("T.menu('Lift this branch')"); await settle(pg)
    v1 = await ev("Book.D.lines[T.find('Verse one')].leaf")
    ok(bool(v1) and await ev("T.lines()") == ["Verse one", "Chorus", "carry me home"] and await ev("T.lines('%s')" % v1) == ["the river Jordan is high", "and the banks are low"] and await ev("T.depths('%s')" % v1) == [0, 0], "Lift: the branch becomes its own leaf, attached to the line it grew from")
    box = await pg.locator('#pg > .l.lf').bounding_box()
    if phone and BROWSER != "firefox": await pg.touchscreen.tap(box["x"] + box["width"] - 12, box["y"] + box["height"] / 2)
    else: await pg.mouse.click(box["x"] + box["width"] - 12, box["y"] + box["height"] / 2)
    await settle(pg)
    ok(await ev("Page.leaf") == v1 and (await pg.inner_text("#crumbs")).replace("\n", "").replace(" ", "") == "Trunk›Riversong›Verseone", "tapping › opens the leaf; the path shows Trunk › River song › Verse one")
    await pg.fill("#ttl", "Verse 1"); song = await ev("Book.parentLeaf(Page.leaf)")
    ok(await ev("T.lines('%s')[0]" % song) == "Verse 1" and await ev("Book.title(Page.leaf)") == "Verse 1", "renaming a leaf renames the line it grew from (they are the same words)")
    await tap(pg, "#tBack", phone); a = await ev("Page.leaf"); await tap(pg, "#tFwd", phone)
    ok(a == song and await ev("Page.leaf") == v1, "Back and Forward walk the leaves you visited")
    await tap(pg, "#tBack", phone)
    # move a line to another leaf; never inside itself
    await ev("Book.act('move', { line: T.find('carry me home'), leaf: '%s' })" % v1)
    ok(await ev("T.lines('%s')" % v1) == ["the river Jordan is high", "and the banks are low", "carry me home"] and await ev("T.lines()") == ["Verse 1", "Chorus"], "Move to… sends a line to another leaf")
    r = await ev("Book.act('move', { line: T.find('Verse 1'), leaf: '%s' })" % v1)
    ok(r["ok"] is False and "inside itself" in r["why"], "a branch can't be moved inside its own leaf")
    await ev("Page.doUndo()"); await settle(pg)
    ok(await ev("T.lines()") == ["Verse 1", "Chorus", "carry me home"] and await ev("T.lines('%s')" % v1) == ["the river Jordan is high", "and the banks are low"], "Undo of a move puts both leaves back as they were")

    # ---- Delete (recoverable) ----
    await ev("T.at('Verse 1')"); await ev("T.menu('Delete')"); await settle(pg)
    ok(await ev("T.lines()") == ["Chorus", "carry me home"] and await ev("Book.D.pruned.length") == 1 and not await ev("Book.alive('%s')" % v1) and await ev("Book.search('Jordan').length") == 0, "Delete takes the line out, and its leaf with it")
    ok("Deleted" in await pg.inner_text("#toast") and await pg.locator("#toast button").count() == 1, "it says so, with Undo")
    await ev("document.querySelector('#tMenu').click()"); await ev("[...document.querySelectorAll('#menu button')].find(b => b.textContent === 'Deleted').click()")
    ok("Verse 1" in await pg.inner_text("#sheet"), "☰ → Deleted lists it")
    await ev("document.querySelector('#sheet [data-id]').click()"); await settle(pg)
    ok(await ev("T.lines()") == ["Verse 1", "Chorus", "carry me home"] and await ev("Book.alive('%s')" % v1) and await ev("Book.D.pruned.length") == 0 and await ev("T.lines('%s').length" % v1) == 2, "Bring back: the line returns where it was, with its leaf and everything in it")
    await ev("T.select('Verse 1', 0, 'Chorus', 3)"); await pg.keyboard.press("Backspace")
    ok(await ev("T.lines()") == ["rus", "carry me home"] and await ev("Book.D.pruned.length") == 1 and await ev("Book.D.pruned[0].name") == "Verse 1", "typing away a line that has a leaf keeps the leaf under Deleted")
    await ev("Page.doUndo()"); await settle(pg)
    ok(await ev("T.lines()") == ["Verse 1", "Chorus", "carry me home"] and await ev("Book.alive('%s')" % v1) and await ev("Book.D.pruned.length") == 0, "and Undo brings it straight back")

    # ---- Undo: steady typing is one step ----
    await ev("Book.sealUndo()"); await ev("T.at('Chorus')"); await pg.keyboard.type(" again", delay=20); await ev("Page.doUndo()"); await settle(pg)
    ok(await ev("T.lines()[1]") == "Chorus" and await same(), "steady typing on a line is one Undo")

    # ---- Search ----
    await ev("Search.open('jordan')"); n = await pg.locator("#sheet [data-line]").count(); txt = await pg.inner_text("#sheet")
    ok(n == 1 and "the river Jordan is high" in txt and "in Verse 1" in txt, "Search finds a line in another leaf")
    await ev("document.querySelector('#sheet [data-line]').click()"); await settle(pg)
    ok(await ev("Page.leaf") == v1 and await ev("!!document.querySelector('#pg .l.flash')") and await pg.locator("#sheet.hide").count() == 1, "tapping the result goes to that leaf and line")

    # ---- the record of every move ----
    log = await ev("T.log()"); joined = " | ".join(log)
    need = ["You wrote in “River song”", "You grew a branch in “River song”", "You lifted “Verse one” into its own leaf", "You moved a branch up in “River song”", "You deleted “Verse 1” from “River song”", "You brought back “Verse 1”", "You undid"]
    ok(all(any(n in l for l in log) for n in need), "the record has every move, who made it and where: " + joined[-400:])
    ok(sum(1 for l in log if l.startswith("You wrote in “River song”")) <= 3, "steady writing is one entry, not one per key")
    await ev("Log.open('book')"); await pg.wait_for_selector("#tlBox .tl")
    ok(await pg.locator("#tlBox .tl").count() >= 8 and "You lifted" in await pg.inner_text("#tlBox"), "☰ → The record reads as a timeline")
    await ev("Page.closeSheet(true)")
    before = await ev("JSON.stringify(Book.D.lines)"); await ev("Log.add({ who: 'me', what: 'x', leaf: Page.leaf })")
    ok(await ev("JSON.stringify(Book.D.lines)") == before, "the record never changes the writing")

    # ---- the writing clock and Hold ----
    await ev("Page.go('%s')" % song); await ev("T.at('Chorus')"); c0 = await ev("Clock.data.ms"); await pg.keyboard.type("abcdef", delay=60); c1 = await ev("Clock.data.ms")
    ok(250 <= c1 - c0 <= 2500, "typing runs the writing clock (%d ms for six keys)" % (c1 - c0))
    await pg.wait_for_timeout(300); await ev("Book.sealUndo()"); await ev("Book.act('write', { line: T.find('Chorus'), words: '!' })"); await ev("Page.doUndo()")
    ok(await ev("Clock.data.ms") == c1, "a move that isn't typing adds no time")
    if phone and BROWSER != "firefox":
        await ev("(() => { const h = document.querySelector('.hold'); h.dispatchEvent(new TouchEvent('touchstart', { cancelable: true, bubbles: true })); })()"); await pg.wait_for_timeout(400); await ev("document.querySelector('.hold').dispatchEvent(new TouchEvent('touchend', { cancelable: true, bubbles: true }))")
    else:
        await pg.keyboard.down("Alt"); await pg.wait_for_timeout(400); await pg.keyboard.up("Alt")
    c2 = await ev("Clock.data.ms"); ok(350 <= c2 - c1 <= 1500, "Hold counts time without typing (%d ms)" % (c2 - c1))
    await ev("document.querySelector('.hold').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))"); await pg.wait_for_timeout(200); await ev("document.querySelector('.hold').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))")
    ok(await ev("Clock.data.ms") == c2 and "hold" not in await ev("Book.actions().join()"), "Hold is not an action, and a press made by code doesn't count: only a real finger or key")
    await ev("Clock.set({ goal: 1 })"); await ev("Clock.paint()"); ok("/ 0:01" in await pg.inner_text(".clock"), "a daily goal shows beside the clock"); await ev("Clock.set({ goal: 0 })")
    ok(any("writing in “River song”" in l or "held the clock" in l for l in await ev("T.log()")), "time spent goes into the record, per leaf")

    # ---- modules: a switch each; off never deletes ----
    await ev("Settings.open()"); mods = await ev("[...document.querySelectorAll('#sheet [data-mod]')].map(c => c.dataset.mod)")
    ok(all(m in mods for m in ["grow", "clock", "search"]), "Settings lists every module with its switch: " + ",".join(mods))
    await ev("document.querySelector('#sheet [data-mod=grow]').click()"); await ev("Page.closeSheet(true)"); await ev("T.at('Chorus')")
    r = await ev("Book.act('grow', { line: T.find('carry me'), dir: 1 })")
    ok(await pg.locator("#b_in.hide").count() == 1 and r["ok"] is False and "switched off" in r["why"], "Grow switched off: its buttons go and its actions are refused")
    ok(await ev("Book.alive('%s')" % v1) and await ev("T.lines('%s').length" % v1) == 2 and await pg.locator("#pg > .l.lf").count() == 1, "but nothing it made is deleted: the lifted leaf is still there " + json.dumps(await ev("[Book.alive('%s'), T.lines('%s'), T.lines(), document.querySelectorAll('#pg > .l.lf').length, Book.title(Page.leaf)]" % (v1, v1))))
    await ev("Mods.set('grow', true)"); ok(await pg.locator("#b_in.hide").count() == 0, "switched back on, it's all there again")
    await ev("Mods.set('clock', false)"); ok(await pg.locator(".clock.hide").count() == 1 and await pg.locator(".hold.hide").count() == 1, "the clock and Hold have their own switch"); await ev("Mods.set('clock', true)")

    # ---- rings and export ----
    rings = await ev("Keep.rings().then(a => a.map(r => r.title))")
    ok("River song" in rings, "rings: the leaf as it was is kept before it changes")
    n0 = await ev("Book.leaves().length"); await ev("Keep.rings(Page.leaf).then(a => Page.go(Book.copyIn(a[a.length - 1].piece, '(as it was)')))"); await settle(pg)
    ok(await ev("Book.leaves().length") == n0 + 1 and "(as it was)" in await ev("Book.title(Page.leaf)") and await ev("T.lines('%s')[0]" % song) == "Verse 1", "a ring comes back as a NEW leaf beside the one you have " + json.dumps(await ev("[Book.leaves().length, Book.title(Page.leaf), T.lines('%s')]" % song)) + str(n0))
    await ev("Settings.open()")
    async with pg.expect_download() as d: await ev("document.querySelector('#sTxt').click()")
    txt = open(await (await d.value).path(), encoding="utf-8").read()
    ok("River song\n    Verse 1\n        the river Jordan is high" in txt and "Seeds" in txt, "export to read: one plain text file, branches indented, lifted leaves under their lines " + json.dumps(txt[:500]))
    async with pg.expect_download() as d: await ev("document.querySelector('#sJson').click()")
    j = json.load(open(await (await d.value).path(), encoding="utf-8"))
    ok(j["format"] == "bolw-core" and len(j["record"]) > 5 and j["book"]["trunk"], "export everything: one open JSON file with the book and the record")
    await ev("Page.closeSheet(true)")

    # ---- a new version never reloads the app while you're typing ----
    await ev("Page.go('%s')" % song); await ev("T.at('carry me')"); await ev("window.__here = 1")
    await ctx.route("**/core/version.txt*", lambda r: r.fulfill(status=200, content_type="text/plain", body="9.9.9"))
    await pg.keyboard.type("x"); await ev("Update.check()"); await pg.wait_for_timeout(300); await pg.keyboard.type("y")
    ok(await ev("Update.waiting") is True and await ev("window.__here") == 1 and "xy" in await ev("T.lines().join()"), "a newer version is published: while you type, nothing reloads")
    await ev("(() => { const real = Date.now; Date.now = () => real() + 60000; })()")
    await pg.wait_for_function("!window.__here", timeout=15000); await ready(pg); await pg.wait_for_timeout(600)
    ok(await ev("Book.title(Page.leaf)") == "River song" and "xy" in await ev("T.lines().join()") and "back where you were" in await pg.inner_text("#toast"), "once your hands rest it updates, and brings you back to the same leaf with every letter kept " + json.dumps(await ev("[Book.title(Page.leaf), T.lines(), document.querySelector('#toast').textContent]")))
    await ctx.unroute("**/core/version.txt*")
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2]))
    await ctx.close()

async def feel(br, p, url):
    """Feel: typing in a long leaf stays quick, and nothing is wider than the screen."""
    ctx = await device(br, p, True); pg = await page(ctx, url); ev = pg.evaluate
    await ev("""() => { Page.newLeaf(); const id = Page.leaf, t = []; for (let i = 0; i < 1500; i++) t.push((i % 7 === 3 ? '\\t' : '') + 'Line ' + i + ' of a long song that keeps going and going'); Book.act('write', { line: Book.D.leaves[id].lines[0], words: t.join('\\n') }); Page.render(); }""")
    await ev("T.at('Line 700 of', 8)"); await pg.wait_for_timeout(200)
    t = await ev("""async () => { const t0 = performance.now(); for (let i = 0; i < 60; i++) document.execCommand('insertText', false, 'x'); const sync = (performance.now() - t0) / 60; const t1 = performance.now(); document.execCommand('insertParagraph'); const enter = performance.now() - t1; return { sync, enter }; }""")
    C.ok(t["sync"] < 4 and "x" * 60 in await ev("T.lines().join('|')"), "feel: a key in a 1,500-line leaf costs %.2f ms of work, and every key landed" % t["sync"])
    C.ok(t["enter"] < 60 and await ev("T.lines().length") == 1501 and await ev("JSON.stringify(T.dom()) === JSON.stringify(T.lines())"), "feel: Return in the middle of it costs %.1f ms" % t["enter"])
    C.ok(await ev("document.documentElement.scrollWidth <= innerWidth"), "feel: nothing is wider than the screen")
    await ctx.close()

async def sync(br, p, url):
    """Same lock, own files: two devices, one passphrase, a fake GitHub. Other books' files are never touched."""
    gh = FakeGitHub(); gh.refs["tol-data"] = "d" * 40; old = gh.plant("sync/aaaaaaaaaaaaaaaa.json", b'{"format":"tol-sealed","v":1,"iv":"x","ct":"old book"}'); ess = gh.plant("book/bbbbbbbbbbbbbbbb.json", b'{"format":"tol-sealed","v":1,"iv":"x","ct":"essentials"}')
    A = await device(br, p, False, gh); Bc = await device(br, p, True, gh)
    for ctx in (A, Bc): await ctx.add_init_script("try { localStorage.setItem('tol-gh-token', JSON.stringify('ghp_test')); } catch (e) {}")
    a = await page(A, url); await a.click("#plus"); await a.keyboard.type("Morning pages"); await a.keyboard.press("Enter"); await a.keyboard.type("the river is high today")
    await a.evaluate("Lock.turnOn('willow bridge candle seven')"); await a.wait_for_function("Lock.label().indexOf('Synced') === 0")
    meta = json.loads(gh.files["sync/meta.json"][0]); mine = [k for k in gh.files if k.startswith("core/")]
    C.ok(meta["format"] == "tol-vault" and meta["iterations"] == 600000, "sync: the vault file is the old book's own format (one passphrase opens all three)")
    C.ok(len(mine) == 1 and gh.files["sync/aaaaaaaaaaaaaaaa.json"][1] == old and gh.files["book/bbbbbbbbbbbbbbbb.json"][1] == ess, "sync: Core writes its own file in core/; the old book's and Essentials' files are untouched")
    raw = gh.files[mine[0]][0].decode()
    C.ok("river" not in raw and "Morning" not in raw and json.loads(raw)["format"] == "tol-sealed", "sync: only scrambled text leaves the device")
    b = await page(Bc, url); await b.evaluate("Book.act('write', { line: Book.D.leaves[Book.D.trunk].lines[1], words: 'a line from the phone' })")
    bad = await b.evaluate("Lock.turnOn('wrong words here now').then(() => 'in', e => e.message)")
    C.ok("doesn't match" in bad and not await b.evaluate("Lock.isOn"), "sync: a wrong passphrase opens nothing")
    await b.evaluate("Lock.turnOn('Willow  Bridge candle-seven')"); await b.wait_for_function("!!T.leafNamed('Morning pages')")
    tr = await b.evaluate("T.lines(Book.D.trunk)")
    C.ok(await b.evaluate("Book.D.trunk") == await a.evaluate("Book.D.trunk") and "Morning pages" in tr and "a line from the phone" in tr, "sync: the second device joins the first one's trunk, and what it had written moves onto it " + json.dumps(tr))
    C.ok(await b.evaluate("Object.keys(localStorage).every(k => (localStorage.getItem(k) || '').toLowerCase().indexOf('willow') < 0)"), "sync: the passphrase is never stored")
    mp = await b.evaluate("T.leafNamed('Morning pages')"); await b.evaluate("Page.go('%s')" % mp); await b.evaluate("T.at('the river is high today')"); await b.keyboard.type(" and loud"); await b.keyboard.press("Enter"); await b.keyboard.type("from the phone"); await b.evaluate("Grow.grow(1)")
    await b.evaluate("Book.flush(); Lock.syncNow(true)"); await b.wait_for_function("Lock.label().indexOf('Synced') === 0"); await b.wait_for_timeout(300)
    await a.evaluate("Lock.syncNow()"); await a.wait_for_function("Book.textOf('%s').indexOf('from the phone') > 0" % mp)
    C.ok(await a.evaluate("Book.textOf('%s')" % mp) == "the river is high today and loud\n    from the phone" and "a line from the phone" in await a.evaluate("T.lines(Book.D.trunk)"), "sync: writing and a branch made on the phone arrive on the laptop")
    await settle(a)
    C.ok(await a.evaluate("Page.leaf") == mp and await a.evaluate("JSON.stringify(T.dom()) === JSON.stringify(T.lines())"), "sync: the open leaf is redrawn with what arrived")
    # both change the same leaf: the newer wins, the other is kept as a ring
    await a.evaluate("T.at('the river is high')"); await a.keyboard.type(" (laptop)"); await a.evaluate("Book.flush()"); await b.wait_for_timeout(40)
    await b.evaluate("T.at('from the phone')"); await b.keyboard.type(" (phone)"); await b.evaluate("Book.flush(); Lock.syncNow(true)"); await b.wait_for_timeout(500)
    await a.wait_for_timeout(4200); await a.evaluate("Lock.syncNow()"); await a.wait_for_function("Book.textOf('%s').indexOf('(phone)') > 0" % mp)
    v = await a.evaluate("Keep.rings('%s')" % mp)
    C.ok(any("another device" in x["why"] and any("(laptop)" in l["text"] for l in x["piece"]["lines"].values()) for x in v), "sync: when both devices changed a leaf, the newer wins and this device's version is kept as a ring")
    # a line moved on one device while the other edited both leaves: it is never dropped
    await a.evaluate("Lock.syncNow(true)"); await a.wait_for_timeout(400); await b.wait_for_timeout(3700); await b.evaluate("Lock.syncNow()"); await b.wait_for_timeout(600)
    seeds = await a.evaluate("T.leafNamed('Seeds')"); line = await a.evaluate("T.find('from the phone', '%s')" % mp)
    await a.evaluate("Book.act('move', { line: '%s', leaf: '%s' })" % (line, seeds)); await a.evaluate("Book.flush()")
    await b.wait_for_timeout(50); await b.evaluate("Book.act('write', { line: Book.D.leaves['%s'].lines[0], at: 0, words: 'B ' })" % mp)
    await b.evaluate("Book.act('write', { line: Book.D.leaves['%s'].lines[0], at: 0, words: 'idea ' })" % seeds); await b.evaluate("Book.flush(); Lock.syncNow(true)"); await b.wait_for_timeout(500)
    await a.evaluate("Lock.syncNow()"); await a.wait_for_timeout(700); await a.evaluate("Lock.syncNow(true)"); await a.wait_for_timeout(500); await b.evaluate("Lock.syncNow()"); await b.wait_for_timeout(700)
    ta = await a.evaluate("Book.textOf(Book.D.trunk, '', true)"); tb = await b.evaluate("Book.textOf(Book.D.trunk, '', true)")
    C.ok(ta.count("from the phone (phone)") == 1 and tb.count("from the phone (phone)") == 1, "sync: a line moved on one device while the other edited both leaves is kept, once, on both")
    # the record is united
    await b.evaluate("Lock.syncNow(true)"); await b.wait_for_timeout(400); await a.evaluate("Lock.syncNow()"); await a.wait_for_timeout(600)
    devs = await a.evaluate("Log.all().then(l => [...new Set(l.map(e => e.dev))].length)")
    C.ok(devs == 2, "sync: the record of every move is united from both devices")
    C.ok(gh.files["sync/aaaaaaaaaaaaaaaa.json"][1] == old and gh.files["book/bbbbbbbbbbbbbbbb.json"][1] == ess and all("river" not in v[0].decode(errors="ignore") for v in gh.files.values()), "sync: nothing readable anywhere, and the other books' files still untouched")
    C.ok(a.errs == [] and b.errs == [], "sync: no errors " + str((a.errs + b.errs)[:2]))
    # safe mode: its own address, none of the app's files, reads the same book
    s = await A.new_page(); reqs = []; s.on("request", lambda r: reqs.append(r.url)); await s.goto(url + "core/safe/"); await s.wait_for_selector("#leaves button")
    C.ok("Morning pages" in await s.inner_text("#leaves") and not any(u.endswith(".js") or ".js?" in u for u in reqs), "safe mode: its own address, loads none of the app's code, and lists your leaves")
    await s.click("#leaves button"); C.ok("the river is high today" in await s.inner_text("#read"), "safe mode: the whole book can be read, leaves under their lines")
    async with s.expect_download() as d: await s.click("#exTxt")
    C.ok("the river is high today" in open(await (await d.value).path(), encoding="utf-8").read(), "safe mode: export works from there")
    await A.close(); await Bc.close()

async def offline_start(br, p, url):
    """The app and safe mode open with no internet at all, once they've been opened once."""
    ctx = await device(br, p, True, sw=True); pg = await page(ctx, url); errs = pg.errs
    await pg.click("#plus"); await pg.keyboard.type("Offline test"); await pg.keyboard.press("Enter"); await pg.keyboard.type("still here"); await pg.evaluate("Book.flush(); Page.saveSpot()")
    await pg.evaluate("navigator.serviceWorker.ready.then(() => true)"); await pg.reload(); await pg.wait_for_function("!!navigator.serviceWorker.controller", timeout=15000)
    await ctx.set_offline(True); await pg.reload(); await ready(pg)
    C.ok(await pg.evaluate("T.lines()") == ["still here"] and await pg.evaluate("Book.title(Page.leaf)") == "Offline test", "offline start: with no internet at all, the app opens on your leaf")
    await pg.goto(url + "core/safe/"); C.ok("Offline test" in await pg.inner_text("body"), "offline start: and so does safe mode")
    C.ok(errs == [], "offline start: no errors " + str(errs[:2])); await ctx.close()

async def guide(br, p, url, n, phone, ai=None, more=None):
    """The guided test page for one stage: the real app on its own sample book; every Show me runs clean and puts everything back."""
    who = ("iPhone" if phone else "laptop") + " guide %d: " % n; ctx = await device(br, p, phone, ai=ai); pg = await page(ctx, url, "core/test/?quick&s=%d" % n); await pg.wait_for_function("!!window.Guide")
    C.ok(await pg.evaluate("Keep.NS") == "core-test" and await pg.evaluate("Lock.off") and await pg.evaluate("localStorage.getItem('core-book')") is None, who + "its own sample book, never the real one, never synced")
    C.ok(await pg.evaluate("Guide.stage") == n and ("Stage %d" % n) in await pg.inner_text("#gN"), who + "opens on stage %d" % n)
    snap = "JSON.stringify([Book.D.leaves, Book.D.lines, Book.D.folds, Book.D.links, Book.D.marks, Book.D.pruned, Book.D.names, Book.D.more, Page.leaf])"
    count = await pg.evaluate("Guide.STAGES[%d].tasks.length" % n)
    for i in range(count):
        if not await pg.evaluate("!!Guide.STAGES[%d].tasks[%d].show" % (n, i)): continue
        before = await pg.evaluate(snap); await pg.evaluate("Guide.demo(Guide.STAGES[%d].tasks[%d].show)" % (n, i))
        C.ok(await pg.evaluate(snap) == before and await pg.locator("#shield.hide").count() == 1 and pg.errs == [], who + "Show me %d runs and puts everything back %s" % (i + 1, str(pg.errs[:1]) if pg.errs else ""))
    await pg.evaluate("Guide.task = 0"); await pg.evaluate("document.querySelector('.av[data-v=off]').click()"); await pg.fill("#gNote", "the bar jumped")
    rep = await pg.evaluate("Guide.report()")
    C.ok(": SOMETHING'S OFF\n   the bar jumped" in rep and "river is high" not in rep and "shepherd" not in rep, who + "the answers report has your answers and none of the writing")
    if more: await more(pg, who)
    C.ok(pg.errs == [], who + "no errors " + str(pg.errs[:2])); await ctx.close()

STAGES = {}
def stage(n):
    def deco(fn): STAGES.setdefault(n, []).append(fn); return fn
    return deco
@stage("1")
async def _s1(br, p, url):
    for phone in (True, False): await stage1(br, p, url, phone)
    await feel(br, p, url); await sync(br, p, url); await offline_start(br, p, url)
    async def more(pg, who):
        await pg.evaluate("Guide.task = 6"); await pg.evaluate("document.querySelector('#gLong').click()")
        C.ok(await pg.evaluate("T.lines().length") == 1200 and await pg.evaluate("T.depths()[1]") == 1, who + "the feel check can add a long leaf")
    for phone in (True, False): await guide(br, p, url, 1, phone, more=more)

# ====================================================================== stage 2: Fold
SONG = "Verse one\n\tthe river is high\n\tand the banks are low\nChorus\n\tcarry me over\n\tcarry me home\nVerse two\n\tthe rain came down"
async def new_leaf(pg, name, text):
    await pg.evaluate("(() => { Page.go(Book.D.trunk); Page.newLeaf(); Book.act('write', { line: Book.D.leaves[Page.leaf].parent, at: 0, words: %s }); Book.act('write', { line: Book.D.leaves[Page.leaf].lines[0], words: %s }); Book.clearUndo(); Page.show(Page.leaf); })()" % (json.dumps(name), json.dumps(text)))
    return await pg.evaluate("Page.leaf")

async def stage2(br, p, url, phone):
    who = ("iPhone" if phone else "laptop") + " 2: "; ok = lambda c, m: C.ok(c, who + m)
    ctx = await device(br, p, phone); pg = await page(ctx, url); ev = pg.evaluate
    song = await new_leaf(pg, "River song", SONG); vis = lambda: ev("T.dom()")
    async def tapgate(fid, more=False):
        sel = '.gate[data-f="%s"]%s' % (fid, " .gm" if more else " .gl"); await tap(pg, sel, phone); await settle(pg)
    # ---- fold a line and its branch behind a gate ----
    await ev("T.at('Chorus')"); await tap(pg, "#b_fold", phone); await settle(pg)
    f1 = await ev("Fold.foldsOf(Page.leaf)[0].id"); d = await vis()
    ok(d == ["Verse one", "the river is high", "and the banks are low", "[▸ Chorus3 lines⋯]", "Verse two", "the rain came down"] and await ev("T.lines().length") == 8, "Fold on a line takes its branch: three lines collapse behind a gate (the words are all still in the book)")
    ok("Folded 3 lines" in await pg.inner_text("#toast"), "it says what it folded, and offers to name it")
    await tapgate(f1); d = await vis()
    ok(d[3] == "[▾ Chorus⋯]" and d[4:7] == ["Chorus", "carry me over", "carry me home"] and await ev("Book.D.folds['%s'].open" % f1), "tapping the gate opens the fold")
    bg = await ev("[...document.querySelectorAll('#pg > .l')].map(e => e.style.backgroundImage ? 1 : 0)")
    ok(bg == [0, 0, 0, 1, 1, 1, 0, 0], "an open fold shows as a colored line in the margin beside its lines")
    await tapgate(f1); ok((await vis())[3] == "[▸ Chorus3 lines⋯]", "tapping again closes it")
    # ---- fold a selection; overlapping folds ----
    await tapgate(f1); await ev("T.select('carry me home', 0, 'Verse two', 5)"); await tap(pg, "#b_fold", phone); await settle(pg)
    f2 = await ev("Fold.foldsOf(Page.leaf).find(f => f.id !== '%s').id" % f1)
    ok(await ev("Book.D.lines[Book.D.folds['%s'].from].text" % f2) == "carry me home" and await ev("Book.D.lines[Book.D.folds['%s'].to].text" % f2) == "Verse two", "Fold on a selection takes exactly the lines the selection touches")
    ok(await vis() == ["Verse one", "the river is high", "and the banks are low", "[▾ Chorus⋯]", "Chorus", "carry me over", "[▸ carry me home2 lines⋯]", "the rain came down"], "two folds overlap: the second hides its lines even inside the open first one")
    await tapgate(f2); pos = await ev("[...document.querySelectorAll('#pg > .l')].map(e => e.style.backgroundPosition)")
    ok(pos[5] != "" and "," in pos[5] and pos[3] != pos[6] and pos[6] != "", "open together, each has its own lane in the margin; the line they share shows both: " + json.dumps(pos[3:7]))
    await tapgate(f1); d = await vis()
    ok(d == ["Verse one", "the river is high", "and the banks are low", "[▸ Chorus3 lines⋯]", "[▾ carry me home⋯]", "Verse two", "the rain came down"], "close the first: its lines hide; the overlapping fold's gate stays, with the line only it holds")
    await tapgate(f1); await tapgate(f2)
    # a fold wholly inside a closed fold has no gate of its own until the outer one opens
    await ev("Book.act('fold', { from: T.find('carry me over'), to: T.find('carry me over') })"); await ev("Page.render()"); f3 = await ev("Fold.foldsOf(Page.leaf).find(f => Book.D.lines[f.from].text === 'carry me over').id")
    await tapgate(f1); n_closed = await pg.locator(".gate").count(); await tapgate(f1)
    ok(n_closed == 2 and await pg.locator(".gate").count() == 3, "a fold wholly inside a closed fold stays behind that gate until it opens")
    await ev("Book.act('unfold', { fold: '%s' })" % f3); await ev("Book.act('unfold', { fold: '%s' })" % f2); await ev("Page.render()")
    # ---- writing in and around a fold ----
    await ev("T.at('carry me home')"); await pg.keyboard.press("Enter"); await pg.keyboard.type("all the way")
    ok(await ev("Book.D.lines[Book.D.folds['%s'].to].text" % f1) == "all the way" and await ev("T.depths()[6]") == 1, "Return at the end of a fold's last line: the new line stays inside the fold")
    await pg.keyboard.press("Enter"); await pg.keyboard.press("Enter"); await pg.keyboard.type("after")
    ok(await ev("Book.D.lines[Book.D.folds['%s'].to].text" % f1) == "all the way" and await ev("T.lines().slice(6, 8)") == ["all the way", "after"], "Return on the empty last line steps out of the fold")
    for _ in range(5): await ev("Page.doUndo()")
    await settle(pg); ok(await ev("T.lines().length") == 8 and await ev("Book.D.lines[Book.D.folds['%s'].to].text" % f1) == "carry me home", "Undo walks all of that back")
    await tapgate(f1); n0 = await ev("T.lines().length"); await ev("T.select('and the banks', 3, 'Verse two', 2)"); await pg.keyboard.press("Backspace"); await settle(pg)
    ok(await ev("T.lines().length") == n0 and "closed fold" in await pg.inner_text("#msg"), "deleting across a closed gate is refused: hidden lines are never typed away by accident")
    # ---- names: a fold named the same in two songs is one gathering ----
    await tapgate(f1, more=True); items = await ev("[...document.querySelectorAll('#menu button')].map(b => b.textContent)")
    ok(items[:2] == ["Open", "Name this fold…"] and "Remove the fold (its lines stay)" in items, "⋯ on a gate opens the fold's own menu: " + ", ".join(items))
    await ev("[...document.querySelectorAll('#menu button')].find(b => b.textContent.indexOf('Name') === 0).click()"); await pg.fill("#fnName", "Chorus"); await ev("document.querySelector('#fnOk').click()"); await settle(pg)
    ok(await ev("Book.D.folds['%s'].name" % f1) == "Chorus" and "gathers 1 piece" in await pg.inner_text("#toast") and (await vis())[3] == "[▸ Chorus3 lines⋯]", "naming a fold")
    song2 = await new_leaf(pg, "Desert road", "Verse\n\trivers in the desert\nRefrain\n\tmake a way")
    r = await ev("Book.act('fold', { from: T.find('Refrain'), name: 'chorus' })")
    ok(await ev("Fold.pieces('Chorus').length") == 2 and await ev("Fold.names().map(n => n.name + ':' + n.n).join()") == "Chorus:2", "a fold named the same in another song joins it: one gathering, two pieces (capitals don't matter)")
    await ev("Fold.openList()"); await ev("document.querySelector('#sheet [data-name]').click()"); txt = await pg.inner_text("#sheet")
    ok("River song" in txt and "Desert road" in txt and "carry me over" in txt and "make a way" in txt, "☰ → Folds → Chorus shows every piece, each with its leaf and its words")
    await ev("document.querySelector('#sheet [data-go]').click()"); await settle(pg)
    ok(await ev("Page.leaf") == song and await ev("Book.D.folds['%s'].open" % f1) and await ev("!!document.querySelector('#pg .l.flash')"), "tapping a piece goes to it and opens its gate")
    # ---- details ----
    await ev("Fold.editDetails('%s')" % f1); await pg.fill("#fdNew", "Key"); await ev("document.querySelector('#fdAdd').click()"); await pg.fill('#sheet [data-k="Key"]', "G"); await ev("document.querySelector('#sheet [data-k=\"Key\"]').dispatchEvent(new Event('change'))")
    ok(await ev("Book.D.folds['%s'].details.Key" % f1) == "G" and await ev("Book.D.names.chorus.keys.join()") == "Key", "a detail on a named fold (Key: G)")
    await ev("Page.closeSheet(true)"); await ev("Fold.editDetails('%s')" % r["fold"])
    ok(await pg.locator('#sheet [data-k="Key"]').count() == 1 and await pg.input_value('#sheet [data-k="Key"]') == "", "the other piece of the gathering offers the same kind of detail, with its own value")
    await ev("Page.closeSheet(true)"); await ev("Book.act('gate', { fold: '%s', open: false })" % f1); await ev("Page.render()")
    ok("Key: G" in (await vis())[3], "details show on the closed gate")
    r2 = await ev("Book.act('detail', { fold: Fold.foldsOf(Page.leaf)[0].id, key: 'Status', value: 'x' })")
    await ev("Book.act('name', { fold: '%s', name: '' })" % f1); r3 = await ev("Book.act('detail', { fold: '%s', key: 'Key', value: 'A' })" % f1)
    ok(r3["ok"] is False and "Name the fold first" in r3["why"], "details belong to named folds: an unnamed fold refuses them, saying why"); await ev("Page.doUndo()")
    # ---- gather by rule: a search saved as a fold ----
    await ev("Book.act('gather', { name: 'Water', search: 'river' })"); await ev("Fold.openName('Water')"); txt = await pg.inner_text("#sheet")
    ok("the river is high" in txt and "rivers in the desert" in txt, "gather by a search: a named gathering that lists every line with those words")
    await ev("Page.closeSheet(true)")
    # ---- remove, Undo, and folds following their lines ----
    await ev("Page.go('%s')" % song); await ev("Book.act('gate', { fold: '%s', open: true })" % f1); await ev("Page.render()"); await ev("Book.sealUndo()")
    await ev("Book.act('unfold', { fold: '%s' })" % f1); await ev("Page.render()")
    ok(await pg.locator(".gate").count() == 0 and await ev("T.lines().length") == 8, "Remove the fold: the gate goes and every line stays")
    await ev("Page.doUndo()"); await settle(pg); ok(await pg.locator(".gate").count() == 1 and await ev("Book.D.folds['%s'].name" % f1) == "Chorus", "Undo brings the fold back, name and all")
    await ev("Book.act('gate', { fold: '%s', open: false })" % f1); u0 = await ev("Book.D.leaves[Page.leaf].updatedAt"); await pg.wait_for_timeout(5); await ev("Book.act('gate', { fold: '%s', open: true })" % f1)
    ok(await ev("Book.D.leaves[Page.leaf].updatedAt") == u0, "opening and closing a gate doesn't count as changing the leaf")
    await ev("Page.doUndo()"); ok(await ev("Book.D.folds['%s'].open" % f1) is False, "and it can be undone too"); await ev("Book.act('gate', { fold: '%s', open: true })" % f1)
    await ev("Book.act('prune', { line: T.find('carry me home') })"); ok(await ev("Book.D.lines[Book.D.folds['%s'].to].text" % f1) == "carry me over", "deleting a fold's last line: the fold now ends on the line before")
    await ev("Page.doUndo()"); await ev("Book.act('lift', { line: T.find('Chorus') })"); ch = await ev("Book.D.lines[T.find('Chorus')].leaf")
    ok(await ev("Book.D.folds['%s'].from" % f1) == await ev("T.find('Chorus')") and await ev("Book.D.folds['%s'].to" % f1) == await ev("T.find('Chorus')"), "lifting a folded line's branch into a leaf: the fold stays on the line")
    await ev("Page.doUndo()"); await ev("Page.render()")
    # ---- going to a hidden line opens its gates ----
    await ev("Book.act('gate', { fold: '%s', open: false })" % f1); await ev("Page.go('%s')" % song2); await ev("Search.open('carry me over')"); await ev("document.querySelector('#sheet [data-line]').click()"); await settle(pg)
    ok(await ev("Page.leaf") == song and await ev("Book.D.folds['%s'].open" % f1) and "carry me over" in await vis(), "going to a line inside a closed fold (from Search) opens the gate")
    # ---- the record, the switch, export ----
    log = " | ".join(await ev("T.log()"))
    ok("You folded 3 lines in “River song”" in log and "You named a fold “Chorus”" in log and "a fold in “River song”" in log and "You removed a fold" in log, "the record has the folding, naming, opening and removing")
    await ev("Mods.set('fold', false)"); await settle(pg)
    ok(await pg.locator(".gate").count() == 0 and await pg.locator("#b_fold.hide").count() == 1 and await vis() == await ev("T.lines()") and await ev("Object.keys(Book.D.folds).length") >= 2, "Fold switched off: gates and button go, every line shows, and the folds are still kept")
    await ev("Mods.set('fold', true)"); await settle(pg); ok(await pg.locator(".gate").count() == 1, "switched on again, the gates are back")
    txt = await ev("Keep.asText(Book)"); ok("FOLDS" in txt and "“Chorus” in “River song”" in txt and "Key: G" in txt, "export lists the folds, their names and details")
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2])); await ctx.close()

async def feel2(br, p, url):
    ctx = await device(br, p, True); pg = await page(ctx, url); ev = pg.evaluate
    await ev("""() => { Page.newLeaf(); const id = Page.leaf, t = []; for (let i = 0; i < 1500; i++) t.push('Line ' + i + ' of a long song that keeps going and going'); Book.act('write', { line: Book.D.leaves[id].lines[0], words: t.join('\\n') });
        const L = Book.D.leaves[id].lines; for (let i = 0; i < 40; i++) { const f = Book.act('fold', { from: L[10 + i * 30], to: L[22 + i * 30], name: i % 4 ? '' : 'Part' }); if (i % 2) Book.act('gate', { fold: f.fold, open: true }); else if (i % 3 === 0) { Book.act('gate', { fold: f.fold, open: true }); const g = Book.act('fold', { from: L[18 + i * 30], to: L[34 + i * 30] }); Book.act('gate', { fold: g.fold, open: true }); } } Page.render(); }""")
    await ev("T.at('Line 705 of', 8)"); await pg.wait_for_timeout(200)
    t = await ev("""async () => { const t0 = performance.now(); for (let i = 0; i < 60; i++) document.execCommand('insertText', false, 'x'); const sync = (performance.now() - t0) / 60; const t1 = performance.now(); document.execCommand('insertParagraph'); const enter = performance.now() - t1; return { sync, enter }; }""")
    C.ok(t["sync"] < 4 and "x" * 60 in await ev("T.lines().join('|')"), "feel 2: a key in a 1,500-line leaf with 50 folds costs %.2f ms of work" % t["sync"])
    C.ok(t["enter"] < 80, "feel 2: Return in it costs %.1f ms" % t["enter"])
    C.ok(await ev("document.documentElement.scrollWidth <= innerWidth"), "feel 2: nothing is wider than the screen"); await ctx.close()

@stage("2")
async def _s2(br, p, url):
    for phone in (True, False): await stage2(br, p, url, phone)
    await feel2(br, p, url)
    for phone in (True, False): await guide(br, p, url, 2, phone)

# ====================================================================== stage 3: Link and the Map
async def stage3(br, p, url, phone):
    who = ("iPhone" if phone else "laptop") + " 3: "; ok = lambda c, m: C.ok(c, who + m)
    ctx = await device(br, p, phone); pg = await page(ctx, url); ev = pg.evaluate
    psalm = await new_leaf(pg, "Psalm 23", "The Lord is my shepherd\nhe leadeth me beside the still waters")
    song = await new_leaf(pg, "River song", SONG); F = lambda t, leaf: "T.find(%s, '%s')" % (json.dumps(t), leaf)
    # ---- link through the page: ⌄ → Link to… → search → label ----
    await ev("T.at('carry me home')"); await ev("T.menu('Link to')"); await pg.fill("#sheet input", "still waters"); await ev("document.querySelector('#sheet [data-line]').click()")
    await pg.fill("#lkLabel", "echoes"); await ev("document.querySelector('#lkOk').click()"); await settle(pg)
    a = await ev(F("carry me home", song)); b = await ev(F("still waters", psalm))
    la = await ev("Link.of('%s')" % a); lb = await ev("Link.of('%s')" % b)
    ok(len(la) == 1 and la[0]["other"] == b and la[0]["label"] == "echoes" and len(lb) == 1 and lb[0]["other"] == a and lb[0]["label"] == "echoes", "Link to…: pick the other line by searching, add a label; both ends know")
    ok(await ev("Page.lineOf('%s').dataset.m" % a) == "∞" and "Linked (echoes)" in await pg.inner_text("#toast"), "the linked line shows ∞, and it says so with Undo")
    # ---- the strip floats; it never moves the page ----
    h0 = await ev("document.querySelector('#head').offsetHeight"); y0 = await ev("Page.lineOf('%s').getBoundingClientRect().top" % a)
    await ev("T.at('carry me home')"); await settle(pg); await settle(pg)
    ok(await pg.locator("#strip:not(.hide) button").count() == 1 and "echoes: he leadeth me" in await pg.inner_text("#strip"), "with the cursor on a linked line, its links show under the top row")
    ok(await ev("document.querySelector('#head').offsetHeight") == h0 and abs(await ev("Page.lineOf('%s').getBoundingClientRect().top" % a) - y0) < 1, "and nothing on the page moves when they appear")
    await ev("T.at('Verse one')"); await settle(pg); await settle(pg); ok(await pg.locator("#strip.hide").count() == 1, "on a line without links, they go")
    # ---- tap ∞ → the other end, wherever it is ----
    box = await pg.locator('#pg > .l[data-m]').bounding_box(); x, y = box["x"] + box["width"] - 12, box["y"] + box["height"] / 2
    if phone and BROWSER != "firefox": await pg.touchscreen.tap(x, y)
    else: await pg.mouse.click(x, y)
    await settle(pg); items = await ev("[...document.querySelectorAll('#menu button')].map(b => b.textContent)")
    ok(len(items) >= 2 and items[0].startswith("echoes → he leadeth me beside") and "Psalm 23" in items[0], "tapping ∞ lists the line's links: " + items[0])
    await ev("document.querySelector('#menu button').click()"); await settle(pg)
    ok(await ev("Page.leaf") == psalm and await ev("document.querySelector('#pg .l.flash').textContent") == "he leadeth me beside the still waters" and await ev("Page.lineOf('%s').dataset.m" % b) == "∞", "tapping a link jumps to the other line, which shows ∞ too")
    # ---- labels are the kinds; each gets its own color ----
    await ev("Book.act('link', { from: '%s', to: %s, label: 'rhymes with' })" % (a, F("carry me over", song))); r = await ev("Book.act('link', { from: '%s', to: %s })" % (a, F("Verse two", song)))
    await ev("Book.act('link', { from: %s, to: '%s', label: 'Echoes' })" % (F("The Lord", psalm), a))
    cols = await ev("Link.of('%s').map(x => [x.label, x.color])" % a); cd = dict((c[0].lower(), c[1]) for c in cols)
    ok(len(cols) == 4 and cd["echoes"] != cd["rhymes with"] and cd[""] != cd["echoes"] and len(set(c[1] for c in cols if c[0].lower() == "echoes")) == 1, "each label has its own color, the same wherever it's used; a link without a label is plain: " + json.dumps(cd))
    dup = await ev("Book.act('link', { from: '%s', to: '%s', label: 'ECHOES' })" % (b, a)); me = await ev("Book.act('link', { from: '%s', to: '%s' })" % (a, a))
    ok(dup["ok"] is False and "already linked" in dup["why"] and me["ok"] is False, "the same link twice, or a line to itself, is refused with the reason")
    ok(await ev("Link.labels().join()") in ("echoes,rhymes with,Echoes", "echoes,Echoes,rhymes with", "Echoes,echoes,rhymes with", "echoes,rhymes with"), "the labels you typed are the kinds on offer next time")
    # ---- remove, relabel, Undo; a deleted line's links wait for it ----
    await ev("Book.act('relabel', { link: '%s', label: 'see also' })" % r["link"]); ok(any(x["label"] == "see also" for x in await ev("Link.of('%s')" % a)), "a link's label can be changed")
    await ev("Book.act('unlink', { link: '%s' })" % r["link"]); ok(len(await ev("Link.of('%s')" % a)) == 3, "a link can be removed")
    await ev("Page.doUndo()"); ok(len(await ev("Link.of('%s')" % a)) == 4, "and Undo brings it back")
    await ev("Page.go('%s')" % psalm); await ev("Book.act('prune', { line: '%s' })" % b); n1 = len(await ev("Link.of('%s')" % a)); await ev("Page.doUndo()")
    ok(n1 == 3 and len(await ev("Link.of('%s')" % a)) == 4, "delete a linked line and its link goes quiet; bring the line back and the link is there again")
    # ---- the map ----
    await ev("Page.go('%s')" % song); await ev("T.at('carry me home')"); await ev("MapView.open()"); await settle(pg)
    up = await ev("[...document.querySelectorAll('#sheet .mup .mn')].map(e => e.textContent)"); here = await pg.inner_text("#mHere"); web = await pg.locator("#sheet .mn.web").count()
    ok(up == ["Trunk", "River song", "Chorus"] and "carry me home" in here and web == 4, "the Map centers on your line: above, what it grew from, back to the trunk; to the sides, its links: " + json.dumps(up))
    ok(await pg.locator("#mapSvg .web").count() == 4 and await pg.locator("#mapSvg .tree").count() >= 3, "branches and links are drawn as lines to the center")
    await ev("document.querySelector('#sheet [data-only=\"rhymes with\"]').click()"); await settle(pg)
    ok(await pg.locator("#sheet .mn.web").count() == 1 and "carry me over" in await pg.inner_text("#sheet .mn.web"), "filtered by label: only those links show")
    await ev("document.querySelector('#sheet [data-only=\"\"]').click()"); await ev("[...document.querySelectorAll('#sheet .mup .mn')].pop().click()"); await settle(pg)
    down = await ev("[...document.querySelectorAll('#sheet .mdown .mn')].map(e => e.textContent)")
    ok("Chorus" in await pg.inner_text("#mHere") and down == ["carry me over", "carry me home"], "tap a node and the map centers on it; below it, what grows from it: " + json.dumps(down))
    await ev("document.querySelector('#sheet .mup .mn.up').click()"); await settle(pg); down = await ev("[...document.querySelectorAll('#sheet .mdown .mn')].map(e => e.textContent)")
    ok("River song" in await pg.inner_text("#mHere") and down == ["Verse one", "Chorus", "Verse two"], "a line with a leaf shows the leaf's lines growing from it")
    await ev("document.querySelector('#sheet [data-c=\"\"]').click()"); await settle(pg)
    ok("Trunk" in await pg.inner_text("#mHere") and "Psalm 23" in await pg.inner_text("#sheet .mdown"), "the trunk is the top of the map")
    await ev("document.querySelector('#mBack').click()"); await ev("document.querySelector('#mBack').click()"); await ev("document.querySelector('#mGo').click()"); await settle(pg)
    ok(await ev("Page.leaf") == song and await ev("document.querySelector('#pg .l.flash').textContent") == "Chorus", "Back on the map retraces your steps; Go there opens the line")
    before = await ev("JSON.stringify(Book.D)"); await ev("MapView.open()"); await ev("Page.closeSheet(true)"); ok(await ev("JSON.stringify(Book.D)") == before, "the map only looks: it changes nothing")
    # ---- the record, the switches, export ----
    log = " | ".join(await ev("T.log()")); ok("You linked two lines (echoes)" in log and "You removed a link" in log, "the record has the linking and unlinking")
    await ev("Mods.set('link', false)"); await settle(pg); await ev("MapView.open('%s')" % a); await settle(pg)
    ok(await pg.locator("#pg > .l[data-m]").count() == 0 and await pg.locator("#sheet .mn.web").count() == 0 and await ev("Object.keys(Book.D.links).length") == 4, "Link switched off: the ∞ marks and the map's sides go; the links are kept")
    await ev("Page.closeSheet(true)"); await ev("Mods.set('link', true)"); await ev("Mods.set('map', false)"); await ev("document.querySelector('#tMenu').click()")
    ok("Map" not in await ev("[...document.querySelectorAll('#menu button')].map(b => b.textContent)") and await pg.locator("#pg > .l[data-m]").count() >= 1, "the Map has its own switch"); await ev("Page.closeMenu()"); await ev("Mods.set('map', true)")
    txt = await ev("Keep.asText(Book)"); ok("LINKS" in txt and "“carry me home” <-> “he leadeth me beside the still waters”  (echoes)" in txt, "export lists the links and their labels")
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2])); await ctx.close()

@stage("3")
async def _s3(br, p, url):
    for phone in (True, False): await stage3(br, p, url, phone)
    for phone in (True, False): await guide(br, p, url, 3, phone)

# ====================================================================== stage 4: Bookmarks
async def stage4(br, p, url, phone):
    who = ("iPhone" if phone else "laptop") + " 4: "; ok = lambda c, m: C.ok(c, who + m)
    ctx = await device(br, p, phone); pg = await page(ctx, url); ev = pg.evaluate
    other = await new_leaf(pg, "Psalm 23", "The Lord is my shepherd"); song = await new_leaf(pg, "River song", SONG)
    await ev("T.at('Verse two')"); await tap(pg, "#tMark", phone); await settle(pg)
    m = await ev("Marks.list()[0]"); line = await ev("T.find('Verse two')")
    ok(m["leaf"] == song and m["line"] == line and m["title"] == "River song · Verse two" and abs(m["at"] - await ev("Date.now()")) < 5000, "🔖 saves where you were, filled in by itself: the leaf, the line and the time")
    ok(await pg.locator("#sheet [data-f]").count() == 5 and "River song · Verse two" in await pg.inner_text("#sheet"), "its card opens with five optional lines: doing, waiting for, why, done looks like, meanwhile")
    await pg.fill('#sheet [data-f="waiting"]', "a second line"); await ev("document.querySelector('#sheet [data-f=waiting]').dispatchEvent(new Event('change'))"); await pg.fill('#sheet [data-f="doing"]', "writing verse two")
    await ev("[...document.querySelectorAll('#cdRow button')].pop().click()"); await settle(pg)
    m = await ev("Marks.list()[0]"); ok(m.get("waiting") == "a second line" and m.get("doing") == "writing verse two" and "why" not in m, "the lines you fill in are kept (even one typed just before Close); the rest stay empty")
    ok(await ev("Page.lineOf('%s').dataset.m" % line) == "⚑", "the bookmarked line shows ⚑")
    await ev("Page.go('%s')" % other); await ev("Marks.openList()"); txt = await pg.inner_text("#sheet")
    ok("Left waiting" in txt and "River song · Verse two" in txt and "What I was doing: writing verse two" in txt, "☰ → Bookmarks lists what's left waiting, with its first line")
    await ev("document.querySelector('#sheet [data-j]').click()"); await settle(pg)
    ok(await ev("Page.leaf") == song and await ev("document.querySelector('#pg .l.flash').textContent") == "Verse two", "tapping it jumps back to the leaf and the line")
    await ev("Marks.openList()"); await ev("document.querySelector('#sheet [data-d]').click()"); txt = await pg.inner_text("#sheet")
    ok("Nothing is waiting" in txt and "Done (kept as a record)" in txt and "River song · Verse two" in txt and await ev("!!Marks.list()[0].done"), "Done: it leaves the waiting list and stays below as a record")
    await ev("Page.closeSheet(true)"); ok(await ev("Page.lineOf('%s').dataset.m || ''" % line) == "", "and its ⚑ leaves the line")
    await ev("Marks.openCard(Marks.list()[0].id)"); await ev("document.querySelector('#cdRow button').click()"); ok(await ev("Marks.waiting().length") == 1, "Not done after all puts it back")
    await ev("Page.closeSheet(true)"); await ev("Page.doUndo()"); ok(await ev("!!Marks.list()[0].done"), "Undo works on bookmarks too"); await ev("Book.act('markdone', { mark: Marks.list()[0].id, done: false })")
    await ev("Book.act('prune', { line: '%s' })" % line); await ev("Page.go('%s')" % other); await ev("Marks.jump(Marks.list()[0])"); await settle(pg)
    ok(await ev("Page.leaf") == song and "is gone" in await pg.inner_text("#msg") and await ev("Marks.list().length") == 1, "if its line was deleted, the bookmark is kept and takes you to its leaf, saying so")
    await ev("Page.doUndo()")
    log = " | ".join(await ev("T.log()")); ok("You left a bookmark in “River song”" in log and "You finished a bookmark" in log, "the record has the bookmark and its finishing")
    await ev("Mods.set('marks', false)"); await settle(pg); ok(await pg.locator("#tMark.hide").count() == 1 and await ev("Marks.list().length") == 1, "Bookmarks switched off: 🔖 goes, the bookmarks are kept"); await ev("Mods.set('marks', true)")
    ok("BOOKMARKS" in await ev("Keep.asText(Book)") and "waiting: a second line" in await ev("Keep.asText(Book)"), "export lists the bookmarks and their lines")
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2])); await ctx.close()

async def sync2(br, p, url):
    """Folds, names, details, links and bookmarks travel between devices too."""
    gh = FakeGitHub(); gh.refs["tol-data"] = "d" * 40; A = await device(br, p, False, gh); Bc = await device(br, p, True, gh)
    for ctx in (A, Bc): await ctx.add_init_script("try { localStorage.setItem('tol-gh-token', JSON.stringify('ghp_test')); } catch (e) {}")
    a = await page(A, url); song = await new_leaf(a, "River song", SONG); ps = await new_leaf(a, "Psalm 23", "he leadeth me beside the still waters")
    await a.evaluate("(() => { const f = Book.act('fold', { from: T.find('Chorus', '%s'), name: 'Chorus' }); Book.act('detail', { fold: f.fold, key: 'Key', value: 'G' }); Book.act('link', { from: T.find('carry me home', '%s'), to: T.find('still waters', '%s'), label: 'echoes' }); Book.act('mark', { line: T.find('Verse two', '%s'), waiting: 'a rhyme' }); Book.act('gather', { name: 'Water', search: 'river' }); })()" % (song, song, ps, song))
    await a.evaluate("Lock.turnOn('willow bridge candle seven')"); await a.wait_for_function("Lock.label().indexOf('Synced') === 0")
    b = await page(Bc, url); await b.evaluate("Lock.turnOn('willow bridge candle seven')"); await b.wait_for_function("!!T.leafNamed('River song')"); await settle(b)
    got = await b.evaluate("(() => { const s = T.leafNamed('River song'); return { pieces: Fold.pieces('Chorus').length, key: (Fold.pieces('Chorus')[0].details || {}).Key, links: Link.of(T.find('carry me home', s)).map(x => x.label + ':' + x.text), marks: Marks.waiting().map(m => m.title + '|' + m.waiting), names: Fold.names().map(n => n.name).join() }; })()")
    C.ok(got == {"pieces": 1, "key": "G", "links": ["echoes:he leadeth me beside the still waters"], "marks": ["River song · Verse two|a rhyme"], "names": "Chorus,Water"}, "sync 2: folds with their names and details, links, bookmarks and gatherings all arrive on the other device " + json.dumps(got))
    await b.evaluate("(() => { Book.act('markdone', { mark: Marks.list()[0].id }); const s = T.leafNamed('River song'); Book.act('unlink', { link: Link.of(T.find('carry me home', s))[0].id }); Book.flush(); return Lock.syncNow(true); })()"); await b.wait_for_timeout(500)
    await a.evaluate("Lock.syncNow()"); await a.wait_for_function("Marks.waiting().length === 0")
    C.ok(await a.evaluate("Link.of(T.find('carry me home', '%s')).length" % song) == 0 and await a.evaluate("Marks.list().length") == 1, "sync 2: a bookmark finished and a link removed on the phone are so on the laptop")
    C.ok(a.errs == [] and b.errs == [], "sync 2: no errors " + str((a.errs + b.errs)[:2])); await A.close(); await Bc.close()

@stage("4")
async def _s4(br, p, url):
    for phone in (True, False): await stage4(br, p, url, phone)
    await sync2(br, p, url)
    for phone in (True, False): await guide(br, p, url, 4, phone)

#STAGES-BELOW

async def main():
    port = 8811; serve(port); url = "http://localhost:%d/" % port
    async with async_playwright() as p:
        br = await launch(p)
        for n in sorted(STAGES):
            if ONLY and n not in ONLY: continue
            for fn in STAGES[n]: await fn(br, p, url)
        await br.close()
    print("\n%d passed, %d failed" % (C.passes, C.fails)); sys.exit(1 if C.fails else 0)

if __name__ == "__main__": asyncio.run(main())
