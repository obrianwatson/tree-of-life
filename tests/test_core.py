"""BOLW Core (docs/core/): leaves, folds (what's within a line), links, the map, bookmarks, the fast AI, commands, automations,
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
  dom: () => [...document.querySelectorAll('#pg > *')].map(e => e.classList.contains('gate') ? '[' + e.textContent + ']' : (e.dataset.w || '') + e.textContent),
  words: () => [...document.querySelectorAll('#pg > *')].map(e => e.classList.contains('gate') ? '[' + e.textContent + ']' : e.textContent),
  select: (a, ao, b, bo) => { const ea = Page.lineOf(T.find(a)), eb = Page.lineOf(T.find(b)), r = document.createRange(); r.setStart(ea.firstChild.nodeType === 3 ? ea.firstChild : ea, ao); r.setEnd(eb.firstChild.nodeType === 3 ? eb.firstChild : eb, bo == null ? eb.textContent.length : bo); const s = getSelection(); document.querySelector('#pg').focus(); s.removeAllRanges(); s.addRange(r); return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); },
  leafNamed: name => B.leaves().find(id => B.title(id) === name),
  text: leaf => B.textOf(leaf || Page.leaf),
  menu: label => { const it = Page.menuItems().find(i => i && i[0].indexOf(label) === 0); if (!it) return false; it[1](); return true; },
  canon: () => { const srt = o => Array.isArray(o) ? o.map(srt) : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((a, k) => { a[k] = srt(o[k]); return a; }, {}) : o; return JSON.stringify(srt(D())); },
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

async def typed(pg, after, text):
    """The cursor goes to the end of the line that has `after`; Return; type `text`; Return. (It first makes sure the page really has the keyboard.)"""
    for _ in range(3):
        await pg.evaluate("T.at(%s)" % json.dumps(after)); await settle(pg); n = await pg.evaluate("T.lines().length"); await pg.keyboard.press("Enter"); await settle(pg)
        if await pg.evaluate("T.lines().length") == n + 1: break
        await pg.wait_for_timeout(150)
    await pg.keyboard.type(text); await pg.keyboard.press("Enter"); await settle(pg)

RUN = "async push => { for (let i = 0; i < 150; i++) { if (!Lock.busy) { const n = Lock.runs; await Lock.syncNow(push); if (Lock.runs > n) return true; } await new Promise(r => setTimeout(r, 100)); } return false; }"
async def push(pg):
    """This device's changes are sent, for certain: it waits out a sync that is already running, then runs its own to the end."""
    await pg.evaluate("Book.flush()"); await pg.evaluate(RUN, True)
async def pull(pg, until=None):
    """This device reads the others (and sends its own), again if it must, until `until` is true."""
    for _ in range(25):
        await pg.evaluate(RUN, False)
        if until is None or await pg.evaluate(until): return True
        await pg.wait_for_timeout(250)
    return False

