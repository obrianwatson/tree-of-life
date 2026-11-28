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
    await ev("T.at('carry me')"); await ev("""(() => { const dt = new DataTransfer(); dt.setData('text/plain', ' home\\n\\tover the water\\n\\t\\tslow\\nBridge'); document.querySelector('#pg').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()""")
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
