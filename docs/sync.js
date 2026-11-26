/* Sync between your devices, through GitHub, locked with your passphrase.
   - Your pages and writing time are encrypted on this device (AES-GCM-256, key made from your
     passphrase with PBKDF2-SHA256, 600,000 rounds) before anything leaves it. GitHub only ever
     stores scrambled text, in the `tol-data` branch, folder `sync/`.
   - Each device writes only its own file (sync/<device id>.json) and reads the others, so two
     devices never overwrite each other. Merging never loses writing: if the same page was changed
     on both, the newer one stays and the other is kept as a page inside it ("Other version …").
   - The passphrase is never stored. The unlocked key stays on this device only.
   - Two files per device. sync/<id>.json is the BASE: this device's whole book. sync/<id>.d.json is the
     DELTA: only what changed since that base (same sealed format, pages/intervals/memory hold just the
     changed ones), so an ordinary save sends a few kilobytes instead of the whole book. When the delta
     grows, the base is written again and the delta starts over. A reader puts a device's base and delta
     together first, then merges. Older versions of the app only read the base; they still work, a bit behind.
   THIS FORMAT IS SACRED: never remove fields, never weaken the encryption, never write plaintext. */
(() => {
  const T = window.TOL;
  if (!T) return;
  const OWNER = "obrianwatson", REPO = "tree-of-life", API = "https://api.github.com";
  const BRANCH = "tol-data", DIR = "sync", META = DIR + "/meta.json";
  const TOKEN_KEY = "tol-gh-token", SYNC_KEY = "tol-sync";
  const ITERATIONS = 600000;
  const st = T.store, esc = T.esc, $ = id => document.getElementById(id);
  const WORDS = "apple anchor arrow autumn badge bakery bamboo banjo barn basket beacon beach bean bear beaver bell berry bicycle birch bird biscuit blanket blossom boat bonfire book boots bottle boulder bowl bracelet branch bread brick bridge brook broom bubble bucket buffalo bugle cabin cactus cake camel camera candle canoe canyon cardinal carpet carrot castle cedar cello chalk cherry chimney cider cinnamon circus citrus clay cliff clock cloud clover coast cobalt coconut coffee comet compass copper coral cotton cougar country cowboy coyote crayon creek cricket crow crystal cupboard curtain cypress daisy dancer dawn desert diamond dolphin donkey dove dragon drum dune eagle earth echo elbow ember emerald engine falcon feather fence fern ferry fiddle field fig finch fire fjord flag flannel flute fog forest fossil fountain fox frost garden garnet geyser ginger glacier globe goose gourd granite grape grass gravel guitar gull hammock harbor harp harvest hawk hazel heron hickory hill hive honey horizon horse hummingbird iceberg igloo indigo iris island ivory ivy jacket jade jaguar jasmine jelly jewel juniper kettle kiwi kite koala ladder lagoon lake lamp lantern lark lava lemon lettuce lighthouse lilac lily lime linen lion lizard llama lobster locket lotus lumber lynx magnet magpie mango maple marble market marsh meadow melon mermaid mesa meteor mint mirror mitten molasses monsoon moon moose mortar moss moth mountain mule mushroom mustard needle nest nickel nutmeg oak oasis oatmeal ocean olive onion opal orange orchard orchid otter owl oyster paddle palm pancake panda paper parrot peach peacock pearl pebble pecan pelican pencil pepper piano pickle pigeon pillow pine pirate plum pocket pony poppy porch potato prairie prism pumpkin quail quarry quartz quill quilt rabbit raccoon radish rain rainbow raven reef ribbon rice ridge river robin rocket rooster rose ruby saddle saffron sage sail salmon sandal sapphire scarf seashell sequoia shadow shore silver sketch sled sloth snail snow sparrow spice spider spoon spring spruce squash squirrel stable star stone storm straw stream sugar summit sun sunflower swan sycamore tangerine tea teapot temple thistle thunder tiger timber toast tomato topaz torch tortoise tower trail train tulip tundra turnip turtle umbrella valley vanilla velvet violet violin volcano wagon walnut walrus wander water wave whale wheat whistle willow window winter wolf wool wren yarn yellow yogurt zebra zephyr zinnia acorn alder almond amber antler apron aspen atlas avocado bagel ballad barley basil bayou bison blizzard bluebell bobcat bramble brass breeze buckle burrow butter button cabbage caramel cargo cashew cattail chapel cheddar chestnut chord cliffside cobble cocoa compost cornfield cove cradle cranberry crocus cuckoo dahlia delta denim dew dinghy driftwood dumpling easel eclipse eggplant elm estuary fable fawn fennel firefly flint foghorn forge freckle gazelle gecko glade gondola gopher grotto guava gumdrop hamlet hatchet haystack hedge hemlock hillside holly hopscotch hornet husky icicle inkwell jasper jigsaw journal kayak kelp kernel keystone lace ladle larch lattice lavender ledger lentil lichen lullaby lupine mallard mandolin manor maize meadowlark mesquite midnight millet minnow mistletoe moccasin monarch mosaic muffin mulberry muslin narwhal nectar nettle nimbus noodle nougat oarlock ocelot octave orbit osprey paisley papaya parsley pasture pavilion peanut pennant peony periwinkle pewter pheasant".split(" ");
  const enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------------- small helpers ---------------- */
  const b64 = buf => { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  const randomId = () => Array.from(rand(8), x => x.toString(16).padStart(2, "0")).join("");
  const normalize = p => (p || "").normalize("NFC").toLowerCase().replace(/[\s\-_.,;:]+/g, " ").trim();  // capitals and spaces don't matter
  const when = t => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  async function sha256(text) { return b64(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
  /* a quick fingerprint of some text (53 bits): only used to tell what changed since this device's base file */
  function quick(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const isMap = (part, v) => !!v && typeof v === "object" && !Array.isArray(v) && part !== "settings";   // a memory part made of records
  const ivKey = i => i ? `${i.start}:${i.end}:${i.device}` : "";
  function indexOf(cur) {            // one fingerprint per page and per memory record (where the cursor sits doesn't count)
    const pages = {}, mem = {}, m = cur.memory || {};
    for (const [id, p] of Object.entries(cur.pages)) pages[id] = quick(JSON.stringify(p && p.cursor ? Object.assign({}, p, { cursor: 0 }) : p));
    for (const [part, v] of Object.entries(m)) {
      if (isMap(part, v)) for (const [k, r] of Object.entries(v)) mem[part + "\n" + k] = quick(JSON.stringify(r));
      else mem[part] = quick(JSON.stringify(v));
    }
    return { pages, mem, ivN: cur.intervals.length, ivTail: ivKey(cur.intervals[cur.intervals.length - 1]) };
  }
  function deltaOf(cur, idx) {       // what's different from the base: changed pages, changed memory records, time entries added since
    if (cur.intervals.length < idx.ivN || ivKey(cur.intervals[idx.ivN - 1]) !== idx.ivTail) return null;   // the time list isn't the base's plus more: start a new base
    const now = indexOf(cur), pages = {}, memory = {}, m = cur.memory || {};
    for (const [id, h] of Object.entries(now.pages)) if (idx.pages[id] !== h) pages[id] = cur.pages[id];
    for (const [k, h] of Object.entries(now.mem)) {
      if (idx.mem[k] === h) continue;
      const i = k.indexOf("\n");
      if (i < 0) memory[k] = m[k]; else { const part = k.slice(0, i); (memory[part] = memory[part] || {})[k.slice(i + 1)] = m[part][k.slice(i + 1)]; }
    }
    return { pages, memory, intervals: cur.intervals.slice(idx.ivN) };
  }
  function overlay(base, delta) {    // one device's base with its newer changes on top = that device's book right now
    const mem = Object.assign({}, base.memory || {});
    for (const [part, v] of Object.entries(delta.memory || {})) mem[part] = isMap(part, v) ? Object.assign({}, mem[part] || {}, v) : v;
    return Object.assign({}, base, delta, { pages: Object.assign({}, base.pages || {}, delta.pages || {}),
                                            intervals: (base.intervals || []).concat(delta.intervals || []), memory: mem });
  }

  let S = Object.assign({ on: false, deviceId: null, deviceName: T.DEVICE, base: {}, seen: {}, mySha: null, lastHash: "", lastSync: 0, salt: null }, st.get(SYNC_KEY, {}));
  if (!S.deviceId) S.deviceId = randomId();
  if (S.appv !== T.APP_VERSION) { S.seen = {}; S.appv = T.APP_VERSION; }   // after an update, read every device's files once more (a newer version may understand more of them)
  const save = () => st.set(SYNC_KEY, S);
  save();
  T.deviceLabel = S.deviceName;

  /* ---------------- the unlocked key, kept in this device's database ---------------- */
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open("tol-vault", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("keys");
        r.onsuccess = () => { this.db = r.result; res(r.result); };
        r.onerror = () => rej(r.error);
      });
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => { const q = fn(db.transaction("keys", mode).objectStore("keys")); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    },
    get(k) { return this.run("readonly", s => s.get(k)); },
    put(k, v) { return this.run("readwrite", s => s.put(v, k)); },
    del(k) { return this.run("readwrite", s => s.delete(k)); }
  };

  /* ---------------- the lock ---------------- */
  async function deriveKey(pass, saltB64, iterations) {
    const base = await crypto.subtle.importKey("raw", enc.encode(normalize(pass)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function sealText(key, text, aad) {
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }
  const seal = (key, obj, aad) => sealText(key, JSON.stringify(obj), aad);
  async function unseal(key, box, aad) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv), additionalData: enc.encode(aad) }, key, unb64(box.ct));
    return JSON.parse(dec.decode(pt));
  }

  /* ---------------- GitHub ---------------- */
  const token = () => st.get(TOKEN_KEY, "");
  const repo = p => `/repos/${OWNER}/${REPO}${p}`;
  async function gh(path, opts = {}) {
    const t = token();
    if (!t) { const e = new Error("NO_TOKEN"); e.noToken = true; throw e; }
    const headers = { "Accept": opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
                      "Authorization": "Bearer " + t, "X-GitHub-Api-Version": "2022-11-28" };
    if (opts.body) headers["Content-Type"] = "application/json";
    let res;
    try { res = await fetch(API + path, { method: opts.method || "GET", body: opts.body, headers, cache: "no-store", keepalive: !!opts.keepalive }); }
    catch (e) { const x = new Error("OFFLINE"); x.offline = true; throw x; }
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const e = new Error((data && data.message) || ("GitHub answered " + res.status)); e.status = res.status;
      if (res.status === 403 || res.status === 429) {
        const after = +res.headers.get("retry-after");
        if (after) e.retryAt = Date.now() + after * 1000;
        else if (res.headers.get("x-ratelimit-remaining") === "0") e.retryAt = (+res.headers.get("x-ratelimit-reset") || 0) * 1000;
        else if (/rate limit/i.test(e.message)) e.retryAt = Date.now() + 60000;
      }
      throw e;
    }
    try { return await (opts.raw ? res.text() : res.json()); }
    catch (e) { const x = new Error("OFFLINE"); x.offline = true; throw x; }   // the answer broke off on the way: a connection problem, try again later
  }
  const q = `?ref=${BRANCH}`;
  async function ensureBranch() {
    if (await gh(repo(`/git/ref/heads/${BRANCH}`), { allow404: true })) return;
    const main = await gh(repo(`/git/ref/heads/main`));
    try { await gh(repo(`/git/refs`), { method: "POST", body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: main.object.sha }) }); }
    catch (e) { if (e.status !== 422) throw e; }   // someone else just made it
  }
  const getMeta = async () => { const t = await gh(repo(`/contents/${META}${q}`), { raw: true, allow404: true }); return t ? JSON.parse(t) : null; };
  const listDir = () => gh(repo(`/contents/${DIR}${q}`), { allow404: true });
  const getRaw = path => gh(repo(`/contents/${path}${q}`), { raw: true });
  /* Exactly the version the list named. It is asked for by its fingerprint and, if GitHub can't give it that way,
     by its path; either way what arrives is CHECKED against the fingerprint (git's own: SHA-1 of "blob <length>\0" +
     the bytes). Anything else (GitHub not caught up with its own list yet, an older copy, a download that broke)
     is "not there yet": nothing is taken from it and it is looked at again next time. */
  async function gitSha(text) {
    const body = enc.encode(text), head = enc.encode(`blob ${body.length}\0`), all = new Uint8Array(head.length + body.length);
    all.set(head); all.set(body, head.length);
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", all)), x => x.toString(16).padStart(2, "0")).join("");
  }
  const LAG = () => Object.assign(new Error("LAG"), { lag: true });
  async function getListed(f) {
    let text;
    try { text = await gh(repo(`/git/blobs/${f.sha}`), { raw: true }); }
    catch (e) {
      if (e.status !== 403 && e.status !== 404 && e.status !== 406 && e.status !== 415) throw e;
      text = await gh(repo(`/contents/${f.path}${q}`), { raw: true, allow404: true });
    }
    if (text == null || (await gitSha(text)) !== f.sha) throw LAG();
    return text;
  }
  const KEEPALIVE_MAX = 60000;       // browsers refuse a closing-app request over 64 KiB
  async function putFile(path, text, sha, keepalive) {
    const body = { message: "Sync (encrypted)", content: b64(enc.encode(text)), branch: BRANCH };
    if (sha) body.sha = sha;
    const json = JSON.stringify(body);
    return gh(repo(`/contents/${path}`), { method: "PUT", body: json, keepalive: !!keepalive && json.length <= KEEPALIVE_MAX });   // too big for a closing-app request: send normally and hope it finishes
  }
  async function putMine(path, text, field, keepalive) {      // write one of this device's own files; S[field] holds its current fingerprint
    let r;
    try { r = await putFile(path, text, S[field], keepalive); }
    catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      S[field] = await currentSha(path);
      r = await putFile(path, text, S[field], keepalive);
    }
    S[field] = r && r.content && r.content.sha;
  }
  async function currentSha(path) { const r = await gh(repo(`/contents/${path}${q}`), { allow404: true }); return r && r.sha; }

  /* ---------------- state ---------------- */
  /* Timing: push ~5 s after you stop typing (at most one write every 15 s, and at least every 60 s
     while you keep typing), push at once when the app is hidden or closed, pull at once when it's
     shown again, and check the other devices every 10 s while it's open (checking never pushes early). */
  const PUSH_AFTER = 5000, MIN_GAP = 15000, MAX_WAIT = 60000, POLL = 10000;
  const DELTA_MAX = 24000, REBASE_GAP = 10 * 60000;   // a delta bigger than this is folded into a fresh base (not more often than every 10 minutes, unless it's half the book)
  let dirtySince = 0, lastWriteAt = 0;
  let key = null, phase = "off", detail = "", running = false, again = false, timer = null, backoff = 0, nextTry = 0, metaOk = false, mode = null, panelMsg = "";
  const canSync = () => !T.SANDBOX && !st.paused && S.on && !!token() && !!key;   // paused: the book is open in another tab

  function label() {
    if (T.SANDBOX) return "Preview: sync off";
    if (!S.on) return "Sync off";
    if (!token()) return "Sync off";
    if (!key) return "Locked — enter passphrase";
    return { syncing: "Syncing…", offline: "Offline — will sync later", error: "Sync problem — will retry", ok: "Synced" }[phase] || "Synced";
  }
  function paint() {
    const p = $("syncPill");
    if (p) { p.hidden = false; p.textContent = label(); p.dataset.state = !S.on || T.SANDBOX ? "off" : !key ? "locked" : phase; p.title = S.lastSync ? "Last synced " + when(S.lastSync) : ""; }
    if ($("settings") && $("settings").open) renderPanel();
  }

  /* ---------------- merging: newest wins, writing is never lost ---------------- */
  function mergeInto(P, I, remote, changed, own) {
    const rname = remote.deviceName || "another device";
    for (const rp of Object.values(remote.pages || {})) {
      if (!rp || !rp.id) continue;
      const lp = P[rp.id], base = S.base[rp.id] || 0;
      // "mine" = what this device itself had when the round began. Once a page has been replaced by another device's
      // version in this round, a third device's older copy of it is just an older copy, not a clash with my writing.
      const mine = !own || own[rp.id] === lp;
      if (!lp) { P[rp.id] = rp; changed.add(rp.id); continue; }
      // where a fold sits in its parent's words moves on its own clock (anchorAt), so typing
      // in a parent never counts as editing the fold itself
      const anchorNewer = (rp.anchorAt || 0) > (lp.anchorAt || 0) ? rp : lp;
      const keepAnchor = node => (!node || node.deleted || node.id !== rp.id || !anchorNewer.anchor || node.anchorAt === anchorNewer.anchorAt) ? node
        : Object.assign({}, node, { anchor: anchorNewer.anchor, anchorAt: anchorNewer.anchorAt });
      if ((rp.updatedAt || 0) === (lp.updatedAt || 0)) {
        const k = keepAnchor(lp); if (k !== lp) { P[rp.id] = k; changed.add(rp.id); }
        continue;
      }
      const remoteNewer = rp.updatedAt > lp.updatedAt;
      const newer = remoteNewer ? rp : lp, older = remoteNewer ? lp : rp;
      const bothChanged = mine && lp.updatedAt > base && rp.updatedAt > base;
      if (bothChanged && !!lp.deleted !== !!rp.deleted) {
        // deleted on one device, written on the other: keep the writing
        const alive = lp.deleted ? rp : lp;
        P[rp.id] = keepAnchor(Object.assign({}, alive, { updatedAt: Math.max(lp.updatedAt, rp.updatedAt) + 1 }));
        changed.add(rp.id); continue;
      }
      if (bothChanged && !lp.deleted && !rp.deleted && (lp.text || "") !== (rp.text || "")) {
        const cid = "cv" + rp.id + "-" + older.updatedAt.toString(36);
        if (!P[cid]) {
          const who = older === lp ? (lp.by || S.deviceName) : (rp.by || rname);
          P[cid] = { id: cid, parentId: rp.id, text: `Other version (${who}, ${when(older.updatedAt)})\n\n${older.text || ""}`,
                     cursor: 0, createdAt: older.updatedAt, updatedAt: newer.updatedAt, by: who };
          changed.add(cid);
        }
      }
      if (remoteNewer) { P[rp.id] = keepAnchor(rp); changed.add(rp.id); }
      else { const k = keepAnchor(P[rp.id]); if (k !== P[rp.id]) { P[rp.id] = k; changed.add(rp.id); } }
    }
    const seen = new Set(I.map(i => `${i.start}:${i.end}:${i.device}`));
    for (const i of remote.intervals || []) {
      const k = `${i.start}:${i.end}:${i.device}`;
      if (!seen.has(k)) { seen.add(k); I.push(i); changed.add("#time"); }
    }
  }

  /* ---------------- one sync ---------------- */
  async function syncNow(reason) {
    if (!canSync()) { paint(); return; }
    if (running) { again = true; return; }
    if ((reason === "interval" || reason === "timer") && Date.now() < nextTry) return;
    running = true; phase = "syncing"; if (reason !== "interval") pushAt = 0; paint();
    try {
      if (!metaOk) {
        const meta = await getMeta();
        if (!meta) { S.on = false; save(); key = null; await idb.del("key").catch(() => {}); panelMsg = "Sync storage was reset. Turn sync on again."; throw Object.assign(new Error("RESET"), { quiet: true }); }
        if (meta.salt !== S.salt) { key = null; await idb.del("key").catch(() => {}); panelMsg = "The passphrase was set up again on another device. Enter it here."; throw Object.assign(new Error("RELOCK"), { quiet: true }); }
        metaOk = true;
      }
      if (notePrefs() && !dirtySince) dirtySince = Date.now();
      const list = (await listDir()) || [];
      const devs = {};                                           // device id → { base: its whole-book file, delta: its changes since }
      for (const f of list) { const m = /^([0-9a-f]{16})(\.d)?\.json$/.exec(f.name || ""); if (m) (devs[m[1]] = devs[m[1]] || {})[m[2] ? "delta" : "base"] = f; }
      const data = T.data();
      const P = Object.assign({}, data.pages), I = data.intervals.slice();
      const M = JSON.parse(JSON.stringify(data.memory || {}));   // memory practice: prompts, settings, review history
      const changed = new Set();
      let spot = null, prefs = null;
      const mine = devs[S.deviceId] || {}; delete devs[S.deviceId];
      if (Date.now() - lastWriteAt > 30000) {                    // (right after a write, what we just wrote is the truth; the list can lag a moment)
        S.mySha = mine.base ? mine.base.sha : null; S.myDeltaSha = mine.delta ? mine.delta.sha : null;
      }
      // Reading one file. Trouble reaching GitHub stops the round (it is tried again later). A file that arrives but
      // can't be opened is "bad": it is skipped, looked at again next time (three tries a session), and never a
      // reason to lock this device as long as the key still opens the vault.
      const BAD = () => Object.assign(new Error("BADFILE"), { bad: true });
      const open = async (f, aad) => {
        const text = await getListed(f);
        let box; try { box = JSON.parse(text); } catch (e) { throw BAD(); }
        if (!box || box.format !== "tol-sealed") throw BAD();
        try { return await unseal(key, box, aad); } catch (e) { throw BAD(); }
      };
      let unread = 0, waiting = 0;
      for (const [id, d] of Object.entries(devs)) {
        // a delta that didn't belong to the listed base is remembered together with that base ("delta@base"):
        // it is looked at again as soon as the listed base changes (GitHub's list can show the base a moment late)
        const newBase = !!d.base && S.seen[id] !== d.base.sha,
              newDelta = !!d.delta && S.seen[id + ".d"] !== d.delta.sha && S.seen[id + ".d"] !== d.delta.sha + "@" + (d.base ? d.base.sha : "");
        if (!newBase && !newDelta) continue;
        let base = null, delta = null, bad = false;
        const read = async (f, aad) => {
          if ((badTries[f.sha] || 0) >= 3) { bad = true; return null; }                   // already tried three times this session
          try { return await open(f, aad); }
          catch (e) {
            if (e.lag) { lagTries[f.sha] = (lagTries[f.sha] || 0) + 1; if (lagTries[f.sha] > 6) { badTries[f.sha] = 3; bad = true; } else waiting++; return null; }   // not there yet: look again next time
            if (!e.bad) throw e;
            if (!(await keyStillOpens())) throw Object.assign(new Error("LOCK"), { name: "OperationError" });   // the passphrase really was changed
            badTries[f.sha] = (badTries[f.sha] || 0) + 1; bad = true; return null;
          }
        };
        if (newBase) base = await read(d.base, "tol-state:" + id);
        if (newDelta && !(newBase && !base)) delta = await read(d.delta, "tol-state:" + id + ":delta");   // (changes without the base they belong to wait for it)
        if (bad) unread++;
        const other = !!delta && !!d.base && !!delta.baseSha && delta.baseSha !== d.base.sha;
        if (other) delta = null;                                 // not for the listed base: left over from an older base (the new base holds it all), or the list is a moment behind
        const remote = base && delta ? overlay(base, delta) : (base || delta);
        if (remote) {
          mergeInto(P, I, remote, changed, data.pages);
          if (remote.memory && T.mergeMemory && T.mergeMemory(M, remote.memory)) changed.add("#memory");
          if (remote.spot && remote.spot.id && (!spot || remote.spot.at > spot.at)) spot = remote.spot;
          if (remote.prefs && (remote.prefs.at || 0) > (prefs ? prefs.at : 0)) prefs = remote.prefs;
        }
        if (base) S.seen[id] = d.base.sha;                       // only what was really read counts as seen
        if (other || delta) S.seen[id + ".d"] = other ? d.delta.sha + "@" + d.base.sha : d.delta.sha;
      }
      if (waiting) setTimeout(() => { if (!running) syncNow("timer"); }, 3000);     // something wasn't there yet: look again in a moment rather than at the next 10 s check
      detail = unread ? `${unread} synced file${unread === 1 ? "" : "s"} from another device couldn't be read and ${unread === 1 ? "was" : "were"} skipped.` : "";
      if (changed.size) T.replaceData(P, I, changed, changed.has("#memory") ? M : null);
      if (prefs && prefs.at > (S.prefsAt || 0)) { T.applyPrefs(prefs); S.prefsJson = JSON.stringify(T.getPrefs()); S.prefsAt = prefs.at; }
      if (reason === "resume" && spot && spot.at > (T.lastSpot().at || 0)) T.goTo(spot.id, spot.cursor, spot.at, spot);
      if (dirtySince || !S.mySha) {
        const background = reason === "timer" || reason === "interval";
        if (reason === "interval" && S.mySha && pushAt > Date.now()) { /* a push is already planned; checking the other devices doesn't bring it forward */ }
        else if (background && S.mySha && Date.now() - lastWriteAt < MIN_GAP) changedSoon();   // too soon after the last write; it'll go shortly
        else await writeMine(false);
      }
      const after = T.data().pages;
      S.base = {}; for (const p of Object.values(after)) S.base[p.id] = p.updatedAt || 0;
      S.lastSync = Date.now(); phase = "ok"; backoff = 0; nextTry = 0;
    } catch (e) {
      if (e.quiet) phase = "error";
      else if (e.offline) { phase = "offline"; }
      else if (e.name === "OperationError") { key = null; await idb.del("key").catch(() => {}); panelMsg = "This device's passphrase no longer opens the synced pages. Enter it again."; phase = "error"; }
      else { phase = "error"; detail = e.message || ""; if (e.status === 401) panelMsg = "GitHub didn't accept the key. Make a new one and save it below."; }
      backoff = Math.min(backoff ? backoff * 2 : 15000, 300000);
      nextTry = e.retryAt ? e.retryAt : Date.now() + backoff;
      if (!e.quiet) schedule(Math.max(5000, nextTry - Date.now()));
    } finally {
      running = false; save(); paint();
      if (again) { again = false; schedule(1500); }
    }
  }

  /* What this device's base file on GitHub holds (fingerprints), kept in this device's database.
     Unknown or out of date → null → the next write is a whole new base. */
  const badTries = {}, lagTries = {};   // file fingerprint → how many times it arrived but couldn't be opened / wasn't the listed version yet, this session
  let baseIdx;
  async function baseIndex() {
    if (baseIdx === undefined) { try { baseIdx = (await idb.get("base")) || null; } catch (e) { baseIdx = null; } }
    const x = baseIdx;
    return x && x.v === 1 && x.deviceId === S.deviceId && x.salt === S.salt && S.mySha && x.sha === S.mySha && x.pages && x.mem ? x : null;
  }
  async function keyStillOpens() {   // does this device's key still open the vault? (then a file that won't open is just a bad file)
    try { const meta = await getMeta(); if (!meta || meta.salt !== S.salt) { metaOk = false; return false; } return (await unseal(key, meta.check, "tol-check")) === "tree-of-life"; }
    catch (e) { if (e.name === "OperationError") return false; throw e; }
  }
  let writing = null;                // the write that is under way, if any (one at a time: two at once would write the same file twice)
  function writeMine(keepalive) {
    const p = (writing || Promise.resolve()).catch(() => {}).then(() => writeOnce(keepalive));
    writing = p; p.catch(() => {}).then(() => { if (writing === p) writing = null; });
    return p;
  }
  async function writeOnce(keepalive) {
    const cur = T.data(), spot = T.lastSpot();
    const prefs = Object.assign(T.getPrefs(), { at: S.prefsAt || 0 });
    const fingerprint = await sha256(JSON.stringify([cur.pages, cur.intervals, spot.id, spot.cursor, spot.node, spot.pos, S.deviceName, prefs, cur.memory || {}]));
    if (fingerprint === S.lastHash && S.mySha) { dirtySince = 0; return; }
    const idx = await baseIndex();
    // from here to the sealing there is no waiting, so what is sealed and what is fingerprinted are the same instant
    const now = Date.now();
    const head = { format: "tol-state", v: 1, deviceId: S.deviceId, deviceName: S.deviceName, savedAt: now, spot, prefs };
    let d = idx ? deltaOf(cur, idx) : null, plain = "";
    if (d) {
      plain = JSON.stringify(Object.assign({}, head, { kind: "delta", baseSha: idx.sha, pages: d.pages, intervals: d.intervals, memory: d.memory }));
      if (!keepalive && plain.length > DELTA_MAX && (now - (idx.at || 0) > REBASE_GAP || plain.length * 2 > (idx.size || 0))) d = null;   // grown too big: fold it into a fresh base
    }
    if (d) {
      const box = await sealText(key, plain, "tol-state:" + S.deviceId + ":delta");
      await putMine(`${DIR}/${S.deviceId}.d.json`, JSON.stringify({ format: "tol-sealed", v: 1, kind: "delta", iv: box.iv, ct: box.ct, updatedAt: now }), "myDeltaSha", keepalive);
    } else {
      plain = JSON.stringify(Object.assign({}, head, { pages: cur.pages, intervals: cur.intervals,
                                                       memory: cur.memory || {} }));   // added field: memory practice (prompts, settings, review history)
      const next = Object.assign(indexOf(cur), { v: 1, deviceId: S.deviceId, salt: S.salt, at: now, size: plain.length });
      const box = await sealText(key, plain, "tol-state:" + S.deviceId);
      baseIdx = null;                                           // until the new base is safely up, nothing is known about it
      await putMine(`${DIR}/${S.deviceId}.json`, JSON.stringify({ format: "tol-sealed", v: 1, iv: box.iv, ct: box.ct, updatedAt: now }), "mySha", keepalive);
      next.sha = S.mySha; baseIdx = next; S.baseAt = now;
      idb.put("base", next).catch(() => {});                  // (if this can't be kept, the next session simply starts with a new base)
    }
    S.lastHash = fingerprint;
    lastWriteAt = Date.now(); dirtySince = 0; pushAt = 0;
  }

  /* design + writing settings: newest wins across devices */
  const DEFAULT_PREFS = JSON.stringify({ theme: {}, looks: [], pause: 4, goal: 5 });
  function notePrefs() {
    const cur = JSON.stringify(T.getPrefs());
    if (S.prefsJson === undefined) { S.prefsJson = cur; S.prefsAt = cur === DEFAULT_PREFS ? 0 : Date.now(); save(); return false; }
    if (cur !== S.prefsJson) { S.prefsJson = cur; S.prefsAt = Date.now(); save(); return true; }
    return false;
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => syncNow("timer"), Math.max(0, ms)); }
  let pushAt = 0;
  function changedSoon(e) {
    if (!canSync()) return;
    const now = Date.now();
    if (e && e.detail === "prefs") notePrefs();
    if (e && e.detail === "time" && pushAt > now) return;     // a clock save rides along with the push already planned
    if (!dirtySince) dirtySince = now;
    const wait = Math.max(Math.min(PUSH_AFTER, dirtySince + MAX_WAIT - now), lastWriteAt + MIN_GAP - now);
    pushAt = now + wait;
    schedule(wait);
  }
  let flushing = false;
  function flush() {          // the app is being hidden or closed: send what's new right now
    if (!canSync() || flushing || (!dirtySince && S.mySha)) return;
    flushing = true;
    writeMine(true).then(save).catch(() => {}).finally(() => { flushing = false; });
  }

  /* ---------------- turning it on ---------------- */
  async function setUp(pass) {
    await ensureBranch();
    if (await getMeta()) { mode = "join"; panelMsg = "Sync is already set up on another device. Enter that same passphrase."; renderPanel(); return; }
    const salt = b64(rand(16));
    const k = await deriveKey(pass, salt, ITERATIONS);
    const meta = { format: "tol-vault", version: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt, check: await seal(k, "tree-of-life", "tol-check") };
    try { await putFile(META, JSON.stringify(meta, null, 1), null); }
    catch (e) { if (e.status === 422 || e.status === 409) { mode = "join"; panelMsg = "Another device just set up sync. Enter that same passphrase."; renderPanel(); return; } throw e; }
    await finishUnlock(k, salt, "Sync is on. Now open the Book of Living Waters on your other device: Settings → Sync → Turn on sync, and type the same passphrase.");
  }
  async function join(pass) {
    const meta = await getMeta();
    if (!meta) { mode = "setup"; panelMsg = "Sync isn't set up yet. Choose a passphrase to start."; renderPanel(); return; }
    const k = await deriveKey(pass, meta.salt, meta.iterations || ITERATIONS);
    try { if ((await unseal(k, meta.check, "tol-check")) !== "tree-of-life") throw 0; }
    catch (e) { panelMsg = "That passphrase doesn't match the one you chose on your other device. Nothing was changed."; renderPanel(); return; }
    await finishUnlock(k, meta.salt, "Unlocked. Your pages are syncing.");
  }
  async function finishUnlock(k, salt, msg) {
    key = k; await idb.put("key", { salt, key: k }).catch(() => {});
    if (S.salt !== salt) { S.seen = {}; S.mySha = null; S.myDeltaSha = null; S.lastHash = ""; S.base = {}; baseIdx = null; }
    S.on = true; S.salt = salt; metaOk = true; save();
    mode = null; panelMsg = msg; renderPanel();
    syncNow("resume");
  }
  async function turnOff() {
    key = null; S.on = false; metaOk = false; save(); clearTimeout(timer);
    await idb.del("key").catch(() => {});
    panelMsg = "Sync is off on this device. Your pages stay here, and on GitHub (locked)."; renderPanel(); paint();
  }

  /* ---------------- passphrase help ---------------- */
  function suggest() { const n = new Uint32Array(6); crypto.getRandomValues(n); return Array.from(n, x => WORDS[x % WORDS.length]).join(" "); }
  function strength(p) {
    const s = normalize(p), words = s ? s.split(" ").length : 0;
    if (words >= 5 || s.length >= 28) return ["Strong", true];
    if (words >= 4 || s.length >= 18) return ["OK — five or six words is stronger", true];
    return ["Too weak — use at least four words (five or six is best)", false];
  }

  /* ---------------- the Sync section in Settings ---------------- */
  function renderPanel() {
    const a = $("syncArea"); if (!a) return;
    const msg = panelMsg ? `<p class="msg" style="margin:8px 0 0">${esc(panelMsg)}</p>` : "";
    if (T.SANDBOX) { a.innerHTML = `<small>Sync is off while you're trying a preview. Your real app keeps syncing.</small>`; return; }
    if (!token()) { a.innerHTML = `<small>Sync uses the same GitHub key as Claude Code. Add that key below first, then come back here.</small>${msg}`; return; }
    if (mode === "busy") { a.innerHTML = `<small>Working… (making the lock takes a few seconds)</small>`; return; }
    if (mode === "setup") {
      a.innerHTML = `<small>Choose a passphrase. You'll type it once on each device. Five or six random words is best; capitals and spaces don't matter.</small>
        <input type="password" id="sp1" placeholder="Passphrase" autocomplete="new-password" autocapitalize="none">
        <input type="password" id="sp2" placeholder="Type it again" autocomplete="new-password" autocapitalize="none">
        <small id="spStrength"></small>
        <div class="row" style="margin-top:6px"><button class="btn" id="spSuggest">Suggest one</button><button class="btn primary" id="spGo">Turn on sync</button><button class="btn ghost" id="spCancel">Cancel</button></div>
        <p class="msg" id="spShow" style="margin:8px 0 0"></p>
        <small><b>Write it down somewhere safe.</b> If you forget it, nobody can unlock the copy on GitHub — not even Claude.</small>${msg}`;
      const upd = () => { $("spStrength").textContent = $("sp1").value ? "Strength: " + strength($("sp1").value)[0] : ""; };
      $("sp1").oninput = upd;
      $("spSuggest").onclick = () => { const s = suggest(); $("sp1").value = s; $("sp2").value = s; $("spShow").textContent = "Your passphrase: " + s + " — write it down now."; upd(); };
      $("spCancel").onclick = () => { mode = null; panelMsg = ""; renderPanel(); };
      $("spGo").onclick = () => {
        const p1 = $("sp1").value, p2 = $("sp2").value;
        if (normalize(p1) !== normalize(p2)) { panelMsg = "The two don't match. Type them again."; renderPanel(); return; }
        if (!strength(p1)[1]) { panelMsg = "That passphrase is too easy to guess. Use at least four words, or tap Suggest one."; renderPanel(); return; }
        run(() => setUp(p1));
      };
      return;
    }
    if (mode === "join" || (S.on && !key)) {
      a.innerHTML = `<small>${S.on ? "This device is locked." : ""} Type the passphrase you chose on your other device.</small>
        <input type="password" id="jp" placeholder="Passphrase" autocomplete="current-password" autocapitalize="none">
        <div class="row" style="margin-top:6px"><button class="btn primary" id="jpGo">Unlock</button>${S.on ? `<button class="btn ghost" id="jpOff">Turn off on this device</button>` : `<button class="btn ghost" id="jpCancel">Cancel</button>`}</div>${msg}`;
      $("jpGo").onclick = () => { const p = $("jp").value; if (!p.trim()) return; run(() => join(p)); };
      if ($("jpOff")) $("jpOff").onclick = turnOff;
      if ($("jpCancel")) $("jpCancel").onclick = () => { mode = null; panelMsg = ""; renderPanel(); };
      return;
    }
    if (!S.on) {
      a.innerHTML = `<small>Keep your pages and writing time the same on your iPhone and laptop. Your writing is locked with a passphrase before it leaves this device, so GitHub only stores scrambled text.</small>
        <div class="row" style="margin-top:6px"><button class="btn primary" id="syncOn">Turn on sync</button></div>${msg}`;
      $("syncOn").onclick = () => run(async () => { await ensureBranch(); mode = (await getMeta()) ? "join" : "setup"; panelMsg = ""; renderPanel(); });
      return;
    }
    a.innerHTML = `<div><b>${esc(label())}</b>${S.lastSync ? ` <small style="display:inline">· last synced ${esc(when(S.lastSync))}</small>` : ""}</div>${phase === "ok" && detail ? `<small>${esc(detail)}</small>` : ""}
      <div class="row" style="margin-top:6px;align-items:center"><input type="text" id="devName" value="${esc(S.deviceName)}" aria-label="This device's name" style="flex:1 1 140px;margin:0"><button class="btn" id="devSave">Rename device</button></div>
      <div class="row" style="margin-top:6px"><button class="btn" id="syncNowBtn">Sync now</button><button class="btn ghost" id="syncOff">Turn off on this device</button></div>${msg}`;
    $("syncNowBtn").onclick = () => { panelMsg = ""; syncNow("now"); };
    $("syncOff").onclick = turnOff;
    $("devSave").onclick = () => { const n = $("devName").value.trim().slice(0, 30); if (n) { S.deviceName = n; T.deviceLabel = n; save(); panelMsg = "Renamed."; syncNow("timer"); renderPanel(); } };
  }
  async function run(fn) {
    const prev = mode; mode = "busy"; panelMsg = ""; renderPanel();
    try { await fn(); if (mode === "busy") mode = prev === "busy" ? null : prev; }
    catch (e) { mode = prev === "busy" ? null : prev; panelMsg = e.offline ? "Couldn't reach GitHub. Check the internet connection and try again."
      : e.noToken ? "Add your GitHub key first." : e.status === 401 ? "GitHub didn't accept the key." : e.status === 403 || e.status === 404 ? "The GitHub key can't reach the tree-of-life project. Check it has Contents: Read and write."
      : "Something went wrong: " + (e.message || e); }
    renderPanel(); paint();
  }

  /* ---------------- wiring ---------------- */
  $("settingsBtn").addEventListener("click", () => { panelMsg = ""; renderPanel(); });
  if ($("syncPill")) $("syncPill").onclick = () => { $("settingsBtn").click(); };
  document.addEventListener("tol:changed", changedSoon);
  setInterval(() => { if (!document.hidden && canSync() && !running) syncNow("interval"); }, POLL);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); else if (canSync()) syncNow("resume"); });
  window.addEventListener("blur", flush);
  window.addEventListener("focus", () => { if (canSync() && Date.now() - S.lastSync > 1500) syncNow("resume"); });
  window.addEventListener("online", () => { if (canSync()) syncNow("resume"); });
  window.addEventListener("pagehide", flush);

  (async () => {
    if (!T.SANDBOX && S.on) {
      try { const rec = await idb.get("key"); if (rec && rec.salt === S.salt) key = rec.key; } catch (e) {}
    }
    paint();
    if (canSync()) syncNow("resume");
  })();
  window.__tolSync = { normalize, strength, suggest, syncNow: r => syncNow(r || "resume"), state: () => ({ phase, on: S.on, locked: !key, label: label(), running, dirtySince, lastWriteAt, nextTry, pushAt, detail, mySha: S.mySha, myDeltaSha: S.myDeltaSha, baseAt: S.baseAt || 0,
                                       seen: Object.assign({}, S.seen), lagging: Object.keys(lagTries).length }),
                       _quick: quick, _indexOf: indexOf, _deltaOf: deltaOf, _overlay: overlay, _newBase: () => { baseIdx = null; } };
})();