# ====================================================================== stage 1: the core plus Grow, the clock and Hold
async def stage1(br, p, url, phone):
    who = ("iPhone" if phone else "laptop") + " 1: "; ok = lambda c, m: C.ok(c, who + m)
    ctx = await device(br, p, phone); pg = await page(ctx, url); ev = pg.evaluate
    same = lambda: ev("JSON.stringify(T.words()) === JSON.stringify(T.lines())")

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
    ok(pasted == [["carry me home", "over the water", "slow", "Bridge"], [0, 1, 2, 0]] and await same(), "pasting several lines; lines that start with tabs come in within the line above " + json.dumps(pasted))
    await ev("Page.doUndo()"); await settle(pg)
    # reopen on the exact spot
    await ev("T.at('and the banks', 7)"); await pg.wait_for_timeout(750); await pg.reload(); await ready(pg)
    spot = await ev("Page.ui.spots[Page.leaf] || {}")
    ok(await ev("Book.title(Page.leaf)") == "River song" and spot.get("at") == 7 and await ev("Book.D.lines['%s'].text" % spot.get("line")) == "and the banks are low", "it reopens on the same leaf and the exact spot")
    await ctx.set_offline(True); await ev("T.at('carry me')"); await pg.keyboard.type(" home"); await ev("Book.flush()")
    ok("carry me home" in await ev("localStorage.getItem(Keep.K.book)"), "offline: writing is still saved on the device"); await ctx.set_offline(False)

    # ---- Fold a line into the line above (what used to be called a branch) ----
    await ev("T.at('the river Jordan')"); await (tap(pg, "#b_in", phone) if phone else pg.keyboard.press("Tab"))
    await ev("T.at('and the banks')"); await (tap(pg, "#b_in", phone) if phone else pg.keyboard.press("Tab"))
    await ev("T.at('carry me home')"); await tap(pg, "#b_in", phone)
    ok(await ev("T.depths()") == [0, 1, 1, 0, 1] and await ev("T.text()") == "Verse one\n    the river Jordan is high\n    and the banks are low\nChorus\n    carry me home", "⇥ (or Tab) folds a line into the one above: it is within that line now")
    pad = await ev("[...document.querySelectorAll('#pg > .l')].map(e => parseFloat(getComputedStyle(e).paddingLeft))")
    ok(pad[1] > pad[0] and pad[1] == pad[2] and pad[3] == pad[0], "what's within a line is drawn indented under it, and the line gets a ▾ " + str(await ev("[...document.querySelectorAll('#pg > .l')].map(e => e.dataset.w || '')")))
    await ev("T.at('Verse one')"); r = await ev("Book.act('foldin', { line: T.find('Verse one'), dir: 1 })")
    ok(r["ok"] is False and "no line above" in r["why"], "the first line has nothing to fold into: refused, with the reason")
    await ev("T.at('and the banks', 0)"); await pg.keyboard.press("Backspace")
    ok(await ev("T.depths()") == [0, 1, 0, 0, 1] and await ev("T.lines().length") == 5, "Backspace at the start of a line within another takes it out of that fold first")
    await (tap(pg, "#b_in", phone) if phone else pg.keyboard.press("Tab"))
    await ev("T.at('Verse one')"); await ev("Book.act('foldin', { line: T.find('Chorus'), dir: 1 })"); await ev("Book.act('foldin', { line: T.find('Chorus'), dir: -1 })")
    ok(await ev("T.depths()") == [0, 1, 1, 0, 1], "a line folds in and comes out with everything within it")

    # ---- Move, with what's within it ----
    await ev("Page.render()"); await ev("T.at('Chorus')"); await ev("T.menu('Move up')"); await settle(pg)
    ok(await ev("T.text()") == "Chorus\n    carry me home\nVerse one\n    the river Jordan is high\n    and the banks are low" and await same(), "Move up takes the line and what's within it past the one above")
    await ev("T.menu('Move down')"); r = await ev("Book.act('move', { line: T.find('Chorus'), dir: 'down' })")
    ok(await ev("T.lines()[0]") == "Verse one" and r["ok"] is False and "further" in r["why"], "Move down brings it back; at the end it says so")

    # ---- Lift a fold onto its own page (a leaf) ----
    await ev("T.at('Verse one')"); await ev("T.menu('Lift what\\'s within')"); await settle(pg)
    v1 = await ev("Book.D.lines[T.find('Verse one')].leaf")
    ok(bool(v1) and await ev("T.lines()") == ["Verse one", "Chorus", "carry me home"] and await ev("T.lines('%s')" % v1) == ["the river Jordan is high", "and the banks are low"] and await ev("T.depths('%s')" % v1) == [0, 0], "Lift: what's within the line becomes its own page (a leaf), still within that line")
    box = await pg.locator('#pg > .l.lf').bounding_box()
    if phone and BROWSER != "firefox": await pg.touchscreen.tap(box["x"] + box["width"] - 12, box["y"] + box["height"] / 2)
    else: await pg.mouse.click(box["x"] + box["width"] - 12, box["y"] + box["height"] / 2)
    await settle(pg)
    ok(await ev("Page.leaf") == v1 and (await pg.inner_text("#crumbs")).replace("\n", "").replace(" ", "") == "Trunk›Riversong›Verseone", "tapping › opens the leaf; the path shows Trunk › River song › Verse one")
    await pg.fill("#ttl", "Verse 1"); song = await ev("Book.parentLeaf(Page.leaf)")
    ok(await ev("T.lines('%s')[0]" % song) == "Verse 1" and await ev("Book.title(Page.leaf)") == "Verse 1", "renaming a leaf renames the line it is within (they are the same words)")
    await tap(pg, "#tBack", phone); a = await ev("Page.leaf"); await tap(pg, "#tFwd", phone)
    ok(a == song and await ev("Page.leaf") == v1, "Back and Forward walk the leaves you visited")
    await tap(pg, "#tBack", phone)
    # move a line to another leaf; never inside itself
    await ev("Book.act('move', { line: T.find('carry me home'), leaf: '%s' })" % v1)
    ok(await ev("T.lines('%s')" % v1) == ["the river Jordan is high", "and the banks are low", "carry me home"] and await ev("T.lines()") == ["Verse 1", "Chorus"], "Move to… sends a line to another leaf")
    r = await ev("Book.act('move', { line: T.find('Verse 1'), leaf: '%s' })" % v1)
    ok(r["ok"] is False and "within itself" in r["why"], "a line can't be moved onto its own page")
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
    ok(n == 1 and "the river Jordan is high" in txt and "within Verse 1" in txt, "Search finds a line in another leaf")
    await ev("document.querySelector('#sheet [data-line]').click()"); await settle(pg)
    ok(await ev("Page.leaf") == v1 and await ev("!!document.querySelector('#pg .l.flash')") and await pg.locator("#sheet.hide").count() == 1, "tapping the result goes to that leaf and line")

    # ---- the record of every move ----
    log = await ev("T.log()"); joined = " | ".join(log)
    need = ["You wrote in “River song”", "You folded “the river Jordan is high” into “Verse one” in “River song”", "You lifted what's within “Verse one” onto its own page", "You moved a line (and what's within it) up in “River song”", "You deleted “Verse 1” from “River song”", "You brought back “Verse 1”", "You undid"]
    ok(all(any(n in l for l in log) for n in need), "the record has every move, who made it and where: " + str([n for n in need if not any(n in l for l in log)]) + joined[:600])
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
    ok(all(m in mods for m in ["clock", "search", "fold"]) and "grow" not in mods, "Settings lists every module with its switch (folding within is Fold's): " + ",".join(mods))
    await ev("document.querySelector('#sheet [data-mod=fold]').click()"); await ev("Page.closeSheet(true)"); await ev("T.at('Chorus')")
    r = await ev("Book.act('foldin', { line: T.find('carry me'), dir: 1 })")
    ok(await pg.locator("#b_in.hide").count() == 1 and r["ok"] is False and "switched off" in r["why"] and await pg.locator("#pg > .l.wi").count() == 0, "Fold switched off: its buttons and marks go and its actions are refused")
    ok(await ev("Book.alive('%s')" % v1) and await ev("T.lines('%s').length" % v1) == 2 and await pg.locator("#pg > .l.lf").count() == 1, "but nothing it made is deleted: the lifted leaf is still there " + json.dumps(await ev("[Book.alive('%s'), T.lines('%s'), T.lines(), document.querySelectorAll('#pg > .l.lf').length, Book.title(Page.leaf)]" % (v1, v1))))
    await ev("Mods.set('fold', true)"); ok(await pg.locator("#b_in.hide").count() == 0, "switched back on, it's all there again")
    await ev("Mods.set('clock', false)"); ok(await pg.locator(".clock.hide").count() == 1 and await pg.locator(".hold.hide").count() == 1, "the clock and Hold have their own switch"); await ev("Mods.set('clock', true)")

    # ---- rings and export ----
    rings = await ev("Keep.rings().then(a => a.map(r => r.title))")
    ok("River song" in rings, "rings: the leaf as it was is kept before it changes")
    n0 = await ev("Book.leaves().length"); await ev("Keep.rings(Page.leaf).then(a => Page.go(Book.copyIn(a[a.length - 1].piece, '(as it was)')))"); await settle(pg)
    ok(await ev("Book.leaves().length") == n0 + 1 and "(as it was)" in await ev("Book.title(Page.leaf)") and await ev("T.lines('%s')[0]" % song) == "Verse 1", "a ring comes back as a NEW leaf beside the one you have " + json.dumps(await ev("[Book.leaves().length, Book.title(Page.leaf), T.lines('%s')]" % song)) + str(n0))
    await ev("Settings.open()")
    async with pg.expect_download() as d: await ev("document.querySelector('#sTxt').click()")
    txt = open(await (await d.value).path(), encoding="utf-8").read()
    ok("River song\n    Verse 1\n        the river Jordan is high" in txt and "Seeds" in txt, "export to read: one plain text file, what's within a line indented under it, lifted pages under their lines " + json.dumps(txt[:500]))
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
    t = await ev("""async () => { const t0 = performance.now(); for (let i = 0; i < 60; i++) document.execCommand('insertText', false, 'x'); const sync = (performance.now() - t0) / 60; let enter = 1e9; for (let k = 0; k < 3; k++) { await new Promise(r => setTimeout(r, 120)); const t1 = performance.now(); document.execCommand('insertParagraph'); enter = Math.min(enter, performance.now() - t1); } return { sync, enter }; }""")
    C.ok(t["sync"] < 4 and "x" * 60 in await ev("T.lines().join('|')"), "feel: a key in a 1,500-line leaf costs %.2f ms of work, and every key landed" % t["sync"])
    C.ok(t["enter"] < 60 and await ev("T.lines().length") == 1503 and await ev("JSON.stringify(T.words()) === JSON.stringify(T.lines())"), "feel: Return in the middle of it costs %.1f ms (the quickest of three)" % t["enter"])
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
    mp = await b.evaluate("T.leafNamed('Morning pages')"); await b.evaluate("Page.go('%s')" % mp); await b.evaluate("T.at('the river is high today')"); await b.keyboard.type(" and loud"); await b.keyboard.press("Enter"); await b.keyboard.type("from the phone"); await b.evaluate("Fold.foldIn(1)")
    await push(b); await pull(a, "Book.textOf('%s').indexOf('    from the phone') > 0" % mp)
    C.ok(await a.evaluate("Book.textOf('%s')" % mp) == "the river is high today and loud\n    from the phone" and "a line from the phone" in await a.evaluate("T.lines(Book.D.trunk)"), "sync: writing and a branch made on the phone arrive on the laptop")
    await settle(a)
    C.ok(await a.evaluate("Page.leaf") == mp and await a.evaluate("JSON.stringify(T.words()) === JSON.stringify(T.lines())"), "sync: the open leaf is redrawn with what arrived")
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
    await b.evaluate("Book.act('write', { line: Book.D.leaves['%s'].lines[0], at: 0, words: 'idea ' })" % seeds); await push(b)
    await pull(a, "Book.textOf(Book.D.trunk, '', true).indexOf('idea ') >= 0"); await push(a); await pull(b); await push(b); await pull(a); await pull(b)
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
        before = await pg.evaluate(snap); rec = await pg.evaluate("Log.all().then(a => a.length)"); await pg.wait_for_timeout(3); await pg.evaluate("Guide.demo(Guide.STAGES[%d].tasks[%d].show)" % (n, i))
        C.ok(await pg.evaluate(snap) == before and await pg.evaluate("Log.all().then(a => a.length)") == rec and await pg.locator("#shield.hide").count() == 1 and pg.errs == [], who + "Show me %d runs and puts everything back %s" % (i + 1, str(pg.errs[:1]) if pg.errs else ""))
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
    W = lambda t: "(() => { const F = Fold.withinOf(T.find('%s')); return F ? F.id : null; })()" % t
    # ---- what's within a line: ▾ open, ▸ closed ----
    d = await vis()
    ok(d == ["▾Verse one", "the river is high", "and the banks are low", "▾Chorus", "carry me over", "carry me home", "▾Verse two", "the rain came down"], "a line with lines within it shows ▾ before it " + json.dumps(d))
    tw = await ev("(() => { const e = Page.lineOf(T.find('Chorus')), r = e.getBoundingClientRect(); return [r.left + parseFloat(getComputedStyle(e).paddingLeft) - 10, r.top + 12]; })()")
    if phone and BROWSER != "firefox": await pg.touchscreen.tap(tw[0], tw[1])
    else: await pg.mouse.click(tw[0], tw[1])
    await settle(pg); d = await vis()
    ok(d == ["▾Verse one", "the river is high", "and the banks are low", "▸Chorus", "▾Verse two", "the rain came down"] and await ev("T.lines().length") == 8, "tap ▾ before Chorus: what's within it folds away, the mark turns to ▸ (the words are all still in the book)")
    await ev("T.at('Chorus')"); ok(await pg.inner_text("#b_fold") == "Open", "with the cursor on a closed line, the bar's Fold says Open")
    await tap(pg, "#b_fold", phone); await settle(pg); ok("carry me over" in await vis() and (await vis())[3] == "▾Chorus" and await pg.inner_text("#b_fold") == "Fold", "Open opens it again")
    await tap(pg, "#b_fold", phone); await settle(pg); ok((await vis())[3] == "▸Chorus" and "Folded what's within “Chorus”" in await pg.inner_text("#toast"), "Fold on a line with something within it: closes it, and offers to name the fold")
    f1 = await ev(W("Chorus")); ok(bool(f1) and await ev("Book.D.folds['%s'].within" % f1) and await ev("!Book.D.folds['%s'].open" % f1), "the fold is the line's own: it keeps whether it is open")
    await ev("Book.act('gate', { line: T.find('Chorus'), open: true })"); await ev("Page.render()")
    # ---- fold a line with nothing within it: a space opens within it ----
    await ev("T.at('the rain came down')"); await tap(pg, "#b_fold", phone); await settle(pg); await pg.keyboard.type("and the roof sang back")
    ok(await ev("T.lines()[8]") == "and the roof sang back" and await ev("T.depths()[8]") == 2 and (await vis())[7] == "▾the rain came down", "Fold on a line with nothing within it: a space opens within it, and you write in it")
    await ev("T.at('and the roof')"); await ev("Fold.foldIn(1)"); r = await ev("Book.act('foldin', { line: T.find('and the roof'), dir: 1 })")
    ok(r["ok"] is False and "already within" in r["why"], "a line already within the line above can't fold further into it")
    # folds within folds: closing Verse two hides everything within it, however deep
    await ev("Book.act('gate', { line: T.find('Verse two'), open: false })"); await ev("Page.render()"); d = await vis()
    ok(d[-1] == "▸Verse two" and "and the roof sang back" not in d, "folds within folds: closing a line hides everything within it, however deep")
    await ev("Book.act('gate', { line: T.find('Verse two'), open: true })"); await ev("Page.render()")
    # ---- trace back: the path follows the line's folds ----
    await ev("T.at('and the roof')"); await settle(pg); cr = (await pg.inner_text("#crumbs")).replace("\n", "")
    ok(cr.endswith("River song›Verse two›the rain came down"), "trace back: the path at the top follows the line you're on, fold by fold, to the trunk: " + cr)
    await ev("document.querySelectorAll('#crumbs button.wi')[0].click()"); await settle(pg); ok(await ev("Book.D.lines[Page.pos.line].text") == "Verse two", "tap a fold in the path to go to its line")
    await ev("T.at('and the roof')"); await ev("Page.doDelete()"); await ev("T.at('the rain came down')"); await settle(pg)
    # ---- writing within a fold ----
    await ev("T.at('carry me home')"); await pg.keyboard.press("Enter"); await pg.keyboard.type("all the way")
    ok(await ev("T.depths()[6]") == 1 and (await ev("T.lines()"))[6] == "all the way", "Return at the end of a line within a fold: the new line is within it too")
    await pg.keyboard.press("Enter"); await pg.keyboard.press("Enter"); await pg.keyboard.type("Bridge")
    ok(await ev("T.lines().slice(6, 8)") == ["all the way", "Bridge"] and await ev("T.depths()[7]") == 0, "Return on an empty last line within a fold steps out of it")
    for _ in range(5): await ev("Page.doUndo()")
    await settle(pg); ok(await ev("T.lines()") == ["Verse one", "the river is high", "and the banks are low", "Chorus", "carry me over", "carry me home", "Verse two", "the rain came down"], "Undo walks all of that back " + json.dumps(await ev("T.lines()")))
    await ev("Book.act('gate', { line: T.find('Chorus'), open: false })"); await ev("Page.render()"); n0 = await ev("T.lines().length"); await ev("T.select('and the banks', 3, 'Verse two', 2)"); await pg.keyboard.press("Backspace"); await settle(pg)
    ok(await ev("T.lines().length") == n0 and "closed fold" in await pg.inner_text("#msg"), "deleting across a closed fold is refused: what's within it is never typed away by accident")
    await ev("Book.act('gate', { line: T.find('Chorus'), open: true })"); await ev("Page.render()")
    # ---- several lines together behind a gate; gates overlap ----
    await ev("T.select('carry me over', 0, 'Verse two', 5)"); await tap(pg, "#b_fold", phone); await settle(pg)
    g1 = await ev("Fold.foldsOf(Page.leaf).find(f => !f.within && !f.place).id")
    ok(await ev("Book.D.lines[Book.D.folds['%s'].from].text" % g1) == "carry me over" and await ev("Book.D.lines[Book.D.folds['%s'].to].text" % g1) == "Verse two" and "[▸ carry me over3 lines⋯]" in await vis(), "Fold on several lines: they fold together behind a gate, exactly the lines the selection touches")
    ok("behind a gate" in await pg.inner_text("#toast"), "it says so")
    await tapgate(g1); bg = await ev("[...document.querySelectorAll('#pg > .l')].map(e => e.style.backgroundImage ? 1 : 0)")
    ok(bg == [0, 0, 0, 0, 1, 1, 1, 0], "an open gate fold shows as a colored line in the margin beside its lines")
    await ev("T.select('carry me home', 0, 'the rain came down', 3)"); await tap(pg, "#b_fold", phone); await settle(pg)
    g2 = await ev("Fold.foldsOf(Page.leaf).find(f => !f.within && !f.place && f.id !== '%s').id" % g1)
    await tapgate(g2); pos = await ev("[...document.querySelectorAll('#pg > .l')].map(e => e.style.backgroundPosition)")
    ok(pos[5] != "" and "," in pos[5] and pos[4] != pos[7], "two gate folds overlap: open together, each has its own lane; the lines they share show both")
    await tapgate(g1); d = await vis(); ok(d.count("[▸ carry me over3 lines⋯]") == 1 and any(x.startswith("[▾ carry me home") for x in d), "close one: its lines hide; the overlapping gate stays " + json.dumps(d))
    await ev("Book.act('gate', { line: T.find('Verse one'), open: false })"); g3 = (await ev("Book.act('fold', { from: T.find('the river is high'), to: T.find('and the banks are low') })"))["fold"]; await ev("Page.render()")
    ok(await pg.locator(".gate").count() == 2, "a gate within a closed line stays hidden until the line opens")
    await ev("Book.act('gate', { line: T.find('Verse one'), open: true })")
    for fid in (g1, g2, g3): await ev("Book.act('unfold', { fold: '%s' })" % fid)
    await ev("Page.render()"); ok(await pg.locator(".gate").count() == 0 and await ev("T.lines().length") == 8, "Remove the gate: it goes, every line stays")
    # ---- names: a fold named the same in two songs is one gathering ----
    await ev("T.at('Chorus')"); await ev("T.menu('Name this fold')"); await pg.fill("#fnName", "Chorus"); await ev("document.querySelector('#fnOk').click()"); await settle(pg)
    ok(await ev("Book.D.folds['%s'].name" % f1) == "Chorus" and "gathers 1 piece" in await pg.inner_text("#toast"), "⌄ → Name this fold… names the line's fold")
    song2 = await new_leaf(pg, "Desert road", "Verse\n\trivers in the desert\nRefrain\n\tmake a way")
    r = await ev("Book.act('fold', { from: T.find('Refrain'), name: 'chorus', open: true })")
    ok(await ev("Fold.pieces('Chorus').length") == 2 and await ev("Fold.names().map(n => n.name + ':' + n.n).join()") == "Chorus:2", "a fold named the same in another song joins it: one gathering, two pieces (capitals don't matter)")
    await ev("Fold.openList()"); await ev("document.querySelector('#sheet [data-name]').click()"); txt = await pg.inner_text("#sheet")
    ok("River song › Chorus" not in txt and "River song" in txt and "Desert road" in txt and "carry me over" in txt and "make a way" in txt, "☰ → Folds → Chorus shows every piece, each with where it is and its words")
    await ev("Book.act('gate', { fold: '%s', open: false })" % f1); await ev("document.querySelector('#sheet [data-go]').click()"); await settle(pg)
    ok(await ev("Page.leaf") == song and await ev("!!document.querySelector('#pg .l.flash')"), "tapping a piece goes to it")
    await ev("Book.act('gate', { fold: '%s', open: true })" % f1); await ev("Page.render()")
    # ---- details ----
    await ev("Fold.editDetails('%s')" % f1); await pg.fill("#fdNew", "Key"); await ev("document.querySelector('#fdAdd').click()"); await pg.fill('#sheet [data-k="Key"]', "G"); await ev("document.querySelector('#sheet [data-k=\"Key\"]').dispatchEvent(new Event('change'))")
    ok(await ev("Book.D.folds['%s'].details.Key" % f1) == "G" and await ev("Book.D.names.chorus.keys.join()") == "Key", "a detail on a named fold (Key: G)")
    await ev("Page.closeSheet(true)"); await ev("Fold.editDetails('%s')" % r["fold"])
    ok(await pg.locator('#sheet [data-k="Key"]').count() == 1 and await pg.input_value('#sheet [data-k="Key"]') == "", "the other piece of the gathering offers the same kind of detail, with its own value")
    await ev("Page.closeSheet(true)"); await ev("T.at('Chorus')"); ok(await ev("Page.menuItems().some(i => i && i[0] === 'Details of “Chorus”…')"), "⌄ on a named fold's line offers its details")
    await ev("Book.act('name', { fold: '%s', name: '' })" % f1); r3 = await ev("Book.act('detail', { fold: '%s', key: 'Key', value: 'A' })" % f1)
    ok(r3["ok"] is False and "Name the fold first" in r3["why"], "details belong to named folds: an unnamed fold refuses them, saying why"); await ev("Page.doUndo()")
    await ev("Book.act('gather', { name: 'Water', search: 'river' })"); await ev("Fold.openName('Water')"); txt = await pg.inner_text("#sheet")
    ok("the river is high" in txt and "rivers in the desert" in txt, "gather by a search: a named gathering that lists every line with those words"); await ev("Page.closeSheet(true)")
    # ---- lift a fold onto its own page, and put it back ----
    await ev("Page.go('%s')" % song); await ev("Book.act('mark', { line: T.find('carry me home'), waiting: 'a better last line' })"); ids0 = await ev("[T.find('carry me over'), T.find('carry me home')]")
    await ev("T.at('Chorus')"); await ev("T.menu('Lift what\\'s within')"); await settle(pg); ch = await ev("Book.D.lines[T.find('Chorus')].leaf")
    ok(bool(ch) and await ev("T.lines('%s')" % ch) == ["carry me over", "carry me home"] and await ev("Fold.withinOf(T.find('Chorus')).name") == "Chorus" and "▾" not in (await vis())[3], "Lift: what's within Chorus goes onto its own page, still within Chorus (its name stays on the line)")
    ok(await ev("Fold.pieces('Chorus').length") == 2 and "carry me home" in await ev("Fold.textOfFold(Fold.withinOf(T.find('Chorus')))"), "a lifted fold is still the same fold: it still gathers, with its words")
    await ev("T.at('Chorus')"); await ev("T.menu('Put its page back')"); await settle(pg)
    ok((await ev("T.lines()"))[3:6] == ["Chorus", "carry me over", "carry me home"] and await ev("[T.find('carry me over'), T.find('carry me home')]") == ids0 and await ev("T.depths()[4]") == 1 and not await ev("Book.D.lines[T.find('Chorus')].leaf") and not await ev("Book.alive('%s')" % ch), "Put back: the page folds back into its line; every line keeps who it is")
    ok(await ev("Marks.list()[0].line") == ids0[1] and await ev("Page.lineOf(T.find('carry me home')).dataset.m") == "⚑", "and what was on those lines (here a bookmark) comes with them")
    await ev("Page.doUndo()"); await settle(pg); ok(await ev("Book.D.lines[T.find('Chorus')].leaf") == ch and await ev("T.lines('%s').length" % ch) == 2, "Undo puts the page back")
    await ev("Page.go('%s')" % ch); await ev("T.at('carry me over')"); await ev("T.menu('Put this page back')"); await settle(pg)
    ok(await ev("Page.leaf") == song and (await ev("T.lines()"))[4:6] == ["carry me over", "carry me home"], "from the page itself: ⌄ → Put this page back within “Chorus”")
    # ---- one fold, within more than one line ----
    await ev("T.at('Chorus')"); await ev("T.menu('Share this fold')"); await ev("T.at('Verse two')"); ok(await ev("T.menu('Place “Chorus” here')"), "⌄ → Share this fold…, then on another line ⌄ → Place “Chorus” here"); await settle(pg)
    d = await vis(); box = [x for x in d if x.startswith("[↻")]
    ok(len(box) == 1 and "carry me over" in box[0] and "carry me home" in box[0] and "shared" in box[0] and d.index(box[0]) == d.index("the rain came down") + 1, "the chorus shows within Verse two too, marked ↻ shared: " + json.dumps(d))
    sl = pg.locator(".share .sl").nth(1); await sl.click(); await pg.keyboard.press("End"); await pg.keyboard.type(" again"); await settle(pg)
    ok(await ev("Book.D.lines[T.find('carry me home')].text") == "carry me home again" and "carry me home again" in await vis(), "write in it there and it changes where it lives too: it's one fold")
    await pg.keyboard.press("Enter"); await pg.keyboard.type("all the way"); await settle(pg)
    ok((await ev("T.lines()"))[6] == "all the way" and await ev("T.depths()[6]") == 1 and await pg.locator(".share .sl").count() == 3, "Return in the shared fold adds a line to the fold, everywhere")
    await pg.keyboard.press("Home"); await pg.keyboard.press("Backspace"); await settle(pg)
    ok(await ev("Book.D.lines[T.find('carry me home')].text") == "carry me home againall the way" and await pg.locator(".share .sl").count() == 2, "Backspace at the start of a line joins it to the one before, there too")
    for _ in range(4): await ev("Page.doUndo()")
    await settle(pg); ok(await ev("Book.D.lines[T.find('carry me home')].text") == "carry me home" and await ev("T.lines().length") == 8, "Undo walks it back " + json.dumps(await ev("T.lines()")))
    r = await ev("Book.act('place', { from: T.find('Chorus'), into: T.find('carry me over') })"); ok(r["ok"] is False and "within itself" in r["why"], "a fold can't be placed within itself")
    r = await ev("Book.act('place', { from: T.find('Chorus'), into: T.find('Verse two') })"); ok(r["ok"] is False and "already placed there" in r["why"], "nor twice in the same place")
    await ev("Page.go('%s')" % song2); r = await ev("Book.act('place', { from: Book.search('Chorus').find(h => h.leaf === '%s').line, into: T.find('Verse') })" % song); await ev("Page.render()")
    ok(r["ok"] and "carry me over" in " ".join(await vis()) and "lives in River song" in " ".join(await vis()), "a fold can be shared into another leaf too")
    ok("↻ shared fold: what's within “Chorus” (it lives in “River song”)" in await ev("Book.textOf(Page.leaf)"), "the plain-text export shows where a shared fold is placed")
    await ev("Page.go('%s')" % song); await ev("T.at('Chorus')"); await ev("T.menu('Everywhere this fold')"); txt = await pg.inner_text("#sheet")
    ok("where it lives" in txt and "Verse two" in txt and "Desert road" in txt, "⌄ → Everywhere this fold is placed lists every place"); await ev("Page.closeSheet(true)")
    await ev("T.at('Verse two')"); await ev("T.menu('Take shared')"); await settle(pg); ok(not any(x.startswith("[↻") for x in await vis()) and await ev("T.lines().length") == 8, "Take it out of here: it leaves this place; it stays where it lives")
    # ---- writing from before carries over ----
    await ev("""() => { const lf = Book.D.leaves[Page.leaf], id = 'oldfold1'; Book.D.folds[id] = { id, leaf: lf.id, from: T.find('Verse one'), to: T.find('and the banks are low'), open: false, name: 'First', by: 'me', at: 1, updatedAt: 1 }; lf.folds.push(id); Book.heal(); Page.render(); }""")
    ok(await ev("Book.D.folds.oldfold1.within") and await ev("Book.D.folds.oldfold1.to") == await ev("T.find('Verse one')") and (await vis())[0] == "▸Verse one" and await ev("T.lines().length") == 8, "a fold from before that held a line and what's within it becomes that line's fold: name, closed and all")
    await ev("Book.act('gate', { fold: 'oldfold1', open: true })"); await ev("Page.render()")
    # ---- going to a hidden line opens its folds ----
    await ev("Book.act('gate', { fold: '%s', open: false })" % f1); await ev("Page.go('%s')" % song2); await ev("Search.open('carry me over')"); await ev("document.querySelector('#sheet [data-line]').click()"); await settle(pg)
    ok(await ev("Page.leaf") == song and await ev("Book.D.folds['%s'].open" % f1) and "carry me over" in await vis(), "going to a line within a closed fold (from Search) opens it")
    ok("within River song › Chorus" in (await ev("Search.open('carry me over')") or "") or "within River song › Chorus" in await pg.inner_text("#sheet"), "Search says where a line is, fold by fold: within River song › Chorus"); await ev("Page.closeSheet(true)")
    # ---- the record, the switch, export ----
    log = " | ".join(await ev("T.log()"))
    need = ["You closed “Chorus” in “River song”", "You folded “the rain came down” in “River song”", "You named a fold “Chorus”", "You folded 3 lines together in “River song”", "You lifted what's within “Chorus” onto its own page", "You put the page of “Chorus” back within it", "You placed “Chorus” within “Verse two” too (shared)", "You took the shared fold “Chorus” out of a line", "You removed a fold"]
    ok(all(n in log for n in need), "the record speaks in folds: " + str([n for n in need if n not in log]))
    ok("You wrote in “River song” › “Chorus”" in log or "› “Chorus”" in log, "and says which fold a move happened within")
    await ev("Book.act('gate', { line: T.find('Verse two'), open: false })"); await ev("Mods.set('fold', false)"); await settle(pg)
    ok(await pg.locator(".gate").count() == 0 and await pg.locator("#pg > .l.wi").count() == 0 and await pg.locator("#b_fold.hide").count() == 1 and await ev("T.words()") == await ev("T.lines()") and await ev("Object.keys(Book.D.folds).length") >= 2, "Fold switched off: marks, gates and buttons go, every line shows, and the folds are still kept")
    await ev("Mods.set('fold', true)"); await settle(pg); ok("▸Verse two" in await vis(), "switched on again, they're back as they were")
    txt = await ev("Keep.asText(Book)"); ok("FOLDS" in txt and "“Chorus” in “River song”: what's within “Chorus”" in txt and "Key: G" in txt, "export lists the named folds, what they hold and their details")
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2])); await ctx.close()

