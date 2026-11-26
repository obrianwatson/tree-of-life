"""Claude in the book (agent.js): open with the header button / Ctrl+K / Ask Claude on a selection,
streaming replies, tools acting on folds/pages/looks, confirmation before removing words, undo of a
whole reply, conversation kept per page, offline and no-key messages, hand-off to Claude Code.
Anthropic is faked (streaming SSE, tool_use). Run:  python3 tests/test_agent.py"""
import asyncio, json, os, re, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import serve, Checks, new_device, CHROME
from test_folds import select, pages, root_id
from playwright.async_api import async_playwright

C = Checks()
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
KEY = "try{if(!localStorage.getItem('tol-ai'))localStorage.setItem('tol-ai', JSON.stringify({key:'sk-ant-test', model:'claude-haiku-5-5', cap: 5}));}catch(e){}"


def sse(blocks, stop):
    """Turn content blocks into an Anthropic-style event stream."""
    ev = [{"type": "message_start", "message": {"usage": {"input_tokens": 900}}}]
    for i, b in enumerate(blocks):
        if b["type"] == "text":
            ev.append({"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}})
            words = b["text"].split(" ")
            for k, w in enumerate(words):
                ev.append({"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": w + ("" if k == len(words) - 1 else " ")}})
        else:
            ev.append({"type": "content_block_start", "index": i, "content_block": {"type": "tool_use", "id": b["id"], "name": b["name"], "input": {}}})
            js = json.dumps(b["input"])
            for k in range(0, len(js), 7):
                ev.append({"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": js[k:k + 7]}})
        ev.append({"type": "content_block_stop", "index": i})
    ev.append({"type": "message_delta", "delta": {"stop_reason": stop}, "usage": {"output_tokens": 120}})
    ev.append({"type": "message_stop"})
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in ev)


class FakeClaude:
    """A queue of scripted replies. Each reply is a function(request_body) -> (blocks, stop_reason)."""
    def __init__(self):
        self.queue = []
        self.calls = []

    async def handle(self, route):
        req = route.request
        cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS"}
        if req.method == "OPTIONS":
            return await route.fulfill(status=204, headers=cors)
        body = json.loads(req.post_data)
        self.calls.append(body)
        if not body.get("stream"):
            return await route.fulfill(status=200, headers=cors, content_type="application/json",
                                       body=json.dumps({"content": [{"type": "text", "text": "OK"}], "usage": {"input_tokens": 10, "output_tokens": 2}}))
        fn = self.queue.pop(0) if self.queue else (lambda b: ([{"type": "text", "text": "Done."}], "end_turn"))
        blocks, stop = fn(body)
        return await route.fulfill(status=200, headers=cors, content_type="text/event-stream", body=sse(blocks, stop))


def tool_call(name, inp, tid="t1"):
    return lambda b: ([{"type": "text", "text": "Let me do that."}, {"type": "tool_use", "id": tid, "name": name, "input": inp}], "tool_use")

def say(text):
    return lambda b: ([{"type": "text", "text": text}], "end_turn")


async def ask(pg, text):
    await pg.fill("#agIn", text)
    await pg.click("#agSend")
    await pg.wait_for_function("!document.getElementById('agSend').disabled", timeout=10000)
    await pg.wait_for_timeout(150)


async def clock(pg):
    return await pg.evaluate("(() => { const [h,m,s] = document.getElementById('total').textContent.split(':').map(Number); return h*3600+m*60+s; })()")


