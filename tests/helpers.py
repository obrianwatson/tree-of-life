"""Shared helpers for the Book of Living Waters browser tests.

Serves docs/ on a local port, starts a browser through Playwright (Chrome by default; set
BROWSER=webkit or BROWSER=firefox for Safari's engine or Firefox), and offers a fake
GitHub (in memory) so sync can be tested without touching the real repository.
"""
import base64, functools, hashlib, http.server, json, os, re, socketserver, threading, time
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
BROWSER = os.environ.get("BROWSER", "chromium")   # chromium (Chrome), webkit (Safari's engine) or firefox


async def launch(p):
    """Start the browser the tests run in. BROWSER=webkit or firefox uses Playwright's own builds;
    chromium uses the Chrome at CHROME if it exists, otherwise Playwright's Chromium."""
    if BROWSER == "firefox":
        return await p.firefox.launch()
    if BROWSER == "webkit":
        return await p.webkit.launch()
    kw = {"args": ["--no-sandbox"]}
    if CHROME and os.path.exists(CHROME):
        kw["executable_path"] = CHROME
    return await p.chromium.launch(**kw)


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


SERVERS = {}


def serve(port, directory=None):
    """Serve docs/ (or another folder) at http://127.0.0.1:<port>/ in a background thread."""
    h = functools.partial(_Quiet, directory=directory or DOCS)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    SERVERS[port] = srv
    return f"http://127.0.0.1:{port}/"


def unplug(port):
    """Stop the server on this port: from the browser's side, the internet is gone."""
    srv = SERVERS.pop(port, None)
    if srv:
        srv.shutdown(); srv.server_close()


class Checks:
    def __init__(self):
        self.fails = 0
        self.passes = 0

    def ok(self, cond, msg):
        print(("PASS " if cond else "FAIL ") + msg, flush=True)
        if cond:
            self.passes += 1
        else:
            self.fails += 1