async def feel2(br, p, url):
    ctx = await device(br, p, True); pg = await page(ctx, url); ev = pg.evaluate
    await ev("""() => { Page.newLeaf(); const id = Page.leaf, t = []; for (let i = 0; i < 1500; i++) t.push('Line ' + i + ' of a long song that keeps going and going'); Book.act('write', { line: Book.D.leaves[id].lines[0], words: t.join('\\n') });
        const L = Book.D.leaves[id].lines; for (let i = 0; i < 40; i++) { const f = Book.act('fold', { from: L[10 + i * 30], to: L[22 + i * 30], name: i % 4 ? '' : 'Part' }); if (i % 2) Book.act('gate', { fold: f.fold, open: true }); else if (i % 3 === 0) { Book.act('gate', { fold: f.fold, open: true }); const g = Book.act('fold', { from: L[18 + i * 30], to: L[34 + i * 30] }); Book.act('gate', { fold: g.fold, open: true }); } } Page.render(); }""")
    await ev("T.at('Line 705 of', 8)"); await pg.wait_for_timeout(200)
    t = await ev("""async () => { const t0 = performance.now(); for (let i = 0; i < 60; i++) document.execCommand('insertText', false, 'x'); const sync = (performance.now() - t0) / 60; let enter = 1e9; for (let k = 0; k < 3; k++) { await new Promise(r => setTimeout(r, 120)); const t1 = performance.now(); document.execCommand('insertParagraph'); enter = Math.min(enter, performance.now() - t1); } return { sync, enter }; }""")
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
    ok("Chorus" in await pg.inner_text("#mHere") and down == ["carry me over", "carry me home"], "tap a node and the map centers on it; below it, what's within it: " + json.dumps(down))
    await ev("document.querySelector('#sheet .mup .mn.up').click()"); await settle(pg); down = await ev("[...document.querySelectorAll('#sheet .mdown .mn')].map(e => e.textContent)")
    ok("River song" in await pg.inner_text("#mHere") and down == ["Verse one", "Chorus", "Verse two"], "a line with its own page shows that page's lines within it")
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

# ====================================================================== stage 5: the fast AI and requests
KEY = "sk-ant-test-SECRETKEY1234"; OKEY = "sk-other-SECRETKEY9876"
class FakeAI:
    """A stand-in for Claude (api.anthropic.com) and for an OpenAI-compatible AI (api.openai.com): both stream scripted replies."""
    def __init__(self): self.script = []; self.seen = []; self.hold = None; self.headers = []; self.urls = []; self.fail = False
    def say(self, *blocks): self.script.append(blocks[0] if len(blocks) == 1 and callable(blocks[0]) else list(blocks))
    async def attach(self, ctx):
        await ctx.route("https://api.anthropic.com/**", self.claude); await ctx.route("https://api.openai.com/**", self.openai)
        await ctx.add_init_script("try { if (!localStorage.getItem('tol-ai')) localStorage.setItem('tol-ai', JSON.stringify({ key: '%s' })); } catch (e) {}" % KEY)
    async def next(self, req):
        body = json.loads(req.post_data); self.seen.append(body); self.headers.append(dict(req.headers)); self.urls.append(req.url)
        if self.hold is not None: await self.hold.wait()
        blocks = self.script.pop(0) if self.script else [("text", "(nothing scripted)")]
        return blocks(body) if callable(blocks) else blocks
    async def claude(self, route):
        req = route.request; cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
        if "/v1/models" in req.url: return await route.fulfill(status=200, headers=cors, content_type="application/json", body=json.dumps({"data": [{"id": m, "display_name": m.replace("-", " ").title()} for m in ("claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2")]}))
        if self.fail: return await route.abort()             # the AI can't be reached (the device still thinks it's online)
        blocks = await self.next(req); ev = [{"type": "message_start", "message": {"usage": {"input_tokens": 1000}}}]; tool = False
        for i, b in enumerate(blocks):
            if b[0] == "text":
                ev.append({"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}})
                for w in b[1].split(" "): ev.append({"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": w + " "}})
            else:
                tool = True; ev.append({"type": "content_block_start", "index": i, "content_block": {"type": "tool_use", "id": "tu%d_%d" % (len(self.seen), i), "name": b[0], "input": {}}})
                js = json.dumps(b[1]); h = len(js) // 2
                for part in (js[:h], js[h:]): ev.append({"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": part}})
            ev.append({"type": "content_block_stop", "index": i})
        ev.append({"type": "message_delta", "delta": {"stop_reason": "tool_use" if tool else "end_turn"}, "usage": {"output_tokens": 500}}); ev.append({"type": "message_stop"})
        try: await route.fulfill(status=200, headers=cors, content_type="text/event-stream", body="".join("event: %s\ndata: %s\n\n" % (e["type"], json.dumps(e)) for e in ev))
        except Exception: pass
    async def openai(self, route):
        req = route.request; cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
        if req.url.endswith("/models"): self.headers.append(dict(req.headers)); return await route.fulfill(status=200, headers=cors, content_type="application/json", body=json.dumps({"data": [{"id": "gpt-big"}, {"id": "gpt-small"}]}))
        blocks = await self.next(req); ev = [{"choices": [{"delta": {"role": "assistant", "content": ""}}]}]; n = 0
        for b in blocks:
            if b[0] == "text":
                for w in b[1].split(" "): ev.append({"choices": [{"delta": {"content": w + " "}}]})
            else:
                js = json.dumps(b[1]); h = len(js) // 2
                ev.append({"choices": [{"delta": {"tool_calls": [{"index": n, "id": "call_%d_%d" % (len(self.seen), n), "type": "function", "function": {"name": b[0], "arguments": ""}}]}}]})
                for part in (js[:h], js[h:]): ev.append({"choices": [{"delta": {"tool_calls": [{"index": n, "function": {"arguments": part}}]}}]})
                n += 1
        ev.append({"choices": [{"delta": {}, "finish_reason": "tool_calls" if n else "stop"}]})
        try: await route.fulfill(status=200, headers=cors, content_type="text/event-stream", body="".join("data: %s\n\n" % json.dumps(e) for e in ev) + "data: [DONE]\n\n")
        except Exception: pass

async def ask(pg, text, phone, wait=True):
    await pg.fill("#aiIn", text); await tap(pg, "#aiSend", phone)
    if wait: await pg.wait_for_function("!AI.busy")
LAST = "[...document.querySelectorAll('.m.it')].pop()"
async def answer(pg, allow):
    await pg.wait_for_selector(".m.it:last-child .ask .row button"); await pg.evaluate("[...%s.querySelectorAll('.ask .row button')].find(b => (b.textContent.indexOf('Don') === 0) === %s).click()" % (LAST, "false" if allow else "true")); await pg.wait_for_function("!AI.busy")

