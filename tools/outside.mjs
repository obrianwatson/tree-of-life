#!/usr/bin/env node
/* tools/outside.mjs · CLAUDE OUTSIDE THE APP: reading and writing the writer's book, sealed.

   The writer can let Claude (working outside the app, in a coding session) read and write his book:
   Settings → Modules → "Claude, outside the app" (docs/core/outside.js). Then:
   - each device publishes a PUBLIC key (core/outside/keys/<device>.json on tol-data); its private key never leaves it;
   - each device seals a copy of its book for Claude (core/outside/books/<device>.json): a fresh AES-GCM-256 key,
     wrapped with Claude's public key (docs/core/outside-key.json, RSA-OAEP-256). Only Claude's private key opens it;
   - Claude sends DELIVERIES (core/outside/inbox/<id>.json): plain steps (the same steps as the writer's ;commands),
     sealed for every device's public key. A device opens one, claims it (core/outside/done/<id>.json), and runs it
     with Claude's own hand: it adds and arranges, never deletes or rewrites his words, and is one Undo.
   Claude's private key lives ONLY outside the repository (default ~/.bolw-outside/claude-private.jwk).

   Local (no network, used by the tests too):
     node tools/outside.mjs keygen [publicOut] [privateOut]
     node tools/outside.mjs open <sealed book file> [privateKey]              → the book as JSON on stdout
     node tools/outside.mjs seal <delivery.json> <device key files…>          → a sealed delivery on stdout
   With the repository (fetches / pushes branch tol-data):
     node tools/outside.mjs read [device]                                      → prints the newest book as text, saves its JSON
     node tools/outside.mjs send <delivery.json>                               → seals for every device and pushes to the inbox */
import { webcrypto as C } from "node:crypto";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { execFileSync } from "node:child_process";
const subtle = C.subtle, enc = new TextEncoder(), dec = new TextDecoder();
const b64 = b => Buffer.from(b).toString("base64"), unb64 = s => new Uint8Array(Buffer.from(s, "base64"));
const HOME = process.env.BOLW_OUTSIDE_HOME || path.join(os.homedir(), ".bolw-outside");
const PRIV = process.env.BOLW_OUTSIDE_KEY || path.join(HOME, "claude-private.jwk");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const RSA = { name: "RSA-OAEP", hash: "SHA-256" };

async function keygen(pubOut, privOut) {
  const kp = await subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const pub = await subtle.exportKey("jwk", kp.publicKey), priv = await subtle.exportKey("jwk", kp.privateKey);
  fs.mkdirSync(path.dirname(privOut), { recursive: true }); fs.writeFileSync(privOut, JSON.stringify(priv), { mode: 0o600 });
  fs.writeFileSync(pubOut, JSON.stringify({ format: "bolw-outside-key", v: 1, who: "Claude, outside the app", made: new Date().toISOString(), key: { kty: pub.kty, n: pub.n, e: pub.e, alg: pub.alg, ext: true } }, null, 1) + "\n");
}
const privKey = async file => subtle.importKey("jwk", JSON.parse(fs.readFileSync(file || PRIV, "utf8")), RSA, false, ["decrypt"]);
const pubKey = async jwk => subtle.importKey("jwk", jwk, RSA, false, ["encrypt"]);

