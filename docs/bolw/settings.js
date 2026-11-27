/* settings.js · SETTINGS and the way back: sync, the AI key, the riverbanks, export, earlier versions, safe mode.
   Keys typed here go straight to their own piece (socket.js, lock.js) and are never shown again. */
(function (g) {
"use strict";
const B = g.Book, Keep = g.Keep, Shelf = g.Shelf, Socket = g.Socket, Lock = g.Lock, Page = g.Page;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
document.body.insertAdjacentHTML("beforeend", `<div class="sheet hide" id="set"><div class="sh"><b id="setT">Settings</b><button id="setX">Done</button></div><div class="sb" id="setB"></div></div>`);
const sheet = $("#set"), body = $("#setB");
const close = () => { sheet.classList.add("hide"); document.body.classList.remove("sheet-open"); Page.render(); };
$("#setX").onclick = close;
function show(title) { $("#setT").textContent = title; sheet.classList.remove("hide"); document.body.classList.add("sheet-open"); body.scrollTop = 0; }
function open() {
  show("Settings"); const set = Shelf.S.set;
  body.innerHTML = `
  <h2>Sync between your devices</h2><p class="nt" id="sSync">${esc(Lock.label())}</p><div id="sSyncBox"></div>
  <h2>AI key</h2><p class="nt">Your Anthropic key: <span id="sKey">${esc(Socket.keyHint())}</span>. It stays on this device and is sent only to Anthropic.</p>
  <input id="sKeyIn" type="password" placeholder="Paste a key to save or replace it" autocomplete="off"><input id="sWs" type="text" placeholder="Workspace ID (only if Anthropic asks for it)" autocomplete="off">
  <div class="row"><button id="sKeySave">Save key</button></div><p class="nt" id="sKeyMsg"></p>
  <h2>What the AI may do</h2>
  <label class="ck"><input type="checkbox" checked disabled> It acts only when I ask <span class="nt">(always)</span></label>
  <label class="ck"><input type="checkbox" id="sOnly"${set.thisNoteOnly ? " checked" : ""}> Only in the note that's open</label>
  <label class="ck"><input type="checkbox" id="sAsk"${set.askFirst ? " checked" : ""}> It asks me first before changing or removing my words, or removing a fold</label>
  <h2>Something's off?</h2><p class="nt">Tell Claude what happened. Only these words and which device you're on are sent, never your writing.</p>
  <textarea id="sIssue" rows="3" placeholder="What happened, and what were you doing?"></textarea>
  <div class="row">${Lock.hasToken() ? '<button id="sIssueSend">Send to Claude</button>' : ""}<button id="sIssueCopy">Copy</button></div><p class="nt" id="sIssueMsg">${Lock.hasToken() ? "" : "This device has no GitHub key, so tap Copy and paste it to Claude."}</p>
  <h2>Take your book with you</h2><div class="row"><button id="sTxt">Export to read (.txt)</button><button id="sJson">Export everything (.json)</button></div><p class="nt">The .txt opens anywhere. The .json holds everything (notes, folds, chats, projects, writing time).</p>
  <h2>The way back</h2><div class="row"><button id="sVers">Earlier versions</button><a class="btn" href="./safe/">Safe mode</a><a class="btn" href="./test/">The guided test</a><a class="btn" href="../">The old book</a></div>
  <p class="nt">Safe mode is a separate, plain page that can always read and export your book, even if the app itself won't open.</p>`;
  $("#sOnly").onchange = e => Shelf.set({ thisNoteOnly: e.target.checked }); $("#sAsk").onchange = e => Shelf.set({ askFirst: e.target.checked });
  $("#sKeySave").onclick = () => { const k = $("#sKeyIn").value.trim(), w = $("#sWs").value.trim(); if (!k && !w) return; Socket.setKey(k || null, w || null); $("#sKeyIn").value = ""; $("#sWs").value = ""; $("#sKey").textContent = Socket.keyHint(); $("#sKeyMsg").textContent = "Saved on this device."; };
  $("#sTxt").onclick = () => Keep.download("book-of-living-waters-" + Keep.stamp() + ".txt", Keep.asText(B, Shelf.S));
  $("#sJson").onclick = () => Keep.download("book-of-living-waters-" + Keep.stamp() + ".json", Keep.asJSON(B, Shelf.S, Page.clock), "application/json");
  $("#sVers").onclick = versions; paintSync(); wireOff();
}
async function paintSync() {
  const box = $("#sSyncBox"); if (!box) return; $("#sSync").textContent = Lock.label(); if (Lock.off) { box.innerHTML = ""; return; }
  if (Lock.isOn && Lock.unlocked) { box.innerHTML = `<div class="row"><button id="sNow">Sync now</button><button id="sOff">Turn off on this device</button></div>`;
    $("#sNow").onclick = () => Lock.syncNow(); $("#sIssue").onclick = () => { if (confirm("Turn sync off on this device? Your book stays here; it just stops syncing.")) Lock.turnOff().then(paintSync); }; return; }
  const old = await Lock.hasOldLock().catch(() => false);
  box.innerHTML = (Lock.hasToken() ? "" : `<input id="sTok" type="password" placeholder="Paste your GitHub key (kept on this device)" autocomplete="off">`)
    + `<input id="sPass" type="password" placeholder="Your sync passphrase" autocomplete="off"><div class="row"><button id="sOn">Turn on sync</button>${old && Lock.hasToken() ? `<button id="sOld">Use the lock already open on this device</button>` : ""}</div>
    <p class="nt" id="sMsg">One passphrase opens both the old book and this one. If you've never set one, the one you type here becomes it: write it down, because nobody can recover it.</p>`;
  const run = async fn => { const m = $("#sMsg"); m.textContent = "Working…"; try { const r = await fn(); if (r === false) { m.textContent = "That lock doesn't fit. Type your passphrase instead."; return; } paintSync(); } catch (e) { m.textContent = e.offline ? "You're offline. Try again when you're online." : (e.message || String(e)); } };
  $("#sOn").onclick = () => run(async () => { const t = $("#sTok"); if (t && t.value.trim()) Lock.setToken(t.value); const p = $("#sPass").value; $("#sPass").value = ""; return Lock.turnOn(p); });
  if ($("#sOld")) $("#sOld").onclick = () => run(() => Lock.useOldLock());
}
Lock.on(() => { if (!sheet.classList.contains("hide") && $("#sSync")) { $("#sSync").textContent = Lock.label(); } });
/* Something's off: the words you type here and the device you're on go to your project on GitHub as an issue
   (titled "Essentials: …"), where Claude reads them. Never your writing, never a key, never "@claude". */
function offReport(text) { return ["Essentials · something's off", new Date().toLocaleString() + " · " + (matchMedia("(pointer:coarse)").matches ? "touch" : "mouse") + " · " + innerWidth + "×" + innerHeight + " · " + (navigator.standalone ? "Home Screen app" : "browser") + " · " + navigator.userAgent.replace(/\s+/g, " ").slice(0, 160), "", text.replace(/@/g, "(at)")].join("\n"); }
function wireOff() {
  const ta = $("#sIssue"), msg = t => { $("#sIssueMsg").textContent = t; };
  $("#sIssueCopy").onclick = async () => { const t = ta.value.trim(); if (!t) return msg("Write what happened first."); try { await navigator.clipboard.writeText(offReport(t)); msg("Copied. Paste it to Claude."); } catch (e) { ta.select(); msg("Select the words and copy them."); } };
  const sd = $("#sIssueSend"); if (!sd) return;
  sd.onclick = async () => { const t = ta.value.trim(); if (!t) return msg("Write what happened first.");
    if (sd.dataset.sure !== "1") { sd.dataset.sure = "1"; sd.textContent = "Yes, post it"; return msg("Your project on GitHub is public, so this can be seen there. Your writing is not included. Tap again to post."); }
    sd.disabled = true; msg("Sending…");
    try { const r = await fetch("https://api.github.com/repos/obrianwatson/tree-of-life/issues", { method: "POST", headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + Keep.lsGet("tol-gh-token"), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Essentials: " + t.split("\n")[0].replace(/@/g, "(at)").slice(0, 60), body: "```\n" + offReport(t) + "\n```\n_Sent from Settings in BOLW Essentials. No writing is included._" }) });
      if (!r.ok) throw new Error("GitHub answered " + r.status); ta.value = ""; sd.dataset.sure = ""; sd.textContent = "Send to Claude"; sd.disabled = false; msg("Sent. Tell Claude “I sent one” and it will read it.");
    } catch (e) { sd.disabled = false; msg("Couldn't send (" + (e.message || e) + "). Tap Copy and paste it to Claude instead."); } };
}
async function versions() {
  show("Earlier versions"); body.innerHTML = `<p class="nt">Loading…</p>`; const list = await Keep.versions();
  const when = t => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  body.innerHTML = `<p class="nt">Before a note changes, the note as it was is kept here on this device. Bringing one back makes a NEW note beside the one you have, so nothing is written over.</p>
    <div class="rows">${list.map((v, i) => `<div class="rowi"><span class="go"><b>${esc(v.title || "Note")}</b><small>${esc(when(v.at))} · ${esc(v.why || "")}</small></span><button class="mini put" data-v="${i}">Bring back</button></div>`).join("") || `<div class="none">No earlier versions yet. They start being kept as you write.</div>`}</div><div class="row"><button id="sBack">‹ Settings</button></div>`;
  $("#sBack").onclick = open;
  body.querySelectorAll("[data-v]").forEach(b => { b.onclick = () => { const v = list[+b.dataset.v], id = B.copyIn(v.piece, "(as it was " + when(v.at) + ")"); const p = Shelf.projectOf(v.note); if (p) Shelf.putNote(id, p); sheet.classList.add("hide"); document.body.classList.remove("sheet-open"); Page.openNote(id); }; });
}
g.Settings = { open, versions, close };
})(window);