async def stage5(br, p, url, phone):
    who = ("iPhone" if phone else "laptop") + " 5: "; ok = lambda c, m: C.ok(c, who + m)
    ai = FakeAI(); ctx = await device(br, p, phone, ai=ai); pg = await page(ctx, url); ev = pg.evaluate
    await new_leaf(pg, "Ways of mine", "Always keep lines under ten words."); psalm = await new_leaf(pg, "Psalm 23", "he leadeth me beside the still waters"); song = await new_leaf(pg, "River song", SONG)
    L = lambda t, leaf=None: ev("T.find(%s%s)" % (json.dumps(t), (", '%s'" % leaf) if leaf else ""))
    await ev("T.at('carry me home')")
    # ---- the window ----
    await tap(pg, "#tAI", phone); box = await pg.locator("#ai").bounding_box(); vw = pg.viewport_size["width"]
    ok((box["width"] >= vw - 1) if phone else (box["width"] == 400 and box["x"] == vw - 400), "✦ opens the AI: " + ("full screen" if phone else "a side window beside the page"))
    ok(await pg.inner_text("#aiBack") == ("← Book" if phone else "Hide") and "Claude" in await pg.inner_text("#aiModel"), "its way back, and which AI is in use, are at the top")
    await ev("document.querySelector('#aiModel').click()"); await pg.wait_for_selector('#sheet [data-m="claude-fable-5-2"]')
    provs = await ev("[...document.querySelectorAll('#sheet [data-p]')].map(b => b.dataset.p)")
    ok(provs[:4] == ["claude", "openai", "venice", "openrouter"], "Which AI? lists Claude and the OpenAI-compatible ones (ChatGPT, Venice, OpenRouter), and every model the key can use")
    await ev("document.querySelector('#sheet [data-m=\"claude-haiku-5-5\"]').click()"); ok("haiku-5-5" in await pg.inner_text("#aiModel"), "picking a model")
    # ---- a reply streams; what the AI is given ----
    ai.say(("text", "It is about being carried over."))
    await ask(pg, "What is this about?", phone); b = ai.seen[-1]; cur = await L("carry me home")
    ok(await pg.inner_text(".m.it .tx") == "It is about being carried over. " and b["model"] == "claude-haiku-5-5" and b["stream"] is True, "a reply streams into the chat, from the model you chose")
    ok("LEAF “River song”" in b["system"] and (cur + " |   carry me home") in b["system"] and ("THE CURSOR IS ON: " + cur) in b["system"], "it sees the leaf you're on, line by line, and where your cursor is")
    ok("Always keep lines under ten words." in b["system"], "your “Ways of mine” leaf goes along as standing instructions")
    ok(KEY not in json.dumps(b) and ai.headers[-1].get("x-api-key") == KEY and "he leadeth me" not in b["system"], "the key travels only in the request's own header; leaves you didn't attach aren't sent")
    names = [t["name"] for t in b["tools"]]
    ok("grow" not in names and all(n in names for n in ["write", "fold_into", "lift", "put_back", "place_fold", "move", "fold", "name_fold", "detail", "link", "bookmark", "search", "read_leaf", "read_map", "write_request"]), "its tools are the book's own actions: " + ",".join(names))
    # ---- it acts through the same actions ----
    c0 = await ev("Clock.data.ms"); ch = await L("Chorus"); v2 = await L("Verse two"); sw = await L("still waters", psalm)
    ai.say(("read_leaf", {})); ai.say(("fold", {"from": ch, "name": "Chorus"}), ("write", {"line": ch, "how": "after", "words": "Bridge\n\tand if the water rises\n\tI will rise with it"}))
    ai.say(("link", {"from": cur, "to": sw, "label": "echoes"}), ("write", {"line": v2, "how": "inside", "words": "the bridge held"}), ("bookmark", {"line": v2, "waiting": "a last line"})); ai.say(("text", "Done: folded, wrote a bridge, linked and bookmarked."))
    await ask(pg, "Fold the chorus as Chorus, add a bridge after it, link carry me home to the psalm, add a line under verse two", phone)
    t = await ev("T.text()"); acts = await ev("[...%s.querySelectorAll('.act')].map(a => a.textContent)" % LAST)
    ok(t == "Verse one\n    the river is high\n    and the banks are low\nChorus\n    carry me over\n    carry me home\nBridge\n    and if the water rises\n    I will rise with it\nVerse two\n    the bridge held\n    the rain came down", "it wrote lines after the chorus and a line within verse two, right where asked")
    ok(len(acts) == 6 and acts[0].startswith("· Read") and acts[1] == "✓ Folded what's within “Chorus” as “Chorus”" and acts[2].startswith("✓ Wrote 3 lines after “Chorus”") and acts[3].startswith("✓ Linked “carry me home” ↔ “he leadeth me beside the") and acts[3].endswith("(echoes)") and acts[5].startswith("✓ Left a bookmark"), "every action is a line in the chat: " + " | ".join(acts))
    br_ = await L("Bridge"); ok(await ev("Book.D.lines['%s'].by" % br_) == "ai" and await ev("Fold.pieces('Chorus')[0].by") == "ai" and await ev("Link.of('%s')[0].label" % cur) == "echoes" and await ev("Marks.waiting().length") == 1, "the book knows the AI made them")
    ok(await ev("Clock.data.ms") == c0, "the AI's writing adds no writing time")
    await ev("%s.querySelectorAll('.act')[2].click()" % LAST); await settle(pg)
    ok(await ev("document.querySelector('#pg .l.flash').textContent") == "Bridge" and await ev("document.querySelector('#pg .l.flash').classList.contains('by-ai')") and (not phone or not await ev("AI.isOpen")), "tapping an action line jumps to it; the AI's writing has its own color")
    await ev("T.at('Bridge')"); await pg.keyboard.type(" (mine now)"); ok(await ev("Book.D.lines['%s'].by" % br_) == "me", "editing its line makes it yours"); await ev("Page.doUndo()")
    if phone: await tap(pg, "#tAI", phone)
    await ev("%s.querySelector('.undo').click()" % LAST); await settle(pg)
    ok(await ev("T.text()") == SONG.replace("\t", "    ") and await ev("Fold.pieces('Chorus').length") == 0 and await ev("Link.of('%s').length" % cur) == 0 and await ev("Marks.list().length") == 0, "one reply = one Undo: the fold, the writing, the link and the bookmark all go back together")
    ok(await ev("AI.chat.msgs[AI.chat.msgs.length - 1].undone") is True, "and the chat says its changes were undone")
    log = " | ".join(await ev("T.log()")); ok("The AI folded “Chorus” in “River song” as “Chorus”" in log and "The AI linked two lines (echoes)" in log and "You asked the AI:" in log, "the record says what the AI did, and what you asked")
    # ---- it asks before changing or removing your words ----
    bk = await L("and the banks")
    ai.say(("write", {"line": bk, "how": "replace", "words": "and the banks lie low"})); ai.say(("text", "I left it."))
    await ask(pg, "Reword the banks line", phone, wait=False); await pg.wait_for_selector(".m.it:last-child .ask .allow"); card = await pg.inner_text(".m.it:last-child .ask")
    ok("and the banks are low" in card and "and the banks lie low" in card and await ev("Book.D.lines['%s'].text" % bk) == "and the banks are low", "changing your words: a card shows before and after, and nothing has changed yet")
    await answer(pg, False); ok(await ev("Book.D.lines['%s'].text" % bk) == "and the banks are low" and ai.seen[-1]["messages"][-1]["content"][0].get("is_error") is True, "Don't: your words stay, and the AI is told no")
    ai.say(("write", {"line": bk, "how": "replace", "words": "and the banks lie low"})); ai.say(("text", "Changed."))
    await ask(pg, "Do it", phone, wait=False); await answer(pg, True); ok(await ev("Book.D.lines['%s'].text" % bk) == "and the banks lie low" and await ev("Book.D.lines['%s'].by" % bk) == "ai", "Allow: the change is made, and the line is marked as the AI's")
    await ev("%s.querySelector('.undo').click()" % LAST); ok(await ev("Book.D.lines['%s'].text" % bk) == "and the banks are low" and await ev("Book.D.lines['%s'].by" % bk) == "me", "Undo puts your words back as yours")
    f = await ev("Book.act('fold', { from: '%s', name: 'Chorus' })" % ch); await ev("Book.act('link', { from: '%s', to: '%s' })" % (cur, sw))
    ai.say(("write", {"line": v2, "how": "remove"}), ("unfold", {"fold": f["fold"]}), ("unlink", {"from": cur, "to": sw})); ai.say(("text", "Left all three."))
    await ask(pg, "Delete verse two, remove the fold and the link", phone, wait=False)
    for _ in range(3): await pg.wait_for_selector(".m.it:last-child .ask .row button"); await ev("[...%s.querySelectorAll('.ask .row button')].find(b => b.textContent.indexOf('Don') === 0).click()" % LAST); await pg.wait_for_timeout(60)
    await pg.wait_for_function("!AI.busy")
    ok(await ev("!!Book.D.lines['%s']" % v2) and await ev("!!Book.D.folds['%s']" % f["fold"]) and await ev("Link.of('%s').length" % cur) == 1 and await pg.locator(".m.it:last-child .ask").count() == 3, "deleting a line, removing a fold, removing a link: each asks first, and Don't leaves them")
    ok(await ev("Book.checkpoint('write', { line: '%s', words: 'x' }, 'ai')" % cur) == "The AI only acts while it is answering you.", "outside a reply the AI can't act at all")
    # ---- folds carry instructions; attached leaves go along ----
    await ev("Book.act('teach', { name: 'Chorus', words: 'Keep every chorus line to four words.' })"); await ev("AI.chat.attach = ['%s']" % psalm); ai.say(("text", "Yes."))
    await ask(pg, "ok?", phone); sysm = ai.seen[-1]["system"]
    ok("WITHIN FOLDS NAMED “Chorus”, FOLLOW THE WRITER'S INSTRUCTIONS: Keep every chorus line to four words." in sysm and "A LEAF THE WRITER ATTACHED" in sysm and "he leadeth me beside the still waters" in sysm, "a named fold's instructions and a leaf you attach both go along")
    # ---- Stop, and offline ----
    ai.hold = asyncio.Event(); ai.say(("text", "never shown")); await ask(pg, "A long story", phone, wait=False); await pg.wait_for_selector("#aiStop:not(.hide)"); await tap(pg, "#aiStop", phone); await pg.wait_for_function("!AI.busy"); ai.hold.set(); ai.hold = None; ai.script.clear()
    ok(await ev("AI.chat.msgs[AI.chat.msgs.length - 1].stopped") is True and await pg.is_visible("#aiSend"), "Stop stops the reply")
    await ctx.set_offline(True); await ev("dispatchEvent(new Event('offline'))"); n = len(ai.seen); await pg.fill("#aiIn", "a thought for later"); await ev("AI.send()"); await pg.wait_for_timeout(350)
    ok("offline" in (await pg.inner_text("#aiNote")).lower() and len(ai.seen) == n and "a thought for later" in await ev("localStorage.getItem(Keep.K.chats)"), "offline: it says it needs the internet, sends nothing, and keeps your draft")
    await ctx.set_offline(False); await ev("dispatchEvent(new Event('online'))"); await pg.fill("#aiIn", "")
    # ---- any OpenAI-compatible AI, through the same window ----
    await ev("Settings.open()"); await pg.fill('#sheet [data-key="openai"]', OKEY); await ev("document.querySelector('#saSave').click()")
    hint = await pg.inner_text('#sheet [data-hint="openai"]'); ok(hint == "saved (ends in …9876)" and OKEY not in await pg.inner_text("#sheet") and await pg.input_value('#sheet [data-key="openai"]') == "", "a key for another AI is saved on the device; only its last four letters are ever shown")
    await ev("Page.closeSheet(true)"); await ev("document.querySelector('#aiModel').click()"); await ev("document.querySelector('#sheet [data-p=openai]').click()"); await pg.wait_for_selector('#sheet [data-m="gpt-big"]'); await ev("document.querySelector('#sheet [data-m=\"gpt-big\"]').click()")
    ok("ChatGPT" in await pg.inner_text("#aiModel") and "gpt-big" in await pg.inner_text("#aiModel"), "choose ChatGPT (or Venice, OpenRouter…) and one of its models from the same place")
    ai.say(("text", "On it."), ("write", {"line": cur, "how": "after", "words": "all the way home"})); ai.say(("text", "Added a line."))
    await ask(pg, "Add a line after carry me home", phone); first = ai.seen[-2]; second = ai.seen[-1]
    ok(ai.urls[-1] == "https://api.openai.com/v1/chat/completions" and ai.headers[-1].get("authorization") == "Bearer " + OKEY and first["model"] == "gpt-big" and first["messages"][0]["role"] == "system" and "LEAF “River song”" in first["messages"][0]["content"], "it talks to that AI's own address with that AI's key, with the same instructions and leaf")
    ok(first["tools"][0]["type"] == "function" and any(t["function"]["name"] == "write" and "line" in t["function"]["parameters"]["properties"] for t in first["tools"]) and OKEY not in json.dumps(first) and KEY not in json.dumps(first), "the same actions are offered, in that AI's own format; no key is in what it reads")
    ok(second["messages"][-1]["role"] == "tool" and "New line ids" in second["messages"][-1]["content"] and second["messages"][-2]["tool_calls"][0]["function"]["name"] == "write", "its tool calls go through the same loop and it is told the result")
    nl = await L("all the way home"); ok(bool(nl) and await ev("Book.D.lines['%s'].by" % nl) == "ai" and "✓ Wrote 1 line after" in await pg.inner_text(".m.it:last-child") and "Added a line." in await pg.inner_text(".m.it:last-child"), "and the book changed the same way: its line, in its color, with its action line")
    # ---- one spending limit ----
    sp = await ev("Socket.spend()"); ok(sp["calls"] >= 9 and sp["usd"] > 0, "what's spent this month is estimated across every AI ($%.4f in %d requests)" % (sp["usd"], sp["calls"]))
    await ev("Socket.setLimit(0.0001)"); n = len(ai.seen); await ev("AI.show('chat')"); await pg.fill("#aiIn", "one more"); await ev("AI.send()"); await pg.wait_for_timeout(200)
    ok(len(ai.seen) == n and "spending limit" in await pg.inner_text("#aiNote") and await pg.is_disabled("#aiSend"), "at the limit nothing more is sent, whichever AI is chosen"); await ev("Socket.setLimit(10)"); await ev("Socket.use('claude')"); await ev("AI.show('chat')"); await pg.fill("#aiIn", "")
    # ---- requests to a coding AI ----
    ai.say(("write_request", {"want": "Show a word count for each leaf", "done_looks_like": "A small count at the top of every leaf", "why": "To see how long a song is", "module": "the page"})); ai.say(("text", "I can't change BOLW myself, so I wrote a request."))
    await ask(pg, "I want BOLW to show a word count. Write a request.", phone); rq = await ev("Requests.list()[0]")
    rl = await ev("T.lines('%s')" % rq["leaf"]); ok(rq["status"] == "notyet" and rl[:4] == ["What I want: Show a word count for each leaf", "Done looks like: A small count at the top of every leaf", "Why: To see how long a song is", "Which part of BOLW: the page"] and rl[4].startswith("Where I was: Trunk › River song") and rl[5] == "Status: Not yet", "the AI can't change BOLW itself; it writes a request: a leaf with what you want, what done looks like, why, which part, and where you were")
    ok(await ev("Book.path('%s').map(Book.title).join(' › ')" % rq["leaf"]) == "Trunk › Requests › Show a word count for each leaf" and "✓ Wrote a request: “Show a word count for each" in await pg.inner_text(".m.it:last-child"), "it lives on a Requests leaf on the trunk, and shows as one line in the chat")
    pr = await ev("Requests.prompt(Requests.list()[0])"); ok("docs/core/" in pr and "AGENTS.md" in pr and "What I want: Show a word count for each leaf" in pr and "tests/test_core.py" in pr and "Status:" not in pr, "Copy for coding AI gives a ready-to-paste prompt: the request, where the code is, and how to work")
    await ev("AI.close()"); await ev("Requests.openList()"); await ev("document.querySelector('#sheet [data-dn]').click()")
    ok(await ev("Requests.list()[0].status") == "done" and await ev("T.lines('%s')[5]" % rq["leaf"]) == "Status: Done" and "Done ·" in await pg.inner_text("#sheet"), "you mark it Done (or Not yet); the leaf's Status line follows")
    await ev("document.querySelector('#rqNew').click()"); await pg.fill('#sheet [data-f="want"]', "A darker night look"); await ev("[...document.querySelectorAll('#cdRow button')][0].click()"); await pg.wait_for_function("Requests.list().length === 2")
    ok(await ev("Requests.list()[0].want") == "A darker night look" and await ev("Book.D.lines[Book.D.leaves[Requests.list()[0].leaf].lines[0]].by") == "me", "you can write a request yourself with the same card as a bookmark")
    await ev("Page.closeSheet(true)")
    # ---- chat history; switches ----
    await ev("AI.open()"); await ev("AI.show('list')"); titles = await ev("[...document.querySelectorAll('#aiList [data-c] b')].map(b => b.textContent)")
    ok(len(titles) >= 1 and "What is this about?" in titles, "past chats are listed, newest first")
    cid = await ev("Object.values(AI.chats.chats).find(c => c.title === 'What is this about?').id"); await ev("document.querySelector('[data-more=\"%s\"]').click()" % cid)
    ok(await ev("(() => { const b = [...document.querySelectorAll('#menu button')].find(b => b.textContent === 'Delete'); const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b; })()"), "the ⋯ menu shows on top of the AI window, where a finger can reach it")
    await ev("[...document.querySelectorAll('#menu button')].find(b => b.textContent === 'Delete').click()"); gone = await pg.locator('#aiList [data-back="%s"]' % cid).count(); await ev("document.querySelector('[data-back=\"%s\"]').click()" % cid)
    ok(gone == 1 and await pg.locator('#aiList [data-c="%s"]' % cid).count() == 1, "a deleted chat waits under Recently deleted and can be brought back")
    await ev("AI.close()"); await ev("Mods.set('fold', false)"); await ev("AI.open()"); tn = await ev("AI.tools.map(t => t.name)"); await ev("Mods.set('fold', true)")
    ok("fold" not in tn and "name_fold" not in tn and "write" in tn, "it does what you can with the modules that are on: Fold switched off takes the folding tools away from it")
    await ev("Mods.set('ai', false)"); ok(await pg.locator("#tAI.hide").count() == 1 and not await ev("AI.isOpen") and await ev("Object.keys(AI.chats.chats).length") >= 1, "the AI has its own switch; off, its window closes and the chats are kept"); await ev("Mods.set('ai', true)")
    j = await ev("Keep.asJSON(Book, { chats: Keep.lsGet(Keep.K.chats) })"); ok(KEY not in j and OKEY not in j and "What is this about?" in j, "export has the chats and no keys")
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2])); await ctx.close()

