"""Folds on one device: create, overlap, pick, edit around, staircase, focus view, resume,
export/import, old data, alignment of the fold lines. Run:  python3 tests/test_folds.py"""
import asyncio, json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, launch
from playwright.async_api import async_playwright

C = Checks()
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())

SEL = """([needle, from, len]) => {
  const t = [...document.querySelectorAll('#writer textarea')].find(x => x.value.includes(needle));
  if (!t) return false;
  const i = t.value.indexOf(needle) + from;
  t.focus(); t.setSelectionRange(i, i + len);
  document.dispatchEvent(new Event('selectionchange'));
  t.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));   // as if tapped
  return true; }"""

async def select(pg, needle, frm=0, ln=None):
    ok = await pg.evaluate(SEL, [needle, frm, len(needle) if ln is None else ln])
    await pg.evaluate("new Promise(r => setTimeout(r, 200))")
    return ok

async def nest_new(pg, needle, frm=0, ln=None, inner=None):
    assert await select(pg, needle, frm, ln), needle
    await pg.wait_for_selector("#foldbar [data-b=nest]", state="visible")
    await pg.click("#foldbar [data-b=nest]")
    await pg.click("#foldbar [data-b=new]")
    await pg.wait_for_timeout(150)
    if inner:
        await pg.keyboard.type(inner, delay=3)

async def pages(pg):
    return {k: v for k, v in (await pg.evaluate("window.TOL.data().pages")).items() if not v.get("deleted")}

async def root_id(pg):
    return await pg.evaluate("JSON.parse(localStorage.getItem('tol-ui')).last")

def by_text(ps, start):
    return next(v for v in ps.values() if (v.get("text") or "").startswith(start))

async def close_all(pg):
    while await pg.locator("#writer .fold [data-close]").count():
        await pg.locator("#writer .fold [data-close]").first.click()
        await pg.wait_for_timeout(50)

async def alignment(pg, label):
    """Each text box and its backdrop (which draws the fold lines) must wrap identically."""
    res = await pg.evaluate("""() => [...document.querySelectorAll('#writer .chunk')].map(ch => {
      const t = ch.querySelector('textarea'), bd = ch.querySelector('.bd');
      const w = document.createTreeWalker(bd, NodeFilter.SHOW_TEXT); let n, last = null;
      while ((n = w.nextNode())) if (n.length) last = n;
      let lastBottom = null;
      if (last && t.value.length) { const r = document.createRange(); const k = Math.max(0, last.length - 2); r.setStart(last, k); r.setEnd(last, k + 1);
        const rs = r.getClientRects(); if (rs.length) lastBottom = rs[rs.length - 1].bottom; }
      const tr = t.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(t).lineHeight);
      return { th: t.scrollHeight, bh: bd.scrollHeight, lines: Math.round(t.scrollHeight / lh), lastOff: lastBottom === null ? null : tr.bottom - lastBottom, lh };
    })""")
    bad = [r for r in res if abs(r["th"] - r["bh"]) > 3 and r["lines"] > 0]
    C.ok(not bad, f"{label}: every text box wraps the same as its fold lines ({len(res)} boxes)" + (f" {bad}" if bad else ""))
    lastbad = [r for r in res if r["lastOff"] is not None and not (0 <= r["lastOff"] < r["lh"] * 1.2)]
    C.ok(not lastbad, f"{label}: the last line of text sits on the last line of each box" + (f" {lastbad}" if lastbad else ""))

LONG = ("The tree is brown. I still set the table for two, and your chair still faces the window where "
        "the light comes in sideways every afternoon like it remembers something supercalifragilisticexpialidocious.")

