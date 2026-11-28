/* outside.js · MODULE "outside" · CLAUDE, OUTSIDE THE APP.
   You work with Claude in a separate chat (a coding session). With this switched on, that Claude can read your
   book and add to it, without you copying or pasting anything:
   - READING: this device seals a copy of your book for Claude (core/outside/books/<device>.json on your sync branch).
     It is locked with a fresh key that only Claude's private key can open (Claude's public key: outside-key.json).
     Nobody else can read it, not even on your public project.
   - WRITING: Claude sends DELIVERIES (core/outside/inbox/<id>.json): plain steps, the same steps as your ;commands,
     sealed so only your devices can open them (each device keeps its own private key; its public half is in
     core/outside/keys/<device>.json). One device claims a delivery (core/outside/done/<id>.json) and adds it with
     Claude's own hand: it adds and arranges, never deletes or rewrites your words. Each delivery is ONE Undo, its lines
     are colored like the AI's, and the record of every move says "Claude (outside the app)".
   - It is OFF until you switch it on (Settings → Modules): nothing goes to Claude unless you asked (unchangeable 6).
     It only works while sync is on and unlocked by you. Nothing arrives while you're typing.
   Claude's side is tools/outside.mjs. */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, Keep = g.Keep, Lock = g.Lock, D = () => B.D, esc = Page.esc;
Mods.add({ id: "outside", name: "Claude, outside the app", about: "Lets Claude, working with you in a separate chat, read a sealed copy of your book and add to it. Off until you switch it on." });
if (!Keep.lsGet("core-outside-asked")) { Keep.lsSet("core-outside-asked", 1); if (Mods.on("outside")) Mods.set("outside", false); }      // off until you switch it on

const enc = new TextEncoder(), dec = new TextDecoder(), RSA = { name: "RSA-OAEP" };
const b64 = buf => { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const DIR = "core/outside/";
let S = Object.assign({ published: null, sent: 0, done: {}, log: [] }, Keep.lsGet("core-outside") || {});
const saveS = () => Keep.lsSet("core-outside", S);
let busy = false, dirty = true, status = "", applying = 0; const subs = [], paint = () => subs.forEach(fn => { try { fn(); } catch (e) {} });

/* ---------- Claude's own hand, and its limits ---------- */
const hand = B.hand("outside");
B.guard((name, needs, who) => { if (String(who).indexOf("outside") !== 0) return true;
  if (!applying) return "Claude (outside the app) only acts while one of its deliveries is being added.";
  if (name === "prune" || name === "unfold" || name === "unlink" || (name === "write" && (needs.remove | 0) > 0)) return "Claude (outside the app) adds and arranges; it doesn't delete or rewrite your words.";
  return true; });

/* ---------- this device's own key pair (the private half can't be read out, only used) ---------- */
function idb(fn, mode) { return new Promise((res, rej) => { let r; try { r = indexedDB.open("core-outside", 1); } catch (e) { return rej(e); }
  r.onupgradeneeded = () => r.result.createObjectStore("keys");
  r.onsuccess = () => { const d = r.result; try { const q = fn(d.transaction("keys", mode || "readonly").objectStore("keys")); q.onsuccess = () => { res(q.result); d.close(); }; q.onerror = () => { rej(q.error); d.close(); }; } catch (e) { d.close(); rej(e); } };
  r.onerror = () => rej(r.error); }); }
let mine = null;
async function myKeys() {
  if (mine) return mine; let k = await idb(s => s.get("me")).catch(() => null);
  if (!k || !k.priv || !k.pub) { const kp = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, false, ["encrypt", "decrypt"]);
    const p = await crypto.subtle.exportKey("jwk", kp.publicKey); k = { priv: kp.privateKey, pub: { kty: p.kty, n: p.n, e: p.e, alg: p.alg, ext: true } }; await idb(s => s.put(k, "me"), "readwrite"); }
  return (mine = k);
}
let claude = null;
async function claudeKey() { if (claude) return claude; const r = await fetch("./outside-key.json", { cache: "no-store" }); if (!r.ok) throw new Error("Claude's key isn't published.");
  const j = await r.json(); claude = await crypto.subtle.importKey("jwk", j.key, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]); return claude; }

