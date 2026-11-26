/* Add-ons: small new abilities Claude (or you) can add to the book in seconds, without
   rebuilding the app. Each add-on runs sealed in its own box (a sandboxed frame with no access to
   your storage, keys or the internet) and can only use this small set of calls:
     bolw.read()                      → the page or fold you're on {id, title, text, folds}
     bolw.readNode(id)                → any page or fold
     bolw.addText(nodeId, text, where) → add words ("end" | "start"); add-ons can never remove words
     bolw.addButton(label, key)       → a button in the add-on bar; bolw.on("button", key => …)
     bolw.showPanel(html)             → show a small panel (plain HTML, shown sealed, no scripts)
     bolw.toast(text)                 → a short message
     bolw.registerCue(name, fn)       → a new hint style for drills: fn(text) → hidden text
     bolw.on("page", node => …)       → when you move to another page
   They're kept in memory.addons (synced, encrypted), versioned, and each can be turned off in one tap
   (Settings → Add-ons). Open the app with ?safe at the end of the address to start with none. */
(() => {
  const T = window.TOL; if (!T || !T.memoryApi) return;
  const $ = id => document.getElementById(id), esc = T.esc, M = T.memoryApi;
  const SAFE = /[?&]safe\b/.test(location.search);
  const running = {};      // id → { frame, code, buttons: [], cues: {} }
  const problems = {};     // id → last error message
  const pending = {};      // request id → resolve (cue answers)

  const css = document.createElement("style");
  css.textContent = `#addonBar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#addonBar:empty{display:none}
#addonBar button{border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:999px;height:34px;padding:0 10px;font:500 13px "Hanken Grotesk",system-ui,sans-serif;cursor:pointer}
#addonPanel{position:fixed;left:50%;top:70px;transform:translateX(-50%);width:min(560px,calc(100vw - 24px));max-height:60vh;background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 50px rgb(0 0 0/.22);z-index:29;display:flex;flex-direction:column}
#addonPanel[hidden]{display:none}
#addonPanel .ap-top{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line)}
#addonPanel .ap-top b{flex:1}
#addonPanel iframe{border:0;width:100%;height:50vh;background:var(--paper)}
.addon-item{display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px;margin:6px 0}
.addon-item b{flex:1 1 160px}
.addon-item small{flex-basis:100%;color:var(--muted)}
.addon-item pre{flex-basis:100%;max-height:200px;overflow:auto;font:12px ui-monospace,Menlo,monospace;background:var(--side);padding:8px;border-radius:8px;white-space:pre-wrap}`;
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.id = "addonBar"; bar.setAttribute("aria-label", "Add-ons");
  const hdr = document.querySelector("main > header"); if (hdr) hdr.insertBefore(bar, $("syncPill"));
  const panel = document.createElement("div"); panel.id = "addonPanel"; panel.hidden = true;
  panel.innerHTML = `<div class="ap-top"><b id="apTitle"></b><button class="btn" id="apClose">Close</button></div>`;   // the sealed frame is made only when a panel is shown
  document.body.appendChild(panel);
  $("apClose").onclick = () => { panel.hidden = true; };

  const list = () => Object.values(M.getPart("addons")).filter(a => a && !a.deleted).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">`;
  const BOOT = `<script>
(() => {
  let n = 0; const wait = {}, ons = {}, cues = {};
  const call = (op, args) => new Promise((res, rej) => { const rid = ++n; wait[rid] = [res, rej]; parent.postMessage({ bolw: 1, op, args, rid }, "*"); });
  addEventListener("message", e => {
    const d = e.data || {}; if (!d.bolw) return;
    if (d.reply && wait[d.reply]) { const [res, rej] = wait[d.reply]; delete wait[d.reply]; d.error ? rej(new Error(d.error)) : res(d.value); }
    else if (d.event) { (ons[d.event] || []).forEach(f => { try { f(d.value); } catch (err) { parent.postMessage({ bolw: 1, op: "error", args: [String(err && err.message || err)] }, "*"); } }); }
    else if (d.cue) { let out = null; try { out = cues[d.cue] ? String(cues[d.cue](d.text)) : null; } catch (err) {} parent.postMessage({ bolw: 1, op: "cueResult", args: [d.rid, out] }, "*"); }
  });
  window.bolw = {
    read: () => call("read", []), readNode: id => call("readNode", [id]),
    addText: (id, text, where) => call("addText", [id, String(text), where || "end"]),
    addButton: (label, key) => call("addButton", [String(label), String(key || label)]),
    showPanel: html => call("showPanel", [String(html)]), toast: t => call("toast", [String(t)]),
    registerCue: (name, fn) => { cues[name] = fn; return call("registerCue", [String(name)]); },
    on: (ev, fn) => { (ons[ev] = ons[ev] || []).push(fn); }
  };
  addEventListener("error", e => parent.postMessage({ bolw: 1, op: "error", args: [String(e.message)] }, "*"));
  addEventListener("unhandledrejection", e => parent.postMessage({ bolw: 1, op: "error", args: [String(e.reason && e.reason.message || e.reason)] }, "*"));
})();
<\/script>`;

  function start(a) {
    stop(a.id);
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts");     // no same-origin: it can't see your storage, keys or this page
    f.hidden = true; f.title = "Add-on: " + a.name; f.dataset.addon = a.id;
    const code = String(a.code || "").replace(/<\/script/gi, "<\\/script");
    f.srcdoc = `<!DOCTYPE html><html><head>${CSP}</head><body>${BOOT}<script>try{${code}\n}catch(err){parent.postMessage({bolw:1,op:"error",args:[String(err&&err.message||err)]},"*")}<\/script></body></html>`;
    running[a.id] = { frame: f, code: a.code, v: a.version, buttons: [], cues: {} };
    delete problems[a.id];
    document.body.appendChild(f);
  }
  function stop(id) {
    const r = running[id]; if (!r) return;
    r.frame.remove(); delete running[id]; paintBar();
  }
  function sync() {          // start what's on (and changed), stop what's off
    if (SAFE) { Object.keys(running).forEach(stop); return; }
    const want = new Map(list().filter(a => a.on).map(a => [a.id, a]));
    for (const id of Object.keys(running)) { const a = want.get(id); if (!a || a.version !== running[id].v || a.code !== running[id].code) stop(id); }
    for (const a of want.values()) if (!running[a.id]) start(a);
    paintBar();
  }
  function paintBar() {
    bar.innerHTML = Object.entries(running).flatMap(([id, r]) => r.buttons.map(b => `<button data-addon-btn="${esc(id)}" data-key="${esc(b.key)}">${esc(b.label)}</button>`)).join("");
  }
  bar.addEventListener("click", e => {
    const b = e.target.closest("[data-addon-btn]"); if (!b) return;
    post(b.dataset.addonBtn, { event: "button", value: b.dataset.key });
  });
  function post(id, msg) { const r = running[id]; if (r && r.frame.contentWindow) r.frame.contentWindow.postMessage(Object.assign({ bolw: 1 }, msg), "*"); }
  const nodeView = n => ({ id: n.id, title: T.titleOf(n), text: n.text || "", kind: n.anchor ? "fold" : "page", foldedUnder: n.anchor ? n.anchor.text : null,
                          folds: T.placedIn(n.id).map(m => ({ id: m.f.id, words: (n.text || "").slice(m.s, m.e), start: m.s, end: m.e })) });

  window.addEventListener("message", e => {
    const d = e.data; if (!d || !d.bolw || !d.op) return;
    const id = Object.keys(running).find(k => running[k].frame.contentWindow === e.source); if (!id) return;   // only our own sealed frames
    const r = running[id], reply = (value, error) => post(id, { reply: d.rid, value, error });
    const a = d.args || [];
    try {
      if (d.op === "read") { const n = T.node(T.current()); reply(T.live(n) ? nodeView(n) : null); }
      else if (d.op === "readNode") { const n = T.node(a[0]); reply(T.live(n) ? nodeView(n) : null); }
      else if (d.op === "addText") {
        const n = T.node(a[0]); if (!T.live(n)) throw new Error("no such page");
        const add = String(a[1] || "").slice(0, 20000), t = n.text || "";
        T.setText(n.id, a[2] === "start" ? add + t : t + add); T.rerender(); reply(true);
      }
      else if (d.op === "addButton") { if (r.buttons.length < 6 && !r.buttons.some(b => b.key === a[1])) r.buttons.push({ label: a[0].slice(0, 30), key: a[1].slice(0, 40) }); paintBar(); reply(true); }
      else if (d.op === "showPanel") {
        $("apTitle").textContent = (M.getPart("addons")[id] || {}).name || "Add-on";
        let pf = $("apFrame"); if (!pf) { pf = document.createElement("iframe"); pf.id = "apFrame"; pf.setAttribute("sandbox", ""); pf.title = "Add-on panel"; panel.appendChild(pf); }
        pf.srcdoc = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>body{font:16px/1.5 system-ui,sans-serif;margin:12px}</style></head><body>${String(a[0]).slice(0, 200000)}</body></html>`;
        panel.hidden = false; reply(true);
      }
      else if (d.op === "toast") { T.toast(String(a[0]).slice(0, 200)); reply(true); }
      else if (d.op === "registerCue") { r.cues[a[0]] = true; reply(true); }
      else if (d.op === "cueResult") { const w = pending[a[0]]; if (w) { delete pending[a[0]]; w(a[1]); } }
      else if (d.op === "error") { problems[id] = String(a[0] || "a problem").slice(0, 300); paintSettings(); }
      else reply(null, "unknown call " + d.op);
    } catch (err) { reply(null, err.message || String(err)); }
  });
  document.addEventListener("tol:changed", () => {});   // (add-ons are told about page moves below)
  let lastPage = null;
  setInterval(() => { const c = T.current(); if (c !== lastPage) { lastPage = c; const n = T.node(c); if (T.live(n)) Object.keys(running).forEach(id => post(id, { event: "page", value: nodeView(n) })); } }, 700);

  /* hint styles from add-ons, for drills (asks the add-on; falls back after a moment) */
  function cueList() { const out = []; for (const [id, r] of Object.entries(running)) for (const name of Object.keys(r.cues)) out.push({ id, name, label: name + " (add-on)" }); return out; }
  function cue(id, name, text) {
    return new Promise(res => {
      const rid = "c" + Math.random().toString(36).slice(2); pending[rid] = res;
      post(id, { cue: name, text, rid }); setTimeout(() => { if (pending[rid]) { delete pending[rid]; res(null); } }, 1500);
    });
  }

  /* ---------------- saving add-ons (versioned) ---------------- */
  function saveAddon(fields) {
    const now = Date.now(), cur = fields.id ? M.getPart("addons")[fields.id] : null;
    const id = (cur && cur.id) || fields.id || "ad" + T.uid();
    const rec = Object.assign({ id, name: "Add-on", desc: "", code: "", version: 0, on: true, createdAt: now, versions: [] }, cur || {}, fields, { id });
    if (fields.code !== undefined && (!cur || cur.code !== fields.code)) {
      rec.version = (cur ? cur.version || 0 : 0) + 1;
      rec.versions = ((cur && cur.versions) || []).concat(cur && cur.code ? [{ v: cur.version, code: cur.code, at: cur.updatedAt || now }] : []).slice(-10);
    }
    M.putRecord("addons", id, rec); setTimeout(sync, 0); paintSettings(); return rec;
  }
  document.addEventListener("tol:memory", () => setTimeout(sync, 0));   // add-ons arriving from your other device

  /* ---------------- Settings → Add-ons ---------------- */
  let showing = null;
  function paintSettings() {
    let area = $("addonArea");
    if (!area) { const ai = $("aiArea"); if (!ai) return; area = document.createElement("div"); area.className = "field"; area.id = "addonArea"; ai.parentNode.insertBefore(area, ai.nextSibling); }
    const L = list();
    area.innerHTML = `<label><span>Add-ons</span><span>${L.filter(a => a.on).length} on</span></label>
      <small>Small abilities Claude adds in seconds. Each runs sealed: it can't see your keys or other storage, can't reach the internet, and can only add words, never remove them.${SAFE ? " <b>Safe mode: none are running.</b>" : ""}</small>
      ${L.map(a => `<div class="addon-item"><b>${esc(a.name)}</b><span>v${a.version}</span>
        <button class="btn" data-ad-toggle="${a.id}">${a.on ? "Turn off" : "Turn on"}</button><button class="btn" data-ad-code="${a.id}">${showing === a.id ? "Hide code" : "View code"}</button><button class="btn" data-ad-del="${a.id}">Remove</button>
        <small>${esc(a.desc || "")}${problems[a.id] ? ` <b>It had a problem:</b> ${esc(problems[a.id])}` : ""}</small>
        ${showing === a.id ? `<pre>${esc(a.code || "")}</pre>` : ""}</div>`).join("") || "<small>None yet. Ask Claude for one, e.g. “add a word count button”.</small>"}
      <div class="row">${L.some(a => a.on) ? `<button class="btn" id="adAllOff">Turn all off</button>` : ""}${SAFE ? `<button class="btn" id="adLeaveSafe">Leave safe mode</button>` : `<button class="btn" id="adSafe">Restart in safe mode</button>`}</div>`;
  }
  document.addEventListener("tol:settings", paintSettings);
  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.adToggle) { const a = M.getPart("addons")[b.dataset.adToggle]; saveAddon({ id: a.id, on: !a.on }); }
    else if (b.dataset.adCode) { showing = showing === b.dataset.adCode ? null : b.dataset.adCode; paintSettings(); }
    else if (b.dataset.adDel) { const a = M.getPart("addons")[b.dataset.adDel]; saveAddon({ id: a.id, on: false, deleted: true }); }
    else if (b.id === "adAllOff") list().filter(a => a.on).forEach(a => saveAddon({ id: a.id, on: false }));
    else if (b.id === "adSafe") location.search = "?safe";
    else if (b.id === "adLeaveSafe") location.search = "";
  });

  /* ---------------- Claude can make and fix add-ons ---------------- */
  if (T.agent) {
    const S = d => ({ type: "string", description: d });
    const API = "Add-on code is plain JavaScript run in a sealed frame with only `bolw`: read(), readNode(id), addText(nodeId, text, 'end'|'start') (can never remove words), addButton(label, key) + on('button', key => …), showPanel(html) (static HTML, no scripts), toast(text), registerCue(name, text => hiddenText) (a hint style for drills), on('page', node => …). All calls return promises. No network, no storage.";
    T.agent.tool("make_addon", "Build a small new ability for the book as an add-on (works in seconds). " + API,
      { name: S("short name"), description: S("what it does, in plain words"), code: S("the JavaScript") }, ["name", "code"], (inp, ctx) => {
        const rec = saveAddon({ name: inp.name.slice(0, 60), desc: (inp.description || "").slice(0, 300), code: inp.code, on: true });
        ctx.mem.push(["addons", rec.id, null]);
        return { data: { id: rec.id, version: rec.version }, summary: `Added the add-on “${rec.name}” (turn it off any time in Settings → Add-ons)` };
      }, "Add-on");
    T.agent.tool("update_addon", "Fix or change an add-on's code (keeps earlier versions). " + API,
      { id: S("add-on id"), code: S("the new JavaScript"), description: S("new description (optional)") }, ["id", "code"], (inp, ctx) => {
        const a = M.getPart("addons")[inp.id]; if (!a || a.deleted) throw new Error("no such add-on");
        T.agent.snapMem(ctx, "addons", a.id);
        const rec = saveAddon({ id: a.id, code: inp.code, desc: inp.description || a.desc });
        return { data: { version: rec.version }, summary: `Updated “${rec.name}” to version ${rec.version}` };
      }, "Add-on");
    T.agent.tool("set_addon", "Turn an add-on on or off.", { id: S("add-on id"), on: { type: "boolean" } }, ["id", "on"], (inp, ctx) => {
      const a = M.getPart("addons")[inp.id]; if (!a || a.deleted) throw new Error("no such add-on");
      T.agent.snapMem(ctx, "addons", a.id); saveAddon({ id: a.id, on: !!inp.on });
      return { summary: `Turned “${a.name}” ${inp.on ? "on" : "off"}` };
    }, "Add-on");
    T.agent.tool("list_addons", "List the book's add-ons (id, name, on/off, version, any problem, code).", {}, [], () =>
      ({ data: list().map(a => ({ id: a.id, name: a.name, on: a.on, version: a.version, problem: problems[a.id] || null, code: a.code })) }));
  }

  T.addons = { sync, cueList, cue, save: saveAddon, running: () => Object.keys(running), problems: () => Object.assign({}, problems), safe: SAFE };
  document.addEventListener("tol:agent-undo", () => setTimeout(sync, 0));
  sync();
})();
