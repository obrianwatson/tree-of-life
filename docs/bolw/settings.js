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
  <h2>Take your book with you</h2><div class="row"><button id="sTxt">Export to read (.txt)</button><button id="sJson">Export everything (.json)</button></div><p class="nt">The .txt opens anywhere. The .json holds everything (notes, folds, chats, projects, writing time).</p>
  <h2>The way back</h2><div class="row"><button id="sVers">Earlier versions</button><a class="btn" href="./safe/">Safe mode</a><a class="btn" href="./test/">The guided test</a><a class="btn" href="../">The old book</a></div>
  <p class="nt">Safe mode is a separate, plain page that can always read and export your book, even if the app itself won't open.</p>`;
  $("#sOnly").onchange = e => Shelf.set({ thisNoteOnly: e.target.checked }); $("#sAsk").onchange = e => Shelf.set({ askFirst: e.target.checked });
  $("#sKeySave").onclick = () => { const k = $("#sKeyIn").value.trim(), w = $("#sWs").value.trim(); if (!k && !w) return; Socket.setKey(k || null, w || null); $("#sKeyIn").value = ""; $("#sWs").value = ""; $("#sKey").textContent = Socket.keyHint(); $("#sKeyMsg").textContent = "Saved on this device."; };
  $("#sTxt").onclick = () => Keep.download("book-of-living-waters-" + Keep.stamp() + ".txt", Keep.asText(B, Shelf.S));
  $("#sJson").onclick = () => Keep.download("book-of-living-waters-" + Keep.stamp() + ".json", Keep.asJSON(B, Shelf.S, Page.clock), "application/json");
  $("#sVers").onclick = versions; paintSync();
}
async function paintSync() {
  const box = $("#sSyncBox"); if (!box) return; $("#sSync").textContent = Lock.label(); if (Lock.off) { box.innerHTML = ""; return; }
  if (Lock.isOn && Lock.unlocked) { box.innerHTML = `<div class="row"><button id="sNow">Sync now</button><button id="sOff">Turn off on this device</button></div>`;
    $("#sNow").onclick = () => Lock.syncNow(); $("#sOff").onclick = () => { if (confirm("Turn sync off on this device? Your book stays here; it just stops syncing.")) Lock.turnOff().then(paintSync); }; return; }
  const old = await Lock.hasOldLock().catch(() => false);
  box.innerHTML = (Lock.hasToken() ? "" : `<input id="sTok" type="password" placeholder="Paste your GitHub key (kept on this device)" autocomplete="off">`)
    + `<input id="sPass" type="password" placeholder="Your sync passphrase" autocomplete="off"><div class="row"><button id="sOn">Turn on sync</button>${old && Lock.hasToken() ? `<button id="sOld">Use the lock already open on this device</button>` : ""}</div>
    <p class="nt" id="sMsg">One passphrase opens both the old book and this one. If you've never set one, the one you type here becomes it: write it down, because nobody can recover it.</p>`;
  const run = async fn => { const m = $("#sMsg"); m.textContent = "Working…"; try { const r = await fn(); if (r === false) { m.textContent = "That lock doesn't fit. Type your passphrase instead."; return; } paintSync(); } catch (e) { m.textContent = e.offline ? "You're offline. Try again when you're online." : (e.message || String(e)); } };
  $("#sOn").onclick = () => run(async () => { const t = $("#sTok"); if (t && t.value.trim()) Lock.setToken(t.value); const p = $("#sPass").value; $("#sPass").value = ""; return Lock.turnOn(p); });
  if ($("#sOld")) $("#sOld").onclick = () => run(() => Lock.useOldLock());
}
Lock.on(() => { if (!sheet.classList.contains("hide") && $("#sSync")) { $("#sSync").textContent = Lock.label(); } });
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