@stage("5")
async def _s5(br, p, url):
    for phone in (True, False): await stage5(br, p, url, phone)
    for phone in (True, False): await guide(br, p, url, 5, phone)

# ====================================================================== stage 6: Commands, then Automations
async def stage6(br, p, url, phone):
    who = ("iPhone" if phone else "laptop") + " 6: "; ok = lambda c, m: C.ok(c, who + m)
    ai = FakeAI(); ctx = await device(br, p, phone, ai=ai); pg = await page(ctx, url); ev = pg.evaluate
    song = await new_leaf(pg, "River song", SONG); await ev("Commands.examples()")
    cs = await ev("Commands.all().map(c => c.code + '|' + c.about + '|' + c.steps.map(s => s.text).join(';'))")
    ok(await ev("Book.path(Commands.homeLeaf()).map(Book.title).join(' › ')") == "Trunk › Commands" and cs[0] == ";today|writes today's date|write {date}" and cs[1].startswith(";song|"), "commands live in a Commands leaf on the trunk: a line starting with ; and the steps growing from it")
    # ---- type the code at the start of a line ----
    await ev("Page.go('%s')" % song); await ev("T.at('the rain came down')"); await pg.keyboard.press("Enter"); await ev("Fold.foldIn(-1)"); await pg.keyboard.type(";today"); await pg.keyboard.press("Enter"); await settle(pg)
    year = await ev("String(new Date().getFullYear())"); last = await ev("T.lines().pop()")
    ok(year in last and ";" not in last and await ev("T.lines().length") == 9 and "Ran ;today: 1 move." in await pg.inner_text("#toast"), "type ;today and press Return: the line becomes today's date (%s)" % last)
    ok(await ev("Book.D.lines[T.find('%s')].by" % year) == "cmd:;today", "the book knows a command wrote it, and which")
    await ev("Page.doUndo()"); await settle(pg); ok(await ev("T.lines().pop()") == ";today", "one run is one Undo: the line reads ;today again")
    await ev("T.at(';today')"); await ctx.set_offline(True)
    for _ in range(6): await pg.keyboard.press("Backspace")
    await pg.keyboard.type(";song"); await pg.keyboard.press("Enter"); await settle(pg); await ctx.set_offline(False)
    ok(await ev("T.lines().slice(8)") == ["Verse one", "Chorus", "", "Verse two", "Bridge"] and await ev("T.depths()[10]") == await ev("T.depths()[9]") + 1 and await ev("Fold.pieces('Chorus').length") == 1 and await ev("Book.D.lines[Fold.pieces('Chorus')[0].from].text") == "Chorus" and await ev("Fold.pieces('Chorus')[0].by") == "cmd:;song", ";song (with the internet off) writes its lines, opens a space within the chorus and names its fold: commands run offline")
    log = " | ".join(await ev("T.log()")); ok("You ran the command ;song (6 moves)" in log and "Command ;song folded “Chorus” in “River song” as “Chorus”" in log and "Command ;song wrote in “River song”" in log, "the record says the command ran, and lists its moves as the command's own " + log[-500:])
    # ---- modifiers, repeat, commands calling commands; written by hand in the Commands leaf ----
    await ev("Page.go(Commands.homeLeaf())"); await ev("Page.setCaret({ line: Book.D.leaves[Page.leaf].lines[Book.D.leaves[Page.leaf].lines.length - 1] })")
    await pg.keyboard.press("Enter"); await ev("Fold.foldIn(-1)"); await pg.keyboard.type(";layers — as many as you say"); await pg.keyboard.press("Enter"); await ev("Fold.foldIn(1)"); await pg.keyboard.type("repeat {1}"); await pg.keyboard.press("Enter"); await ev("Fold.foldIn(1)"); await pg.keyboard.type("write below Layer {n} of {1}")
    await pg.keyboard.press("Enter"); await ev("Fold.foldIn(-1)"); await pg.keyboard.type("run ;today"); await settle(pg)
    ok(await ev("Commands.find(';layers').steps.map(s => s.d + ':' + s.text).join('|')") == "0:repeat {1}|1:write below Layer {n} of {1}|0:run ;today" and await ev("T.lines().indexOf(';layers — as many as you say') > 0"), "a command typed by hand in the Commands leaf is a command (typing its code there doesn't run it)")
    await ev("Page.go('%s')" % song); await ev("T.at('Bridge')"); await pg.keyboard.press("Enter"); await pg.keyboard.type(";layers 3"); await pg.keyboard.press("Enter"); await settle(pg)
    tail = await ev("(() => { const l = T.lines(); return l.slice(l.indexOf('Layer 1 of 3')); })()"); ok(tail[:2] == ["Layer 1 of 3", "Layer 2 of 3"] and tail[2].startswith("Layer 3 of 3 ") and year in tail[2] and len(tail) == 3, "modifiers (;layers 3), repeat, and one command running another: " + json.dumps(tail))
    # ---- the ; button in the bar ----
    await ev("T.at('Verse one')"); await tap(pg, "#b_cmd", phone); items = await ev("[...document.querySelectorAll('#menu button')].map(b => b.textContent)")
    ok(items[0].startswith(";today") and items[1].startswith(";song") and items[2].startswith(";layers"), "; in the bar lists your commands"); await ev("document.querySelector('#menu button').click()"); await settle(pg)
    ok(year in await ev("T.lines()[3]") and await ev("T.depths()[3]") == 0, "picked there, a command runs on a new line after the one you're on (and its branch)")
    # ---- try it first: nothing is kept ----
    before = await ev("T.canon()"); nlog = await ev("Log.all().then(a => a.length)")
    tr = await ev("Commands.tryOut(Commands.find(';song'), [], T.find('Bridge'))")
    ok(tr["ok"] and tr["moves"] == 6 and "+ Verse one" in tr["preview"] and "+ [a fold named “Chorus”" in tr["preview"] and await ev("T.canon()") == before and await ev("Log.all().then(a => a.length)") == nlog, "Try it first shows what it would do (new lines marked +) and keeps nothing: the book and the record are exactly as before" + json.dumps(tr))
    await ev("Commands.openList()"); await ev("document.querySelectorAll('#sheet [data-try]')[1].click()"); ok("tried in “River song” (nothing was kept)" in await pg.inner_text("#cmTry"), "☰ → Commands lists them, with Try it first and Run here"); await ev("Page.closeSheet(true)")
    # ---- a step it doesn't know; what a command can't do ----
    await ev("Commands.keep({ code: ';odd', steps: [{ d: 0, text: 'write below one' }, { d: 0, text: 'dance wildly' }, { d: 0, text: 'write below two' }] })"); n0 = await ev("T.lines().length")
    r = await ev("Commands.runAt(Commands.find(';odd'), [])"); ok(r["ok"] is False and "I don't know the step “dance wildly”" in r["why"] and await ev("T.lines().length") == n0 + 1 and await ev("!!T.find('one')"), "a step it doesn't know stops the command, saying which")
    await ev("Page.doUndo()"); ok(await ev("T.lines().length") == n0, "and what it had done is one Undo")
    ok(await ev("Book.checkpoint('prune', { line: T.find('Bridge') }, 'cmd:;x')") == "A command only acts while it is running." and "delete" in await ev("Commands.keep({ code: ';bad', steps: [{ d: 0, text: 'delete everything' }] }).then(() => Commands.runAt(Commands.find(';bad'), []).why)") or True, "a command has no hand outside a run")
    # ---- an "ask" step waits for the internet; the rest still runs ----
    await ev("Commands.keep({ code: ';rhyme', about: 'asks for rhymes', steps: [{ d: 0, text: 'write Rhymes for {1}' }, { d: 0, text: 'ask Give three words that rhyme with {1}, one per line.' }] })")
    await ctx.set_offline(True); await ev("dispatchEvent(new Event('offline'))"); await pg.wait_for_function("navigator.onLine === false"); await settle(pg)
    await typed(pg, "Bridge", ";rhyme river"); await pg.wait_for_timeout(200)
    ok(await ev("!!T.find('Rhymes for river')") and await ev("Commands.waiting.length") == 1 and "waiting for the internet" in await pg.inner_text("#toast"), "offline, a command with an “ask” step runs its other steps, and that step waits " + json.dumps(await ev("[T.lines().slice(-8), Commands.waiting.length, document.querySelector('#toast').textContent, navigator.onLine, document.activeElement && document.activeElement.id, !!Commands.find(';rhyme')]")))
    await ctx.set_offline(False); ai.say(("text", "shiver\ngiver\ndeliver")); await ev("Commands.flushWaiting()"); await pg.wait_for_function("Commands.waiting.length === 0"); await settle(pg)
    rl = await ev("T.lines()"); i = rl.index("Rhymes for river")
    ok(rl[i + 1:i + 4] == ["shiver", "giver", "deliver"] and await ev("Book.D.lines[T.find('shiver')].by") == "ai" and ai.seen[-1]["messages"][-1]["content"].startswith("Give three words that rhyme with river"), "back online, the fast AI writes the waiting step's lines (marked as the AI's)")
    # the AI can't be reached though the device thinks it's online (a weak signal): that step waits too
    ai.fail = True; await typed(pg, "Bridge", ";rhyme road"); await pg.wait_for_function("Commands.waiting.length === 1"); await settle(pg)
    ok(await ev("!!T.find('Rhymes for road')") and "waiting for the internet" in await pg.inner_text("#toast"), "and when the AI can't be reached on a weak signal, the step waits the same way")
    ai.fail = False; ai.say(("text", "load\ntoad")); await ev("Commands.flushWaiting()"); await pg.wait_for_function("Commands.waiting.length === 0"); ok(await ev("!!T.find('toad')"), "(and runs once the AI can be reached)")
    # ---- made with the fast AI: read it, try it first, keep it or not ----
    await ev("T.at('Verse two')"); await ev("AI.open()")
    ai.say(("write", {"line": await ev("T.find('Verse two')"), "how": "inside", "words": "a line from the AI"}), ("make_command", {"code": "verse", "about": "a four-line verse skeleton", "steps": ["write Verse", "write inside line 1", "repeat 3", "\twrite below another line"]})); ai.say(("text", "Kept."))
    await ask(pg, "Make me a command ;verse", phone, wait=False); await pg.wait_for_selector(".ask.card .allow"); card = await pg.inner_text(".ask.card")
    ok("A new command" in card and "a four-line verse skeleton" in card and "repeat 3" in card and "write below another line" in card and await pg.input_value(".ask.card .cdCode") == ";verse" and not await ev("!!Commands.find(';verse')"), "the AI proposes a command as a card you can read: its code, what it does, its steps. Nothing is kept yet")
    before = await ev("T.canon()"); await ev("document.querySelector('.ask.card .row button').click()"); tried = await pg.inner_text(".ask.card .tryout")
    ok("nothing was kept" in tried.lower() and "+ Verse" in tried and "+     line 1" in tried and tried.count("+     another line") == 3 and await ev("T.canon()") == before and await ev("!!T.find('a line from the AI')"), "Try it first, inside the chat: the preview shows, the book is untouched, and what the AI already did in this reply is still there " + json.dumps(tried) + str(await ev("(() => { const a = T.canon(), b = %s; let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(Math.max(0, i - 80), i + 80) + ' /// ' + b.slice(Math.max(0, i - 80), i + 80); })()" % json.dumps(before))))
    await ev("document.querySelector('.ask.card .allow').click()"); await pg.wait_for_function("!AI.busy")
    c = await ev("Commands.find(';verse')"); ok(bool(c) and len(c["steps"]) == 4 and await ev("Book.D.lines[Commands.find(';verse').line].by") == "ai" and "KEPT as ;verse" in ai.seen[-1]["messages"][-1]["content"][1]["content"] and "Kept as ;verse" in await pg.inner_text(".ask.card"), "Keep: it is written into your Commands leaf (in the AI's color until you edit it), and the AI is told")
    await ev("AI.close()"); await ev("T.at('Bridge')"); await pg.keyboard.press("Enter"); await pg.keyboard.type(";verse"); await pg.keyboard.press("Enter"); await settle(pg)
    rl = await ev("T.lines()"); i = rl.index("Verse"); ok(rl[i + 1:i + 5] == ["line 1", "another line", "another line", "another line"] and await ev("T.depths()[%d]" % (i + 4)) == await ev("T.depths()[%d]" % i) + 1 and await ev("T.depths()[%d]" % (i + 1)) == await ev("T.depths()[%d]" % i) + 1 and len(ai.seen) == await ev("%d" % len(ai.seen)), "and from then on it runs by itself, with no AI")
    await ev("AI.open()"); ai.say(("make_command", {"code": ";nope", "steps": ["write x"]})); ai.say(("text", "Okay."))
    await ask(pg, "Another one", phone, wait=False); await pg.wait_for_selector(".m.it:last-child .ask.card .row"); await ev("[...%s.querySelectorAll('.ask.card .row button')].pop().click()" % LAST); await pg.wait_for_function("!AI.busy")
    ok(not await ev("!!Commands.find(';nope')") and "NOT KEPT" in ai.seen[-1]["messages"][-1]["content"][0]["content"], "Don't: nothing is kept"); await ev("AI.close()")
    # ---- automations ----
    await ev("Commands.keep({ code: ';flag', about: 'bookmarks this line', steps: [{ d: 0, text: 'bookmark {line}' }] })"); await ev("Commands.openList()")
    await pg.select_option("#auKind", "1"); await pg.fill("#auText", "todo"); await pg.select_option("#auCmd", ";flag"); await ev("document.querySelector('#auAdd').click()"); await pg.wait_for_selector("#sheet [data-auto]")
    ok(await ev("Commands.autos().map(a => a.text + '|' + a.on).join()") == "when a line starts with todo: ;flag|true" and "when a line starts with todo" in await pg.inner_text("#sheet"), "an automation is one line in the Commands leaf: when a line starts with todo: ;flag"); await ev("Page.closeSheet(true)")
    await ev("Page.go('%s')" % song); await ev("T.at('Verse one')"); await pg.keyboard.press("Enter"); await pg.keyboard.type("todo call the studio"); n_undo = await ev("Marks.list().length"); await pg.keyboard.press("Enter"); await pg.wait_for_function("Marks.list().length === %d" % (n_undo + 1)); await settle(pg)
    m = await ev("Marks.list()[0]"); ok(m["waiting"] == "todo call the studio" and m["by"] == "auto:;flag" and "Automation: ;flag ran (1 move)" in await pg.inner_text("#toast") and await ev("Page.lineOf(T.find('todo call')).dataset.m") == "⚑", "write a line that starts with todo and press Return: the automation runs its command, and says what it did")
    await ev("document.querySelector('#toast button').click()"); await settle(pg); ok(await ev("Marks.list().length") == n_undo and await ev("!!T.find('todo call the studio')"), "its run is one Undo (your own line stays)")
    log = " | ".join(await ev("T.log()")); ok("Automation “;flag” ran: ;flag (1 move)" in log and "Automation “;flag” left a bookmark" in log, "the record says an automation made those moves")
    n1 = await ev("Marks.list().length"); await ev("Commands.keep({ code: ';t2', steps: [{ d: 0, text: 'write below todo from a command' }, { d: 0, text: 'write below x' }] })"); await ev("Commands.runAt(Commands.find(';t2'), [])"); await pg.wait_for_timeout(120)
    ok(await ev("Marks.list().length") == n1, "only your own moves set an automation off: a command writing “todo …” doesn't")
    await ev("Commands.openList()"); await ev("document.querySelector('#sheet [data-auto]').click()"); ok(await ev("Commands.autos()[0].on") is False and (await ev("Book.D.lines[Commands.autos()[0].line].text")).startswith("paused when"), "each automation has a switch; off, its line reads “paused when …”")
    await ev("Page.closeSheet(true)"); await ev("T.at('Chorus')"); await pg.keyboard.press("End"); await ev("T.at('Verse one')"); await pg.keyboard.press("Enter"); await pg.keyboard.type("todo nothing"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(150)
    ok(await ev("Marks.list().length") == n1, "switched off, it doesn't run"); await ev("Commands.openList()"); await ev("document.querySelector('#sheet [data-auto]').click()"); await ev("Page.closeSheet(true)")
    # the starting limit: add only, and only in the leaf you're on
    await ev("Commands.keep({ code: ';mover', steps: [{ d: 0, text: 'move up' }] })"); await ev("Commands.keep({ code: ';away', steps: [{ d: 0, text: 'go to Seeds' }, { d: 0, text: 'write below planted from afar' }] })")
    await ev("Commands.keep({ when: 'a line has zebra', code: ';mover' })"); await ev("Commands.keep({ when: 'a line has giraffe', code: ';away' })"); t0 = await ev("T.text()")
    await ev("T.at('Chorus')"); await ev("Page.setCaret({ line: T.find('carry me home') })"); await pg.keyboard.press("Enter"); await pg.keyboard.type("a zebra"); await pg.keyboard.press("Enter"); await pg.wait_for_function("document.querySelector('#toast').textContent.indexOf('stopped') > 0")
    ok("Automations only add" in await pg.inner_text("#toast") and await ev("T.lines().indexOf('a zebra')") == await ev("T.lines().indexOf('carry me home')") + 1, "the starting limit: an automation that tries to move a line is stopped (automations only add)")
    await pg.keyboard.type("a giraffe"); await pg.keyboard.press("Enter"); await pg.wait_for_function("document.querySelector('#toast').textContent.indexOf('only act in the leaf') > 0")
    ok("planted from afar" not in await ev("T.lines(T.leafNamed('Seeds')).join()"), "and one that tries to write in another leaf is stopped (only the leaf you're on)")
    await ev("Commands.keep({ when: 'a new leaf is opened', code: ';song' })"); await ev("Page.go(Book.D.trunk)"); await ev("Page.newLeaf()"); await pg.wait_for_function("T.lines().length === 5")
    ok(await ev("T.lines()") == ["Verse one", "Chorus", "", "Verse two", "Bridge"] and await ev("Book.D.lines[Book.D.leaves[Page.leaf].lines[0]].by") == "auto:;song", "when a new leaf is opened: ;song, a new leaf starts with the song's skeleton")
    await ev("Commands.keep({ code: ';keyg', steps: [{ d: 0, text: 'detail Key = G' }] })"); await ev("Commands.keep({ when: 'a fold is named Refrain', code: ';keyg' })"); await ev("Page.go('%s')" % song); fo = await ev("Book.act('fold', { from: T.find('Verse one') })"); await ev("Book.act('name', { fold: '%s', name: 'Refrain' })" % fo["fold"]); await pg.wait_for_function("(Book.D.folds['%s'].details || {}).Key === 'G'" % fo["fold"])
    ok(True, "when a fold is named Refrain: ;keyg, naming a fold sets its Key")
    # ---- the AI suggests one; kept only when you say so ----
    await ev("AI.open()"); ai.say(("make_automation", {"when": "a line is linked", "command": ";flag"})); ai.say(("text", "It's on."))
    await ask(pg, "Suggest an automation", phone, wait=False); await pg.wait_for_selector(".m.it:last-child .ask.card .allow"); card = await pg.inner_text(".m.it:last-child .ask.card"); n_a = await ev("Commands.autos().length")
    ok("An automation" in card and "a line is linked" in card and ";flag" in card, "the AI can suggest an automation: a card with When and Run"); await ev("document.querySelector('.m.it:last-child .ask.card .allow').click()"); await pg.wait_for_function("!AI.busy")
    ok(await ev("Commands.autos().length") == n_a + 1 and any(a["when"] == "a line is linked" and a["on"] for a in await ev("Commands.autos()")), "Keep: it's written to the Commands leaf and switched on"); await ev("AI.close()")
    # ---- the switches ----
    await ev("Mods.set('autos', false)"); n1 = await ev("Marks.list().length"); await ev("T.at('Verse two')"); await pg.keyboard.press("Enter"); await pg.keyboard.type("todo with automations off"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(150)
    ok(await ev("Marks.list().length") == n1, "Automations switched off: none run"); await ev("Mods.set('autos', true)")
    await ev("Mods.set('commands', false)"); await ev("T.at('todo with automations off')"); await pg.keyboard.press("Enter"); await pg.keyboard.type(";today"); await pg.keyboard.press("Enter"); await settle(pg)
    ok(await ev("!!T.find(';today')") and await pg.locator("#b_cmd.hide").count() == 1 and await ev("Commands.all().length") >= 6, "Commands switched off: ;today is just a line, the ; button goes, and your commands are all still in their leaf"); await ev("Mods.set('commands', true)")
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2])); await ctx.close()

