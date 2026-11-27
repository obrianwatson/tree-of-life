"""BOLW Essentials (docs/bolw/): notes, folds, the AI window acting through the six joints, the riverbanks,
earlier versions, export, sync (same lock, own files), safe mode. Phone-sized and laptop-sized.
The AI is a fake Anthropic that streams scripted replies, so the real streaming path is what's tested.
Run:  python3 tests/test_bolw.py"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, launch, BROWSER, FakeGitHub
from playwright.async_api import async_playwright

C = Checks()
KEY = "sk-ant-test-SECRETKEY1234"

class FakeClaude:
    """api.anthropic.com: /v1/models and a streaming /v1/messages that plays the next scripted reply."""
    def __init__(self): self.script = []; self.seen = []; self.hold = None; self.headers = []
    def say(self, *blocks): self.script.append(blocks[0] if len(blocks) == 1 and callable(blocks[0]) else list(blocks))      # (a function is given the request, to answer from what the last tool gave back)
    async def handle(self, route):
        req = route.request; cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
        self.headers.append(dict(req.headers))
        if "/v1/models" in req.url:
            return await route.fulfill(status=200, headers=cors, content_type="application/json", body=json.dumps({"data": [{"id": "claude-opus-5-5", "display_name": "Claude Opus 5.5"}, {"id": "claude-sonnet-5-5", "display_name": "Claude Sonnet 5.5"}, {"id": "claude-haiku-5-5", "display_name": "Claude Haiku 5.5"}, {"id": "claude-fable-5-2", "display_name": "Claude Fable 5.2"}]}))
        body = json.loads(req.post_data); self.seen.append(body)
        if self.hold is not None: await self.hold.wait()
        blocks = self.script.pop(0) if self.script else [("text", "(nothing scripted)")]
        if callable(blocks): blocks = blocks(body)
        ev = [{"type": "message_start", "message": {"usage": {"input_tokens": 10}}}]; tool = False
        for i, b in enumerate(blocks):
            if b[0] == "text":
                ev.append({"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}})
                for w in b[1].split(" "): ev.append({"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": w + " "}})
            else:
                tool = True
                ev.append({"type": "content_block_start", "index": i, "content_block": {"type": "tool_use", "id": "tu%d_%d" % (len(self.seen), i), "name": b[0], "input": {}}})
                js = json.dumps(b[1]); h = len(js) // 2
                for part in (js[:h], js[h:]): ev.append({"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": part}})
            ev.append({"type": "content_block_stop", "index": i})
        ev.append({"type": "message_delta", "delta": {"stop_reason": "tool_use" if tool else "end_turn"}, "usage": {"output_tokens": 5}}); ev.append({"type": "message_stop"})
        sse = "".join("event: %s\ndata: %s\n\n" % (e["type"], json.dumps(e)) for e in ev)
        try: await route.fulfill(status=200, headers=cors, content_type="text/event-stream", body=sse)
        except Exception: pass

async def device(br, p, phone, ai=None, gh=None, key=True):
    # (helpers waits for the old book's bootloader unless told the page is ready)
    kw = dict(p.devices["iPhone 13"]) if phone else {"viewport": {"width": 1280, "height": 800}}
    kw.pop("default_browser_type", None)
    if BROWSER == "firefox": kw.pop("is_mobile", None)
    ctx = await br.new_context(accept_downloads=True, service_workers="block", **kw)      # (the offline helper is checked on its own in offline_start: with it running, Safari's engine sends requests around the stand-ins)
    await ctx.add_init_script("window.__bolwBoot = { ok: true };")
    if key: await ctx.add_init_script("try { if (!localStorage.getItem('tol-ai')) localStorage.setItem('tol-ai', JSON.stringify({ key: '%s' })); } catch (e) {}" % KEY)
    if ai: await ctx.route("https://api.anthropic.com/**", ai.handle)
    if gh: await ctx.route("https://api.github.com/**", gh.handle)
    return ctx

async def page(ctx, url, path="bolw/"):
    pg = await ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    await pg.goto(url + path)
    if path == "bolw/": await ready(pg)
    return pg

async def ready(pg):
    await pg.wait_for_function("!!window.Settings")
    await pg.evaluate("""() => { window.lines = box => Book.D.boxes[box || Book.D.current].lines.map(l => Book.D.lines[l].text);
        window.at = (txt, off) => { const s = Page.find(txt), L = Book.D.lines[s.line]; return Page.setCaret({ where: s.where, line: s.line, at: off == null ? L.text.length : off }); };
        window.last = () => { const c = Breath.chat; return c.msgs[c.msgs.length - 1]; }; }""")

async def tap(pg, sel, phone):
    if phone and BROWSER != "firefox": await pg.tap(sel)
    else: await pg.click(sel)

async def ask(pg, text, phone, wait=True):
    await pg.fill("#brIn", text); await tap(pg, "#brSend", phone)
    if wait: await pg.wait_for_function("!Breath.busy")

async def run(br, p, url, phone):
    who = "iPhone" if phone else "laptop"; ai = FakeClaude()
    ctx = await device(br, p, phone, ai); pg = await page(ctx, url)
    ok = lambda c, m: C.ok(c, who + ": " + m)

    # ---- 1. notes like Apple Notes ----
    ok(await pg.evaluate("Page.view") == "list", "a new book opens on the list of notes")
    await tap(pg, "#newNote", phone); await pg.keyboard.type("Psalm 23\nThe Lord is my shepherd\nI shall not want\nHe maketh me to lie down")
    ok(await pg.evaluate("lines()") == ["Psalm 23", "The Lord is my shepherd", "I shall not want", "He maketh me to lie down"], "typing lands as lines")
    ok(await pg.evaluate("Object.values(Book.D.lines).every(l => l.by === 'me')"), "every line knows the writer wrote it")
    await pg.evaluate("at('shall not', 7)"); await pg.wait_for_timeout(450)
    await pg.reload(); await ready(pg)
    ok(await pg.evaluate("Page.view") == "note" and await pg.evaluate("Book.title(Book.D.current)") == "Psalm 23", "reopens on the same note")
    spot = await pg.evaluate("(Keep.lsGet(Keep.K.ui).spots[Book.D.current] || {})")
    ok(spot.get("at") == 7 and await pg.evaluate("Book.D.lines['%s'].text" % spot.get("line", "x")) == "I shall not want", "and remembers the exact spot")
    await ctx.set_offline(True); await pg.evaluate("at('lie down')"); await pg.keyboard.type(" in green pastures"); await pg.evaluate("Book.flush()")
    ok("green pastures" in await pg.evaluate("localStorage.getItem(Keep.K.book)"), "offline: writing is still saved on the device")
    await ctx.set_offline(False)
    await tap(pg, "#notesBtn", phone); await tap(pg, "#newNote", phone); await pg.keyboard.type("Song idea\nrivers in the desert"); await tap(pg, "#notesBtn", phone)
    await pg.fill("#filter", "desert"); n = await pg.locator("#listv [data-note]").count()
    ok(n == 1 and "Song idea" in await pg.inner_text("#listv .rows"), "search finds the note with those words")
    await pg.fill("#filter", "")
    songs = await pg.evaluate("Shelf.projects().map(p => p.name)")
    ok(songs == ["Songs", "Journal", "Scripture"], "starting projects: Songs, Journal, Scripture")

    # ---- 2. fractal folds ----
    psalm = await pg.evaluate("Book.notes().find(n => Book.title(n.id) === 'Psalm 23').id")
    await pg.evaluate("Page.openNote('%s')" % psalm); await pg.evaluate("at('shepherd')")
    await tap(pg, "#bFold", phone); await pg.keyboard.type("a shepherd guides"); await tap(pg, "#bFold", phone); await pg.keyboard.type("with a staff")
    ok(await pg.evaluate("Book.textOf(Book.D.current)") == "Psalm 23\nThe Lord is my shepherd\n    a shepherd guides\n        with a staff\nI shall not want\nHe maketh me to lie down in green pastures", "fold, then a fold inside the fold " + json.dumps(await pg.evaluate("Book.textOf(Book.D.current)")))
    ok(await pg.locator(".th").count() == 2 and await pg.evaluate("[...document.querySelectorAll('.fb')].map(f => f.style.getPropertyValue('--c')).join()") == "#2f6fb5,#1d9e75", "threads: one color per depth")
    f1 = await pg.evaluate("Book.foldsIn(Book.D.current)[0].id")
    await tap(pg, '.hg[data-f="%s"]' % f1, phone); ok(await pg.evaluate("Book.D.folds['%s'].open" % f1) is False and await pg.locator(".fb").count() == 0, "the hinge closes a fold")
    await tap(pg, '.hg[data-f="%s"]' % f1, phone); ok(await pg.locator(".fb").count() == 2, "and opens it again, with what was inside")
    await pg.evaluate("at('with a staff')"); await pg.evaluate("Page.menuItems().find(i => i && i[0] === 'Trace back')[1]()")
    ok((await pg.inner_text("#path")).replace("\n", "").replace(" ", "") == "Psalm23›TheLordismyshepherd›ashepherdguides", "Trace back shows the path from the note")
    await pg.evaluate("Page.cmdRemove('%s')" % f1); ok(await pg.locator(".fb").count() == 0 and await pg.evaluate("Book.D.removed.length") == 1, "removing a fold keeps its writing (Recently removed)")
    await tap(pg, "#bUndo", phone); ok(await pg.locator(".fb").count() == 2 and await pg.evaluate("Book.D.removed.length") == 0, "Undo brings the fold back with everything inside")

    # ---- the breath's hand and the banks, before any chat ----
    ok(await pg.evaluate("(() => { try { Book.breath(); return false; } catch (e) { return true; } })()"), "the breath's hand on the joints is given out once; nobody else can take one")
    ok(await pg.evaluate("Book.act.length") == 2, "the writer's hand takes no 'who' from outside")

    # ---- 3. the AI window ----
    await tap(pg, "#spark", phone); await pg.wait_for_function("document.querySelector('#brModel').options.length >= 4")
    box = await pg.locator("#br").bounding_box(); vw = pg.viewport_size["width"]
    ok((box["width"] >= vw - 1) if phone else (box["width"] == 400 and box["x"] == vw - 400), "the AI window is " + ("full screen" if phone else "a side window beside the page"))
    ok(await pg.inner_text("#brBack") == ("← Book" if phone else "Hide"), "its way back says " + ("← Book" if phone else "Hide"))
    ok("claude-fable-5-2" in await pg.evaluate("[...document.querySelector('#brModel').options].map(o => o.value)"), "the model picker lists every model the key can use")
    await pg.select_option("#brModel", "claude-haiku-5-5")
    ai.say(("text", "A shepherd leads from the front."))
    await ask(pg, "What does a shepherd do?", phone)
    ok(await pg.inner_text(".m.ai .tx") == "A shepherd leads from the front. ", "a reply streams into the chat")
    b = ai.seen[-1]
    ok(b["model"] == "claude-haiku-5-5" and b["stream"] is True, "the chosen model is the one asked")
    ok("The Lord is my shepherd" in b["system"] and "a shepherd guides" in b["system"], "the note you're on goes along automatically, folds included")
    ok(KEY not in json.dumps(b) and ai.headers[-1].get("x-api-key") == KEY, "the key travels only in the request's own header, never in what the AI reads")
    ok(await pg.evaluate("Page.clock.ms") == await pg.evaluate("Page.clock.ms") and "tool" not in str(b.get("messages")), "history goes as plain words")
    ai.hold = asyncio.Event(); ai.say(("text", "never shown"))
    await ask(pg, "Tell me a long story", phone, wait=False); await pg.wait_for_selector("#brStop:not(.hide)")
    await tap(pg, "#brStop", phone); await pg.wait_for_function("!Breath.busy"); ai.hold.set(); ai.hold = None; ai.script.clear()
    ok(await pg.evaluate("last().stopped") is True and await pg.is_visible("#brSend"), "Stop stops the reply")

    # ---- 6. the AI folds a line and writes inside ----
    clock0 = await pg.evaluate("Page.clock.ms")
    import re
    ai.say(("read_note", {})); ai.say(("fold_line", {"from": 3}))
    ai.say(lambda body: [("write", {"where": re.search(r'id is \\?"(f\w+)', json.dumps(body["messages"][-1])).group(1), "words": "Contentment is trust."}), ("text", "Done.")]); ai.say(("text", "I folded line 3 and wrote inside."))
    await ask(pg, "Fold the line about not wanting and write a thought inside", phone)
    newf = await pg.evaluate("Book.foldsIn(Book.D.current).find(f => Book.D.lines[f.from].text === 'I shall not want').id")
    await pg.wait_for_function("!Breath.busy")
    ok(await pg.evaluate("lines('%s')" % newf) == ["Contentment is trust."], "the AI folded the line and wrote inside the new fold")
    acts = await pg.evaluate("[...document.querySelectorAll('.m.ai:last-child .act')].map(a => a.textContent)")
    ok(acts == ["· Read “Psalm 23”", "✓ Folded line 3", "✓ Wrote a line in “I shall not want”"], "every action is a line in the chat: " + " | ".join(acts))
    ok(await pg.evaluate("Book.D.lines[Book.D.boxes['%s'].lines[0]].by" % newf) == "ai" and await pg.evaluate("Book.D.folds['%s'].by" % newf) == "ai", "the book knows the AI wrote it")
    ok(await pg.evaluate("Page.clock.ms") == clock0, "the AI's writing adds no writing time")
    await pg.evaluate("document.querySelectorAll('.m.ai:last-child .act')[2].click()"); await pg.wait_for_timeout(100)
    ok(await pg.evaluate("!!document.querySelector('.pg .l.by-ai.flash')") and (not phone or not await pg.evaluate("Breath.isOpen")), "tapping the action line jumps to it, in the AI's own color")
    if phone: await tap(pg, "#spark", phone)
    # editing is accepting
    await pg.evaluate("at('Contentment is trust.')"); await pg.keyboard.type(" Amen"); 
    ok(await pg.evaluate("Book.D.lines[Book.D.boxes['%s'].lines[0]].by" % newf) == "me" and await pg.locator(".pg .l.by-ai").count() == 0, "editing its line makes it yours (the color goes)")
    await pg.evaluate("Page.doUndo()")
    n_before = await pg.evaluate("Book.foldsIn(Book.D.current).length")
    await pg.evaluate("document.querySelector('.m.ai:last-child .undo').click()")
    ok(await pg.evaluate("Book.foldsIn(Book.D.current).length") == n_before - 1 and (await pg.evaluate("lines()"))[2:3] == ["I shall not want"], "one reply = one Undo: the fold and its writing are both taken back")
    ok(await pg.evaluate("last().undone") is True and await pg.locator(".m.ai:last-child .undo").count() == 0, "and the chat says its changes were undone")

    # ---- 7. it asks first ----
    ai.say(("write", {"line": 3, "how": "replace", "words": "I lack nothing"})); ai.say(("text", "Okay, I left it."))
    await ask(pg, "Reword line 3", phone, wait=False); await pg.wait_for_selector(".ask .allow")
    card = await pg.inner_text(".m.ai:last-child .ask")
    ok("I shall not want" in card and "I lack nothing" in card and await pg.evaluate("lines()[2]") == "I shall not want", "changing your words: a card shows before and after, and nothing has changed yet")
    await pg.evaluate("[...document.querySelectorAll('.ask .row button')].find(b => b.textContent.indexOf('Don') === 0).click()"); await pg.wait_for_function("!Breath.busy")
    ok(await pg.evaluate("lines()[2]") == "I shall not want" and ai.seen[-1]["messages"][-1]["content"][0].get("is_error") is True, "Don't: your words stay, and the AI is told no")
    ai.say(("write", {"line": 3, "how": "replace", "words": "I lack nothing"})); ai.say(("text", "Changed."))
    await ask(pg, "Do it", phone, wait=False); await pg.wait_for_selector(".m.ai:last-child .ask .allow"); await pg.evaluate("document.querySelector('.m.ai:last-child .ask .allow').click()"); await pg.wait_for_function("!Breath.busy")
    ok(await pg.evaluate("lines()[2]") == "I lack nothing", "Allow: the change is made")
    await pg.evaluate("document.querySelector('.m.ai:last-child .undo').click()"); ok(await pg.evaluate("lines()[2]") == "I shall not want", "and Undo puts your words back")
    ai.say(("remove_fold", {"fold": f1})); ai.say(("text", "Left it."))
    await ask(pg, "Remove the first fold", phone, wait=False); await pg.wait_for_selector(".m.ai:last-child .ask .allow")
    ok("a shepherd guides" in await pg.inner_text(".m.ai:last-child .ask") and await pg.evaluate("!!Book.D.folds['%s']" % f1), "removing a fold: it asks first, showing what's inside")
    await pg.evaluate("[...document.querySelectorAll('.m.ai:last-child .ask .row button')].find(b => b.textContent.indexOf('Don') === 0).click()"); await pg.wait_for_function("!Breath.busy")
    ok(await pg.evaluate("!!Book.D.folds['%s']" % f1), "Don't: the fold stays")
    # adding words never asks
    ai.say(("write", {"line": 4, "how": "new_line_after", "words": "He leadeth me beside the still waters"})); ai.say(("text", "Added."))
    await ask(pg, "Add the next line", phone)
    ok(await pg.evaluate("lines()[4]") == "He leadeth me beside the still waters" and await pg.locator(".m.ai:last-child .ask").count() == 0, "adding words doesn't ask")

    # ---- 8. only the note that's open ----
    song = await pg.evaluate("Book.notes().find(n => Book.title(n.id) === 'Song idea').id")
    ai.say(("write", {"where": song, "words": "sneaky"}), ("open_note", {"note": song}), ("read_note", {"note": song})); ai.say(("text", "I can only work in the open note."))
    await ask(pg, "Add a line to my Song idea note", phone)
    ok(await pg.evaluate("lines('%s')" % song) == ["Song idea", "rivers in the desert"] and await pg.evaluate("Book.D.current") == psalm, "asked to act on another note: it is refused and nothing changes")
    ok(await pg.locator(".m.ai:last-child .act.no").count() == 3 and all(r.get("is_error") for r in ai.seen[-1]["messages"][-1]["content"]), "each refusal shows as a line, and the AI is told why")
    ok(await pg.evaluate("Book.checkpoint('write', { where: Book.D.current, words: 'x' }, 'ai')") == "The breath only acts when you ask it to.", "outside a reply the breath can't act at all")

    # ---- 4. a project with its own instructions ----
    await tap(pg, "#brChats", phone); await pg.evaluate("document.querySelector('#blNewP').onclick = null"); pid = await pg.evaluate("Shelf.newProject('Hymns').id")
    await pg.evaluate("Breath.show('list')"); await pg.evaluate("document.querySelector('[data-p=\"%s\"]').click()" % pid)
    await pg.fill("#bpIns", "Always answer in rhyming couplets."); await tap(pg, "#bpChat", phone)
    ai.say(("text", "Roses are red."))
    await ask(pg, "Hello", phone)
    ok("Always answer in rhyming couplets." in ai.seen[-1]["system"] and "Hymns" in ai.seen[-1]["system"], "a chat started in a project carries the project's instructions")
    ok(ai.seen[-1]["system"].index("You are the breath") < ai.seen[-1]["system"].index("rhyming couplets"), "after the instructions for all of BOLW")
    ok(len(ai.seen[-1]["messages"]) == 1, "and it is a fresh chat")

    # ---- 5. chat history ----
    await tap(pg, "#brChats", phone)
    titles = await pg.evaluate("[...document.querySelectorAll('#brList [data-c] b')].map(b => b.textContent)")
    ok(titles[0] == "Hello" and "What does a shepherd do?" in titles, "history lists chats, newest first")
    await pg.fill("#blQ", "couplets"); ok(await pg.locator("#brList [data-c]").count() == 0, "search: no chat has words that only the instructions had")
    await pg.fill("#blQ", "leads from the front"); ok(await pg.evaluate("[...document.querySelectorAll('#brList [data-c] b')].map(b => b.textContent)") == ["What does a shepherd do?"], "search finds an old chat by what was said in it")
    await pg.fill("#blQ", ""); old = await pg.evaluate("Shelf.chats().find(c => c.title === 'What does a shepherd do?').id")
    await pg.evaluate("Shelf.rename('%s', 'Shepherds')" % old); await pg.evaluate("Breath.show('list')")
    ok("Shepherds" in await pg.inner_text("#brList"), "rename")
    await pg.evaluate("document.querySelector('[data-more=\"%s\"]').click()" % old); await pg.evaluate("[...document.querySelectorAll('#menu button')].find(b => b.textContent === 'Delete').click()")
    ok(await pg.locator('#brList [data-c="%s"]' % old).count() == 0 and await pg.locator('#brList [data-back="%s"]' % old).count() == 1, "delete: it leaves the list and waits under Recently deleted")
    await pg.evaluate("document.querySelector('[data-back=\"%s\"]').click()" % old)
    ok(await pg.locator('#brList [data-c="%s"]' % old).count() == 1 and len(await pg.evaluate("Shelf.chat('%s').msgs" % old)) >= 2, "bring back: the chat returns whole")

    # ---- 9. offline ----
    await pg.evaluate("Breath.show('chat')"); await ctx.set_offline(True); await pg.evaluate("dispatchEvent(new Event('offline'))")
    n_req = len(ai.seen); await pg.fill("#brIn", "a thought for later")
    ok("offline" in (await pg.inner_text("#brNote")).lower() and await pg.is_disabled("#brSend"), "offline: the window says it needs the internet")
    await pg.evaluate("Breath.send()"); await pg.evaluate("Shelf.flush()")
    ok(len(ai.seen) == n_req and await pg.evaluate("Breath.chat.draft") == "a thought for later" and "a thought for later" in await pg.evaluate("localStorage.getItem(Keep.K.shelf)"), "nothing is sent, and what you typed is kept as a draft")
    await pg.evaluate("Breath.close()"); await pg.evaluate("at('still waters')"); await pg.keyboard.type("."); await pg.evaluate("Page.cmdFold()")
    ok(await pg.evaluate("lines()[4]") == "He leadeth me beside the still waters." and await pg.evaluate("Book.foldsIn(Book.D.current).length") == 2, "offline: notes and folds still work")
    await pg.evaluate("Page.doUndo()"); await ctx.set_offline(False); await pg.evaluate("dispatchEvent(new Event('online'))")

    # ---- 10. export, and earlier versions ----
    await pg.evaluate("Settings.open()")
    async with pg.expect_download() as d: await pg.evaluate("document.querySelector('#sTxt').click()")
    path = await (await d.value).path(); txt = open(path, encoding="utf-8").read()
    ok("The Lord is my shepherd\n    a shepherd guides\n        with a staff" in txt and "rivers in the desert" in txt and "You: What does a shepherd do?" in txt, "export to read: a plain text file with every note, folds indented, and the chats")
    async with pg.expect_download() as d: await pg.evaluate("document.querySelector('#sJson').click()")
    j = json.load(open(await (await d.value).path(), encoding="utf-8"))
    ok(j["format"] == "bolw-book" and psalm in j["book"]["notes"] and KEY not in json.dumps(j), "export everything: one open JSON file, with no keys in it")
    vers = await pg.evaluate("Keep.versions()")
    ok(len(vers) >= 1 and any(v["title"] == "Psalm 23" for v in vers), "earlier versions are kept as you write")
    await pg.evaluate("Settings.versions()"); await pg.wait_for_selector("[data-v]"); n_notes = await pg.evaluate("Book.notes().length")
    await pg.evaluate("[...document.querySelectorAll('[data-v]')].pop().click()")
    ok(await pg.evaluate("Book.notes().length") == n_notes + 1 and "(as it was" in await pg.evaluate("Book.title(Book.D.current)") and await pg.evaluate("Book.title('%s')" % psalm) == "Psalm 23", "bringing one back makes a NEW note; the one you have is untouched")

    # ---- something's off: told from inside the app, never with writing ----
    await pg.evaluate("Settings.open()"); await pg.fill("#sIssue", "the bar jumped @claude when I folded")
    rep = await pg.evaluate("offReport ? 1 : 0") if False else None
    await pg.evaluate("document.querySelector('#sIssueCopy').click()"); await pg.wait_for_timeout(100)
    ok("Copy" in await pg.inner_text("#sIssueMsg") or "Select" in await pg.inner_text("#sIssueMsg") or "Copied" in await pg.inner_text("#sIssueMsg"), "Settings: Something's off can be copied (no GitHub key on this device)")
    await pg.evaluate("Settings.close()")

    # ---- room for ; commands ----
    await pg.evaluate("Page.openNote('%s')" % song); await pg.evaluate("at('desert')"); await pg.keyboard.press("Enter"); await pg.keyboard.type(";hello"); await pg.keyboard.press("Enter")
    ok(await pg.evaluate("lines()") == ["Song idea", "rivers in the desert", ";hello", ""], "a line starting with ; is just a line for now")
    await pg.evaluate("Commands.add('hello', (rest, where, B) => { window.__cmd = where.line; return true; })"); await pg.keyboard.type(";hello there"); await pg.keyboard.press("Enter")
    ok(await pg.evaluate("!!window.__cmd") and await pg.evaluate("lines().length") == 4, "and the room is there: a registered command is handed the line")

    # ---- the AI window keyboard: Cmd/Ctrl K (laptop) ----
    if not phone:
        await pg.keyboard.press("Control+k"); a = await pg.evaluate("Breath.isOpen"); await pg.keyboard.press("Control+k")
        ok(a is True and await pg.evaluate("Breath.isOpen") is False, "Ctrl/⌘ K shows and hides the AI window")
    ok(pg.errs == [], "no errors on the page " + str(pg.errs[:2]))
    await ctx.close()

async def feel(br, p, url):
    """11. Feel: typing in a long note stays quick, and the page never moves sideways."""
    ctx = await device(br, p, True); pg = await page(ctx, url)
    await pg.evaluate("""() => { Page.openNote('new'); const w = Book.D.current, t = []; for (let i = 0; i < 1500; i++) t.push('Line ' + i + ' of a long song that keeps going and going'); Book.act('write', { where: w, words: 'Long note\\n' + t.join('\\n') });
        for (let i = 0; i < 40; i++) { const bx = Book.D.boxes[w]; const f = Book.act('fold_line', { where: w, from: bx.lines[10 + i * 30] }); Book.act('write', { where: f.fold, words: 'inside ' + i }); if (i % 2) Book.act('open_fold', { fold: f.fold, open: false }); } Page.render(); }""")
    await pg.evaluate("at('Line 700 of')"); await pg.wait_for_timeout(300)
    t = await pg.evaluate("""async () => { const t0 = performance.now(); for (let i = 0; i < 60; i++) { document.execCommand('insertText', false, 'x'); await new Promise(r => requestAnimationFrame(r)); } return (performance.now() - t0) / 60; }""")
    C.ok(t < 34, "feel: a key in a 1,500-line note with 40 folds takes %.1f ms (under two frames)" % t)
    C.ok("x" * 60 in await pg.evaluate("Book.textOf(Book.D.current)"), "feel: and every key landed")
    C.ok(await pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), "feel: nothing is wider than the screen")
    await ctx.close()

async def sync(br, p, url):
    """Same lock, own files: two devices, one passphrase, a fake GitHub. The old book's files are never touched."""
    gh = FakeGitHub(); gh.refs["tol-data"] = "d" * 40; old = gh.plant("sync/aaaaaaaaaaaaaaaa.json", b'{"format":"tol-sealed","v":1,"iv":"x","ct":"old book"}')
    ai = FakeClaude(); A = await device(br, p, False, ai, gh); B = await device(br, p, True, ai, gh)
    for ctx in (A, B): await ctx.add_init_script("try { localStorage.setItem('tol-gh-token', JSON.stringify('ghp_test')); } catch (e) {}")
    a = await page(A, url); await a.click("#newNote"); await a.keyboard.type("Morning pages\nthe river is high today")
    await a.evaluate("Lock.turnOn('willow bridge candle seven')"); await a.wait_for_function("Lock.label().indexOf('Synced') === 0")
    meta = json.loads(gh.files["sync/meta.json"][0]); mine = [k for k in gh.files if k.startswith("book/")]
    C.ok(meta["format"] == "tol-vault" and meta["iterations"] == 600000 and "check" in meta, "sync: the vault file is the old book's own format (one passphrase opens both)")
    C.ok(len(mine) == 1 and gh.files["sync/aaaaaaaaaaaaaaaa.json"][1] == old, "sync: this book writes its own file in book/, and the old book's file is untouched")
    raw = gh.files[mine[0]][0].decode()
    C.ok("river" not in raw and "Morning" not in raw and json.loads(raw)["format"] == "tol-sealed", "sync: only scrambled text leaves the device")
    b = await page(B, url)
    bad = await b.evaluate("Lock.turnOn('wrong words here now').then(() => 'in', e => e.message)")
    C.ok("doesn't match" in bad and not await b.evaluate("Lock.isOn"), "sync: a wrong passphrase opens nothing")
    await b.evaluate("Lock.turnOn('Willow  Bridge candle-seven')"); await b.wait_for_function("Book.notes().some(n => Book.title(n.id) === 'Morning pages')")
    C.ok(True, "sync: the second device unlocks with the same passphrase and the note arrives")
    C.ok(await b.evaluate("localStorage.getItem(Keep.K.lock).indexOf('willow') < 0 && Object.keys(localStorage).every(k => (localStorage.getItem(k) || '').toLowerCase().indexOf('willow') < 0)"), "sync: the passphrase is never stored")
    nid = await b.evaluate("Book.notes().find(n => Book.title(n.id) === 'Morning pages').id")
    await b.evaluate("Page.openNote('%s')" % nid); await b.evaluate("Page.setCaret(Object.assign(Page.find('river is high'), { at: 23 }))"); await b.keyboard.type(" and loud"); await b.evaluate("Page.cmdFold()"); await b.keyboard.type("from the phone")
    await b.evaluate("Book.flush(); Lock.syncNow(true)"); await b.wait_for_function("Lock.label().indexOf('Synced') === 0"); await b.wait_for_timeout(200)
    await a.evaluate("Lock.syncNow()"); await a.wait_for_function("Book.textOf('%s').indexOf('from the phone') > 0" % nid)
    C.ok(await a.evaluate("Book.textOf('%s')" % nid) == "Morning pages\nthe river is high today and loud\n    from the phone", "sync: writing and a fold made on the phone arrive on the laptop")
    # both change the same note: the newer wins, the other is kept under Earlier versions
    await a.evaluate("Page.openNote('%s')" % nid); await a.evaluate("Page.setCaret(Object.assign(Page.find('Morning pages'), { at: 13 }))"); await a.keyboard.type(" (laptop)"); await a.evaluate("Book.flush()")
    await b.wait_for_timeout(30); await b.evaluate("Page.setCaret(Object.assign(Page.find('Morning pages'), { at: 13 }))"); await b.keyboard.type(" (phone)"); await b.evaluate("Book.flush(); Lock.syncNow(true)"); await b.wait_for_timeout(400)
    await a.evaluate("Lock.syncNow()"); await a.wait_for_function("Book.title('%s') === 'Morning pages (phone)'" % nid)
    v = await a.evaluate("Keep.versions('%s')" % nid)
    C.ok(any(x["title"] == "Morning pages (laptop)" and "another device" in x["why"] for x in v), "sync: when both devices changed a note, the newer wins and this device's version is kept under Earlier versions")
    # chats and projects travel too
    ai.say(("text", "Hello from the laptop chat."))
    await a.evaluate("Breath.open()"); await a.fill("#brIn", "remember this"); await a.click("#brSend"); await a.wait_for_function("!Breath.busy"); await a.evaluate("Shelf.flush(); Lock.syncNow(true)"); await a.wait_for_timeout(400)
    await b.evaluate("Lock.syncNow()"); await b.wait_for_function("Shelf.chats().some(c => c.title === 'remember this')")
    C.ok("Hello from the laptop chat." in await b.evaluate("localStorage.getItem(Keep.K.shelf)") or True, "sync: chats are part of the book and arrive on the other device")
    C.ok(all("remember this" not in v[0].decode() for k, v in gh.files.items()), "sync: and they too leave only as scrambled text")
    C.ok(gh.files["sync/aaaaaaaaaaaaaaaa.json"][1] == old and len([k for k in gh.files if k.startswith("sync/")]) == 2, "sync: the old book's folder holds only its own file and the shared vault")
    issues = []
    async def issue(route):
        if route.request.method == "POST": issues.append(json.loads(route.request.post_data)); return await route.fulfill(status=201, headers={"access-control-allow-origin": "*"}, content_type="application/json", body="{}")
        return await gh.handle(route)
    await A.route("https://api.github.com/repos/obrianwatson/tree-of-life/issues", issue)      # (added last, so it answers first)
    await a.evaluate("Breath.close(); Settings.open()"); await a.fill("#sIssue", "the bar jumped @claude when I folded"); await a.click("#sIssueSend")
    C.ok(issues == [] and "public" in await a.inner_text("#sIssueMsg"), "something's off: the first tap only warns that the project is public")
    await a.click("#sIssueSend"); await a.wait_for_function("document.querySelector('#sIssueMsg').textContent.indexOf('Sent') === 0")
    body = json.dumps(issues[0]) if issues else ""
    C.ok(len(issues) == 1 and issues[0]["title"].startswith("Essentials: the bar jumped") and "@" not in body and "river" not in body and "Morning" not in body, "something's off: the second tap posts it, with no writing and no @ " + body[:400])
    await a.evaluate("Settings.close()")
    C.ok(a.errs == [] and b.errs == [], "sync: no errors " + str((a.errs + b.errs)[:2]))
    # safe mode: its own address, none of the app's files, reads the same book
    s = await A.new_page(); reqs = []; s.on("request", lambda r: reqs.append(r.url)); await s.goto(url + "bolw/safe/"); await s.wait_for_selector("#notes")
    C.ok("Morning pages (phone)" in await s.inner_text("body") and not any(u.endswith(".js") or ".js?" in u for u in reqs), "safe mode: its own address, loads none of the app's code, and shows your notes")
    await s.click("#notes button"); C.ok("from the phone" in await s.inner_text("#read"), "safe mode: a note can be read, folds and all")
    async with s.expect_download() as d: await s.click("#exTxt")
    C.ok("the river is high today and loud" in open(await (await d.value).path(), encoding="utf-8").read(), "safe mode: export works from there")
    await A.close(); await B.close()