/* ---------- reading: a sealed copy of your book, for Claude ---------- */
async function sendBook() {
  const ck = await claudeKey(), now = Date.now();
  const st = { format: "bolw-outside-state", v: 1, deviceId: Lock.deviceId, savedAt: now, where: Page.leaf, book: B.D, deliveries: S.log.slice(-30) };
  const raw = crypto.getRandomValues(new Uint8Array(32)), k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("bolw-outside-book:" + Lock.deviceId) }, k, enc.encode(JSON.stringify(st)));
  const box = { format: "bolw-outside-book", v: 1, deviceId: Lock.deviceId, savedAt: now, k: b64(await crypto.subtle.encrypt(RSA, ck, raw)), iv: b64(iv), ct: b64(ct) };
  await Lock.outside.write(DIR + "books/" + Lock.deviceId + ".json", JSON.stringify(box)); S.sent = now; dirty = false; saveS();
}
async function publishKey() { const k = await myKeys(), fp = k.pub.n.slice(0, 24); if (S.published === fp) return;
  await Lock.outside.write(DIR + "keys/" + Lock.deviceId + ".json", JSON.stringify({ format: "bolw-outside-device", v: 1, deviceId: Lock.deviceId, key: k.pub, at: Date.now() })); S.published = fp; saveS(); }

/* ---------- writing: Claude's deliveries ---------- */
function startLine(d) {
  const ok = id => id && D().lines[id] && B.alive(D().lines[id].in);
  if (ok(d.line)) return d.line;
  if (d.leaf && D().leaves[d.leaf] && B.alive(d.leaf)) { const lf = D().leaves[d.leaf]; return lf.lines[lf.lines.length - 1]; }
  const tr = D().leaves[D().trunk]; return tr.lines[tr.lines.length - 1];
}
function apply(d) {
  const C = g.Commands; if (!C) return { ok: false, why: "BOLW couldn't read the steps." };
  const steps = C.parseSteps(d.steps.map(String).join("\n")), tag = "out" + B.uid(""); let r;
  applying++; B.begin(tag, "outside"); try { r = C.execute(steps, { code: "(Claude)", args: [], line: startLine(d), hand }); } catch (e) { r = { ok: false, why: e.message || String(e) }; } finally { B.end(); applying--; }
  if (!r.ok && B.groupDepth(tag) === 0) B.undo();                          // a delivery that doesn't fit is taken back whole
  B.flush(); Page.redraw();
  const entry = { id: d.id, title: String(d.title || "A delivery").slice(0, 80), at: Date.now(), ok: !!r.ok, moves: r.moves || 0, why: r.ok ? undefined : String(r.why || "").slice(0, 200) };
  S.log.push(entry); if (S.log.length > 60) S.log.shift(); saveS(); dirty = true;
  if (r.ok) Page.toast("Claude added “" + entry.title + "”.", "Undo", () => { if (B.groupDepth(tag) === 0) { B.undo(); Page.redraw(); } });
  else Page.toast("A delivery from Claude didn't fit, so nothing was added. Claude can see why.");
  if (r.ok && r.line && d.go !== false && D().lines[r.line]) { try { Page.go(D().lines[r.line].in, r.line); } catch (e) {} }
  paint(); return entry;
}
async function openDelivery(box) {
  const w = box.keys && box.keys[Lock.deviceId]; if (!w) return null;     // sealed before this device had a key: Claude will send it again
  const k = await myKeys(), raw = await crypto.subtle.decrypt(RSA, k.priv, unb64(w)), aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const d = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv), additionalData: enc.encode("bolw-outside-delivery:" + box.id) }, aes, unb64(box.ct))));
  if (d.format !== "bolw-outside-delivery" || d.id !== box.id || !Array.isArray(d.steps)) throw new Error("not a delivery"); return d;
}
async function checkInbox() {
  const files = await Lock.outside.list(DIR + "inbox"); if (!files.length) return;
  const taken = {}; (await Lock.outside.list(DIR + "done")).forEach(f => { taken[String(f.name).replace(/\.json$/, "")] = 1; });
  for (const f of files.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const id = String(f.name || "").replace(/\.json$/, ""); if (!/^[\w-]{4,60}$/.test(id) || S.done[id] || taken[id]) { if (taken[id] && !S.done[id]) { S.done[id] = "elsewhere"; saveS(); } continue; }
    if (Page.typing && !document.hidden) return;                              // nothing arrives under your fingers
    const text = await Lock.outside.read(f); if (text == null) continue;
    let d; try { const box = JSON.parse(text); if (box.id !== id) throw 0; d = await openDelivery(box); } catch (e) { S.done[id] = "unopened"; saveS(); continue; }
    if (!d) continue;
    if (!(await Lock.outside.claim(DIR + "done/" + id + ".json", JSON.stringify({ format: "bolw-outside-done", v: 1, id, device: Lock.deviceId, at: Date.now() })))) { S.done[id] = "elsewhere"; saveS(); continue; }
    S.done[id] = "added"; saveS(); if (Page.typing && !document.hidden) await new Promise(r => { const t = setInterval(() => { if (!Page.typing || document.hidden) { clearInterval(t); r(); } }, 500); });
    apply(d);
  }
}