async def main():
    url = serve(8812)
    async with async_playwright() as p:
        br = await launch(p)
        ctx, pg = await new_device(br, url, token=False, viewport={"width": 1280, "height": 800}, accept_downloads=True)

        # ---------- create: sentence, word, single character ----------
        await pg.click("#writer textarea")
        await pg.keyboard.type("The tree is brown.\nMy chair faces the window.", delay=3)
        root = await root_id(pg)
        await nest_new(pg, "The tree is brown.", inner="Whole sentence fold.")
        await pg.click("#writer > .node > .chunk textarea")   # back to the page text
        await nest_new(pg, "tree", inner="One word fold.")
        await nest_new(pg, "brown", 0, 1, inner="One letter fold.")
        ps = await pages(pg)
        folds = [v for v in ps.values() if v.get("anchor")]
        C.ok(sorted(f["anchor"]["text"] for f in folds) == sorted(["The tree is brown.", "tree", "b"]), "folds made on a whole sentence, a word and one character")
        C.ok(all(f["parentId"] == root for f in folds), "all three folds belong to the page")

        # ---------- overlap: distinct lines and colors ----------
        await nest_new(pg, "tree is", inner="Overlap one.")
        await nest_new(pg, "is brown", inner="Overlap two.")
        pl = await pg.evaluate("id => window.TOL.folds.placed(id)", root)
        C.ok(len(pl) == 5, "five folds placed on the first line")
        over = [(a, b) for a in pl for b in pl if a["id"] < b["id"] and a["s"] < b["e"] and b["s"] < a["e"]]
        C.ok(over and all(a["level"] != b["level"] for a, b in over), "overlapping folds sit on different lines")
        C.ok(all(a["color"] != b["color"] for a, b in over), "overlapping folds have different colors")
        stack = await pg.evaluate("""() => { const bd = document.querySelector('#writer .node > .chunk .bd');
            const spans = [...bd.querySelectorAll('span.fm')]; const s = spans.find(x => x.textContent.includes('is'));
            return s ? (s.getAttribute('style').match(/linear-gradient/g) || []).length : 0 }""")
        C.ok(stack >= 3, f"the words 'is' show {stack} stacked lines (sentence + two overlaps)")

        # ---------- picker for several folds at one spot ----------
        await close_all(pg)   # fold everything away so the page is one box
        await select(pg, "is brown", 1, 0)   # caret inside "is"
        btns = await pg.locator("#foldbar [data-b=toggle]").count()
        C.ok(btns >= 3, f"caret inside overlapping words lists {btns} folds to choose from")
        dots = await pg.evaluate("[...document.querySelectorAll('#foldbar .fdot')].map(d => d.style.background)")
        C.ok(len(set(dots)) == len(dots), "each choice shows its own color")
        await pg.click("#foldbar [data-b=toggle] >> nth=0")
        C.ok(await pg.locator("#writer .fold").count() == 1, "choosing one opens just that fold, in place")

        # ---------- anchors follow edits ----------
        await close_all(pg)
        t0 = pg.locator("#writer textarea").first
        await t0.click(); await pg.keyboard.press("Control+Home"); await pg.keyboard.type("Yes, ", delay=3)
        ps = await pages(pg)
        word = next(v for v in ps.values() if v.get("anchor", {}).get("text") == "tree")
        txt = ps[root]["text"]
        C.ok(txt[word["anchor"]["start"]:word["anchor"]["end"]] == "tree", "typing before a fold moves it along with its word")
        await select(pg, "tree", 2, 0); await pg.keyboard.type("XX", delay=3)
        ps = await pages(pg); word = ps[word["id"]]
        C.ok(word["anchor"]["text"] == "trXXee", "typing inside folded words grows the fold")
        await select(pg, "trXXee", 6, 0); await pg.keyboard.type("s", delay=3)
        ps = await pages(pg)
        C.ok(ps[word["id"]]["anchor"]["text"] == "trXXee", "typing right after the folded word doesn't stretch the fold")
        letter = next(v for v in ps.values() if v.get("anchor", {}).get("text") == "b")
        await select(pg, "brown", 0, 1); await pg.keyboard.press("Backspace")
        ps = await pages(pg)
        C.ok(letter["id"] in ps and await pg.evaluate("id => window.TOL.folds.unattached(id)", letter["id"]), "deleting all of a fold's words keeps the fold, marked unattached")
        await pg.wait_for_timeout(900)
        if await pg.locator(f"#list [data-tw='{root}']").text_content() == "▸":
            await pg.click(f"#list [data-tw='{root}']")
        lst = await pg.text_content("#list")
        C.ok("unattached" in lst, "the page list shows the unattached fold")

        # ---------- staircase, three levels deep ----------
        await pg.click("#newTop")
        await pg.keyboard.type("Level zero line about the river.\nSecond line.", delay=3)
        r2 = await root_id(pg)
        await nest_new(pg, "river", inner="Level one, about the bridge.")
        await nest_new(pg, "bridge", inner="Level two: the old stones.")
        await nest_new(pg, "stones", inner="Level three")
        C.ok(await pg.locator("#writer .fold .fold .fold").count() == 1, "three folds open in a staircase, one inside the other")
        before = await pg.text_content("#total")
        await pg.keyboard.type(" and moss growing between them", delay=60)
        await pg.wait_for_timeout(300)
        after = await pg.text_content("#total")
        C.ok(after != before, f"typing three levels deep runs the writing clock ({before} → {after})")
        ps = await pages(pg)
        deep = by_text(ps, "Level three")
        C.ok(deep["text"].endswith("between them"), "the deepest fold is edited directly in place")
        indents = await pg.evaluate("[...document.querySelectorAll('#writer .fold')].map(f => Math.round(f.getBoundingClientRect().left))")
        C.ok(indents == sorted(indents) and len(set(indents)) == 3, f"each level steps further in {indents}")
        await pg.screenshot(path=os.path.join(SHOTS, "folds-laptop-staircase.png"))
        await alignment(pg, "laptop staircase")

        # ---------- focus view, step out, crumbs ----------
        lvl1 = by_text(ps, "Level one"); lvl2 = by_text(ps, "Level two")
        await pg.click(f"#writer [data-own='{lvl2['id']}']")
        crumbs = await pg.text_content("#crumbs")
        C.ok(await root_id(pg) == lvl2["id"] and "Step out" in crumbs and "Book" in crumbs, f"'Open on its own' makes the fold the page: {crumbs}")
        C.ok(await pg.locator("#writer .fold").count() == 1, "its own fold still unfolds inside it")
        await pg.click("#crumbs .crumb.out")
        C.ok(await root_id(pg) == lvl1["id"], "Step out goes up one level")
        C.ok(await pg.locator(f"#writer [data-fold='{lvl2['id']}']").count() == 1, "…with the fold you were in open in place")
        await pg.click(f"#crumbs [data-crumb='{r2}']")
        C.ok(await root_id(pg) == r2 and await pg.locator("#writer .fold .fold").count() >= 1, "a crumb opens that level with the way back open")

        # ---------- resume where you left off ----------
        await pg.locator(f"#writer [data-fold='{deep['id']}'] textarea").first.click()
        await pg.keyboard.press("End")
        await pg.wait_for_timeout(500)
        await pg.reload(); await pg.wait_for_timeout(500)
        foc = await pg.evaluate("(() => { const t = document.activeElement; return t && t._c ? [t._c.id, t.selectionStart, t.value.length] : null })()")
        C.ok(foc and foc[0] == deep["id"] and foc[1] == foc[2], f"reopening puts you back in the deepest fold, at the end ({foc})")

        # ---------- chunk edges: Backspace joins across an open fold ----------
        await pg.click("#newTop")
        await pg.keyboard.type("alpha beta\ngamma delta", delay=3)
        await nest_new(pg, "beta", inner="inside")
        boxes = pg.locator("#writer > .node > .chunk textarea")
        C.ok(await boxes.count() == 2, "an open fold splits the page text around it")
        await boxes.nth(1).click(); await pg.keyboard.press("Control+Home"); await pg.keyboard.press("Backspace")
        ps = await pages(pg); r3 = await root_id(pg)
        C.ok(ps[r3]["text"] == "alpha betagamma delta", "Backspace at the start joins the lines above and below the fold")
        await pg.keyboard.press("Enter")
        ps = await pages(pg)
        C.ok(ps[r3]["text"] == "alpha beta\ngamma delta", "Enter puts the line break back")

        # ---------- show/hide fold lines ----------
        await pg.click("#foldsToggle")
        C.ok(await pg.locator("#writer span.fm").count() == 0 and "hidden" in await pg.text_content("#foldsToggle"), "'Folds hidden' removes the lines")
        await pg.click("#foldsToggle")
        C.ok(await pg.locator("#writer span.fm").count() > 0, "'Folds shown' brings them back")

        # ---------- export / import keeps folds ----------
        await pg.click("#settingsBtn")
        async with pg.expect_download() as dl:
            await pg.click("#exp")
        path = await (await dl.value).path()
        exp = json.load(open(path))
        C.ok(sum(1 for v in exp["pages"].values() if v.get("anchor")) >= 8, "export includes every fold's anchor")
        await pg.keyboard.press("Escape")
        ctx2, pg2 = await new_device(br, url, token=False, viewport={"width": 1280, "height": 800})
        await pg2.click("#settingsBtn")
        await pg2.set_input_files("#imp", path); await pg2.wait_for_timeout(400)
        p2 = {k: v for k, v in (await pg2.evaluate("window.TOL.data().pages")).items() if not v.get("deleted")}
        C.ok(sum(1 for v in p2.values() if v.get("anchor")) == sum(1 for v in exp["pages"].values() if v.get("anchor")), "import brings the folds back")
        await pg2.keyboard.press("Escape")
        await pg2.evaluate(f"window.TOL.goTo('{r2}', 0, Date.now())"); await pg2.wait_for_timeout(200)
        C.ok(len(await pg2.evaluate("id => window.TOL.folds.placed(id)", r2)) == 1, "imported folds find their words")
        C.ok(not pg2.errs, f"no errors on the importing device {pg2.errs}")

        # ---------- old data from before folds ----------
        ctx3 = await br.new_context(viewport={"width": 1280, "height": 800})
        await ctx3.add_init_script("""if (!localStorage.getItem('tol-pages')) {
          localStorage.setItem('tol-pages', JSON.stringify({p1:{id:'p1',parentId:null,text:'Old lyric\\nSecond old line',cursor:4,createdAt:1,updatedAt:2},
                                                          p2:{id:'p2',parentId:'p1',text:'Old inner page',cursor:0,createdAt:1,updatedAt:1}}));
          localStorage.setItem('tol-ui', JSON.stringify({last:'p1',pause:4,goal:5,open:{}})); }""")
        pg3 = await ctx3.new_page(); pg3.errs = []; pg3.on("pageerror", lambda e: pg3.errs.append(str(e)))
        await pg3.goto(url); await pg3.wait_for_timeout(400)
        C.ok(await pg3.locator("#writer textarea").first.input_value() == "Old lyric\nSecond old line", "pages from before folds open as they were")
        C.ok("1 inside" in await pg3.text_content("#list"), "old pages inside pages still listed")
        await nest_new(pg3, "lyric", inner="new fold in old page")
        C.ok(await pg3.locator("#writer .fold").count() == 1 and not pg3.errs, "folds work on an old page")

        # ---------- phone ----------
        ctx4, ph = await new_device(br, url, token=False, **p.devices["iPhone 13"])
        await ph.click("#writer textarea")
        await ph.keyboard.type(LONG + "\nA second line about the swing.", delay=1)
        await nest_new(ph, "tree is brown")
        await ph.keyboard.type("Grandfather planted it the year I was born.", delay=1)
        await ph.locator("#writer > .node > .chunk textarea").first.click()
        await nest_new(ph, "is brown. I still", inner="overlapping fold")
        await ph.locator("#writer > .node > .chunk textarea").first.click()
        await nest_new(ph, "brown", inner="third")
        await ph.screenshot(path=os.path.join(SHOTS, "folds-phone-staircase.png"))
        await alignment(ph, "iPhone")
        bar_ok = await ph.evaluate("""(() => { const t = [...document.querySelectorAll('#writer textarea')][0]; t.focus(); t.setSelectionRange(4, 8);
              document.dispatchEvent(new Event('selectionchange')); return new Promise(r => setTimeout(() => { const b = document.getElementById('foldbar').getBoundingClientRect();
              r(!document.getElementById('foldbar').hidden && b.left >= 0 && b.right <= innerWidth); }, 300)); })()""")
        C.ok(bar_ok, "on the iPhone the Nest bar appears fully on screen")
        await ph.screenshot(path=os.path.join(SHOTS, "folds-phone-nestbar.png"))
        # laptop long paragraph with overlapping folds
        await pg.click("#newTop")
        await pg.keyboard.type(LONG, delay=1)
        await nest_new(pg, "table for two", inner="x")
        await pg.locator("#writer > .node > .chunk textarea").first.click()
        await nest_new(pg, "two, and your chair", inner="y")
        await pg.locator("#writer > .node > .chunk textarea").first.click()
        await nest_new(pg, "supercalifragilisticexpialidocious")
        await alignment(pg, "laptop long paragraph")
        await pg.evaluate("window.TOL.setTheme(Object.assign(window.TOL.getTheme(), {font:'typewriter', size: 23}))"); await pg.wait_for_timeout(300)
        await alignment(pg, "laptop typewriter look")
        await pg.screenshot(path=os.path.join(SHOTS, "folds-laptop-overlap.png"))

        for name, x in (("laptop", pg), ("phone", ph)):
            C.ok(not x.errs, f"no page errors on the {name} {x.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
