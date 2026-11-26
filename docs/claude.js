/* Claude inside the Tree of Life.
   - Look-and-feel requests ("bigger text", "warmer paper", "typewriter") change the app instantly.
   - Anything else goes to Claude Code on GitHub as a conversation (one GitHub issue per conversation).
   - Claude Code's changes come back as a preview you can try on a copy of your pages, then keep or undo.
   Your writing and writing time are never sent anywhere unless you tick "Include the page I was on". */
(() => {
  const T = window.TOL;
  if (!T) return;
  const OWNER = "obrianwatson", REPO = "tree-of-life", API = "https://api.github.com";
  const TITLE_PREFIX = "Tree of Life: ";
  const $ = id => document.getElementById(id);
  const esc = T.esc;
  const st = T.store;
  // These live under fixed names (not the sandbox copy) so a preview can keep or undo itself.
  const TOKEN_KEY = "tol-gh-token", CHAT_KEY = "tol-claude", TRYING_KEY = "tol-trying", UPDATED_KEY = "tol-updated";
  const LOOKS_KEY = T.PREFIX + "looks";
  const ROOT = T.SANDBOX ? location.href.split("/preview/")[0] + "/" : new URL("./", location.href).href;

  /* ---------------- GitHub ---------------- */
  const token = () => st.get(TOKEN_KEY, "");
  const repo = p => `/repos/${OWNER}/${REPO}${p}`;
  async function gh(path, opts = {}) {
    const t = token();
    if (!t) { const e = new Error("NO_TOKEN"); e.noToken = true; throw e; }
    const headers = { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + t, "X-GitHub-Api-Version": "2022-11-28" };
    if (opts.body) headers["Content-Type"] = "application/json";
    const res = await fetch(API + path, Object.assign({}, opts, { headers, cache: "no-store" }));
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = new Error((data && data.message) || ("GitHub answered " + res.status));
      e.status = res.status; throw e;
    }
    return data;
  }
  const friendly = e => e.noToken ? "Connect GitHub first (Settings → Claude Code key)."
    : e.status === 401 ? "GitHub didn't accept the key. Make a new one and save it in Settings."
    : e.status === 403 || e.status === 404 ? "The key can't reach the tree-of-life project. Check its permissions (see the steps)."
    : e.status === 405 || e.status === 409 ? "GitHub couldn't merge this change right now. Try again in a minute."
    : (e.message && e.message !== "Failed to fetch") ? e.message : "Couldn't reach GitHub. Check the internet connection.";

  /* ---------------- vibe design: understand look-and-feel requests ---------------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const CODE_WORDS = /\b(add|adding|create|build|feature|count|counter|timer|export|import|sync|fold|folds|link|links|tag|tags|branch|save|saving|delete|remove|move|search|fix|bug|broken|crash|doesn'?t|isn'?t|won'?t|when i|should|keyboard shortcut|menu|list|sort|notification|remind)\b/;
  function interpret(text, cur) {
    const s = " " + text.toLowerCase().replace(/[’]/g, "'") + " ";
    const t = Object.assign({}, cur), did = [];
    const much = /\b(much|a lot|way|lots|really|very)\b/.test(s) ? 2 : 1;
    const TXT = "(text|font|type|words|letters|writing|lettering)";
    const near = (a, b) => new RegExp(`\\b${a}\\b[^.!?]{0,30}\\b${b}\\b|\\b${b}\\b[^.!?]{0,30}\\b${a}\\b`).test(s);
    if (/\b(original|default) look\b|\breset (the )?(look|design|theme)\b/.test(s)) {
      return { theme: Object.assign({}, T.THEME_DEFAULT), did: ["back to the original look"], code: false };
    }
    if (near("(bigger|larger|enlarge|increase|huge|grow)", TXT)) { t.size = clamp(t.size + 2 * much, 13, 34); did.push("bigger text"); }
    else if (near("(smaller|tinier|shrink|decrease)", TXT)) { t.size = clamp(t.size - 2 * much, 13, 34); did.push("smaller text"); }
    if (near("(bigger|larger)", "(button|thumb|hold)")) { t.thumb = clamp(t.thumb + 14 * much, 56, 140); did.push("bigger hold button"); }
    else if (near("(smaller|tinier)", "(button|thumb|hold)")) { t.thumb = clamp(t.thumb - 14 * much, 56, 140); did.push("smaller hold button"); }
    if (/\btypewriter|courier|typed\b/.test(s)) {
      t.font = "typewriter"; t.paper = "#f4efe3"; t.ink = "#26231e"; t.mode = "light"; did.push("typewriter type on warm paper");
    } else if (/\bsans\b|\bclean font|\bmodern\b|\bsimple font/.test(s)) { t.font = "sans"; did.push("clean modern type"); }
    else if (/\bserif\b|\bbookish\b|\blike a book\b|\bnovel\b|\bclassic\b|\bliterary\b/.test(s)) { t.font = "serif"; did.push("book type"); }
    if (/\b(dark|darker|night|dim|black background)\b/.test(s)) { t.mode = "dark"; t.paper = null; t.ink = null; did.push("dark mode"); }
    else if (/\b(warm|warmer|cream|creamy|sepia|cozy|cosy|parchment|old paper)\b/.test(s)) {
      if (!did.some(d => d.startsWith("typewriter"))) { t.paper = "#f7f1e3"; t.ink = "#2b261f"; t.mode = "light"; did.push("warmer paper"); }
    } else if (/\b(cool|cooler|crisp|whiter|bright white|clean white)\b/.test(s)) { t.paper = "#fbfcfd"; t.ink = "#1b1e22"; t.mode = "light"; did.push("cooler, crisper paper"); }
    else if (/\b(light mode|day mode|lighter)\b/.test(s)) { t.mode = "light"; did.push("light mode"); }
    if (/\b(wider|broader)\b/.test(s) || near("(wide)", "(page|column|lines)")) { t.width = clamp(t.width + 100 * much, 480, 1100); did.push("wider page"); }
    else if (/\b(narrower|thinner column)\b/.test(s) || near("(narrow)", "(page|column|lines)")) { t.width = clamp(t.width - 100 * much, 480, 1100); did.push("narrower page"); }
    if (/\b(more space|more room between|airier|airy|spacious|double.?spaced?|more spacing|space (it )?out|breathe|looser)\b/.test(s)) { t.lh = Math.round(clamp(t.lh + 0.2 * much, 1.2, 2.4) * 100) / 100; did.push("more space between lines"); }
    else if (/\b(less space|tighter|denser|compact|single.?spaced?)\b/.test(s)) { t.lh = Math.round(clamp(t.lh - 0.2 * much, 1.2, 2.4) * 100) / 100; did.push("less space between lines"); }
    const code = CODE_WORDS.test(s);
    return { theme: t, did, code };
  }

  /* ---------------- conversations (kept on GitHub, listed here) ---------------- */
  let chat = Object.assign({ convs: [], current: null }, st.get(CHAT_KEY, {}));
  const saveChat = () => st.set(CHAT_KEY, chat);
  const conv = () => chat.convs.find(c => c.n === chat.current) || null;
  let messages = [], prInfo = null, status = null, busy = false, lastError = "", note = "", design = null;

  function renderConvSelect() {
    const sel = $("convSel");
    const opts = chat.convs.slice().sort((a, b) => b.n - a.n)
      .map(c => `<option value="${c.n}"${c.n === chat.current ? " selected" : ""}>${esc(c.title.replace(TITLE_PREFIX, ""))}${c.final ? " · " + c.final : ""}</option>`);
    sel.innerHTML = `<option value=""${chat.current ? "" : " selected"}>New conversation</option>` + opts.join("");
  }
  $("convSel").onchange = e => { chat.current = e.target.value ? +e.target.value : null; saveChat(); messages = []; prInfo = null; status = null; render(); refresh(); };
  $("newConv").onclick = () => { chat.current = null; saveChat(); messages = []; prInfo = null; status = null; design = null; render(); $("ask").focus(); };
  $("backWrite").onclick = () => T.showView("write");
  $("claudeBtn").onclick = () => { T.closeDrawer(); T.showView("chat"); };
  document.addEventListener("tol:view", e => { if (e.detail === "chat") { render(); syncConvs(); refresh(); } });

  async function syncConvs() {
    if (!token()) return;
    try {
      const issues = await gh(repo(`/issues?creator=${OWNER}&state=all&per_page=40&sort=created&direction=desc`));
      for (const i of issues) {
        if (i.pull_request || !i.title.startsWith(TITLE_PREFIX)) continue;
        if (!chat.convs.some(c => c.n === i.number)) chat.convs.push({ n: i.number, title: i.title, createdAt: Date.parse(i.created_at) });
      }
      saveChat(); renderConvSelect();
    } catch (e) { /* the list is a convenience; ignore */ }
  }

  /* ---------------- reading a conversation ---------------- */
  const FOOTER = /\n+---\n_Sent from the (?:Tree of Life app|Book of Living Waters)[\s\S]*$/;
  function cleanMine(body) { return (body || "").replace(FOOTER, "").replace(/^\s*@claude\s*/i, "").trim(); }
  const isWorking = b => /is working|working…|working\.\.\./i.test(b) && !/finished/i.test(b);
  const isError = b => /encountered an error|ran into an error/i.test(b);
  function toMsg(x) {
    const mine = x.user && x.user.login === OWNER;
    return { id: x.id, mine, body: mine ? cleanMine(x.body) : (x.body || ""), at: Date.parse(x.created_at), updated: Date.parse(x.updated_at || x.created_at) };
  }

  async function findPR(c, claudeDone) {
    if (c.pr) return;
    const branches = await gh(repo(`/branches?per_page=100`));
    const b = (branches || []).find(x => x.name.startsWith(`claude/issue-${c.n}-`));
    if (!b) return false;
    const prs = await gh(repo(`/pulls?state=all&head=${OWNER}:${encodeURIComponent(b.name)}`));
    if (prs && prs.length) { c.pr = prs[0].number; saveChat(); return true; }
    if (claudeDone) {
      const pr = await gh(repo(`/pulls`), { method: "POST", body: JSON.stringify({
        title: c.title.replace(TITLE_PREFIX, ""), head: b.name, base: "main",
        body: `Made by Claude Code from the Book of Living Waters. Closes #${c.n}` }) });
      c.pr = pr.number; saveChat();
    }
    return true;
  }

  async function previewReady(pr) {
    try {
      const r = await fetch(`${ROOT}preview/${pr.number}/version.txt`, { cache: "no-store" });
      if (!r.ok) return false;
      return (await r.text()).trim() === pr.head.sha;
    } catch (e) { return false; }
  }

  let refreshing = false;
  async function refresh() {
    const c = conv();
    if (!c || !token() || refreshing) return;
    refreshing = true; lastError = "";
    try {
      const [issue, comments] = await Promise.all([gh(repo(`/issues/${c.n}`)), gh(repo(`/issues/${c.n}/comments?per_page=100`))]);
      let list = [toMsg(issue), ...comments.map(toMsg)];
      const lastBotIssue = comments.filter(x => !(x.user && x.user.login === OWNER)).pop();
      const claudeDone = lastBotIssue && !isWorking(lastBotIssue.body || "");
      let hasBranch = !!c.pr;
      if (!c.pr) hasBranch = await findPR(c, claudeDone);
      prInfo = null;
      if (c.pr) {
        const [pr, prComments] = await Promise.all([gh(repo(`/pulls/${c.pr}`)), gh(repo(`/issues/${c.pr}/comments?per_page=100`))]);
        prInfo = pr;
        list = list.concat(prComments.map(toMsg));
      }
      list.sort((a, b) => a.at - b.at);
      messages = list;
      const lastMine = [...list].reverse().find(m => m.mine);
      const lastBot = [...list].reverse().find(m => !m.mine);
      const waiting = lastMine && (!lastBot || lastBot.at < lastMine.at);
      if (prInfo && prInfo.merged_at) status = "kept";
      else if (prInfo && prInfo.state === "closed") status = "undone";
      else if (waiting) status = "sent";
      else if (lastBot && isWorking(lastBot.body)) status = "working";
      else if (lastBot && isError(lastBot.body)) status = "error";
      else if (prInfo) status = (await previewReady(prInfo)) ? "ready" : "preparing";
      else if (hasBranch) status = "preparing";
      else status = lastBot ? "answered" : "sent";
      if ((status === "kept" || status === "undone") && c.final !== status) { c.final = status; saveChat(); renderConvSelect(); }
    } catch (e) { lastError = friendly(e); }
    refreshing = false;
    render();
  }
  setInterval(() => {
    if (T.view() === "chat" && !document.hidden && conv() && !["kept", "undone"].includes(status)) refresh();
  }, 6000);

  /* ---------------- drawing the conversation ---------------- */
  function md(text) {
    let h = esc(text);
    h = h.replace(/&lt;img[^&]*&gt;/g, "");
    h = h.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    h = h.replace(/^\s*- \[x\]/gim, "✓").replace(/^\s*- \[ \]/gim, "○");
    h = h.replace(/^#{1,6}\s*/gm, "").replace(/^---$/gm, "");
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    return h.replace(/\n/g, "<br>");
  }
  const STATUS = {
    sent: ["Sent", "Waiting for Claude Code to start. This usually takes under a minute."],
    working: ["Claude is working…", "You can keep writing. This page updates by itself."],
    preparing: ["Getting your preview ready…", "Claude is done. The preview takes a minute or two to appear."],
    ready: ["Ready to try", "Try it on a copy of your pages, then keep it or undo it. To change something, just say what."],
    answered: ["Claude answered", "Reply below to continue."],
    error: ["Claude ran into a problem", "Say what you'd like again, or start a new conversation."],
    kept: ["Kept", "The app updates itself within a minute or two."],
    undone: ["Undone", "Nothing was changed."]
  };
  function render() {
    renderConvSelect();
    const th = $("thread"), sb = $("statusbar");
    const parts = [];
    if (!token()) parts.push(setupCard());
    if (!conv() && !design) {
      parts.push(`<div class="card"><h3>Change the app by asking</h3>
        <p>Say how you want it to look or work. Look-and-feel changes (text size, paper, type, spacing, dark mode) happen instantly. Anything new goes to Claude Code, and comes back for you to try before you keep it.</p>
        <p style="margin:0">Your writing is never sent unless you tick "Include the page I was on".</p></div>`);
    }
    for (const m of messages) {
      parts.push(`<div class="bubble${m.mine ? " mine" : ""}"><span class="who">${m.mine ? "You" : "Claude"}</span>${md(m.body)}</div>`);
    }
    if (design) parts.push(designCard());
    th.innerHTML = parts.join("");
    th.scrollTop = th.scrollHeight;
    bindCards();
    // status and actions
    const s = status && STATUS[status];
    let html = "";
    if (lastError) html = `<div class="state">${esc(lastError)}</div>`;
    else if (note && !conv()) html = `<div class="state">${esc(note)}</div>`;
    else if (conv() && s) html = `<div class="state">${s[0]}<small>${s[1]}</small></div>`;
    if (!lastError && status === "ready" && prInfo) {
      html += `<button class="btn primary" data-act="try">Try it</button><button class="btn" data-act="keep">Keep it</button><button class="btn" data-act="undo">Undo</button>`;
    } else if (!lastError && prInfo && prInfo.state === "open" && ["preparing", "working", "sent", "error"].includes(status)) {
      html += `<button class="btn" data-act="undo">Undo</button>`;
    } else if (!lastError && status === "kept") {
      html += `<button class="btn" data-act="reload">Reload the app</button>`;
    }
    sb.innerHTML = html;
    sb.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act));
    $("ask").placeholder = status === "ready" ? "Ask for a fix, or say what to change…"
      : "Tell Claude what you'd like. For example: make the text bigger and warmer, or add a word count.";
  }

  function setupCard() {
    return `<div class="card" id="setupCard"><h3>Connect Claude Code (once per device)</h3>
      <p>Look-and-feel changes work right now. To let Claude Code build new things, give this device a GitHub key:</p>
      <ol>
        <li>On GitHub, open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">New fine-grained token</a> (Settings → Developer settings → Personal access tokens → Fine-grained tokens).</li>
        <li>Name it <b>Book of Living Waters</b>. Pick an expiration (1 year is fine).</li>
        <li>Repository access: <b>Only select repositories</b> → <b>tree-of-life</b>.</li>
        <li>Repository permissions: <b>Contents</b>, <b>Issues</b> and <b>Pull requests</b>, each set to <b>Read and write</b>.</li>
        <li>Tap <b>Generate token</b> and copy it (it starts with <code>github_pat_</code>).</li>
        <li>Paste it here and tap Save. Do this on your iPhone and your laptop. Never paste it into a chat.</li>
      </ol>
      <div class="row"><input type="password" id="setupToken" placeholder="github_pat_…" autocomplete="off" style="flex:1 1 200px"><button class="btn primary" id="setupSave">Save</button></div>
      <p id="setupMsg" style="margin:6px 0 0"></p></div>`;
  }
  function designCard() {
    return `<div class="card" id="designCard"><h3>${design.kept ? "Kept" : "Changed instantly"}</h3>
      <p>${esc(design.did.join(", "))}.${design.kept ? "" : " Look at your page, then keep it or undo it."}</p>
      ${design.kept ? "" : `<div class="row"><button class="btn primary" data-d="keep">Keep it</button><button class="btn" data-d="undo">Undo</button>
      <button class="btn" data-d="peek">Look at my page</button>
      ${design.text ? `<button class="btn" data-d="send">Send to Claude Code instead</button>` : ""}</div>`}</div>`;
  }
  function bindCards() {
    const save = $("setupSave");
    if (save) save.onclick = () => saveToken($("setupToken").value, $("setupMsg"));
    document.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
      const a = b.dataset.d;
      if (a === "keep") { T.setTheme(design.theme); design.kept = true; render(); }
      else if (a === "undo") { T.previewTheme(design.prev); design = null; render(); }
      else if (a === "peek") { T.showView("write"); }
      else if (a === "send") { const text = design.text; T.previewTheme(design.prev); design = null; sendToClaude(text); }
    });
  }

  /* ---------------- sending ---------------- */
  $("attach").onchange = e => { $("attachWarn").hidden = !e.target.checked; };
  $("composer").addEventListener("submit", e => {
    e.preventDefault();
    const text = $("ask").value.trim();
    if (!text || busy) return;
    $("ask").value = "";
    const cur = T.getTheme();
    const r = interpret(text, cur);
    const followUp = conv() && status === "ready";
    if (design && design.kept) design = null;
    note = "";
    if (r.did.length && !r.code && !followUp) {
      design = { theme: r.theme, prev: cur, did: r.did, text, kept: false };
      T.previewTheme(r.theme); render(); return;
    }
    if (r.did.length && r.code && !followUp) {
      design = { theme: r.theme, prev: cur, did: r.did, text: null, kept: false };
      T.previewTheme(r.theme);
    }
    sendToClaude(text);
  });

  async function sendToClaude(text) {
    if (!token()) { lastError = "To ask Claude Code for this, connect GitHub first (steps above)."; render(); return; }
    busy = true; $("sendBtn").disabled = true; lastError = "";
    let body = `@claude ${text}`;
    if ($("attach").checked) {
      const page = T.currentPageText();
      body += `\n\n<details><summary>The page I was on</summary>\n\n\`\`\`\n${page.replace(/```/g, "ˋˋˋ")}\n\`\`\`\n</details>`;
    }
    body += `\n\n---\n_Sent from the Book of Living Waters (${T.DEVICE}, version ${T.APP_VERSION}). Please follow CLAUDE.md and reply in plain words: what you changed and what I should try._`;
    try {
      const c = conv();
      if (c && !c.final) {
        // follow-ups go where Claude is working: on the change itself once it exists
        await gh(repo(`/issues/${c.pr || c.n}/comments`), { method: "POST", body: JSON.stringify({ body }) });
      } else {
        const title = TITLE_PREFIX + text.replace(/\s+/g, " ").slice(0, 70);
        const issue = await gh(repo(`/issues`), { method: "POST", body: JSON.stringify({ title, body }) });
        chat.convs.push({ n: issue.number, title, createdAt: Date.now() });
        chat.current = issue.number; saveChat();
      }
      status = "sent";
      $("attach").checked = false; $("attachWarn").hidden = true;
    } catch (e) { lastError = friendly(e); $("ask").value = text; }
    busy = false; $("sendBtn").disabled = false;
    render(); refresh();
  }

  /* ---------------- try, keep, undo ---------------- */
  async function act(a) {
    const c = conv(); if (!c || !prInfo) { if (a === "reload") location.reload(); return; }
    const title = c.title.replace(TITLE_PREFIX, "");
    if (a === "try") { st.set(TRYING_KEY, { pr: prInfo.number, title }); location.href = `${ROOT}preview/${prInfo.number}/`; return; }
    if (a === "reload") { location.reload(); return; }
    try {
      if (a === "keep") await keep(prInfo.number, title);
      if (a === "undo") await undo(prInfo.number, c.n);
    } catch (e) { lastError = friendly(e); }
    await refresh();
  }
  async function keep(pr, title) {
    await gh(repo(`/pulls/${pr}/merge`), { method: "PUT", body: JSON.stringify({ merge_method: "squash", commit_title: `Tree of Life: ${title} (#${pr})` }) });
    st.set(UPDATED_KEY, { title, at: Date.now() });
  }
  async function undo(pr, issueN) {
    await gh(repo(`/pulls/${pr}`), { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    if (issueN) await gh(repo(`/issues/${issueN}`), { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) });
  }

  /* ---------------- the Changes list ---------------- */
  $("changesBtn").onclick = async () => {
    design = null;
    const th = $("thread");
    if (!token()) { lastError = "Connect GitHub first to see the changes you've kept."; render(); return; }
    th.innerHTML = `<div class="card"><h3>Changes you've kept</h3><p>Loading…</p></div>`;
    try {
      const prs = await gh(repo(`/pulls?state=closed&per_page=50&sort=updated&direction=desc`));
      const kept = prs.filter(p => p.merged_at && p.head && /^claude\//.test(p.head.ref));
      th.innerHTML = `<div class="card"><h3>Changes you've kept</h3>${kept.length ? "" : "<p>None yet.</p>"}
        ${kept.map(p => `<div class="look" style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
          <span style="flex:1">${esc(p.title)}<br><small style="color:var(--muted)">${new Date(p.merged_at).toLocaleDateString()}</small></span>
          <button class="btn" data-revert="${p.number}" data-title="${esc(p.title)}">Undo this change</button></div>`).join("")}
        <div class="row" style="margin-top:10px"><button class="btn" id="closeChanges">Back</button></div></div>`;
      $("closeChanges").onclick = render;
      th.querySelectorAll("[data-revert]").forEach(b => b.onclick = () => {
        chat.current = null;
        sendToClaude(`Please undo the change "${b.dataset.title}" (pull request #${b.dataset.revert}) exactly as it was before, as a new change I can try. Don't change anything else.`);
      });
    } catch (e) { lastError = friendly(e); render(); }
  };

  /* ---------------- the GitHub key ---------------- */
  async function saveToken(value, msgEl) {
    const v = (value || "").trim();
    const say = t => { if (msgEl) msgEl.textContent = t; };
    if (!v) { say("Paste the key first."); return; }
    st.set(TOKEN_KEY, v);
    say("Checking with GitHub…");
    try {
      const r = await gh(repo(""));
      const ok = !r.permissions || r.permissions.push;
      const m = ok ? "Connected. Claude Code is ready." : "Connected, but the key can't make changes. Give it Read and write for Contents, Issues and Pull requests.";
      say(m); note = m;
      paintGh(); render(); syncConvs();
    } catch (e) { say(friendly(e)); }
  }
  function paintGh() {
    const el = $("ghState"); if (el) el.textContent = token() ? "Connected" : "Not connected";
  }
  $("ghSave").onclick = () => { saveToken($("ghToken").value, $("msg")); $("ghToken").value = ""; };
  $("ghRemove").onclick = () => { st.set(TOKEN_KEY, ""); paintGh(); render(); $("msg").textContent = "Key removed from this device."; };

  /* ---------------- Looks ---------------- */
  const looks = () => st.get(LOOKS_KEY, []);
  const looksChanged = () => document.dispatchEvent(new CustomEvent("tol:changed", { detail: "prefs" }));
  function paintLooks() {
    const list = looks();
    $("looksList").innerHTML = list.length ? list.map((l, i) =>
      `<div class="look"><span>${esc(l.name)}</span><button class="btn" data-use="${i}">Use</button><button class="btn ghost" data-del="${i}" aria-label="Delete ${esc(l.name)}">Delete</button></div>`).join("")
      : `<small>No saved looks yet.</small>`;
    $("looksList").querySelectorAll("[data-use]").forEach(b => b.onclick = () => { T.setTheme(looks()[+b.dataset.use].theme); $("msg").textContent = "Look applied."; });
    $("looksList").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const l = looks(); l.splice(+b.dataset.del, 1); st.set(LOOKS_KEY, l); paintLooks(); looksChanged(); });
  }
  $("saveLook").onclick = () => {
    const name = $("lookName").value.trim() || `Look ${looks().length + 1}`;
    const l = looks(); l.push({ name, theme: T.getTheme() }); st.set(LOOKS_KEY, l); looksChanged();
    $("lookName").value = ""; paintLooks(); $("msg").textContent = `Saved "${name}".`;
  };
  $("resetLook").onclick = () => { T.setTheme(T.THEME_DEFAULT); $("msg").textContent = "Back to the original look."; };
  $("settingsBtn").addEventListener("click", () => { paintLooks(); paintGh(); });

  /* ---------------- banners: trying a preview, or just updated ---------------- */
  const banner = $("banner");
  if (T.SANDBOX) {
    const trying = st.get(TRYING_KEY, null);
    const name = trying && String(trying.pr) === T.SANDBOX ? trying.title : `change #${T.SANDBOX}`;
    banner.innerHTML = `<span>Trying: ${esc(name)}. This is a copy of your pages; your real writing is safe.</span>
      <button class="btn" id="bKeep">Keep it</button><button class="btn" id="bUndo">Undo</button><button class="btn ghost" id="bBack">Back to my real app</button>`;
    banner.hidden = false;
    $("claudeBtn").hidden = true;
    const go = () => { location.href = ROOT; };
    $("bBack").onclick = go;
    $("bKeep").onclick = async () => {
      try { await keep(+T.SANDBOX, name); go(); } catch (e) { banner.querySelector("span").textContent = friendly(e); }
    };
    $("bUndo").onclick = async () => {
      const c = chat.convs.find(x => String(x.pr) === T.SANDBOX);
      try { await undo(+T.SANDBOX, c && c.n); go(); } catch (e) { banner.querySelector("span").textContent = friendly(e); }
    };
  } else {
    const upd = st.get(UPDATED_KEY, null);
    if (upd && upd.title) {
      banner.innerHTML = `<span>Kept: ${esc(upd.title)}. If you don't see it yet, the update is still on its way (a minute or two).</span>
        <button class="btn" id="bReload">Reload</button><button class="btn ghost" id="bOk">OK</button>`;
      banner.hidden = false;
      $("bReload").onclick = () => location.reload();
      $("bOk").onclick = () => { st.set(UPDATED_KEY, null); banner.hidden = true; };
    }
  }
  paintGh();
  // exposed for tests only
  window.__tolClaude = { interpret };
})();
