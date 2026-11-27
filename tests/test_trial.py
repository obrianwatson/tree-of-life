"""Trial #01 · Book Phase (docs/trial/): the six actions through one layer, on a phone-sized and a laptop-sized screen.
Run:  python3 tests/test_trial.py"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, launch, BROWSER
from playwright.async_api import async_playwright

C = Checks()
PIECES = ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "1h", "book"]

async def device(br, p, phone):
    kw = dict(p.devices["iPhone 13"]) if phone else {"viewport": {"width": 1280, "height": 800}}
    kw.pop("default_browser_type", None)
    if BROWSER == "firefox": kw.pop("is_mobile", None)
    ctx = await br.new_context(**kw)
    await ctx.add_init_script("window.__bolwBoot = { ok: true };")
    return ctx

async def page(ctx, url, piece, quick=False):
    pg = await ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    await pg.goto(url + "trial/" + piece + "/" + ("?quick" if quick else "")); await inject(pg)
    return pg

async def inject(pg):
    await pg.wait_for_function("!!window.TrialView")
    await pg.evaluate("""() => { window.__gate = []; const c = Book.checkpoint; Book.checkpoint = (n, needs, by) => { window.__gate.push(n + ':' + by); return c(n, needs, by); };
        window.at = (txt, off) => { const s = TrialView.find(txt), L = Book.D.lines[s.line]; return TrialView.setCaret({ where: s.where, line: s.line, at: off == null ? L.text.length : off }); };
        window.snap = () => { const sort = o => Array.isArray(o) ? o.map(sort) : o && typeof o === 'object' ? Object.keys(o).sort().reduce((a, k) => (a[k] = sort(o[k]), a), {}) : o; return JSON.stringify(sort([Book.D.folds, Book.D.boxes, Book.D.lines])); };
        window.lines = box => Book.D.boxes[box || Book.D.current].lines.map(l => Book.D.lines[l].text);
        window.selectLines = (a, b) => { const A = document.querySelector('.l[data-id="' + TrialView.find(a).line + '"]'), Z = document.querySelector('.l[data-id="' + TrialView.find(b).line + '"]');
            const r = document.createRange(); r.setStart(A.firstChild.nodeType === 3 ? A.firstChild : A.querySelector('.cv:last-of-type, .cv').firstChild || A, 2); const zt = document.createTreeWalker(Z, NodeFilter.SHOW_TEXT).nextNode(); r.setEnd(zt, 3);
            A.closest('.pc').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }; }""")

async def tap(pg, sel, phone):
    if phone and BROWSER != "firefox": await pg.tap(sel)
    else: await pg.click(sel)

async def run(br, p, url, phone):
    who = "iPhone" if phone else "laptop"
    ctx = await device(br, p, phone)

    # ---------- 1a: writing ----------
    pg = await page(ctx, url, "1a")
    await pg.evaluate("at('restoreth')"); await pg.keyboard.type(" Amen."); await pg.keyboard.press("Enter"); await pg.keyboard.type("My own line"); await pg.wait_for_timeout(250)
    L = await pg.evaluate("lines()")
    C.ok(L[-2:] == ["He restoreth my soul. Amen.", "My own line"], f"{who} 1a: typing and Return write lines through the layer {L[-2:]}")
    gate = await pg.evaluate("window.__gate")
    C.ok(len(gate) >= 3 and all(g == "write:me" for g in gate), f"{who} 1a: every keystroke went through the one checkpoint, as me ({len(gate)} writes)")
    C.ok(await pg.evaluate("Object.values(Book.D.lines).every(l => l.by === 'me')"), f"{who} 1a: the book remembers who wrote each line (me)")
    await pg.evaluate("at('shepherd', 15)"); await pg.keyboard.type("X"); await pg.wait_for_timeout(100)
    C.ok("The Lord is my Xshepherd" in (await pg.evaluate("lines()"))[1], f"{who} 1a: the caret writes exactly where it was put, mid-line")
    await pg.evaluate("at('He maketh', 0)"); await pg.keyboard.press("Backspace"); await pg.wait_for_timeout(100)
    C.ok(any("want.He maketh" in x for x in await pg.evaluate("lines()")), f"{who} 1a: Backspace at the start of a line joins it to the line above")
    await pg.keyboard.press("Enter"); await pg.wait_for_timeout(100)
    C.ok((await pg.evaluate("lines()"))[2].startswith("He maketh"), f"{who} 1a: Return splits it again")
    dom = await pg.evaluate("[...document.querySelectorAll('.pc')].map(p => { const c = p.cloneNode(true); c.querySelectorAll('.hg,br').forEach(x => x.remove()); return c.textContent; }).join('\\n')")
    C.ok(dom == "\n".join(await pg.evaluate("lines()")), f"{who} 1a: what's on the page is exactly what's in the book")
    n0 = len(await pg.evaluate("lines()")); await pg.evaluate("at('My own line')"); await pg.wait_for_timeout(1600); await pg.keyboard.type(" that I regret"); await pg.wait_for_timeout(200)
    await tap(pg, "#bUndo", phone); await pg.wait_for_timeout(200)
    C.ok((await pg.evaluate("lines()"))[-1] == "My own line", f"{who} 1a: Undo puts the line back as it read before (steady typing is one step)")
    await pg.evaluate("at('My own line')"); await pg.keyboard.type("!"); await pg.wait_for_timeout(400); await pg.reload(); await inject(pg)
    C.ok((await pg.evaluate("Book.D.boxes[Book.D.current].lines.map(l => Book.D.lines[l].text)"))[-1] == "My own line!", f"{who} 1a: everything is kept with no save button (closed and opened again)")
    C.ok(await pg.locator("#bFold").is_hidden() and await pg.locator("#notesBtn").is_hidden(), f"{who} 1a: only writing is on the page (no Fold, no Notes yet)")
    box = await pg.locator(".spark-slot").bounding_box()
    C.ok(box and box["width"] >= 40 and await pg.evaluate("document.querySelector('.side-slot') !== null"), f"{who}: room is kept for the ✦ corner and the side window; neither is built")
    C.ok(not pg.errs, f"{who} 1a: no page errors {pg.errs}"); await pg.close()

    # ---------- 1b: the list of notes ----------
    pg = await page(ctx, url, "1b")
    C.ok(await pg.locator("#listv").is_visible() and await pg.locator(".rowi b").first.text_content() == "Psalm 23", f"{who} 1b: opens on the list, newest on top, first line as the title")
    await tap(pg, "#newNote", phone); await pg.wait_for_timeout(200); await pg.keyboard.type("A new song"); await pg.keyboard.press("Enter"); await pg.keyboard.type("first words"); await pg.wait_for_timeout(200)
    await tap(pg, "#notesBtn", phone); await pg.wait_for_timeout(200)
    C.ok(await pg.locator(".rowi b").first.text_content() == "A new song" and await pg.locator("#listv [data-note]").count() == 4, f"{who} 1b: New note opens ready to type; its first line is its title; it's on top")
    await tap(pg, "#newNote", phone); await pg.wait_for_timeout(200); await tap(pg, "#notesBtn", phone); await pg.wait_for_timeout(200)
    C.ok(await pg.locator("#listv [data-note]").count() == 4, f"{who} 1b: a note left empty disappears")
    await pg.locator("#listv [data-note]").last.click(); await pg.wait_for_timeout(200); await pg.evaluate("at('Coffee')"); await pg.keyboard.type(" beans"); await pg.wait_for_timeout(200)
    cur = await pg.evaluate("Book.D.current"); await tap(pg, "#bUndo", phone); await pg.wait_for_timeout(150); await tap(pg, "#bUndo", phone); await pg.wait_for_timeout(200)
    C.ok(await pg.evaluate("Book.D.current") != cur and "Coffee" in await pg.evaluate(f"Book.D.boxes['{cur}'].lines.map(l => Book.D.lines[l].text).join()"), f"{who} 1b: Undo takes back the typing, then returns to the note you were on before")
    await pg.evaluate(f"TrialView.openNote('{cur}')"); await pg.evaluate("at('Coffee')"); await pg.keyboard.type("!"); await pg.wait_for_timeout(200); await tap(pg, "#notesBtn", phone); await pg.wait_for_timeout(200)
    C.ok(await pg.locator(".rowi b").first.text_content() == "Groceries", f"{who} 1b: the note you just edited rises to the top")
    await pg.fill("#filter", "river"); await pg.wait_for_timeout(200)
    C.ok(await pg.locator("#listv [data-note]").count() == 1 and await pg.locator(".rowi b").first.text_content() == "Song idea", f"{who} 1b: Search keeps only the notes with that word")
    C.ok("open_note:me" in await pg.evaluate("window.__gate"), f"{who} 1b: opening a note goes through the layer and its checkpoint")
    C.ok(not pg.errs, f"{who} 1b: no page errors {pg.errs}"); await pg.close()

    # ---------- 1c: making a fold ----------
    pg = await page(ctx, url, "1c")
    await pg.evaluate("at('my shepherd')"); await pg.wait_for_timeout(150); await tap(pg, "#bFold", phone); await pg.wait_for_timeout(200); await pg.keyboard.type("A shepherd guides."); await pg.wait_for_timeout(200)
    f = await pg.evaluate("(() => { const f = Book.foldsIn(Book.D.current)[0]; return f && { open: f.open, by: f.by, inside: lines(f.id), from: Book.D.lines[f.from].text, same: f.from === f.to }; })()")
    dbg = "" if f and f["inside"] == ["A shepherd guides."] else await pg.evaluate("JSON.stringify([document.activeElement && document.activeElement.className, document.activeElement && document.activeElement.dataset.box, lines(), (getSelection().anchorNode || {}).nodeName, document.querySelector('.fb') && document.querySelector('.fb .pc').innerHTML.slice(0, 300)])")
    C.ok(f and f["open"] and f["inside"] == ["A shepherd guides."] and f["from"].startswith("The Lord") and f["same"] and f["by"] == "me", f"{who} 1c: tap a line, tap Fold, and you're writing inside the fold on that whole line {f} {dbg}")
    C.ok(await pg.evaluate("document.activeElement && document.activeElement.closest('.fb') !== null"), f"{who} 1c: the caret (and keyboard) stayed with you, inside the fold")
    order = await pg.evaluate("[...document.querySelectorAll('#pg .pc, #pg .fb')].map(e => e.className.split(' ')[0]).slice(0, 3).join()")
    C.ok(order == "pc,fb,pc" and await pg.locator(".hg").count() == 1 and await pg.locator(".l .cv").count() == 1, f"{who} 1c: the fold opens right under its line; the line is underlined with a ▾ at its end")
    await pg.evaluate("at('my shepherd')"); await pg.wait_for_timeout(150); await tap(pg, "#bFold", phone); await pg.wait_for_timeout(200)
    C.ok("1f" in await pg.text_content("#msg") and await pg.evaluate("Object.keys(Book.D.folds).length") == 1, f"{who} 1c: a second fold on the same line is held back for now, with a plain sentence")
    await pg.evaluate("at('guides')"); await pg.wait_for_timeout(150); await tap(pg, "#bFold", phone); await pg.wait_for_timeout(200)
    C.ok("1e" in await pg.text_content("#msg"), f"{who} 1c: so is a fold inside a fold")
    await pg.evaluate("selectLines('green pastures', 'still waters')"); await pg.wait_for_timeout(250)
    C.ok(await pg.text_content("#bFold") == "Fold 2 lines", f"{who} 1c: a highlight across two lines offers “Fold 2 lines”")
    await tap(pg, "#bFold", phone); await pg.wait_for_timeout(200); await pg.keyboard.type("Rest."); await pg.wait_for_timeout(200)
    f2 = await pg.evaluate("(() => { const f = Book.foldsIn(Book.D.current)[1]; return [Book.D.lines[f.from].text.slice(0, 9), Book.D.lines[f.to].text.slice(0, 10), lines(f.id)]; })()")
    C.ok(f2 == ["He maketh", "he leadeth", ["Rest."]], f"{who} 1c: it folds every line the highlight touches {f2}")
    if not phone:
        await pg.evaluate("at('restoreth')"); await pg.keyboard.press("Tab"); await pg.wait_for_timeout(200)
        C.ok(await pg.evaluate("Object.keys(Book.D.folds).length") == 3, "laptop 1c: Tab folds the line")
    await pg.evaluate("Book.checkpoint = () => 'The banks say no.'"); await pg.evaluate("at('Psalm 23')"); await pg.wait_for_timeout(150); n = await pg.evaluate("Object.keys(Book.D.folds).length"); await tap(pg, "#bFold", phone); await pg.wait_for_timeout(200)
    C.ok(await pg.evaluate("Object.keys(Book.D.folds).length") == n and "banks say no" in await pg.text_content("#msg"), f"{who} 1c: when the checkpoint refuses, nothing happens and the reason is shown (ready for the riverbanks)")
    C.ok(not pg.errs, f"{who} 1c: no page errors {pg.errs}"); await pg.close()

    # ---------- 1d: the hinge ----------
    pg = await page(ctx, url, "1d")
    C.ok(await pg.locator(".fb").count() == 0 and await pg.text_content(".hg") == "▸", f"{who} 1d: a closed fold is just an underline and a ▸")
    await tap(pg, ".hg", phone); await pg.wait_for_timeout(250)
    C.ok(await pg.locator(".fb").count() == 1 and await pg.text_content(".hg") == "▾" and "walks ahead" in await pg.text_content(".fb"), f"{who} 1d: tapping the hinge opens the fold under its line")
    C.ok(await pg.evaluate("!document.querySelector('#pg').contains(document.activeElement)"), f"{who} 1d: tapping the hinge while reading doesn't call up the keyboard")
    hb = await pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('.hg'), '::after'); const r = document.querySelector('.hg').getBoundingClientRect(); return [r.width - parseFloat(s.left) - parseFloat(s.right), r.height - parseFloat(s.top) - parseFloat(s.bottom)]; })()")
    C.ok(hb[0] >= 28 and hb[1] >= 30, f"{who} 1d: the hinge is small to the eye but big to the thumb ({hb[0]:.0f}×{hb[1]:.0f})")
    await tap(pg, ".th", phone); await pg.wait_for_timeout(250)
    C.ok(await pg.locator(".fb").count() == 0, f"{who} 1d: tapping the thread closes the fold")
    await tap(pg, ".hg", phone); await pg.wait_for_timeout(200); await pg.evaluate("at('walks ahead')"); await pg.keyboard.type("!"); await pg.wait_for_timeout(150)
    if phone: await tap(pg, ".hg", phone)
    else: await pg.keyboard.press("Escape")
    await pg.wait_for_timeout(250)
    C.ok(await pg.locator(".fb").count() == 0 and await pg.evaluate("TrialView.pos && Book.D.lines[TrialView.pos.line].text.startsWith('The Lord')"), f"{who} 1d: closing a fold you're writing in leaves the caret at its line, by the hinge")
    await pg.evaluate("at('my shepherd')"); await pg.keyboard.press("Enter"); await pg.keyboard.type("A line after."); await pg.wait_for_timeout(200)
    await tap(pg, ".hg", phone); await pg.wait_for_timeout(200)
    order = await pg.evaluate("[...document.querySelectorAll('#pg > .bx > *')].map(e => e.className.split(' ')[0] + ':' + e.textContent.slice(0, 12)).join(' | ')")
    C.ok("fb:" in order and order.index("fb:") < order.index("A line after"), f"{who} 1d: Return at the end of a folded line starts the new line below the fold, not inside it")
    g = [x for x in await pg.evaluate("window.__gate") if x.startswith("open_fold")]
    C.ok(len(g) >= 4, f"{who} 1d: every open and close went through the layer ({len(g)})")
    C.ok(not pg.errs, f"{who} 1d: no page errors {pg.errs}"); await pg.close()

    # ---------- 1e: infinite folds, threads, tracing back ----------
    pg = await page(ctx, url, "1e")
    await pg.evaluate("at('by name')"); await pg.wait_for_timeout(100)
    for i in range(8):
        await tap(pg, "#bFold", phone); await pg.wait_for_timeout(120); await pg.keyboard.type(f"Level {i + 3} words here"); await pg.wait_for_timeout(120)
    depth = await pg.evaluate("Book.depth(TrialView.pos.where)")
    C.ok(depth == 10, f"{who} 1e: folds go inside folds without end (10 deep)")
    cols = await pg.evaluate("[...document.querySelectorAll('.th')].map(t => getComputedStyle(t.parentElement).getPropertyValue('--c').trim())")
    C.ok(len(cols) == 10 and cols[0] != cols[1] and cols[1] != cols[2] and cols[0] == cols[6], f"{who} 1e: every open fold hangs from a thread, one color per depth")
    w = await pg.evaluate("[...document.querySelectorAll('.pc')].pop().getBoundingClientRect().width"); flat = await pg.locator(".fb.flat").count()
    if phone: C.ok(flat == 6 and w >= 250, f"iPhone 1e: after four levels the indent stops and only the colors go on, so the words keep their room ({w:.0f}px wide at depth 10)")
    else: C.ok(w >= 400, f"laptop 1e: ten levels deep the words still have room ({w:.0f}px)")
    await tap(pg, "#bMore", phone); await pg.wait_for_timeout(200); await pg.locator("#menu button", has_text="Trace back").click(); await pg.wait_for_timeout(200)
    crumbs = await pg.locator("#path button").all_text_contents()
    C.ok(len(crumbs) == 11 and crumbs[0] == "Psalm 23" and crumbs[1].startswith("The Lord") and await pg.locator("#path").is_visible(), f"{who} 1e: Trace back shows the path from the note down to this fold {crumbs[:3]}…")
    C.ok("trace_parent:me" in await pg.evaluate("window.__gate"), f"{who} 1e: tracing goes through the layer too")
    top = (await pg.evaluate("Book.foldsIn(Book.D.current)[0].id")); await pg.evaluate(f"Book.act('open_fold', {{ fold: '{top}', open: false }}); TrialView.render()"); await pg.wait_for_timeout(100)
    await pg.locator("#path button").nth(3).click(); await pg.wait_for_timeout(300)
    C.ok(await pg.locator(".fb").count() >= 3 and await pg.locator(".flash").count() >= 1, f"{who} 1e: tapping a name in the path opens the way to it and shows it")
    await pg.evaluate("at('Psalm 23')"); await pg.keyboard.type("!"); await pg.wait_for_timeout(150)
    C.ok(await pg.locator("#path").is_hidden(), f"{who} 1e: the path disappears when you keep writing")
    if not phone:
        await pg.locator(".fb .fb .l").first.click(modifiers=["ControlOrMeta"]); await pg.wait_for_timeout(200)
        C.ok(await pg.locator("#path").is_visible(), "laptop 1e: ⌘/Ctrl-click on a line traces it back")
    C.ok(not pg.errs, f"{who} 1e: no page errors {pg.errs}"); await pg.close()

    # ---------- 1f: overlapping folds ----------
    pg = await page(ctx, url, "1f")
    await pg.evaluate("selectLines('green pastures', 'still waters')"); await pg.wait_for_timeout(250); await tap(pg, "#bFold", phone); await pg.wait_for_timeout(200); await pg.keyboard.type("Quiet water."); await pg.wait_for_timeout(200)
    ov = await pg.evaluate("(() => { const l = TrialView.find('green pastures').line, e = document.querySelector('.l[data-id=\"' + l + '\"]'); return [e.querySelectorAll('.cv').length, e.querySelector('.cv0') !== null, e.querySelector('.cv1') !== null, document.querySelectorAll('.hg').length]; })()")
    C.ok(ov == [2, True, True, 2], f"{who} 1f: a line can belong to two overlapping folds; each has its own underline and its own hinge {ov}")
    await pg.evaluate("at('my shepherd')"); await pg.wait_for_timeout(150); await tap(pg, "#bFold", phone); await pg.wait_for_timeout(200); await pg.keyboard.type("Mine."); await pg.wait_for_timeout(200)
    C.ok(await pg.evaluate("Book.foldsIn(Book.D.current).length") == 3 and await pg.locator(".hg").count() == 3, f"{who} 1f: a second fold on a line that already has one")
    await pg.evaluate("at('green pastures')"); await pg.wait_for_timeout(150); await tap(pg, "#bMore", phone); await pg.wait_for_timeout(200)
    items = await pg.locator("#menu button").all_text_contents()
    C.ok(sum(1 for i in items if i.startswith(("Open ", "Close "))) == 2, f"{who} 1f: the ⌄ menu lists every fold on the line by name {items}")
    await pg.keyboard.press("Escape"); await pg.evaluate("document.querySelector('#menu').classList.add('hide')")
    await pg.evaluate("at('He maketh', 0)"); await pg.keyboard.press("Backspace"); await pg.wait_for_timeout(200)
    C.ok(await pg.evaluate("Book.foldsIn(Book.D.current).length") == 3 and await pg.evaluate("Book.foldsIn(Book.D.current).every(f => Book.D.lines[f.from] && Book.D.lines[f.to] && Book.hasWriting(f.id))"), f"{who} 1f: joining folded lines together never drops a fold or its writing")
    C.ok(not pg.errs, f"{who} 1f: no page errors {pg.errs}"); await pg.close()

    # ---------- 1g: remove and Undo ----------
    pg = await page(ctx, url, "1g")
    before = await pg.evaluate("snap()")
    await pg.evaluate("at('my shepherd')"); await pg.wait_for_timeout(150); await tap(pg, "#bMore", phone); await pg.wait_for_timeout(200); await pg.locator("#menu button", has_text="Remove fold").click(); await pg.wait_for_timeout(250)
    C.ok(await pg.locator(".hg").count() == 0 and await pg.evaluate("Book.D.removed.length") == 1 and "kept" in await pg.text_content("#msg"), f"{who} 1g: Remove fold takes the fold off its line and keeps its writing")
    await tap(pg, "#bUndo", phone); await pg.wait_for_timeout(250)
    C.ok(await pg.evaluate("snap()") == before and await pg.evaluate("Book.D.removed.length") == 0, f"{who} 1g: Undo brings it back with everything inside, folds and all")
    await pg.evaluate("at('restoreth')"); await pg.wait_for_timeout(1600); await pg.keyboard.press("Enter"); await pg.keyboard.type("A new line."); await pg.wait_for_timeout(1600); await tap(pg, "#bFold", phone); await pg.wait_for_timeout(200); await pg.keyboard.type("Inside."); await pg.wait_for_timeout(200)
    for _ in range(4): await tap(pg, "#bUndo", phone); await pg.wait_for_timeout(150)
    C.ok(await pg.evaluate("snap()") == before, f"{who} 1g: Undo, tap by tap, walks back through writing, folding and new lines to exactly where it began")
    fid = await pg.evaluate("Book.foldsIn(Book.D.current)[0].id"); await pg.evaluate(f"TrialView.cmdRemove('{fid}')"); await pg.wait_for_timeout(400); await pg.reload(); await inject(pg)
    await tap(pg, "#notesBtn", phone); await pg.wait_for_timeout(200)
    C.ok(await pg.locator(".rm [data-put]").count() == 1, f"{who} 1g: after closing and opening the page, the removed fold waits under Recently removed folds")
    await pg.locator(".rm [data-put]").click(); await pg.wait_for_timeout(400)
    C.ok(await pg.evaluate("snap()") == before and await pg.locator(".hg").count() >= 1, f"{who} 1g: Put back returns it to its line with all its writing")
    C.ok(not pg.errs, f"{who} 1g: no page errors {pg.errs}"); await pg.close()

    # ---------- 1h: the clock and Hold ----------
    pg = await page(ctx, url, "1h")
    ms = "(JSON.parse(localStorage.getItem('bolw-trial-1h-clock') || '{\"ms\":0}')).ms"
    await pg.evaluate("at('restoreth')"); await pg.keyboard.type(" Typing for a second or so", delay=40); await pg.wait_for_timeout(200)
    t1 = await pg.evaluate(ms); C.ok(600 < t1 < 4000 and "●" in await pg.text_content("#clock"), f"{who} 1h: typing counts ({t1} ms) and the clock shows ●")
    if phone and BROWSER != "firefox":
        await pg.dispatch_event("#hold", "touchstart", {"touches": [], "changedTouches": [], "targetTouches": []}) if False else await pg.evaluate("document.querySelector('#hold').dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }))")
        await pg.wait_for_timeout(1200); await pg.evaluate("document.querySelector('#hold').dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }))")
    else:
        await pg.keyboard.down("Alt"); await pg.wait_for_timeout(1200); await pg.keyboard.up("Alt")
    t2 = await pg.evaluate(ms); C.ok(1000 < t2 - t1 < 2500, f"{who} 1h: Hold counts while held ({t2 - t1} ms)")
    C.ok(not any(g.startswith("hold") for g in await pg.evaluate("window.__gate")) and "hold" not in json.dumps(await pg.evaluate("Book.actions")), f"{who} 1h: Hold is not an action: nothing but your own hand can reach it")
    await pg.evaluate("Book.act('write', { where: Book.D.current, words: ' (written by the breath, later)' }, 'ai')"); await pg.evaluate("TrialView.render()"); await pg.wait_for_timeout(200)
    C.ok(await pg.evaluate(ms) == t2 and await pg.locator(".l.by-ai").count() == 1, f"{who} 1h: a line written by someone else adds no time and is stored (and shown) as theirs")
    await pg.evaluate("at('by the breath')"); await pg.keyboard.type("!"); await pg.wait_for_timeout(200)
    C.ok(await pg.locator(".l.by-ai").count() == 0, f"{who} 1h: once you type into that line, it's yours")
    C.ok(not pg.errs, f"{who} 1h: no page errors {pg.errs}"); await pg.close()

    # ---------- every Show me, on every piece: runs through the same layer, then puts the page back ----------
    for piece in PIECES:
        pg = await page(ctx, url, piece, quick=True)
        n = await pg.evaluate("TrialView.tasks.filter(t => t.show).length"); same = True; used = 0
        for i in range(n):
            ok = await pg.evaluate("""async i => { const T = TrialView.tasks.filter(t => t.show)[i], before = JSON.stringify(Book.D); window.__gate = []; await TrialView.demo(T.show);
                return [JSON.stringify(Book.D) === before, window.__gate.length, !document.querySelector('#shield').classList.contains('hide')]; }""", i)
            same = same and ok[0] and not ok[2]; used = used + ok[1]
        C.ok(same and (used > 0 or n == 0) and not pg.errs, f"{who} {piece}: all {n} Show me demos run through the layer and leave the page as it was {pg.errs}")
        await pg.close()
    await ctx.close()

async def main():
    url = serve(8891)
    async with async_playwright() as p:
        br = await launch(p)
        await run(br, p, url, True)
        await run(br, p, url, False)
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
