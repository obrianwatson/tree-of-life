/* Check this device: one tap in Settings runs a set of quick checks on THIS device (the things automatic
   tests on other machines can't know) and shows a short report you can copy, or send to Claude through
   GitHub. The report never contains your writing: only yes/no results, counts, sizes and the browser's name.
   Nothing here changes your pages or your writing time. */
(() => {
  const T = window.TOL; if (!T) return;
  const $ = id => document.getElementById(id), esc = T.esc;
  const errs = [];                                     // errors seen since the book opened
  addEventListener("error", e => { if (errs.length < 20) errs.push(String(e.message || "error").slice(0, 140)); });
  addEventListener("unhandledrejection", e => { if (errs.length < 20) errs.push(String((e.reason && e.reason.message) || e.reason || "rejected").slice(0, 140)); });
  const kb = n => n < 1000 ? n + " B" : n < 1e6 ? Math.round(n / 1000) + " KB" : (n / 1e6).toFixed(2) + " MB";
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " took too long")), ms))]);

  async function run() {
    const R = [], add = (name, ok, detail) => R.push({ name, ok, detail: detail || "" });   // ok: true = fine, false = needs a look, null = just information
    const B = window.__bolwBoot || {};
    add("App version", true, `${T.APP_VERSION} · running ${B.origin === "onboard" ? (B.label || "an onboard version") : "the published version"}${B.safe ? " (safe mode)" : ""}${B.fell ? " · fell back from a version that didn't start" : ""}`);
    add("Device", null, `${T.DEVICE} · ${navigator.userAgent.replace(/\s+/g, " ").slice(0, 160)} · ${innerWidth}×${innerHeight} · ${(matchMedia("(display-mode: standalone)").matches || navigator.standalone) ? "opened from the Home Screen" : "opened in a browser tab"}`);

    // the small text storage the book lives in
    try { const k = "tol-check-probe", v = String(Date.now()); localStorage.setItem(k, v); const back = localStorage.getItem(k); localStorage.removeItem(k); add("Saving on this device", back === v && !Object.keys(T.store.bad).length, Object.keys(T.store.bad).length ? "a save failed a moment ago" : "works"); }
    catch (e) { add("Saving on this device", false, "blocked: " + e.message); }
    const u = T.storageUse(), pct = Math.round(100 * u.total / u.limit);
    const top = Object.entries(u.parts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${kb(n)}`).join(", ");
    add("Storage in use", pct < 70, `${kb(u.total)}, about ${pct}% of what this device can hold (${top})`);

    // the bigger database: safety copies, the app's own versions, the sync key
    try {
      await withTimeout(new Promise((res, rej) => { const r = indexedDB.open("bolw-check-probe", 1); r.onupgradeneeded = () => r.result.createObjectStore("s"); r.onerror = () => rej(r.error);
        r.onsuccess = () => { const db = r.result, tx = db.transaction("s", "readwrite"); tx.objectStore("s").put("x", "k"); tx.oncomplete = () => { db.close(); indexedDB.deleteDatabase("bolw-check-probe"); res(); }; tx.onerror = () => rej(tx.error); }; }), 5000, "the database");
      add("The bigger database", true, "works");
    } catch (e) { add("The bigger database", false, "not available (" + e.message + "): no safety copies, and the app can't keep its own versions"); }
    if (T.safe && !T.safe.off) {
      try { const L = (await T.safe.list()).filter(m => m.key.startsWith("day:")), D = await T.safe.trash();
        add("Safety copies", L.length > 0, L.length ? `${L.length} day${L.length === 1 ? "" : "s"} kept, newest ${new Date(L[0].at).toLocaleString()} · ${D.length} in Recently deleted` : "none yet (the first is made a few seconds after you write)"); }
      catch (e) { add("Safety copies", false, e.message); }
    }
    if (navigator.storage && navigator.storage.persisted) { try { add("Storage kept by the browser", null, (await navigator.storage.persisted()) ? "yes: the browser won't clear it on its own" : "not promised (normal). Sync or exports are the real backup"); } catch (e) {} }

    // the locks sync needs
    try {
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(16), iterations: 1000 }, await crypto.subtle.importKey("raw", new TextEncoder().encode("check"), "PBKDF2", false, ["deriveKey"]), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("living waters"));
      add("Encryption", new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct)) === "living waters", "works");
    } catch (e) { add("Encryption", false, "not available: " + e.message); }

    // opening without internet
    try {
      const sw = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const names = window.caches ? (await caches.keys()).filter(k => k.startsWith("tol-")) : [];
      const n = names.length ? (await (await caches.open(names[names.length - 1])).keys()).length : 0;
      const vault = window.__bolwVault ? (await (await window.__bolwVault()).all()).length : 0;
      add("Opens without internet", !!(sw && sw.active) && vault > 0, `${sw && sw.active ? "offline helper on" : "offline helper not on yet (open the book once more while online)"} · ${n} files saved · ${vault} app version${vault === 1 ? "" : "s"} kept`);
    } catch (e) { add("Opens without internet", false, e.message); }
    add("One tab at a time", !!(navigator.locks && navigator.locks.request), navigator.locks ? (T.store.paused ? "this tab is paused (the book is open elsewhere)" : "guarded") : "this browser can't guard against two tabs; keep the book open in one");
    add("Phone keyboard", null, window.visualViewport ? "the hold button follows the keyboard" : "this browser doesn't report the keyboard; the hold button may sit under it");

    // the book itself
    const d = T.data(), all = Object.values(d.pages), live = all.filter(p => p && !p.deleted);
    const healed = T.healTree();
    add("The book", true, `${live.filter(p => !p.anchor).length} pages, ${live.filter(p => p.anchor && !p.ref && !p.portal && !p.code).length} folds, ${live.filter(p => p.anchor && p.anchor.lost).length} unattached, ${all.length - live.length} deletion markers · ${d.intervals.length} time entries${healed ? ` · fixed ${healed} page(s) that were inside each other` : ""}`);
    add("Errors since opening", errs.length === 0, errs.length ? errs.slice(0, 3).join(" | ") : "none");

    // sync and the keys (never their values)
    let tok = ""; try { tok = JSON.parse(localStorage.getItem("tol-gh-token") || '""'); } catch (e) {}
    const S = window.__tolSync && window.__tolSync.state();
    if (!tok) add("GitHub key", null, "not on this device (needed for sync and for Claude Code)");
    else {
      try { const r = await withTimeout(fetch("https://api.github.com/repos/obrianwatson/tree-of-life", { headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + tok }, cache: "no-store" }), 12000, "GitHub");
        const j = await r.json().catch(() => ({}));
        add("GitHub key", r.ok && (!j.permissions || j.permissions.push), r.ok ? (j.permissions && !j.permissions.push ? "works, but can't write (give it Contents: Read and write)" : "works") : `GitHub answered ${r.status}`); }
      catch (e) { add("GitHub key", navigator.onLine === false ? null : false, navigator.onLine === false ? "offline right now" : "couldn't reach GitHub: " + e.message); }
    }
    if (S) {
      if (!S.on) add("Sync", null, "off on this device");
      else if (S.locked) add("Sync", false, "locked: type the passphrase in Settings → Sync");
      else { try { await withTimeout(window.__tolSync.syncNow("now"), 30000, "sync"); } catch (e) {}
        const s2 = window.__tolSync.state(); add("Sync", s2.phase === "ok", `${s2.label}${s2.detail ? " · " + s2.detail : ""} · ${s2.mySha ? "base file up" : "no base file yet"}${s2.myDeltaSha ? ", delta file up" : ""}`); }
    }
    add("Claude in the book", null, T.ai && T.ai.ready() ? `key saved · model ${T.ai.cfg().model} · about $${T.ai._usage().usd.toFixed(2)} used this month` : "no Anthropic key on this device");
    return R;
  }
  function reportText(R) {
    const bad = R.filter(r => r.ok === false).length;
    return [`Book of Living Waters: device check, ${new Date().toLocaleString()}`, bad ? `${bad} thing${bad === 1 ? "" : "s"} to look at` : "All good"]
      .concat(R.map(r => `${r.ok === false ? "LOOK" : r.ok === true ? "ok  " : "info"}  ${r.name}: ${r.detail}`)).join("\n");
  }

  let last = null, note = "";
  function paint(busy) {
    let area = $("checkArea");
    if (!area) { const after = $("safeArea") || ($("backupNote") && $("backupNote").parentNode); if (!after) return; area = document.createElement("div"); area.className = "field"; area.id = "checkArea"; after.parentNode.insertBefore(area, after.nextSibling); }
    const bad = last ? last.filter(r => r.ok === false).length : 0;
    area.innerHTML = `<label><span>Check this device</span>${last ? `<span>${bad ? bad + " to look at" : "all good"}</span>` : ""}</label>
      <small>Runs quick checks on this device (saving, storage, safety copies, offline, sync, keys). The report has no writing in it.</small>
      <div class="row"><button class="btn" id="ckRun"${busy ? " disabled" : ""}>${busy ? "Checking…" : last ? "Check again" : "Check this device"}</button>
        ${last ? `<button class="btn" id="ckCopy">Copy the report</button><button class="btn" id="ckSend">Send it to Claude</button>` : ""}</div>
      ${last ? `<div class="qlist">${last.map(r => `<div class="q"><div><b>${r.ok === false ? "⚠ " : r.ok === true ? "✓ " : "· "}${esc(r.name)}</b><small>${esc(r.detail)}</small></div></div>`).join("")}</div>` : ""}
      <p class="msg">${esc(note)}</p>`;
  }
  document.addEventListener("tol:settings", () => { note = ""; paint(false); });
  document.addEventListener("click", async e => {
    const id = e.target && e.target.id;
    if (id === "ckRun") { note = ""; paint(true); try { last = await run(); } catch (err) { note = "The check itself hit a problem: " + (err.message || err); } paint(false); }
    else if (id === "ckCopy" && last) {
      const text = reportText(last);
      try { await navigator.clipboard.writeText(text); note = "Copied. Paste it into your chat with Claude."; }
      catch (err) { const ta = document.createElement("textarea"); ta.value = text; ta.readOnly = true; ta.style.cssText = "width:100%;height:160px"; note = "Select all of this and copy it:"; paint(false); $("checkArea").appendChild(ta); ta.select(); return; }
      paint(false);
    } else if (id === "ckSend" && last) {
      let tok = ""; try { tok = JSON.parse(localStorage.getItem("tol-gh-token") || '""'); } catch (err) {}
      if (!tok) { note = "There's no GitHub key on this device, so copy the report instead."; paint(false); return; }
      if (e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "Yes, post it (your project on GitHub is public; the report has no writing)"; return; }
      note = "Sending…"; paint(false);
      try {
        const bad = last.filter(r => r.ok === false).length;
        const r = await fetch("https://api.github.com/repos/obrianwatson/tree-of-life/issues", { method: "POST", headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
          body: JSON.stringify({ title: `Device check: ${T.DEVICE}, version ${T.APP_VERSION}: ${bad ? bad + " to look at" : "all good"}`, body: "```\n" + reportText(last) + "\n```\n_Sent from Settings → Check this device. No writing is included._" }) });
        if (!r.ok) throw new Error("GitHub answered " + r.status);
        note = "Sent. Claude can read it the next time you talk.";
      } catch (err) { note = "Couldn't send it (" + (err.message || err) + "). Copy the report instead."; }
      paint(false);
    }
  });
  T.check = { run, reportText, _errs: errs };
})();