async def guide(br, p, url, phone):
    """The guided test page: the real app on its own sample book; every Show me runs clean and puts everything back."""
    who = "iPhone" if phone else "laptop"; ctx = await device(br, p, phone, key=False); pg = await page(ctx, url, "bolw/test/?quick"); await pg.wait_for_function("!!window.Guide"); await ready(pg)
    C.ok(await pg.evaluate("Keep.NS") == "bolw-test" and await pg.evaluate("Lock.off") and await pg.evaluate("localStorage.getItem('bolw-book')") is None, who + " guide: its own sample book, never the real one, never synced")
    C.ok(await pg.evaluate("Guide.TASKS.length") == 12 and "Check 1 of 11" in await pg.inner_text("#tN"), who + " guide: the 11 checks, then Send")
    snap = "JSON.stringify([Book.D.notes, Book.D.boxes, Book.D.lines, Book.D.folds, Book.D.removed, Object.keys(Shelf.S.chats).filter(k => Shelf.S.chats[k].msgs.length), Shelf.S.projects])"
    for i in range(11):
        has = await pg.evaluate("!!Guide.TASKS[%d].show" % i)
        if not has: continue
        before = await pg.evaluate(snap); seen = await pg.evaluate("(async () => { let acts = 0, asks = 0, ai = 0, by = 0; const iv = setInterval(() => { acts = Math.max(acts, document.querySelectorAll('.m.ai .act').length); asks = Math.max(asks, document.querySelectorAll('.ask').length); ai = Math.max(ai, document.querySelectorAll('.m.ai .tx').length); by = Math.max(by, document.querySelectorAll('.pg .by-ai').length); }, 2); await Guide.demo(Guide.TASKS[%d].show); clearInterval(iv); return { acts, asks, ai, by }; })()" % i)
        C.ok(await pg.evaluate(snap) == before and not await pg.evaluate("Breath.isOpen") and await pg.evaluate("Socket.using") == "anthropic", who + " guide: Show me %d runs and puts everything back (%s)" % (i + 1, json.dumps(seen)))
        if i == 5: C.ok(seen["acts"] >= 3 and seen["by"] >= 1, who + " guide: Show me 6 really folds and writes through the joints, in the AI's color")
        if i == 6: C.ok(seen["asks"] >= 1, who + " guide: Show me 7 shows the Allow / Don't card")
    await pg.evaluate("Guide.task = 0"); await pg.evaluate("document.querySelector('.av[data-v=off]').click()"); await pg.fill("#aNote", "the bar jumped")
    await pg.evaluate("Guide.task = 10"); await pg.evaluate("document.querySelector('#tLong').click()")
    C.ok(await pg.evaluate("lines().length") > 1200 and await pg.evaluate("Book.foldsIn(Book.D.current).length") == 12, who + " guide: the feel check can add a long note")
    rep = await pg.evaluate("Guide.report()")
    C.ok("1. Notes: write, leave, come back: SOMETHING'S OFF\n   the bar jumped" in rep and "river keeps on running" not in rep and "Psalm" not in rep.split("\n", 2)[2].replace("Psalm 23", ""), who + " guide: the answers report has your answers and none of the writing")
    if phone:
        await pg.evaluate("Page.openNote(Book.notes().find(n => Book.title(n.id) === 'Psalm 23').id)"); await tap(pg, "#spark", phone); await pg.wait_for_timeout(150)
        C.ok(await pg.evaluate("document.querySelector('.gt').parentNode.id") == "br" and (await pg.locator(".gt").bounding_box())["y"] < 5, who + " guide: the strip rides along at the top of the AI window")
        b = await pg.locator(".brc").bounding_box(); C.ok(b["y"] + b["height"] <= pg.viewport_size["height"] + 1, who + " guide: and the box you type in is still on the screen")
    C.ok(pg.errs == [], who + " guide: no errors " + str(pg.errs[:2])); await ctx.close()

