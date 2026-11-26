/* Onboard code: the app can change itself, on this device, in seconds.
   The bootloader (index.html) starts the app from a version in the CODE VAULT (IndexedDB "bolw-code"):
   versions {id, n, origin: published|onboard, label, base, parent, files:{name:text}, note, by, at}.
   Here: Settings → App versions (history, use any version = rollback, "Return to published version",
   pin on this device, plain-words "What changed"), Claude's tools to propose a change, TRY it in a sealed
   preview (sandboxed iframe, no network, a COPY of the book, built-in self-test), then Keep (it becomes
   this device's version; reload) or Undo. Kept versions sync (memory.codeversions: the changed files only,
   plus "~active" = the newest choice); publish to GitHub (a pull request, or main if you confirm).
   Safety: Claude's changes can't touch sync.js or code.js, can't mention keys or the vault, and the
   bootloader is never in the vault; a version that fails to start falls back to the last good one. */
(() => {
  const T = window.TOL; if (!T || !T.memoryApi) return;
  const $ = id => document.getElementById(id), esc = T.esc, M = T.memoryApi;
  const B = window.__bolwBoot || null, PREVIEWING = !!window.__bolwPreview;
  const LOCKED = ["sync.js", "code.js"];
  const FORBID = /tol-ai\b|tol-gh-token|tol-sync|tol-vault|bolw-code|__bolwVault|deleteDatabase|localStorage\.clear|removeItem\s*\(|x-api-key|Authorization/;
  const KEEP_SYNCED = 5;
  const uidv = () => "v" + T.uid();
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 86400 ? Math.floor(s / 3600) + " h ago" : new Date(t).toLocaleDateString(); };

  /* code-folds read the version that is running */
  T.code = T.code || {};
  if (B && B.files) {
    T.code.source = async n => { if (n in B.files) return B.files[n]; throw new Error(n + " isn't in this version"); };
    T.code.files = () => Object.keys(B.files).sort((a, b) => (a === "app.html" ? -1 : b === "app.html" ? 1 : 0));
    T.code.label = () => B.label || B.id;
  }
  if (!B || PREVIEWING || !window.__bolwVault) { T.onboard = { running: B }; return; }   // previews and very old starts: nothing to manage
  const V = () => window.__bolwVault();
  /* before restarting, send the choice to the other devices (if sync is on), then reload */
  const reload = async () => {
    if (window.__tolSync) try { await Promise.race([window.__tolSync.syncNow("resume"), new Promise(r => setTimeout(r, 5000))]); } catch (e) {}
    setTimeout(() => location.reload(), 150);
  };

  /* ---------------- versions ---------------- */
  async function list() { return (await (await V()).all()).sort((a, b) => b.at - a.at); }
  async function meta(k) { return (await V()).meta(k); }
  async function setMeta(k, v) { return (await V()).set(k, v); }
  function choose(id, by) { M.putRecord("codeversions", "~active", { id: "~active", choice: id || "published", by: by || T.deviceLabel || "", at: Date.now() }); }
  async function use(id) {                            // roll back or forward to any version on this device
    await setMeta("active", id || null); await setMeta("choiceAt", Date.now());
    if (await meta("pinned")) await setMeta("pinned", id || null);
    choose(id); reload();
  }
  async function returnToPublished() { await setMeta("pinned", null); return use(null); }
  async function pin(on) { await setMeta("pinned", on ? B.id : null); }

  /* the synced copy of a kept version: only the files that differ from its published base */
  async function shareVersion(v) {
    const base = await (await V()).get("pub-" + v.base), changed = {};
    for (const [n, t] of Object.entries(v.files)) if (!base || base.files[n] !== t) changed[n] = t;
    const removed = base ? Object.keys(base.files).filter(n => !(n in v.files)) : [];
    M.putRecord("codeversions", v.id, { id: v.id, n: v.n, label: v.label, base: v.base, parent: v.parent, note: v.note, by: v.by, at: v.at, changed, removed, full: !base });
    const recs = Object.values(M.getPart("codeversions")).filter(r => r.id !== "~active" && !r.deleted).sort((a, b) => b.at - a.at);
    for (const r of recs.slice(KEEP_SYNCED)) M.putRecord("codeversions", r.id, { id: r.id, deleted: true });
  }
  /* versions kept on another device arrive here; the newest choice wins unless this device is pinned */
  let importing = false, offered = null;
  async function importSynced() {
    if (importing) return; importing = true;
    try {
      const vv = await V(), recs = M.getPart("codeversions");
      for (const r of Object.values(recs)) {
        if (!r || r.deleted || r.id === "~active" || await vv.get(r.id)) continue;
        let base = await vv.get("pub-" + r.base);
        if (!base && !r.full) { try { const p = await window.__bolwPublished(); if (p.base === r.base) { await vv.put(p); base = p; } } catch (e) {} }
        if (!base && !r.full) continue;                // its published base isn't here yet
        const files = Object.assign({}, r.full ? {} : base.files, r.changed); for (const n of r.removed || []) delete files[n];
        await vv.put({ id: r.id, n: r.n, origin: "onboard", label: r.label, base: r.base, parent: r.parent, note: r.note, by: r.by, at: r.at, files });
      }
      const c = recs["~active"];
      if (c && !(await meta("pinned")) && (c.at || 0) > ((await meta("choiceAt")) || 0)) {
        const id = c.choice === "published" ? null : c.choice;
        if (!id || await vv.get(id)) {
          await vv.set("active", id); await vv.set("choiceAt", c.at);
          const want = id || "published";
          if (want !== (B.origin === "published" ? "published" : B.id) && offered !== want) {
            offered = want;
            const v = id && await vv.get(id);
            T.toast(`${v ? v.label + " (“" + (v.note || "").slice(0, 40) + "”)" : "The published version"} was chosen on ${c.by || "another device"}. Reload to use it.`, "Reload", () => location.reload());
          }
        }
      }
    } catch (e) { console.warn("code versions", e); }
    importing = false;
  }
  document.addEventListener("tol:memory", () => setTimeout(importSynced, 50));          // arrived from another device
  addEventListener("bolw:undo-bad", e => { setMeta("choiceAt", Date.now()); choose(e.detail.good); });

  /* ---------------- plain-words differences ---------------- */
  function lineDiff(a, b) {
    const x = a.split("\n"), y = b.split("\n");
    let s = 0; while (s < x.length && s < y.length && x[s] === y[s]) s++;
    let ex = x.length, ey = y.length; while (ex > s && ey > s && x[ex - 1] === y[ey - 1]) { ex--; ey--; }
    const X = x.slice(s, ex), Y = y.slice(s, ey), out = [];
    if (X.length * Y.length > 4e6) { X.forEach(l => out.push(["-", l])); Y.forEach(l => out.push(["+", l])); return { at: s, out }; }
    const L = Array.from({ length: X.length + 1 }, () => new Uint16Array(Y.length + 1));
    for (let i = X.length - 1; i >= 0; i--) for (let j = Y.length - 1; j >= 0; j--) L[i][j] = X[i] === Y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < X.length || j < Y.length) {
      if (i < X.length && j < Y.length && X[i] === Y[j]) { out.push([" ", X[i]]); i++; j++; }
      else if (j < Y.length && (i >= X.length || L[i][j + 1] >= L[i + 1][j])) out.push(["+", Y[j++]]);
      else out.push(["-", X[i++]]);
    }
    return { at: s, out };
  }
  function diff(fromFiles, toFiles) {
    const names = [...new Set(Object.keys(fromFiles || {}).concat(Object.keys(toFiles || {})))].sort(), files = [];
    for (const n of names) {
      const a = (fromFiles || {})[n], b = (toFiles || {})[n];
      if (a === b) continue;
      if (a == null) { files.push({ name: n, kind: "added", text: `${n}: a new file (${b.split("\n").length} lines).`, lines: [] }); continue; }
      if (b == null) { files.push({ name: n, kind: "removed", text: `${n}: removed.`, lines: [] }); continue; }
      const d = lineDiff(a, b), add = d.out.filter(l => l[0] === "+").length, del = d.out.filter(l => l[0] === "-").length;
      let parts = [];
      if (T.code.split) { const old = new Map(T.code.split(n, a).map(c => [c.key, c.text])); parts = T.code.split(n, b).filter(c => old.get(c.key) !== c.text).map(c => c.title); }
      files.push({ name: n, kind: "changed", parts, add, del, lines: d.out.filter(l => l[0] !== " ").slice(0, 400),
        text: `${n}: ${parts.length ? "changed " + parts.slice(0, 4).map(p => "“" + p + "”").join(", ") + (parts.length > 4 ? ` and ${parts.length - 4} more` : "") : "changed"} — ${add} line${add === 1 ? "" : "s"} added, ${del} removed.` });
    }
    return { files, summary: files.length ? files.map(f => f.text).join(" ") : "No differences." };
  }

  /* ---------------- trying a change: a sealed preview on a copy of the book ---------------- */
  const SELFTEST = `async () => {
    const R = [], ok = (name, pass, detail) => R.push({ name, ok: !!pass, detail: detail || "" });
    const T = window.TOL, wait = ms => new Promise(r => setTimeout(r, ms));
    ok("The app starts", T && document.getElementById("writer"), T ? "" : "the app didn't start");
    if (!T) return R;
    const before = window.__bolwCopy.pages, live = Object.values(before).filter(p => p && !p.deleted);
    const now = T.data().pages, lost = live.filter(p => !now[p.id] || now[p.id].deleted || (now[p.id].text || "") !== (p.text || ""));
    ok("All your writing is still there", !lost.length, lost.length ? lost.length + " page(s) changed or missing" : live.length + " pages checked");
    try {
      const top = live.filter(p => !p.parentId).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (top) { T.openPage(top.id, false); await wait(80); }
      const ta = document.querySelector("#writer textarea");
      ok("Pages open", ta && (!top || ta.value === (top.text || "").slice(0, ta.value.length)), top ? "opened “" + T.titleOf(top).slice(0, 30) + "”" : "an empty book");
    } catch (e) { ok("Pages open", false, e.message); }
    try {
      const n0 = T.data().intervals.length;
      for (let i = 0; i < 6; i++) { T.typed(); await wait(200); }
      T.endTyping();
      const iv = T.data().intervals, last = iv[iv.length - 1];
      ok("The writing clock counts", iv.length > n0 && last.end - last.start >= 1000, "");
    } catch (e) { ok("The writing clock counts", false, e.message); }
    try {
      const p = T.createNode({ parentId: null, text: "Self-test page with folded words" });
      const s = p.text.indexOf("folded"), f = T.createNode({ parentId: p.id, text: "inside", anchor: T.makeAnchor(p.text, s, s + 6) });
      T.openFold(f.id); T.openPage(p.id, false); await wait(80);
      ok("Folds show", !!document.querySelector("#writer .fold[data-fold='" + f.id + "'] textarea"), "");
    } catch (e) { ok("Folds show", false, e.message); }
    ok("Sync code loads", window.__tolSync && typeof window.__tolSync.syncNow === "function", "");
    ok("No errors while starting", !window.__bolwErrs.length, window.__bolwErrs.slice(0, 2).join("; "));
    return R;
  }`;
  function copyOfBook() {                       // what the preview gets: your book, never your keys
    const out = {};
    for (const k of ["tol-pages", "tol-intervals", "tol-ui", "tol-theme", "tol-looks", "tol-memory"]) { try { const v = localStorage.getItem(k); if (v != null) out[k] = v; } catch (e) {} }
    return out;
  }
  const js = o => JSON.stringify(o).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
  function previewDoc(files) {
    const copy = copyOfBook();
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'">
</head><body><script>
(() => {
  const DATA = ${js(copy)}, FILES = ${js(files)};
  const mem = new Map(Object.entries(DATA));
  const ls = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); }, clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  for (const n of ["localStorage", "sessionStorage"]) try { Object.defineProperty(window, n, { value: ls, configurable: true }); } catch (e) {}
  for (const n of ["indexedDB", "caches"]) try { Object.defineProperty(window, n, { value: undefined, configurable: true }); } catch (e) {}
  window.__bolwPreview = "onboard"; window.__bolwErrs = [];
  try { window.__bolwCopy = { pages: JSON.parse(DATA["tol-pages"] || "{}") }; } catch (e) { window.__bolwCopy = { pages: {} }; }
  window.__bolwBoot = { id: "preview", origin: "preview", label: "the change you're trying", files: FILES };
  addEventListener("error", e => window.__bolwErrs.push(e.message));
  const run = ${window.__bolwRun.toString()};
  window.__bolwErrs.push(...run(FILES));
  setTimeout(async () => {
    let results; try { results = await (${SELFTEST})(); } catch (e) { results = [{ name: "Self-test", ok: false, detail: e.message }]; }
    parent.postMessage({ bolwSelfTest: true, results }, "*");
  }, 250);
})();
<\/script></body></html>`;
  }
  function checkEdits(edits) {
    for (const e of edits) {
      if (!e || !e.file) throw new Error("each change needs a file");
      if (LOCKED.includes(e.file)) throw new Error(`${e.file} can only be changed through Claude Code (it holds sync or this safety layer)`);
      if (!/^[\w.-]+\.(js|html|css)$/.test(e.file) || e.file.includes("..")) throw new Error("not an app file: " + e.file);
      const added = e.content != null ? e.content : e.replace || "";
      if (FORBID.test(added)) throw new Error("changes may not touch keys, sync or the code vault (" + added.match(FORBID)[0] + ")");
    }
  }
  function applyEdits(files, edits) {
    const out = Object.assign({}, files);
    for (const e of edits) {
      if (e.content != null) { out[e.file] = e.content; continue; }
      const t = out[e.file]; if (t == null) throw new Error(e.file + " isn't in this version");
      const at = t.indexOf(e.find); if (!e.find || at < 0) throw new Error(`couldn't find the text to change in ${e.file}`);
      if (t.indexOf(e.find, at + 1) >= 0) throw new Error(`the text to change appears more than once in ${e.file}; include more of it`);
      out[e.file] = t.slice(0, at) + e.replace + t.slice(at + e.find.length);
    }
    return out;
  }

  const css = document.createElement("style");
  css.textContent = `#codeTry{position:fixed;inset:0;z-index:10000;background:var(--paper,#fff);display:flex;flex-direction:column}
#codeTry .ct-top{padding:10px 14px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px;align-items:center;font:15px/1.4 "Hanken Grotesk",system-ui,sans-serif}
#codeTry .ct-top b{flex:1 1 200px}
#codeTry .ct-res{width:100%;font-size:14px;display:flex;flex-wrap:wrap;gap:4px 12px}
#codeTry .ct-res .bad{color:#a33}#codeTry .ct-res .good{color:var(--green)}
@media (max-width:600px){#codeTry .ct-res{max-height:84px;overflow:auto;font-size:13px}}
#codeTry iframe{flex:1;border:0;width:100%;background:#fff}
#codeArea .ver{display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px;margin:6px 0}
#codeArea .ver div{flex:1 1 220px}#codeArea .ver.on{border-color:var(--green)}
.cd-lines{font:12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;max-height:260px;overflow:auto;background:var(--side);border-radius:8px;padding:6px;margin:4px 0}
.cd-lines .a{color:#1f6b3a}.cd-lines .d{color:#a33}`;
  document.head.appendChild(css);

  let trying = null;   // { draft, frame, resolve, results }
  async function tryChange({ note, edits, by, base }) {
    if (trying) throw new Error("another change is being tried; keep or undo it first");
    checkEdits(edits || []);
    let from = B.files, fromBase = B.base, parent = B.id;
    if (base === "published") { const p = await window.__bolwPublished(); await (await V()).put(p); from = p.files; fromBase = p.base; parent = p.id; }
    const files = applyEdits(from, edits || []);
    const d = diff(B.files, files);
    const box = document.createElement("div"); box.id = "codeTry"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Trying a change");
    box.innerHTML = `<div class="ct-top"><b>Trying: ${esc(note || "a change")}</b>
      <button class="btn primary" id="ctKeep" disabled>Keep</button><button class="btn" id="ctUndo">Undo</button><button class="btn" id="ctDiff">What changed</button>
      <div class="ct-res" id="ctRes">Running the self-test on a copy of your book…</div><div id="ctDiffBox" hidden></div></div>`;
    const fr = document.createElement("iframe"); fr.setAttribute("sandbox", "allow-scripts"); fr.title = "Preview of the change (a copy of your book)";
    fr.srcdoc = previewDoc(files);
    box.appendChild(fr); document.body.appendChild(box);
    T.endTyping();
    let resolve; const done = new Promise(r => { resolve = r; });
    trying = { draft: { note: note || "a change", by: by || T.deviceLabel || "", files, base: fromBase, parent }, frame: fr, box, resolve, diff: d };
    const timer = setTimeout(() => finish([{ name: "The app starts", ok: false, detail: "it didn't finish starting in 15 seconds" }]), 15000);
    function finish(results) {
      clearTimeout(timer); if (!trying || trying.results) return;
      trying.results = results;
      const pass = results.every(r => r.ok);
      $("ctRes").innerHTML = `<span class="${pass ? "good" : "bad"}"><b>${pass ? "Self-test passed." : "Self-test found a problem."}</b></span>` +
        results.map(r => `<span class="${r.ok ? "good" : "bad"}">${r.ok ? "✓" : "✗"} ${esc(r.name)}${r.detail ? " (" + esc(r.detail) + ")" : ""}</span>`).join("") +
        `<span>Try it below. It's a copy: nothing you do there reaches your book.</span>`;
      $("ctKeep").disabled = !pass; $("ctKeep").title = pass ? "" : "It can be kept once the self-test passes";
      resolve({ passed: pass, results, changed: d.summary });
    }
    trying.finish = finish;
    $("ctKeep").onclick = keep; $("ctUndo").onclick = () => undo();
    $("ctDiff").onclick = () => { const b = $("ctDiffBox"); b.hidden = !b.hidden; b.innerHTML = diffHTML(d); };
    return done;
  }
  addEventListener("message", e => {
    if (!trying || e.source !== trying.frame.contentWindow || !e.data || !e.data.bolwSelfTest) return;
    trying.finish(Array.isArray(e.data.results) ? e.data.results.map(r => ({ name: String(r.name).slice(0, 80), ok: !!r.ok, detail: String(r.detail || "").slice(0, 160) })) : []);
  });
  function undo(silent) { if (!trying) return; trying.box.remove(); if (!trying.results) trying.resolve({ passed: false, results: [], undone: true }); trying = null; if (!silent) T.toast("Undone. Nothing changed."); }
  async function keep() {
    if (!trying || !trying.results || !trying.results.every(r => r.ok)) return;
    const vv = await V(), all = await vv.all(), n = Math.max(0, ...all.filter(v => v.origin === "onboard").map(v => v.n || 0)) + 1;
    const t = trying.draft, v = { id: uidv(), n, origin: "onboard", label: "onboard version " + n, base: t.base, parent: t.parent, note: t.note, by: t.by, at: Date.now(), files: t.files };
    await vv.put(v); await vv.set("active", v.id); await vv.set("choiceAt", v.at);
    if (await vv.meta("pinned")) await vv.set("pinned", v.id);
    choose(v.id); await shareVersion(v);
    trying.box.querySelector("#ctRes").textContent = "Kept. Starting it…";
    trying = null; reload();
  }
  function diffHTML(d) {
    return `<p><small>${esc(d.summary)}</small></p>` + d.files.filter(f => f.lines.length).map(f => `<details><summary>${esc(f.name)}: the lines</summary><div class="cd-lines">${f.lines.map(([k, l]) => `<div class="${k === "+" ? "a" : "d"}">${k} ${esc(l)}</div>`).join("")}</div></details>`).join("");
  }

  /* ---------------- publishing to GitHub (optional) ---------------- */
  async function gh(path, opts) {
    let tok = ""; try { tok = JSON.parse(localStorage.getItem("tol-gh-token") || '""'); } catch (e) {}
    if (!tok) throw new Error("Connect GitHub first (Settings → Claude Code key).");
    const r = await fetch("https://api.github.com/repos/obrianwatson/tree-of-life" + path, Object.assign({ cache: "no-store" }, opts, { headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + tok, "Content-Type": "application/json" } }));
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error((j && j.message) || "GitHub answered " + r.status); e.status = r.status; throw e; }
    return j;
  }
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  async function publish(id, toMain) {
    const vv = await V(), v = await vv.get(id); if (!v) throw new Error("no such version");
    const base = await vv.get("pub-" + v.base), names = Object.keys(v.files).filter(n => !base || base.files[n] !== v.files[n]);
    if (!names.length) throw new Error("this version has no changes from the published one");
    let branch = "main";
    if (!toMain) {
      const ref = await gh("/git/ref/heads/main");
      branch = "onboard-v" + v.n + "-" + Date.now().toString(36);
      await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: "refs/heads/" + branch, sha: ref.object.sha }) });
    }
    for (const n of names) {
      let sha; try { sha = (await gh(`/contents/docs/${n}?ref=${branch}`)).sha; } catch (e) { if (e.status !== 404) throw e; }
      await gh(`/contents/docs/${n}`, { method: "PUT", body: JSON.stringify(Object.assign({ message: `Onboard version ${v.n}: ${v.note}`, content: b64(v.files[n]), branch }, sha ? { sha } : {})) });
    }
    if (toMain) return { where: "main", files: names };
    const pr = await gh("/pulls", { method: "POST", body: JSON.stringify({ title: `Onboard version ${v.n}: ${v.note}`.slice(0, 120), head: branch, base: "main",
      body: `Made onboard in the Book of Living Waters (${v.by || "this device"}, ${new Date(v.at).toLocaleString()}), based on published version ${v.base}.\n\n${diff(base ? base.files : {}, v.files).summary}` }) });
    return { where: "pull request", url: pr.html_url, number: pr.number, files: names };
  }
  const pdlg = document.createElement("dialog"); pdlg.id = "codePub"; pdlg.setAttribute("aria-labelledby", "cpT"); document.body.appendChild(pdlg);
  function askPublish(id, label) {
    pdlg.innerHTML = `<h2 id="cpT">Publish ${esc(label)} to GitHub</h2>
      <p>This sends the changed files to the app's project on GitHub with your GitHub key. Your writing is never sent.</p>
      <div class="row"><button class="btn primary" data-p="pr">Open a pull request (recommended)</button><button class="btn" data-p="main">Commit straight to main…</button><button class="btn" data-p="x">Cancel</button></div><p id="cpMsg"></p>`;
    pdlg.showModal();
    pdlg.onclick = async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.p === "x") return pdlg.close();
      if (b.dataset.p === "main" && !b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Yes, commit to main (it goes live for everyone)"; return; }
      $("cpMsg").textContent = "Publishing…";
      try { const r = await publish(id, b.dataset.p === "main"); $("cpMsg").innerHTML = r.url ? `Done: <a href="${esc(r.url)}" target="_blank" rel="noopener">pull request #${r.number}</a> (${r.files.length} file${r.files.length === 1 ? "" : "s"}).` : `Done: committed ${r.files.length} file${r.files.length === 1 ? "" : "s"} to main.`; }
      catch (err) { $("cpMsg").textContent = "Couldn't publish: " + err.message; }
    };
  }

  /* ---------------- is the published version newer than what this is built on? ---------------- */
  let newer = null;
  async function checkPublished() {
    if (B.origin !== "onboard" || navigator.onLine === false) return;
    try {
      const r = await fetch("app.html", { cache: "no-cache" }); if (!r.ok) return;
      const ver = ((await r.text()).match(/const APP_VERSION = "([^"]+)"/) || [])[1];
      if (ver && ver !== B.base) { newer = ver; T.toast(`A newer published version (${ver}) is out. This onboard version is built on ${B.base}.`, "See", () => { $("settingsBtn").click(); setTimeout(() => { const a = $("codeArea"); if (a) a.scrollIntoView(); }, 200); }); }
    } catch (e) {}
  }

  /* ---------------- Settings → App versions ---------------- */
  async function paint() {
    let area = $("codeArea");
    if (!area) { const after = $("addonArea") || $("aiArea"); if (!after) return; area = document.createElement("div"); area.className = "field"; area.id = "codeArea"; after.parentNode.insertBefore(area, after.nextSibling); }
    const L = await list(), pinned = await meta("pinned");
    const running = B.origin === "published" ? "the published version " + B.base : `${B.label} (“${B.note}”)`;
    area.innerHTML = `<label><span>App versions</span></label>
      <p><small>Running: <b>${esc(running)}</b>${B.safe ? " — in safe mode" : ""}. Claude can change the app here in seconds: you try each change on a copy first, then keep it or undo it.</small></p>
      ${newer ? `<p class="fnote">A newer published version (${esc(newer)}) is out; this one is built on ${esc(B.base)}. <button class="btn" data-cv="usepub">Use the published version</button> <button class="btn" data-cv="merge">Bring my changes over with Claude</button></p>` : ""}
      <div class="row"><label><input type="checkbox" data-cv="pin"${pinned ? " checked" : ""}> Keep this device on this version (don't follow other devices)</label></div>
      <div class="row">${B.origin !== "published" ? `<button class="btn" data-cv="usepub">Return to published version</button>` : ""}<button class="btn" data-cv="safe">Restart in safe mode</button></div>
      ${L.map(v => `<div class="ver${v.id === B.id ? " on" : ""}"><div><b>${esc(v.label || v.id)}</b>${v.id === B.id ? " · running" : ""}<br><small>${esc(v.note || "")} · ${esc(v.by || "")} · ${ago(v.at)}</small></div>
        ${v.id !== B.id ? `<button class="fbtn" data-cv-use="${v.id}">Use this</button>` : ""}<button class="fbtn" data-cv-diff="${v.id}">What changed</button>
        ${v.origin === "onboard" ? `<button class="fbtn" data-cv-pub="${v.id}">Publish to GitHub…</button>` : ""}</div><div id="cvd-${v.id}" hidden></div>`).join("")}`;
  }
  document.addEventListener("tol:settings", () => { paint(); });
  document.addEventListener("click", async e => {
    const b = e.target.closest("button,input"); if (!b || !b.closest("#codeArea")) return;
    if (b.dataset.cvUse) use(b.dataset.cvUse);
    else if (b.dataset.cv === "usepub") returnToPublished();
    else if (b.dataset.cv === "safe") { const u = new URL(location.href); u.searchParams.set("safe", "1"); location.href = u.href; }
    else if (b.dataset.cv === "pin") pin(b.checked);
    else if (b.dataset.cv === "merge") { $("settings").close(); if (T.agent) { T.agent.open(null); const a = $("agIn"); if (a) a.value = `Please bring my onboard changes (${B.label}: “${B.note}”) over to the new published version ${newer}: look at onboard_changes, then propose the same changes with base "published".`; } }
    else if (b.dataset.cvPub) { const v = await (await V()).get(b.dataset.cvPub); askPublish(v.id, v.label); }
    else if (b.dataset.cvDiff) {
      const box = $("cvd-" + b.dataset.cvDiff); if (!box.hidden) { box.hidden = true; return; }
      const vv = await V(), v = await vv.get(b.dataset.cvDiff), from = v.parent && await vv.get(v.parent) || await vv.get("pub-" + v.base);
      box.innerHTML = from && from.id !== v.id ? `<p><small>Compared with ${esc(from.label || from.id)}:</small></p>` + diffHTML(diff(from.files, v.files)) : "<p><small>This is a published version as it came from GitHub.</small></p>";
      box.hidden = false;
    }
  });

  /* ---------------- Claude's tools: onboard changes ---------------- */
  if (T.agent) {
    const S = d => ({ type: "string", description: d });
    T.agent.tool("propose_change", "Change the app's own code ONBOARD, in seconds: give exact edits to the running version's files (read them first with list_code/read_code). The change opens in a sealed preview on a COPY of the book and the built-in self-test runs there; you get the results. The owner then taps Keep or Undo (you can't keep it). Not allowed: sync.js, code.js, anything about keys, sync or the code vault. Keep edits small.",
      { note: S("what the change does, in plain words (shown to the owner)"), base: S("'current' (default) or 'published' (build on the newest published files, e.g. to bring changes over)"),
        edits: { type: "array", description: "edits applied in order", items: { type: "object", properties: { file: S("file name, e.g. app.html or memory.js"), find: S("exact text that appears once in the file"), replace: S("the new text"), content: S("instead of find/replace: the whole new file") }, required: ["file"] } } },
      ["note", "edits"], async inp => {
        const r = await tryChange({ note: inp.note, edits: inp.edits || [], by: "Claude", base: inp.base });
        return { data: r, summary: r.undone ? "The owner undid the change" : `Trying “${inp.note}” on a copy — self-test ${r.passed ? "passed" : "found a problem"}; Keep or Undo is yours` };
      }, "Deep · onboard");
    T.agent.tool("list_versions", "List the app versions on this device (onboard and published), which one is running.", {}, [], async () =>
      ({ data: { running: B.id, versions: (await list()).map(v => ({ id: v.id, label: v.label, note: v.note, by: v.by, base: v.base, at: new Date(v.at).toISOString() })) } }));
    T.agent.tool("onboard_changes", "Show what the running onboard version changed compared with its published base (plain words and changed lines).", {}, [], async () => {
      const base = await (await V()).get("pub-" + B.base); const d = diff(base ? base.files : {}, B.files);
      return { data: { summary: d.summary, files: d.files.map(f => ({ name: f.name, kind: f.kind, lines: f.lines.slice(0, 200).map(l => l.join(" ")) })) } };
    });
  }

  T.onboard = { running: B, list, use, returnToPublished, pin, tryChange, keep, undo: () => undo(true), diff, publish, importSynced, checkPublished, _trying: () => trying, paint };
  setTimeout(() => { importSynced(); checkPublished(); }, 400);
})();