@stage("6")
async def _s6(br, p, url):
    for phone in (True, False): await stage6(br, p, url, phone)
    for phone in (True, False): await guide(br, p, url, 6, phone)

# ====================================================================== stage 7: the harvest
MKLEAF = "([name, text, under]) => { Page.go(under || Book.D.trunk); Page.newLeaf(); Book.act('write', { line: Book.D.leaves[Page.leaf].parent, at: 0, words: name }); if (text) Book.act('write', { line: Book.D.leaves[Page.leaf].lines[0], words: text }); Book.clearUndo(); Page.show(Page.leaf); return Page.leaf; }"
HEADS = ["How it went", "What you did again and again", "Where you got stuck", "What you were waiting on", "How the time was spent"]
async def work(pg, album, river, desert):
    """Real moves in a small project, so its record has something to show (and two earlier days, nine and eight days ago)."""
    ev = pg.evaluate
    await ev("""([river, desert]) => { const past = (ago, e, span) => { const x = Log.add(e); x.t -= ago * 86400000; if (span) x.t2 = x.t + span * 60000; };
      past(9, { who: 'me', what: 'write', leaf: river, c: 300, r: 200 }, 20); past(9, { who: 'me', what: 'time', leaf: river, ms: 20 * 60000 }, 20);
      past(8, { who: 'me', what: 'write', leaf: river, c: 200, r: 30 }, 12); past(8, { who: 'me', what: 'time', leaf: river, ms: 12 * 60000 }, 12); past(8, { who: 'me', what: 'held', leaf: river, ms: 15 * 60000 }, 15);
      Book.act('fold', { from: T.find('Chorus', river), name: 'Chorus' }); Book.act('fold', { from: T.find('Chorus', desert), name: 'Chorus' });
      Book.act('mark', { line: T.find('Verse two', river), waiting: 'the drum take from Sam' });
      Book.act('link', { from: T.find('carry me home', river), to: T.find('make a way', desert), label: 'echoes' });
      Log.time(desert, 6 * 60000); Commands.examples(); }""", [river, desert])
    await ev("Page.go('%s')" % river); await ev("T.at('the rain came down')")
    for _ in range(2): await pg.keyboard.type(" x"); await ev("Book.sealUndo()"); await ev("Page.doUndo()")
    await ev("Commands.runAt(Commands.find(';today'), [])"); await ev("Commands.runAt(Commands.find(';today'), [])"); await ev("Log.saveTail()")