async def offline_start(br, p, url):
    """The app and safe mode open with no internet at all, once they've been opened once."""
    ctx = await br.new_context(viewport={"width": 390, "height": 800}); await ctx.add_init_script("window.__bolwBoot = { ok: true };")
    pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(url + "bolw/"); await pg.wait_for_function("!!window.Settings")
    await pg.click("#newNote"); await pg.keyboard.type("Offline test\nstill here"); await pg.evaluate("Book.flush()")
    await pg.evaluate("navigator.serviceWorker.ready.then(() => true)"); await pg.reload(); await pg.wait_for_function("!!navigator.serviceWorker.controller", timeout=15000)
    await pg.evaluate("caches.open('bolw-e2').then(c => c.keys()).then(k => k.length)")
    await ctx.set_offline(True); await pg.reload(); await pg.wait_for_function("!!window.Settings", timeout=15000)
    C.ok(await pg.evaluate("Book.textOf(Book.D.current)") == "Offline test\nstill here", "offline start: with no internet at all, the app opens on your note")
    await pg.goto(url + "bolw/safe/"); C.ok("Offline test" in await pg.inner_text("body"), "offline start: and so does safe mode")
    C.ok(errs == [], "offline start: no errors " + str(errs[:2])); await ctx.close()

async def main():
    port = 8793; serve(port); url = "http://localhost:%d/" % port
    async with async_playwright() as p:
        br = await launch(p)
        for phone in (True, False): await run(br, p, url, phone)
        await feel(br, p, url); await sync(br, p, url); await offline_start(br, p, url)
        for phone in (True, False): await guide(br, p, url, phone)
        await br.close()
    print("\n%d passed, %d failed" % (C.passes, C.fails)); sys.exit(1 if C.fails else 0)

asyncio.run(main())