async def main():
    url = serve(8831)
    fake = FakeClaude()
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

        # ---------- no key: Claude says how to switch it on ----------
        ctx0, pg0 = await new_device(br, url, token=False, viewport={"width": 1280, "height": 800})
        await pg0.click("#claudeHere")
        C.ok(await pg0.is_visible("#agent"), "✦ Claude opens the Claude panel")
        C.ok("Settings → AI" in await pg0.text_content("#agNote"), "without a key, the panel says to add one in Settings → AI")
        await ctx0.close()

        ctx = await br.new_context(viewport={"width": 1280, "height": 800})
        await ctx.add_init_script(KEY)
        await ctx.route("https://api.anthropic.com/**", fake.handle)
        await ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
        pg = await ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_timeout(400)

        await pg.click("#writer textarea")
        await pg.keyboard.type("The tree is brown.\nMy chair faces the window.", delay=3)
        await pg.wait_for_timeout(5200)           # let the typing clock stop
        root = await root_id(pg)
        t0 = await clock(pg)

        # ---------- Ctrl+K opens; a tool makes a fold; streaming text shows; undo puts it back ----------
        await pg.keyboard.press("Control+k")
        C.ok(await pg.is_visible("#agent"), "Ctrl+K opens Claude")
        fake.queue = [tool_call("make_fold", {"node_id": root, "words": "tree", "text": "Grandfather planted it."}), say("I folded the memory under “tree”.")]
        await ask(pg, "fold a memory under tree")
        ps = await pages(pg)
        f = next((v for v in ps.values() if v.get("anchor") and v["anchor"]["text"] == "tree"), None)
        C.ok(f and f["text"] == "Grandfather planted it.", "Claude made a real fold under “tree” with its text")
        steps = await pg.locator("#agent .ag-step").all_text_contents()
        C.ok(any("Folded under" in s for s in steps), "the step shows as a line: " + "; ".join(steps))
        msgs = await pg.locator("#agent .ag-m.a .ag-t").all_text_contents()
        C.ok(any("I folded the memory" in m for m in msgs), "the streamed reply text shows")
        tiers = await pg.locator("#agent .ag-tier").all_text_contents()
        C.ok(tiers and tiers[-1] == "Instant", "the reply is marked Instant")
        sent = fake.calls[-2]
        C.ok(any(t["name"] == "make_fold" for t in sent["tools"]) and sent["stream"] is True and sent["model"] == "claude-haiku-5-5", "Claude was called streaming, with tools and the chosen model")
        C.ok("enscribe oneself into life" in sent["system"], "Claude knows the writer's definition (spelled enscribe)")
        C.ok(f"id {root}" in json.dumps(sent["messages"][0]), "Claude is told where the writer is")
        C.ok(fake.calls[-1]["messages"][-1]["content"][0]["type"] == "tool_result", "the tool result went back to Claude")
        C.ok(await clock(pg) == t0, "Claude's actions added nothing to the writing clock")
        C.ok(await pg.is_visible("#agUndo"), "“Undo Claude's changes” appears")
        await pg.click("#agUndo"); await pg.wait_for_timeout(200)
        ps = await pages(pg)
        C.ok(not any(v.get("anchor") and v["anchor"]["text"] == "tree" for v in ps.values()), "undo removed the fold Claude made")
        C.ok(ps[root]["text"].startswith("The tree is brown."), "the writer's words are untouched by undo")

        # ---------- removing words needs the writer's OK ----------
        fake.queue = [tool_call("replace_text", {"node_id": root, "find": "brown", "replace": "green"}), say("Left it alone.")]
        await pg.fill("#agIn", "make it green")
        await pg.click("#agSend")
        await pg.wait_for_selector("#agent .ag-ask", timeout=5000)
        C.ok("change words" in await pg.text_content("#agent .ag-ask"), "Claude asks before changing the writer's words")
        await pg.click("#agent .ag-ask [data-no]")
        await pg.wait_for_function("!document.getElementById('agSend').disabled", timeout=10000)
        C.ok("brown" in (await pages(pg))[root]["text"], "saying Don't keeps the words")
        fake.queue = [tool_call("replace_text", {"node_id": root, "find": "brown", "replace": "green"}), say("Changed it.")]
        await pg.fill("#agIn", "yes, make it green")
        await pg.click("#agSend")
        await pg.wait_for_selector("#agent .ag-ask", timeout=5000)
        await pg.click("#agent .ag-ask [data-yes]")
        await pg.wait_for_function("!document.getElementById('agSend').disabled", timeout=10000)
        C.ok("The tree is green." in (await pages(pg))[root]["text"], "saying Allow changes them")
        await pg.click("#agUndo"); await pg.wait_for_timeout(200)
        C.ok("The tree is brown." in (await pages(pg))[root]["text"], "undo puts the original words back")

        # ---------- the look, and undo of it ----------
        before = await pg.evaluate("window.TOL.getTheme()")
        key = next(k for k, v in before.items() if isinstance(v, (int, float)) and not isinstance(v, bool))
        fake.queue = [tool_call("set_look", {"changes": {key: before[key] + 1}}), say("Done.")]
        await ask(pg, "change the look a little")
        C.ok((await pg.evaluate("window.TOL.getTheme()"))[key] == before[key] + 1, f"Claude changed the look ({key})")
        await pg.click("#agUndo"); await pg.wait_for_timeout(150)
        C.ok((await pg.evaluate("window.TOL.getTheme()"))[key] == before[key], "undo restored the look")

        # ---------- conversation kept per page, survives reload ----------
        await pg.reload(); await pg.wait_for_timeout(500)
        await pg.click("#claudeHere")
        n_user = await pg.locator("#agent .ag-m.u").count()
        C.ok(n_user >= 4, f"the conversation for this page is still there after reload ({n_user} of your messages)")
        conv = await pg.evaluate(f"(window.TOL.getMemory().convos || {{}})['{root}']")
        C.ok(conv and len(conv["msgs"]) >= 8, "it's kept in memory.convos (which syncs, encrypted)")
        await pg.click("#agClose")

        # ---------- Ask Claude on selected words ----------
        await select(pg, "chair")
        await pg.wait_for_selector("#foldbar [data-b=ask]", state="visible")
        await pg.click("#foldbar [data-b=ask]")
        C.ok("chair" in await pg.text_content("#agSel"), "Ask Claude on a selection shows the selected words")
        fake.queue = [say("It's a chair.")]
        await ask(pg, "what is this?")
        C.ok("“chair”" in json.dumps(fake.calls[-1]["messages"][-1]) or "chair" in json.dumps(fake.calls[-1]["messages"][-1]), "the selected words go to Claude")
        await pg.screenshot(path=os.path.join(SHOTS, "agent-laptop.png"))

        # ---------- a bad tool input comes back as an error, not a crash ----------
        fake.queue = [tool_call("make_fold", {"node_id": root, "words": "not here", "text": "x"}), say("Those words aren't there.")]
        await ask(pg, "fold under something missing")
        C.ok("aren't there" in (await pg.locator("#agent .ag-m.a .ag-t").all_text_contents())[-1], "a failed tool is reported back to Claude, who explains")
        C.ok("isn't" in json.dumps(fake.calls[-1]["messages"][-1]) or "aren't" in json.dumps(fake.calls[-1]["messages"][-1]), "the tool error went to Claude")

        # ---------- hand-off to Claude Code (Deep) ----------
        fake.queue = [lambda b: ([{"type": "tool_use", "id": "h1", "name": "ask_claude_code", "input": {"request": "Add a dark sidebar"}}], "tool_use"), say("Handed to Claude Code.")]
        await ask(pg, "rebuild the sidebar")
        await pg.wait_for_timeout(700)
        C.ok(await pg.evaluate("window.TOL.view()") == "chat" and await pg.input_value("#ask") == "Add a dark sidebar", "big changes go to the Claude Code page, request filled in")
        await pg.evaluate("window.TOL.showView('write')")
        await pg.click("#claudeHere")
        C.ok((await pg.locator("#agent .ag-tier").all_text_contents())[-1] == "Deep", "that reply is marked Deep")
        await pg.click("#agClose")

        # ---------- offline ----------
        n_calls = len(fake.calls)
        await ctx.set_offline(True)
        await pg.click("#claudeHere")
        await pg.fill("#agIn", "hello?"); await pg.click("#agSend"); await pg.wait_for_timeout(200)
        C.ok("offline" in (await pg.text_content("#agNote")).lower() and len(fake.calls) == n_calls, "offline: Claude says so plainly and nothing is sent")
        await ctx.set_offline(False)
        await pg.click("#agClose")

        # ---------- iPhone: the button sits in the header, the panel fits ----------
        ph = await br.new_context(**p.devices["iPhone 13"])
        await ph.add_init_script(KEY)
        await ph.route("https://api.anthropic.com/**", fake.handle)
        await ph.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
        pp = await ph.new_page(); pp.errs = []
        pp.on("pageerror", lambda e: pp.errs.append(str(e)))
        await pp.goto(url); await pp.wait_for_timeout(400)
        await pp.tap("#claudeHere")
        box = await pp.locator("#agent").bounding_box()
        C.ok(box and box["x"] >= 0 and box["x"] + box["width"] <= 390 + 1, "on the iPhone the Claude panel fits the screen")
        C.ok(not await pp.is_visible("#thumb"), "the hold button steps aside while the panel is open")
        await pp.screenshot(path=os.path.join(SHOTS, "agent-phone.png"))
        C.ok(not pp.errs, f"no page errors on the phone {pp.errs}")
        await ph.close()

        C.ok(not pg.errs, f"no page errors {pg.errs}")
        await br.close()
    print(f"\n{C.passes} passed, {C.fails} failed")
    sys.exit(1 if C.fails else 0)


if __name__ == "__main__":
    asyncio.run(main())