class FakeGitHub:
    """Just enough of the GitHub API for sync: refs and contents on the tol-data branch."""

    def __init__(self):
        self.refs = {"main": "m" * 40}
        self.files = {}
        self.offline = False
        self.puts = []          # (path, bytes stored) for every write, to measure how much sync sends
        self.blobs = {}         # every version ever written, by its sha (like git)
        self.no_blobs = False   # True: answer 404 for /git/blobs (the app must fall back to reading by path)
        self.lag = {}           # path → an older sha: the folder list shows that older version (GitHub's list a moment behind)
        self.garble = set()     # shas whose NEXT read returns garbage once (a download that went wrong)
        self.late = {}          # sha → how many reads answer 404 first (GitHub lists a new file a moment before it can hand it over)
        self.old_by_path = {}   # path → older content handed out ONCE when the file is read by its path (a copy that is behind)

    def plant(self, path, data):
        """Put a file there as if some device had written it (with git's real fingerprint)."""
        sha = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()
        self.files[path] = (data, sha); self.blobs[sha] = data
        return sha

    async def handle(self, route):
        req = route.request
        if self.offline:
            return await route.abort("internetdisconnected")
        u = urlparse(req.url)
        path, qs = u.path, parse_qs(u.query)
        cors = {"access-control-allow-origin": "*"}

        def j(code, obj):
            return route.fulfill(status=code, headers=cors, content_type="application/json", body=json.dumps(obj))

        m = re.match(r"^/repos/obrianwatson/tree-of-life(.*)$", path)
        if not m:
            return await j(404, {"message": "Not Found"})
        rest = m.group(1)
        if rest == "":
            return await j(200, {"permissions": {"push": True}})
        mm = re.match(r"^/git/ref/heads/(.+)$", rest)
        if mm and req.method == "GET":
            b = mm.group(1)
            return await (j(200, {"object": {"sha": self.refs[b]}}) if b in self.refs else j(404, {"message": "Not Found"}))
        if rest == "/git/refs" and req.method == "POST":
            body = json.loads(req.post_data)
            name = body["ref"].split("refs/heads/")[1]
            if name in self.refs:
                return await j(422, {"message": "Reference already exists"})
            self.refs[name] = body["sha"]
            return await j(201, {"ref": body["ref"]})
        mm = re.match(r"^/git/blobs/([0-9a-f]+)$", rest)
        if mm and req.method == "GET":
            data = None if self.no_blobs else self.blobs.get(mm.group(1))
            if data is None:
                return await j(404, {"message": "Not Found"})
            if mm.group(1) in self.garble:
                self.garble.discard(mm.group(1)); data = b'{"format":"tol-sealed","v":1,"iv":"AAAA","ct":"garbled'
            if mm.group(1) in self.late:
                self.late[mm.group(1)] -= 1
                if self.late[mm.group(1)] <= 0:
                    del self.late[mm.group(1)]
                return await j(404, {"message": "Not Found"})
            if "raw" in req.headers.get("accept", ""):
                return await route.fulfill(status=200, headers=cors, content_type="text/plain", body=data)
            return await j(200, {"sha": mm.group(1), "encoding": "base64", "content": base64.b64encode(data).decode()})
        mm = re.match(r"^/contents/(.+)$", rest)
        if mm:
            p = mm.group(1)
            if req.method == "GET":
                if "tol-data" not in self.refs:
                    return await j(404, {"message": "No commit found for the ref"})
                if p in ("sync", "book", "core"):
                    items = [{"name": k.split("/")[1], "path": k, "sha": self.lag.get(k, v[1]), "type": "file"} for k, v in self.files.items() if k.startswith(p + "/")]
                    return await (j(200, items) if items else j(404, {"message": "Not Found"}))
                if p not in self.files:
                    return await j(404, {"message": "Not Found"})
                data, sha = self.files[p]
                if "raw" in req.headers.get("accept", ""):
                    if p in self.old_by_path:
                        data = self.old_by_path.pop(p)
                    return await route.fulfill(status=200, headers=cors, content_type="text/plain", body=data)
                return await j(200, {"sha": sha, "content": base64.b64encode(data).decode()})
            if req.method == "PUT":
                body = json.loads(req.post_data)
                cur = self.files.get(p)
                if cur and body.get("sha") != cur[1]:
                    return await j(409, {"message": "sha does not match"})
                data = base64.b64decode(body["content"])
                sha = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()      # git's own fingerprint of a file, as the real GitHub gives
                self.files[p] = (data, sha)
                self.blobs[sha] = data
                self.puts.append((p, len(data)))
                return await j(200 if cur else 201, {"content": {"sha": sha, "path": p}})
        return await j(200, [])


async def new_device(browser, url, fake=None, token=True, **ctx_kw):
    ctx_kw.pop("default_browser_type", None)
    if BROWSER == "firefox":
        ctx_kw.pop("is_mobile", None)       # Firefox has no phone mode; the phone-sized window and touch still apply
    ctx = await browser.new_context(**ctx_kw)
    if fake:
        await ctx.route("https://api.github.com/**", fake.handle)
    await ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
    if token:
        await ctx.add_init_script("try{if(!localStorage.getItem('tol-gh-token'))localStorage.setItem('tol-gh-token', JSON.stringify('github_pat_test'));}catch(e){}")
    pg = await ctx.new_page()
    pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    await pg.goto(url)
    await pg.wait_for_timeout(400)
    return ctx, pg


# The app now starts through a small bootloader (docs/index.html) that loads the app's files a moment
# after the page loads. Every test's goto/reload waits until the app has started.
from playwright.async_api import Page as _Page
_goto, _reload = _Page.goto, _Page.reload

async def _wait_app(pg):
    try:
        await pg.wait_for_function("window.__bolwBoot && 'ok' in window.__bolwBoot || /couldn't/.test((document.getElementById('bolwBoot') || {}).textContent || '')", timeout=15000)
    except Exception as e:
        print("boot wait:", str(e)[:200])

async def _goto_wait(self, url, **kw):
    r = await _goto(self, url, **kw)
    await _wait_app(self)
    return r

async def _reload_wait(self, **kw):
    r = await _reload(self, **kw)
    await _wait_app(self)
    return r

_Page.goto, _Page.reload = _goto_wait, _reload_wait