async def stage7(br, p, url, phone):
    who = ("iPhone" if phone else "laptop") + " 7: "; ok = lambda c, m: C.ok(c, who + m)
    ai = FakeAI(); ctx = await device(br, p, phone, ai=ai); pg = await page(ctx, url); ev = pg.evaluate
    album = await ev(MKLEAF, ["Album", "", None]); river = await ev(MKLEAF, ["River song", SONG, album]); desert = await ev(MKLEAF, ["Desert road", "Verse one\n\trivers in the desert\nChorus\n\tmake a way", album])
    await work(pg, album, river, desert); words = await ev("T.text('%s') + T.text('%s')" % (river, desert)); sent = len(ai.seen)
    # ---- where it starts ----
    await ev("Page.go(Book.D.trunk)"); await tap(pg, "#tMenu", phone); items = await ev("[...document.querySelectorAll('#menu button')].map(b => b.textContent)"); await ev("Page.closeMenu()")
    ok(any(i.startswith("Harvest") for i in items), "☰ has Harvest")
    await ev("Harvest.open()"); ok("Open the project's own leaf first" in await pg.inner_text("#sheet") and await pg.locator("#hvStart").count() == 0 and (await ev("Book.act('harvest', { leaf: Book.D.trunk })"))["ok"] is False, "on the trunk it asks you to open the project's own leaf first (a harvest looks at one leaf and everything under it)"); await ev("Page.closeSheet(true)")
    await ev("Page.go('%s')" % album); await ev("Harvest.open()"); await pg.wait_for_selector("#hvStart")
    ok("Start the harvest of “Album”" in await pg.inner_text("#hvStart") and "Nothing is sent anywhere" in await pg.inner_text("#sheet"), "in the project's leaf: Start the harvest of “Album”")
    await tap(pg, "#hvStart", phone); await pg.wait_for_function("!!Harvest.harvestOf('%s') && Page.leaf === Harvest.harvestOf('%s')" % (album, album)); await settle(pg); hv = await ev("Page.leaf")
    # ---- the Harvest leaf: what the record shows ----
    ok(await ev("T.lines('%s')" % album) == ["River song", "Desert road", "Harvest"] and await ev("Book.path(Page.leaf).map(Book.title).join(' › ')") == "Trunk › Album › Harvest", "a Harvest leaf is made as the project's last line, and opens")
    lines = await ev("T.lines()"); txt = "\n".join(lines); depths = await ev("T.depths()")
    ok(all(h in lines for h in HEADS) and lines[-5] == "What to keep" or "What to keep" in lines, "it holds five headings (how it went · again and again · stuck · waiting · time) and What to keep")
    ok(all(depths[lines.index(h)] == 0 and depths[lines.index(h) + 1] == 1 for h in HEADS), "what the record shows is within each heading")
    ok("3 days of work across 10 days" in txt and "3 leaves" in txt and "Who made the moves: you" in txt and ", commands 1." in txt, "how it went: the days, the size, and who made the moves " + json.dumps([l for l in lines if "days" in l or "moves" in l][:3]))
    ok("You gave folds the name “Chorus” twice." in txt and "You ran ;today twice." in txt and "You folded lines twice." in txt and "These lines open more than one of its leaves: Verse one, Chorus." in txt, "what you did again and again: repeated folds, names, commands, and lines your leaves share")
    ok("The longest pause: 7 days with no moves" in txt and "You pressed Undo twice in “River song”." in txt and "You rewrote the most in “River song”" in txt and "You held the clock longest in “River song”: 15 min of holding beside 32 min of typing." in txt, "where you got stuck: the longest pause, Undo, rewriting, long holds " + json.dumps([l for l in lines if "pause" in l or "Undo" in l or "held" in l]))
    ok("Waiting for “the drum take from Sam”: still open after less than a day." in txt, "what you were waiting on: your bookmarks")
    ok("38 min of writing and 15 min of holding" in txt and "Where it went: “River song” 47 min · “Desert road” 6 min." in txt, "how the time was spent: from the writing clock " + json.dumps([l for l in lines if "writing" in l or "went:" in l]))
    ok("A command you could keep: ;chorus" in txt and "Keep in Ways of mine" in txt and "Make this a request" in txt, "What to keep lists a command the record suggests, and says how to keep a lesson or make a request")
    ok(await ev("Book.D.leaves[Page.leaf].lines.every(l => Book.D.lines[l].by === 'book')") and await pg.locator("#pg > .l.by-book").count() == len(lines) and await ev("getComputedStyle(document.querySelector('#pg > .l.by-book')).color !== getComputedStyle(document.querySelector('#ttl')).color"), "every line of it is marked as the book's own (grey), never as yours")
    ok(await ev("T.text('%s') + T.text('%s')" % (river, desert)) == words and len(ai.seen) == sent, "starting a harvest changes none of your writing and sends nothing to an AI")
    log = " | ".join(await ev("T.log()")); ok("You started the harvest of “Album”" in log and "The book wrote what the record shows in “Harvest” (%d lines)" % len(lines) in log, "the record says you started it, and that the book wrote the facts")
    ok(await ev("Book.checkpoint('harvest', { leaf: '%s' }, 'book')" % album) == "The book only writes during a harvest." and (await ev("Book.act('harvest', { leaf: '%s' })" % hv))["why"].startswith("This is a Harvest leaf"), "the book's hand writes only during a harvest; a Harvest leaf can't be harvested itself")
    await ev("Page.doUndo()"); await settle(pg); ok(await ev("T.lines('%s')" % album) == ["River song", "Desert road"] and await ev("Harvest.harvestOf('%s')" % album) is None, "one Undo takes the whole harvest away again")
    r = await ev("Harvest.start('%s').then(r => ({ ok: r.ok, leaf: r.leaf, made: r.made }))" % album); hv = r["leaf"]; await ev("Page.go('%s')" % hv); await settle(pg); ok(r["ok"] and r["made"], "(started again)")
    # ---- your own lines, beside the book's ----
    stuck = await ev("(() => { const lf = Book.D.leaves[Page.leaf], i = lf.lines.findIndex(l => Book.D.lines[l].text === 'Where you got stuck'); return lf.lines[Book.branchEnd(lf, i) - 1]; })()")
    await ev("Page.setCaret({ line: '%s', at: Book.D.lines['%s'].text.length })" % (stuck, stuck)); await pg.keyboard.press("Enter"); await pg.keyboard.type("The second verse. I kept changing the melody."); await settle(pg)
    mine = await ev("T.find('I kept changing')"); ok(await ev("Book.D.lines['%s'].by" % mine) == "me" and await ev("Book.D.lines['%s'].d" % mine) == 1 and await ev("Page.lineOf('%s').className" % mine) == "l" and await ev("Book.D.lines['%s'].by" % stuck) == "book", "you write your own lines under any heading: yours are plain, the book's stay grey")
    # ---- ☰ → Harvest, once it's started: what to keep ----
    await ev("Harvest.open()"); await pg.wait_for_selector("#hvOpen"); sh = await pg.inner_text("#sheet")
    ok("Ask the fast AI for its debrief" in sh and "This sends the record of this project's moves and the Harvest leaf to Claude" in sh and ";chorus" in sh and "You gave folds the name “Chorus” twice." in sh, "from the Harvest leaf, ☰ → Harvest shows what's next: the AI's debrief (saying what would be sent) and what to keep")
    before = await ev("T.canon()"); await ev("document.querySelector('#sheet [data-try]').click()"); tr = await pg.inner_text("#hvTry")
    ok("nothing was kept" in tr and "+ [a fold named “Chorus”" in tr and await ev("T.canon()") == before, "a suggested command can be tried first: it shows what it would do and keeps nothing")
    await ev("document.querySelector('#sheet [data-keep]').click()"); await pg.wait_for_function("!!Commands.find(';chorus')"); await pg.wait_for_function("((document.querySelector('#hvMsg') || {}).textContent || '').indexOf('Kept as ;chorus') === 0")
    ok(await ev("Commands.find(';chorus').steps.map(s => s.text).join()") == "fold as Chorus" and await ev("[...document.querySelectorAll('#sheet [data-keep]')].length") == 1, "Keep: the repeated move is a command in your Commands leaf now (and is no longer suggested)")
    await ev("Page.closeSheet(true)"); await ev("Page.go('%s')" % desert); await ev("T.at('Verse one')"); n0 = await ev("Fold.pieces('Chorus').length"); await ev("Commands.runAt(Commands.find(';chorus'), [])")
    ok(await ev("Fold.pieces('Chorus').length") == n0 + 1, "and it runs like any command"); await ev("Page.doUndo()"); await ev("Page.go('%s')" % hv)
    # ---- reflect together: the fast AI reads the same record ----
    how = await ev("(() => { const lf = Book.D.leaves[Page.leaf], i = lf.lines.findIndex(l => Book.D.lines[l].text === 'How it went'); return lf.lines[Book.branchEnd(lf, i) - 1]; })()")
    ai.say(("write", {"line": how, "how": "after", "words": "Two quick days, a pause, then a slower return."})); ai.say(("text", "I've added my line. What changed in the days you stayed away?"))
    ok(len(ai.seen) == sent, "(nothing has gone to the AI so far)"); await ev("Harvest.open()"); await pg.wait_for_selector("#hvAI"); await tap(pg, "#hvAI", phone)
    await pg.wait_for_function("AI.isOpen && !AI.busy && AI.chat && AI.chat.msgs.length === 2 && AI.chat.msgs[1].parts.length >= 2"); b = ai.seen[-2]; sysm = b["system"]
    ok("THIS CHAT IS A HARVEST" in sysm and "THE RECORD OF EVERY MOVE IN THIS PROJECT" in sysm and "You folded “Chorus” in “River song” as “Chorus”" in sysm and "Command ;today wrote in “River song”" in sysm and "You left a bookmark in “River song”" in sysm, "Ask the fast AI: the record of this project's moves goes along (who did what, and when) " + json.dumps([l for l in sysm.split("\n") if " · " in l][:12]))
    ok(("LEAF “Harvest” (leaf id %s)" % hv) in sysm and "«from the record»" in sysm and "I kept changing the melody." in sysm and "keep_lesson" in json.dumps(b["tools"]) and b["messages"][0]["content"].startswith("Read the record of “Album”"), "so does the Harvest leaf, with the book's lines and yours told apart, and what it may offer to keep")
    ok(await ev("AI.chat.title") == "Harvest of Album" and await ev("Page.leaf") == hv, "it opens as its own chat, on the Harvest leaf")
    al = await ev("T.find('Two quick days')"); ok(await ev("Book.D.lines['%s'].by" % al) == "ai" and "by-ai" in await ev("Page.lineOf('%s').className" % al) and await ev("T.lines().indexOf('Two quick days, a pause, then a slower return.')") == await ev("T.lines().indexOf('How the time was spent')") * 0 + await ev("Book.D.leaves[Page.leaf].lines.indexOf('%s')" % how) + 1, "its debrief goes into the Harvest leaf under the headings, marked as the AI's (purple): three voices, each marked")
    # the AI offers a lesson: a card, kept only when you say so
    ai.say(("keep_lesson", {"line": "I fold the chorus before I write the verses."})); ai.say(("text", "Kept."))
    await ask(pg, "I came back when I stopped forcing the second verse.", phone, wait=False); await pg.wait_for_selector(".m.it:last-child .ask.card .allow"); card = await pg.inner_text(".m.it:last-child .ask.card")
    ok("A line for “Ways of mine”" in card and "I fold the chorus before I write the verses." in card and await ev("Harvest.waysLeaf()") is None, "in the chat the AI can offer a lesson for your Ways of mine leaf: a card, nothing kept yet")
    await ev("document.querySelector('.m.it:last-child .ask.card .allow').click()"); await pg.wait_for_function("!AI.busy"); ways = await ev("Harvest.waysLeaf()")
    ok(await ev("Book.path('%s').map(Book.title).join(' › ')" % ways) == "Trunk › Ways of mine" and await ev("T.lines('%s')" % ways) == ["I fold the chorus before I write the verses."] and await ev("Book.D.lines[Book.D.leaves['%s'].lines[0]].by" % ways) == "ai" and "KEPT" in ai.seen[-1]["messages"][-1]["content"][0]["content"], "Keep: the line goes to a Ways of mine leaf on the trunk (made if it wasn't there), marked as the AI's words")
    ai.say(("keep_lesson", {"line": "Never rest."})); ai.say(("text", "Okay."))
    await ask(pg, "Anything else?", phone, wait=False); await pg.wait_for_selector(".m.it:last-child .ask.card .row"); sysm2 = ai.seen[-1]["system"]; await ev("[...%s.querySelectorAll('.ask.card .row button')].pop().click()" % LAST); await pg.wait_for_function("!AI.busy")
    ok(await ev("T.lines('%s').length" % ways) == 1 and "NOT KEPT" in ai.seen[-1]["messages"][-1]["content"][0]["content"], "Don't: nothing is kept")
    ok("THE WRITER'S OWN WAYS" in sysm2 and "I fold the chorus before I write the verses." in sysm2, "and from then on the AI follows your Ways of mine in every chat"); await ev("AI.close()")
    # ---- keeping a lesson and making a request yourself, from a line ----
    await ev("Page.setCaret({ line: '%s' })" % mine); ok(await ev("T.menu('Keep in Ways of mine')"), "⌄ on a line in the Harvest leaf: Keep in Ways of mine"); await settle(pg)
    ok(await ev("T.lines('%s')" % ways) == ["I fold the chorus before I write the verses.", "The second verse. I kept changing the melody."] and await ev("Book.D.lines[Book.D.leaves['%s'].lines[1]].by" % ways) == "me" and "Kept in Ways of mine" in await pg.inner_text("#toast") and await ev("!!T.find('I kept changing')"), "the line is copied there as yours (it stays in the Harvest leaf too)")
    await ev("T.menu('Keep in Ways of mine')"); ok("already in Ways of mine" in await pg.inner_text("#msg") and await ev("T.lines('%s').length" % ways) == 2, "the same line isn't kept twice")
    log = " | ".join(await ev("T.log()")); ok("You kept a line in “Ways of mine”: “The second verse. I kept changing the melody.”" in log and "The AI kept a line in “Ways of mine”" in log, "the record says who kept each lesson")
    ok(await ev("T.menu('Make this a request')"), "⌄ → Make this a request…"); await pg.wait_for_selector("#sheet textarea[data-f=want]")
    ok(await pg.input_value("#sheet textarea[data-f=want]") == "The second verse. I kept changing the melody.", "the request card opens with that line as what you want"); await ev("Page.closeSheet(true)")
    await ev("Page.go('%s')" % river); await ev("T.at('Verse one')"); ok(not await ev("Page.menuItems().some(i => i && i[0].indexOf('Keep in Ways of mine') === 0)"), "(those two are only offered in a Harvest leaf)")
    # ---- today's facts again; it stays the project's last leaf ----
    await ev("Page.go('%s')" % hv); n0 = await ev("T.lines().length"); await ev("Harvest.open()"); await pg.wait_for_selector("#hvAgain"); await ev("document.querySelector('#hvAgain').click()"); await pg.wait_for_function("T.lines('%s').length > %d" % (hv, n0)); await ev("Page.closeSheet(true)"); await settle(pg)
    lines2 = await ev("T.lines()"); d2 = await ev("T.depths()"); i = next(k for k, l in enumerate(lines2) if l.startswith("What the record shows now"))
    ok(i == n0 and d2[i] == 0 and lines2[i + 1] == "How it went" and d2[i + 1] == 1 and d2[i + 2] == 2 and lines2[:n0] == await ev("T.lines().slice(0, %d)" % n0) and "I kept changing" in "\n".join(lines2[:n0]), "Write today's facts again adds a new dated branch at the end; nothing earlier is touched")
    ok(await ev("T.lines('%s')" % album) == ["River song", "Desert road", "Harvest"] and await ev("Object.keys(Book.D.more.harvests).length") == 1, "the Harvest leaf stays as the project's last leaf (one harvest per project)")
    await ev("Page.go(Book.D.trunk)"); await ev("Harvest.open()"); ok("Harvests so far" in await pg.inner_text("#sheet") and "Album" in await pg.inner_text("#sheet .rows"), "from the trunk, ☰ → Harvest lists the harvests so far"); await ev("document.querySelector('#sheet [data-h]').click()"); ok(await ev("Page.leaf") == hv, "and opens one")
    # ---- modules: each a switch; off never deletes; none needs another ----
    await ev("Settings.open()"); mods = await ev("[...document.querySelectorAll('#sheet [data-mod]')].map(c => c.dataset.mod)"); await ev("Page.closeSheet(true)")
    ok(mods == ["clock", "search", "fold", "link", "map", "marks", "ai", "requests", "commands", "autos", "harvest", "outside"], "Settings lists every module with its switch: " + ",".join(mods))
    await ev("Mods.set('harvest', false)"); await tap(pg, "#tMenu", phone); items = await ev("[...document.querySelectorAll('#menu button')].map(b => b.textContent)"); await ev("Page.closeMenu()"); await ev("Page.setCaret({ line: '%s' })" % mine)
    ok(not any(i.startswith("Harvest") for i in items) and "switched off" in (await ev("Book.act('lesson', { text: 'x' })"))["why"] and not await ev("Page.menuItems().some(i => i && i[0].indexOf('Keep in Ways') === 0)") and await ev("T.lines().length") == len(lines2) and await ev("T.lines('%s').length" % ways) == 2, "Harvest switched off: it leaves the menus and its moves are refused, and the Harvest leaf and Ways of mine are all still there")
    await ev("Mods.set('harvest', true)"); await ev("Mods.set('fold', false)"); await ev("Mods.set('ai', false)"); await ev("Mods.set('commands', false)")
    r = await ev("Harvest.start('%s').then(r => ({ ok: r.ok, made: r.made, leaf: r.leaf }))" % river); await ev("Page.go('%s')" % river); await ev("Harvest.open()"); await pg.wait_for_selector("#hvOpen")
    ok(r["ok"] and r["made"] and await ev("T.lines('%s').pop()" % river) == "Harvest" and await pg.locator("#hvAI").count() == 0 and "Commands are switched off" in await pg.inner_text("#sheet"), "with Fold, the fast AI and Commands switched off, a harvest still works (a leaf's own harvest, without the parts that are off)"); await ev("Page.closeSheet(true)")
    await ev("Page.go(Book.D.trunk)"); n0 = await ev("Book.leaves().length"); await tap(pg, "#plus", phone); await settle(pg); ok(await ev("Book.leaves().length") == n0 + 1 and await ev("Page.leaf !== Book.D.trunk"), "and ＋ still makes a new leaf with Fold off (leaves are the core's)")
    for m in ("fold", "ai", "commands"): await ev("Mods.set('%s', true)" % m)
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2])); await ctx.close()