/* a sealed box: { k: the AES key wrapped with RSA-OAEP, iv, ct }   (AAD names what it is, so a box can't be passed off as another) */
async function openBox(box, priv, aad) {
  const raw = await subtle.decrypt(RSA, priv, unb64(box.k)), k = await subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  return JSON.parse(dec.decode(await subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv), additionalData: enc.encode(aad) }, k, unb64(box.ct))));
}
async function sealFor(obj, pubs, aad) {          // one AES key, wrapped once for each device
  const raw = C.getRandomValues(new Uint8Array(32)), k = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]), iv = C.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, k, enc.encode(JSON.stringify(obj))), keys = {};
  for (const [dev, jwk] of Object.entries(pubs)) keys[dev] = b64(await subtle.encrypt(RSA, await pubKey(jwk), raw));
  return { iv: b64(iv), ct: b64(ct), keys };
}
async function openBook(file, priv) {
  const box = JSON.parse(fs.readFileSync(file, "utf8")); if (box.format !== "bolw-outside-book") throw new Error("That isn't a sealed book.");
  return openBox(box, await privKey(priv), "bolw-outside-book:" + box.deviceId);
}
async function sealDelivery(file, keyFiles) {
  const d = JSON.parse(fs.readFileSync(file, "utf8")); d.format = "bolw-outside-delivery"; d.v = 1; d.id = d.id || ("d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)); d.at = d.at || Date.now();
  if (!Array.isArray(d.steps) || !d.steps.length) throw new Error("A delivery needs steps.");
  const pubs = {}; keyFiles.forEach(f => { const k = JSON.parse(fs.readFileSync(f, "utf8")); if (k.format === "bolw-outside-device" && k.deviceId && k.key) pubs[k.deviceId] = k.key; });
  if (!Object.keys(pubs).length) throw new Error("No device keys: the writer hasn't switched on “Claude, outside the app” on any device yet.");
  const box = await sealFor(d, pubs, "bolw-outside-delivery:" + d.id);
  return { format: "bolw-outside-inbox", v: 1, id: d.id, at: d.at, iv: box.iv, ct: box.ct, keys: box.keys };
}

/* ---------- with the repository: branch tol-data, folder core/outside/ ---------- */
const git = (args, o) => execFileSync("git", ["-C", ROOT].concat(args), Object.assign({ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }, o || {}));
function fetchData() { git(["fetch", "--depth=1", "origin", "+refs/heads/tol-data:refs/remotes/origin/tol-data"]); }
const list = dir => { try { return git(["ls-tree", "--name-only", "origin/tol-data", dir + "/"]).split("\n").filter(Boolean); } catch (e) { return []; } };
const show = p => git(["show", "origin/tol-data:" + p], { maxBuffer: 1 << 28 });
function bookAsText(D) {
  const out = [], seen = {}; const title = id => id === D.trunk ? "Trunk" : ((D.lines[(D.leaves[id] || {}).parent] || {}).text || "Untitled");
  const walk = (id, pad) => { const lf = D.leaves[id]; if (!lf || seen[id]) return; seen[id] = 1; lf.lines.forEach(l => { const L = D.lines[l]; if (!L) return; const p = pad + "    ".repeat(L.d || 0);
    out.push(p + L.text + (L.by && L.by !== "me" ? "   [" + L.by + "]" : "") + "   ⟨" + L.id + "⟩"); if (L.leaf && D.leaves[L.leaf]) { out.push(p + "    ── leaf ⟨" + L.leaf + "⟩"); walk(L.leaf, p + "    "); } }); };
  walk(D.trunk, ""); const names = Object.keys(D.names || {}); const folds = Object.values(D.folds || {}).filter(f => f.name).map(f => "  " + f.name + " (in " + title(f.leaf) + ")");
  return out.join("\n") + (folds.length ? "\n\nNAMED FOLDS\n" + folds.join("\n") : "") + (names.length ? "\n\nNAMES: " + names.join(", ") : "");
}
async function readBook(want) {
  fetchData(); const files = list("core/outside/books").filter(f => f.endsWith(".json")); if (!files.length) throw new Error("No sealed book yet: the writer hasn't switched on “Claude, outside the app”, or that device hasn't synced since.");
  let best = null; for (const f of files) { const box = JSON.parse(show(f)); if (want && box.deviceId !== want) continue; if (!best || box.savedAt > best.savedAt) best = box; }
  if (!best) throw new Error("No sealed book from that device.");
  const st = await openBox(best, await privKey(), "bolw-outside-book:" + best.deviceId); fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(path.join(HOME, "book.json"), JSON.stringify(st)); return st;
}
async function send(file) {
  fetchData(); const keys = list("core/outside/keys").filter(f => f.endsWith(".json")), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bolw-out-"));
  const kf = keys.map(f => { const p = path.join(tmp, path.basename(f)); fs.writeFileSync(p, show(f)); return p; });
  const sealed = await sealDelivery(file, kf), dest = "core/outside/inbox/" + sealed.id + ".json";
  const wt = path.join(tmp, "wt"); git(["worktree", "add", "--detach", wt, "origin/tol-data"]);
  try {
    const W = a => execFileSync("git", ["-C", wt].concat(a), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    fs.mkdirSync(path.join(wt, "core/outside/inbox"), { recursive: true }); fs.writeFileSync(path.join(wt, dest), JSON.stringify(sealed));
    W(["add", dest]); W(["-c", "user.name=Claude (outside the app)", "-c", "user.email=noreply@anthropic.com", "commit", "-q", "-m", "Delivery (sealed)"]);
    for (let i = 0; i < 4; i++) { try { W(["-c", "push.negotiate=true", "push", "-q", "origin", "HEAD:refs/heads/tol-data"]); return sealed.id; }
      catch (e) { W(["fetch", "--depth=1", "origin", "+refs/heads/tol-data:refs/remotes/origin/tol-data"]); W(["rebase", "-q", "origin/tol-data"]); } }
    throw new Error("Couldn't push the delivery.");
  } finally { try { git(["worktree", "remove", "--force", wt]); } catch (e) {} }
}

const [cmd, ...a] = process.argv.slice(2);
try {
  if (cmd === "keygen") await keygen(a[0] || path.join(ROOT, "docs/core/outside-key.json"), a[1] || PRIV);
  else if (cmd === "open") process.stdout.write(JSON.stringify(await openBook(a[0], a[1])));
  else if (cmd === "seal") process.stdout.write(JSON.stringify(await sealDelivery(a[0], a.slice(1))));
  else if (cmd === "read") { const st = await readBook(a[0]); console.log("From device " + st.deviceId + " · saved " + new Date(st.savedAt).toLocaleString() + (st.where ? " · open leaf ⟨" + st.where + "⟩" : "") + "\n"); console.log(bookAsText(st.book)); }
  else if (cmd === "send") console.log("Sent delivery " + (await send(a[0])));
  else { console.log("keygen | open <file> | seal <delivery> <keys…> | read [device] | send <delivery>"); process.exit(2); }
} catch (e) { console.error(e.message || e); process.exit(1); }