/* ---------- the rhythm: after you change something, and every so often ---------- */
async function tick(force) {
  if (busy || !Mods.on("outside") || !Lock.outside.ready) return; busy = true;
  try { await publishKey(); await checkInbox(); if (force || (dirty && Date.now() - S.sent > 20000) || Date.now() - S.sent > 600000) await sendBook(); status = "";
  } catch (e) { status = e.offline ? "Offline. It will catch up when you're back online." : (e.message || String(e)); }
  busy = false; paint();
}
B.on(ev => { if (ev.dry) return; if (ev.type === "action" || ev.type === "undo") dirty = true; });
setInterval(() => { if (!document.hidden && !Page.typing) tick(); }, 15000);
Lock.on(() => { if (!Lock.busy) setTimeout(() => tick(), 300); });
Mods.changed(id => { if (id === "outside" && Mods.on("outside")) tick(true); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });

const label = () => { if (!Mods.on("outside")) return "Off. Claude outside the app can't read or change your book.";
  if (!Lock.outside.ready) return "Waiting for sync: turn sync on (and unlock it) above, then Claude can read and add to your book.";
  if (status) return "Trouble: " + status; return S.sent ? "On. Claude last got a sealed copy of your book at " + new Date(S.sent).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "." : "On. Sending Claude a sealed copy of your book…"; };
if (g.Settings) g.Settings.add({ order: 25, mod: "outside", title: "Claude, outside the app", id: "outside", build(box) {
  const draw = () => { if (!box.isConnected) return;
    const recent = S.log.slice(-5).reverse().map(e => `<div class="rowi"><span class="go"><b>${esc(e.title)}</b><small>${new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${e.ok ? e.moves + " moves" : "didn't fit, nothing added"}</small></span></div>`).join("");
    box.innerHTML = `<p class="nt" id="oLbl">${esc(label())}</p><div class="row"><button id="oNow">Send Claude my book now</button></div>` + (recent ? `<h3>What Claude added</h3><div class="rows">${recent}</div>` : "") +
      `<p class="nt">Claude reads a sealed copy only it can open, and adds to your book with its own hand: it never deletes or rewrites your words, each delivery is one Undo, and its lines are colored like the AI's. Switch it off under Modules at any time.</p>`;
    box.querySelector("#oNow").onclick = () => { dirty = true; tick(true); }; };
  draw(); subs.push(() => { const e = box.querySelector("#oLbl"); if (e && box.isConnected) e.textContent = label(); }); } });

g.Outside = { tick, apply: d => { if (!d || !Array.isArray(d.steps)) throw new Error("not a delivery"); return apply(d); }, get state() { return S; }, label };
})(window);
