/* Code-folds: "The App" — the app's own files, read-only, split into foldable chunks.
   You can open and fold them, write notes on any chunk (memory.codenotes, synced), place a chunk in
   any page (a fold with `code: {file, key, title}` under a line it adds, or under words you select →
   Nest → "App code…"), and hand a chunk to Claude Code ("Change this with Claude Code" → the Deep tier).
   Changes to the code itself only happen through Claude Code (or, later, onboard versions).
   Where the files come from: T.code.read(name) — the published files of this version (cached offline by
   the service worker). The onboard code vault (Phase 5) replaces T.code.source. */
(() => {
  const T = window.TOL; if (!T || !T.memoryApi) return;
  const $ = id => document.getElementById(id), esc = T.esc, H = T.hooks, M = T.memoryApi;
  const FILES = ["index.html", "claude.js", "memory.js", "ai.js", "agent.js", "addons.js", "drill.js", "codefolds.js", "sync.js", "sw.js"];
  const cache = {};
  const code = T.code = T.code || {};
  code.files = code.files || (() => FILES.slice());
  code.label = code.label || (() => "published version " + T.APP_VERSION);
  /* published files: fetched, and kept in a cache of their own so The App opens offline too */
  const CC = "bolw-code";
  code.source = code.source || (async name => {
    const url = new URL("./" + name, location.href).href;
    try {
      const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(name + ": " + r.status);
      const t = await r.text();
      try { const c = await caches.open(CC); await c.put(url, new Response(t, { headers: { "content-type": "text/plain" } })); } catch (e) {}
      return t;
    } catch (err) {
      try { const c = await caches.open(CC), hit = await c.match(url); if (hit) return hit.text(); } catch (e) {}
      throw err;
    }
  });
  code.read = async name => { const k = code.label() + "|" + name; if (!(k in cache)) cache[k] = await code.source(name); return cache[k]; };
  code.forget = () => { for (const k of Object.keys(cache)) delete cache[k]; };

  /* split a file into chunks at its section comments, functions, tools and big HTML parts */
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "part";
  function titleOf(line, name) {
    let m;
    if ((m = line.match(/\/\*\s*-{3,}\s*(.*?)\s*-{3,}/))) return m[1];
    if ((m = line.match(/^\s*\/\*\s*(.{3,60}?)(\*\/|$)/))) return m[1].replace(/[.:]\s.*$/, "").trim();
    if ((m = line.match(/^\s*(?:async\s+)?function\s+([\w$]+)/))) return "function " + m[1];
    if ((m = line.match(/^\s*(?:T\.agent\.)?tool\("([\w]+)"/))) return "Claude's tool “" + m[1] + "”";
    if ((m = line.match(/^\s*<(style|script|header|main|section|dialog|aside|nav|footer|body|head)\b([^>]*)>/))) { const id = (m[2].match(/id="([^"]+)"/) || [])[1]; return "<" + m[1] + (id ? " #" + id : "") + ">"; }
    return line.trim().slice(0, 60) || name;
  }
  function isBreak(line, html) {
    if (/^\s{0,2}\/\*\s*-{3,}/.test(line)) return true;
    if (/^\s{0,2}(async\s+)?function\s+[\w$]+/.test(line)) return true;
    if (/^\s{0,4}(T\.agent\.)?tool\("[\w]+"/.test(line)) return true;
    if (html && /^\s{0,4}<(style|script|header|main|section|dialog|aside)\b/.test(line)) return true;
    return false;
  }
  function chunks(name, text) {
    const lines = text.split("\n"), html = /\.html$/.test(name), out = [];
    let cur = { start: 0, lines: [], title: "Start of " + name };
    for (let i = 0; i < lines.length; i++) {
      if (isBreak(lines[i], html) && cur.lines.length) { out.push(cur); cur = { start: i, lines: [], title: titleOf(lines[i], name) }; }
      cur.lines.push(lines[i]);
    }
    out.push(cur);
    const merged = [];
    for (const c of out) { const prev = merged[merged.length - 1]; if (prev && c.lines.length < 3) prev.lines = prev.lines.concat(c.lines); else merged.push(c); }
    const final = [];
    for (const c of merged) {                     // very long parts are split at blank lines
      if (c.lines.length <= 140) { final.push(c); continue; }
      let part = { start: c.start, lines: [], title: c.title }, k = 1;
      c.lines.forEach((l, i) => { part.lines.push(l); if (part.lines.length >= 80 && !l.trim() && i < c.lines.length - 5) { final.push(part); k++; part = { start: c.start + i + 1, lines: [], title: c.title + " (part " + k + ")" }; } });
      final.push(part);
    }
    const seenKeys = {};
    return final.map(c => { const b = name + "#" + slug(c.title); seenKeys[b] = (seenKeys[b] || 0) + 1; return { key: b + (seenKeys[b] > 1 ? "-" + seenKeys[b] : ""), file: name, title: c.title, from: c.start + 1, to: c.start + c.lines.length, text: c.lines.join("\n") }; });
  }
  code.chunks = async name => chunks(name, await code.read(name));
  code.chunk = async (file, key) => (await code.chunks(file)).find(c => c.key === key) || null;

  /* notes on chunks (synced) */
  const notes = () => M.getPart("codenotes");
  const noteOf = key => { const n = notes()[key]; return n && !n.deleted ? n.text || "" : ""; };
  const saveNote = (c, text) => M.putRecord("codenotes", c.key, { id: c.key, file: c.file, title: c.title, text });

  /* ---------------- the App view ---------------- */
  const sec = document.createElement("section"); sec.id = "appView"; sec.dataset.view = "app"; sec.hidden = true; sec.setAttribute("aria-label", "The App");
  document.querySelector("main").appendChild(sec);
  const css = document.createElement("style");
  css.textContent = `#appView{overflow-y:auto;padding:16px max(16px,calc((100% - 860px)/2)) 160px}
#appView .a-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#appView .a-top b{flex:1;font-size:18px}
#appView input[type=search]{width:100%;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:15px "Hanken Grotesk",system-ui,sans-serif;padding:0 10px;margin:8px 0}
#appView details{border:1px solid var(--line);border-radius:12px;margin:6px 0;background:var(--paper)}
#appView details>summary{cursor:pointer;padding:10px 12px;font:15px/1.3 "Hanken Grotesk",system-ui,sans-serif;list-style-position:inside}
#appView details details{margin:4px 8px;border-radius:10px}
#appView summary small{color:var(--muted);margin-left:6px}
#appView summary .nb{font-size:12px;border:1px dashed var(--line);border-radius:6px;padding:0 5px;margin-left:6px;color:var(--muted)}
.cf-pre{margin:0 10px 8px;padding:10px;overflow:auto;max-height:420px;background:var(--side);border-radius:8px;font:12.5px/1.45 ui-monospace,Menlo,monospace;white-space:pre;tab-size:2}
.cf-note{display:block;width:calc(100% - 20px);margin:0 10px 6px;min-height:52px;border:1px solid var(--line);border-radius:8px;padding:8px;font:15px/1.4 Literata,Georgia,serif;background:var(--paper);color:var(--ink)}
.cf-row{display:flex;gap:6px;flex-wrap:wrap;margin:0 10px 10px}
.fold.place .cf-pre{margin:4px 0}`;
  document.head.appendChild(css);

  let q = "";
  async function openApp(focusKey) {
    T.showView("app");
    sec.innerHTML = `<div class="a-top"><b>The App</b><button class="btn" data-a="quit">Back to writing</button></div>
      <p><small>This is the app's own code (${esc(code.label())}), split into parts you can fold. It's read-only here: fold it, place parts in your pages and write notes freely. To change it, use “Change this with Claude Code”.</small></p>
      <input type="search" id="appQ" placeholder="Find in the code" value="${esc(q)}" aria-label="Find in the code"><div id="appFiles"><p><small>Loading…</small></p></div>`;
    $("appQ").addEventListener("input", e => { q = e.target.value; paintFiles(); });
    await paintFiles(focusKey);
  }
  async function paintFiles(focusKey) {
    const box = $("appFiles"); if (!box) return;
    const parts = [];
    for (const f of code.files()) {
      let list;
      try { list = await code.chunks(f); } catch (e) { parts.push(`<details><summary>${esc(f)} <small>couldn't load (${esc(e.message)}${navigator.onLine === false ? ", offline and not saved yet" : ""})</small></summary></details>`); continue; }
      const ql = q.trim().toLowerCase();
      const shown = ql ? list.filter(c => c.title.toLowerCase().includes(ql) || c.text.toLowerCase().includes(ql) || noteOf(c.key).toLowerCase().includes(ql)) : list;
      if (ql && !shown.length) continue;
      const openFile = ql || (focusKey && focusKey.startsWith(f + "#"));
      parts.push(`<details data-file="${esc(f)}"${openFile ? " open" : ""}><summary><b>${esc(f)}</b><small>${list.length} parts · ${list[list.length - 1].to} lines</small></summary>
        ${shown.map(c => chunkHTML(c, focusKey === c.key)).join("")}</details>`);
    }
    box.innerHTML = parts.join("") || "<p><small>Nothing found.</small></p>";
    if (focusKey) { const el = box.querySelector(`[data-key="${CSS.escape(focusKey)}"]`); if (el) el.scrollIntoView({ block: "start" }); }
  }
  function chunkHTML(c, open) {
    const note = noteOf(c.key);
    return `<details data-key="${esc(c.key)}"${open ? " open" : ""}><summary>${esc(c.title)}<small>lines ${c.from}–${c.to}</small>${note ? '<span class="nb">note</span>' : ""}</summary>
      <pre class="cf-pre">${esc(c.text)}</pre>
      <textarea class="cf-note" data-note="${esc(c.key)}" placeholder="Your note on this part (kept and synced; the code doesn't change)">${esc(note)}</textarea>
      <div class="cf-row"><button class="fbtn" data-cf-place="${esc(c.key)}">Place in a page…</button><button class="fbtn" data-cf-claude="${esc(c.key)}">Change this with Claude Code</button></div></details>`;
  }
  const byKey = async key => { const file = key.split("#")[0]; return code.chunk(file, key); };
  let noteT = null;
  document.addEventListener("input", async e => {
    const t = e.target; if (!t.dataset || !t.dataset.note) return;
    clearTimeout(noteT); const key = t.dataset.note, val = t.value;
    noteT = setTimeout(async () => { const c = await byKey(key); if (c) saveNote(c, val); }, 400);
  });
  document.addEventListener("focusout", async e => {      // save at once when leaving the note
    const t = e.target; if (!t.dataset || !t.dataset.note) return;
    clearTimeout(noteT); const c = await byKey(t.dataset.note); if (c && noteOf(c.key) !== t.value) saveNote(c, t.value);
  });
  async function toClaudeCode(key) {
    const c = await byKey(key); if (!c) { T.toast("That part of the code isn't there any more."); return; }
    T.showView("chat");
    const a = $("ask"); if (!a) return;
    const body = c.text.length > 4000 ? c.text.slice(0, 4000) + "\n… (cut)" : c.text, note = noteOf(c.key);
    a.value = `In ${c.file}, the part “${c.title}” (lines ${c.from}–${c.to}, ${code.label()}):\n\n\`\`\`\n${body}\n\`\`\`\n${note ? "\nMy note on it: " + note + "\n" : ""}\nWhat I'd like changed: `;
    a.focus(); a.setSelectionRange(a.value.length, a.value.length);
  }
  code.toClaudeCode = toClaudeCode;

  /* place a chunk in a page: a line is added at the end of the page, with the code folded under it */
  const pdlg = document.createElement("dialog"); pdlg.id = "cfPick"; pdlg.setAttribute("aria-labelledby", "cfPickT"); document.body.appendChild(pdlg);
  let picking = null;
  function pickPage(key) {
    picking = { key };
    const L = T.allNodes().filter(n => T.live(n) && !n.ref && !n.code && !n.portal).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 60);
    pdlg.innerHTML = `<h2 id="cfPickT">Place this code in…</h2><p><small>A line naming it is added at the end of the page you pick, with the code folded under it. Your other words aren't touched.</small></p>
      <div class="list">${L.map(n => `<button class="btn" style="display:block;width:100%;text-align:left;margin:4px 0" data-cf-to="${n.id}">${esc(T.titleOf(n))}</button>`).join("") || "<p>No pages yet.</p>"}</div>
      <div class="row"><button class="btn" data-cf-cancel="1">Cancel</button></div>`;
    pdlg.showModal();
  }
  async function placeChunk(key, pageId) {
    const c = await byKey(key), n = T.node(pageId); if (!c || !T.live(n)) return null;
    const line = `⌘ ${c.file} · ${c.title}`, text = n.text || "", sep = text && !text.endsWith("\n") ? "\n" : "";
    T.setText(n.id, text + sep + line);
    const s = text.length + sep.length;
    return T.placeHere(n.id, s, s + line.length, null, { code: { file: c.file, key: c.key, title: c.title } });
  }
  code.place = placeChunk;
  function pickChunk(st) {                     // from the writer: words selected → Nest → App code…
    picking = { st };
    pdlg.innerHTML = `<h2 id="cfPickT">Fold app code under these words</h2><input type="search" id="cfQ" placeholder="Find a part (e.g. writing clock, sync, fold)" style="width:100%;height:44px;border-radius:10px;border:1px solid var(--line);padding:0 10px">
      <div id="cfList" class="list"><p><small>Loading…</small></p></div><div class="row"><button class="btn" data-cf-cancel="1">Cancel</button></div>`;
    pdlg.showModal();
    const paint = async () => {
      const ql = ($("cfQ").value || "").trim().toLowerCase(), out = [];
      for (const f of code.files()) { try { for (const c of await code.chunks(f)) if (!ql || c.title.toLowerCase().includes(ql) || c.text.toLowerCase().includes(ql)) out.push(c); } catch (e) {} if (out.length > 60) break; }
      $("cfList").innerHTML = out.slice(0, 60).map(c => `<button class="btn" style="display:block;width:100%;text-align:left;margin:4px 0" data-cf-chunk="${esc(c.key)}">${esc(c.title)} <small>${esc(c.file)}</small></button>`).join("") || "<p><small>Nothing found.</small></p>";
    };
    $("cfQ").addEventListener("input", paint); paint();
  }
  pdlg.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cfCancel) { pdlg.close(); picking = null; }
    else if (b.dataset.cfTo && picking) { const k = picking.key; pdlg.close(); picking = null; const f = await placeChunk(k, b.dataset.cfTo); if (f) { T.toast("Placed. It's folded under the last line of that page."); } }
    else if (b.dataset.cfChunk && picking && picking.st) {
      const st = picking.st, c = await byKey(b.dataset.cfChunk); pdlg.close(); picking = null;
      if (c) T.placeHere(st.id, st.s, st.e, null, { code: { file: c.file, key: c.key, title: c.title } });
    }
  });
  H.nestExtra = () => `<button data-b="code" title="Fold a part of the app's own code under these words">App code…</button>`;
  H.nestClick = (k, st) => { if (k !== "code") return false; pickChunk(st); return true; };

  /* a code-fold in a page: the code (read-only), your note, and the hand-off */
  H.placeBody = (f, box) => {
    if (!f.code) return false;
    const body = document.createElement("div"); body.className = "cf-body"; body.innerHTML = `<small>Loading ${esc(f.code.file)}…</small>`;
    box.appendChild(body);
    const t = box.querySelector(".ftitle"); if (t) t.textContent = "⌘ " + f.code.file + " · " + f.code.title;
    const nt = box.querySelector(".fold-head .fnote"); if (nt) nt.remove();
    code.chunk(f.code.file, f.code.key).then(c => {
      if (!c) { body.innerHTML = `<div class="cyc">This part isn't in the current version of ${esc(f.code.file)} any more.</div>`; return; }
      body.innerHTML = `<pre class="cf-pre">${esc(c.text)}</pre><textarea class="cf-note" data-note="${esc(c.key)}" placeholder="Your note on this part">${esc(noteOf(c.key))}</textarea>
        <div class="cf-row"><button class="fbtn" data-cf-open="${esc(c.key)}">Show in The App</button><button class="fbtn" data-cf-claude="${esc(c.key)}">Change this with Claude Code</button></div>`;
    }).catch(e => { body.innerHTML = `<div class="cyc">Couldn't load ${esc(f.code.file)} (${esc(e.message)}).</div>`; });
    return true;
  };
  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cfPlace) pickPage(b.dataset.cfPlace);
    else if (b.dataset.cfClaude) toClaudeCode(b.dataset.cfClaude);
    else if (b.dataset.cfOpen) openApp(b.dataset.cfOpen);
    else if (b.dataset.a === "quit" && sec.contains(b)) { T.showView("write"); }
  });

  /* the list: a row for The App (after Memory and Drills) */
  const prevMore = H.listTopMore, prevOther = H.listTopOther;
  H.listTopMore = () => (prevMore ? prevMore() : "") + `<div class="item memrow"><button class="open" data-listtop="app"><b>The App</b><small>its own code, foldable</small></button></div>`;
  H.listTopOther = k => { if (k === "app") openApp(); else if (prevOther) prevOther(k); else M.hub(); };

  /* Claude can read the code and fold it into pages */
  if (T.agent) {
    const S = d => ({ type: "string", description: d });
    T.agent.tool("list_code", "List the app's own code files and their parts (titles and keys). Read-only.", { file: S("optional file name to list its parts") }, [], async inp => {
      if (!inp.file) return { data: { version: code.label(), files: code.files() } };
      return { data: (await code.chunks(inp.file)).map(c => ({ key: c.key, title: c.title, lines: c.from + "-" + c.to })) };
    });
    T.agent.tool("read_code", "Read one part of the app's code by key (from list_code), with the owner's note on it.", { key: S("part key, like memory.js#word-by-word-comparison") }, ["key"], async inp => {
      const c = await byKey(inp.key); if (!c) throw new Error("no such part");
      return { data: { file: c.file, title: c.title, lines: c.from + "-" + c.to, note: noteOf(c.key), text: c.text.slice(0, 12000) } };
    });
    T.agent.tool("place_code", "Fold a part of the app's code into a page (adds a line naming it at the end of the page, with the code folded under it).", { key: S("part key"), page_id: S("page or fold id") }, ["key", "page_id"], async (inp, ctx) => {
      T.agent.snap(ctx, inp.page_id);
      const f = await placeChunk(inp.key, inp.page_id); if (!f) throw new Error("couldn't place it");
      ctx.nodes[f.id] = null;
      return { summary: `Folded “${f.code.title}” (${f.code.file}) into “${T.titleOf(T.node(inp.page_id)).slice(0, 40)}”` };
    });
    T.agent.tool("note_code", "Write the owner's note on a part of the app's code (only when asked).", { key: S("part key"), note: S("the note") }, ["key", "note"], async (inp, ctx) => {
      const c = await byKey(inp.key); if (!c) throw new Error("no such part");
      T.agent.snapMem(ctx, "codenotes", c.key); saveNote(c, inp.note);
      return { summary: `Noted on “${c.title}”` };
    });
  }

  code.open = openApp;
  T.refreshList();
})();