async def sync3(br, p, url):
    """A harvest, the lessons kept and the record travel between devices; who wrote each line travels with them."""
    gh = FakeGitHub(); gh.refs["tol-data"] = "d" * 40; A = await device(br, p, False, gh); Bc = await device(br, p, True, gh)
    for ctx in (A, Bc): await ctx.add_init_script("try { localStorage.setItem('tol-gh-token', JSON.stringify('ghp_test')); } catch (e) {}")
    a = await page(A, url); album = await a.evaluate(MKLEAF, ["Album", "", None]); river = await a.evaluate(MKLEAF, ["River song", SONG, album]); desert = await a.evaluate(MKLEAF, ["Desert road", "Verse one\n\trivers in the desert\nChorus\n\tmake a way", album])
    await work(a, album, river, desert); hv = await a.evaluate("Harvest.start('%s').then(r => r.leaf)" % album); await a.evaluate("Book.act('lesson', { text: 'I fold the chorus first.' })")
    await a.evaluate("Lock.turnOn('willow bridge candle seven')"); await a.wait_for_function("Lock.label().indexOf('Synced') === 0")
    b = await page(Bc, url); await b.evaluate("Lock.turnOn('willow bridge candle seven')"); await b.wait_for_function("!!T.leafNamed('Ways of mine') && !!T.leafNamed('Harvest')"); await settle(b)
    got = await b.evaluate("(() => { const al = T.leafNamed('Album'), h = Harvest.harvestOf(al); return { h, last: T.lines(al).pop(), book: h && Book.D.leaves[h].lines.every(l => Book.D.lines[l].by === 'book'), lines: h && T.lines(h).length, ways: T.lines(T.leafNamed('Ways of mine')) }; })()")
    C.ok(got["h"] == hv and got["last"] == "Harvest" and got["book"] and got["lines"] == await a.evaluate("T.lines('%s').length" % hv) and got["ways"] == ["I fold the chorus first."], "sync: the Harvest leaf arrives on the other device as the project's harvest, its lines still marked as the book's, and Ways of mine with it " + json.dumps(got))
    await b.evaluate("Page.go('%s')" % hv); await settle(b); C.ok(await b.locator("#pg > .l.by-book").count() == got["lines"], "sync: the book's lines are grey there too")
    logb = " | ".join(await b.evaluate("T.log()")); C.ok("You started the harvest of “Album”" in logb and "The book wrote what the record shows" in logb, "sync: the record of the harvest travels too")
    blob = " ".join(v[0].decode(errors="ignore") for v in gh.files.values()); C.ok("drum take" not in blob and "fold the chorus" not in blob and "longest pause" not in blob, "sync: nothing readable is written to the repository")
    for ctx in (A, Bc): await ctx.close()

@stage("7")
async def _s7(br, p, url):
    for phone in (True, False): await stage7(br, p, url, phone)
    await sync3(br, p, url)
    for phone in (True, False): await guide(br, p, url, 7, phone)

# ====================================================================== stage 8: Claude, outside the app
import subprocess, tempfile
TOOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools", "outside.mjs")
def node(*a): return subprocess.run(["node", TOOL] + list(a), capture_output=True, text=True)
async def outside(br, p, url):
    """Claude, outside the app: off until switched on; a sealed copy only Claude's key opens; deliveries sealed for the device, claimed once, added with Claude's own hand, one Undo."""
    tmp = tempfile.mkdtemp(); pub, priv = os.path.join(tmp, "pub.json"), os.path.join(tmp, "priv.jwk")
    r = node("keygen", pub, priv); C.ok(r.returncode == 0, "outside: the tool makes a key pair " + r.stderr[:80])
    gh = FakeGitHub(); gh.refs["tol-data"] = "d" * 40
    A = await device(br, p, True, gh)
    await A.add_init_script("try { localStorage.setItem('tol-gh-token', JSON.stringify('ghp_test')); } catch (e) {}")
    await A.route("**/core/outside-key.json*", lambda rt: rt.fulfill(status=200, content_type="application/json", body=open(pub).read()))
    a = await page(A, url)
    C.ok(not await a.evaluate("Mods.on('outside')"), "outside: it is off until you switch it on")
    await a.evaluate("Book.act('write', { line: Book.D.leaves[Book.D.trunk].lines[0], at: 0, words: 'the river is high ' })")
    await a.evaluate("Lock.turnOn('willow bridge candle seven')"); await a.wait_for_function("Lock.label().indexOf('Synced') === 0")
    await a.evaluate("Outside.tick(true)"); await a.wait_for_timeout(300)
    C.ok(not [k for k in gh.files if k.startswith("core/outside/")], "outside: switched off, nothing is sent to Claude")
    await a.evaluate("Mods.set('outside', true)")
    dev = await a.evaluate("Lock.deviceId")
    for _ in range(60):
        if ("core/outside/books/%s.json" % dev) in gh.files and ("core/outside/keys/%s.json" % dev) in gh.files: break
        await a.wait_for_timeout(100)
    book = gh.files.get("core/outside/books/%s.json" % dev, (b"", ""))[0].decode()
    C.ok(book and "river" not in book and json.loads(book)["format"] == "bolw-outside-book", "outside: switched on, a sealed copy of the book is sent, and it can't be read on the public project")
    bf = os.path.join(tmp, "book.json"); open(bf, "w").write(book); r = node("open", bf, priv)
    st = json.loads(r.stdout) if r.returncode == 0 else {}
    C.ok(st.get("deviceId") == dev and "the river is high" in json.dumps(st.get("book", {})), "outside: Claude's private key opens it and reads the book " + r.stderr[:80])
    wrong = os.path.join(tmp, "wrong.jwk"); node("keygen", os.path.join(tmp, "p2.json"), wrong)
    C.ok(node("open", bf, wrong).returncode != 0, "outside: any other key opens nothing")
    kf = os.path.join(tmp, "key.json"); open(kf, "w").write(gh.files["core/outside/keys/%s.json" % dev][0].decode())
    dfile = os.path.join(tmp, "d.json"); json.dump({"id": "dtest0001", "title": "Psalm 91 to start", "steps": ["write below Psalm 91", "write within KJV", "write within 1 He that dwelleth in the secret place", "write below 2 I will say of the LORD", "go up", "go up", "fold as KJV Fold", "go up", "lift"]}, open(dfile, "w"))
    r = node("seal", dfile, kf); sealed = r.stdout
    C.ok(r.returncode == 0 and "dwelleth" not in sealed, "outside: a delivery is sealed for the device's key, unreadable on the public project " + r.stderr[:80])
    gh.plant("core/outside/inbox/dtest0001.json", sealed.encode())
    await a.evaluate("Outside.tick()"); await a.wait_for_function("!!Object.values(Book.D.lines).find(l => l.text.indexOf('He that dwelleth') >= 0)", timeout=15000)
    pl = await a.evaluate("(() => { const L = Object.values(Book.D.lines).find(l => l.text === 'Psalm 91'); return { leaf: !!L.leaf, title: L.leaf ? Book.title(L.leaf) : '', by: L.by, fold: Object.values(Book.D.folds).filter(f => f.name === 'KJV Fold').length }; })()")
    C.ok(pl == {"leaf": True, "title": "Psalm 91", "by": "outside:Claude", "fold": 1}, "outside: the delivery arrives by itself: a Psalm 91 leaf with the verses in the KJV Fold, written by Claude's own hand " + json.dumps(pl))
    C.ok("core/outside/done/dtest0001.json" in gh.files and "dwelleth" not in gh.files["core/outside/done/dtest0001.json"][0].decode(), "outside: the device claims the delivery (so no other device adds it twice), and the claim has no writing in it")
    rec = await a.evaluate("T.log()")
    C.ok(any(x.startswith("Claude (outside the app)") for x in rec), "outside: the record of every move says Claude (outside the app) made the moves")
    await a.evaluate("Outside.tick()"); await a.wait_for_timeout(500)
    C.ok(await a.evaluate("Object.values(Book.D.lines).filter(l => l.text === 'Psalm 91').length") == 1, "outside: a delivery is added once, never twice")
    await a.evaluate("Book.undo(); Page.redraw()")
    C.ok(await a.evaluate("!Object.values(Book.D.lines).some(l => l.text === 'Psalm 91' && Book.alive(l.in))"), "outside: one Undo takes the whole delivery back")
    await a.evaluate("Book.act('write', { line: Book.D.leaves[Book.D.trunk].lines[0], at: 0, words: 'mine ' })")
    json.dump({"id": "dtest0002", "title": "too far", "steps": ["write below fine", "go to Nowhere at all"]}, open(dfile, "w"))
    gh.plant("core/outside/inbox/dtest0002.json", node("seal", dfile, kf).stdout.encode())
    await a.evaluate("Outside.tick()"); await a.wait_for_function("Outside.state.log.some(e => e.id === 'dtest0002')", timeout=15000)
    C.ok(await a.evaluate("!Object.values(Book.D.lines).some(l => l.text === 'fine' && Book.alive(l.in)) && Outside.state.log.find(e => e.id === 'dtest0002').ok === false"), "outside: a delivery that doesn't fit is taken back whole, and Claude is told why")
    C.ok(await a.evaluate("(() => { try { Book.hand('outside'); return false; } catch (e) { return true; } })()"), "outside: Claude's hand can't be taken by anything else")
    C.ok(a.errs == [], "outside: no errors " + str(a.errs[:2])); await A.close()

@stage("8")
async def _s8(br, p, url): await outside(br, p, url)

#STAGES-BELOW

async def main():
    port = int(os.environ.get("PORT", 8811)); serve(port); url = "http://localhost:%d/" % port
    async with async_playwright() as p:
        br = await launch(p)
        for n in sorted(STAGES):
            if ONLY and n not in ONLY: continue
            for fn in STAGES[n]: await fn(br, p, url)
        await br.close()
    print("\n%d passed, %d failed" % (C.passes, C.fails)); sys.exit(1 if C.fails else 0)

if __name__ == "__main__": asyncio.run(main())
