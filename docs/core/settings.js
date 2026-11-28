/* settings.js · CORE · SETTINGS: the module switches, and the sections other pieces add (Settings.add).
   Built in: modules, export (take your book with you), the way back, "Something's off?", about. */
(function (g) {
"use strict";
const B = g.Book, Keep = g.Keep, Page = g.Page, Mods = g.Mods, esc = Page.esc;
const sections = [];
const add = s => { sections.push(s); sections.sort((a, b) => a.order - b.order); };
function open() {
  Page.sheet("Settings", body => { sections.forEach(s => { if (s.mod && !Mods.on(s.mod)) return; const h = Page.el("h2", "", s.title), box = Page.el("div", "sec"); box.dataset.sec = s.id || s.title; body.appendChild(h); body.appendChild(box); try { s.build(box); } catch (e) { console.error(e); } }); });
}
add({ order: 10, title: "Modules", id: "mods", build(box) {
  box.innerHTML = `<p class="nt">BOLW is a small core plus modules. Switching one off hides it; it never deletes what it made.</p>` + Mods.list.map(m => `<label class="ck"><input type="checkbox" data-mod="${m.id}"${Mods.on(m.id) ? " checked" : ""}><span>${esc(m.name)}<small>${esc(m.about || "")}</small></span></label>`).join("");
  box.querySelectorAll("[data-mod]").forEach(c => { c.onchange = () => Mods.set(c.dataset.mod, c.checked); }); } });
add({ order: 60, title: "Take your book with you", id: "export", build(box) {
  box.innerHTML = `<div class="row"><button id="sTxt">Export to read (.txt)</button><button id="sJson">Export everything (.json)</button></div><p class="nt">The .txt opens anywhere: what is within a line indented under it, lifted pages under their lines. The .json holds everything (folds, links, bookmarks, deleted things, the record).</p>`;
  box.querySelector("#sTxt").onclick = () => Keep.download("book-of-living-waters-" + Keep.stamp() + ".txt", Keep.asText(B));
  box.querySelector("#sJson").onclick = () => g.Log.all().then(log => Keep.download("book-of-living-waters-" + Keep.stamp() + ".json", Keep.asJSON(B, { record: log, clock: g.Clock ? g.Clock.days : null, chats: Keep.lsGet(Keep.K.chats) }), "application/json")); } });
add({ order: 70, title: "The way back", id: "back", build(box) {
  box.innerHTML = `<div class="row"><a class="btn" href="./safe/">Safe mode</a><a class="btn" href="./test/">The guided tests</a><a class="btn" href="../bolw/">Essentials</a><a class="btn" href="../">The old book</a></div><p class="nt">Safe mode is a separate, plain page that can always read and export your book, even if the app itself won't open. Rings (earlier versions) and Deleted are in the ☰ menu.</p>`; } });
/* Something's off: your own words and which device you're on go to your project on GitHub, where Claude reads them.
   Never your writing, never a key, never "@". Two taps, because the project is public. */
const report = text => ["Core · something's off", new Date().toLocaleString() + " · " + (Page.TOUCH ? "touch" : "mouse") + " · " + innerWidth + "×" + innerHeight + " · " + (navigator.standalone ? "Home Screen app" : "browser") + " · v" + (g.CORE_VERSION || "?") + " · " + navigator.userAgent.replace(/\s+/g, " ").slice(0, 160), "", text.replace(/@/g, "(at)")].join("\n");
add({ order: 80, title: "Something's off?", id: "off", build(box) {
  const tok = Keep.lsGet("tol-gh-token");
  box.innerHTML = `<p class="nt">Tell Claude what happened. Only these words and which device you're on are sent, never your writing.</p><textarea id="sIssue" rows="3" placeholder="What happened, and what were you doing?"></textarea><div class="row">${tok ? '<button id="sIssueSend">Send to Claude</button>' : ""}<button id="sIssueCopy">Copy</button></div><p class="nt" id="sIssueMsg">${tok ? "" : "This device has no GitHub key, so tap Copy and paste it to Claude."}</p>`;
  const ta = box.querySelector("#sIssue"), msg = t => { box.querySelector("#sIssueMsg").textContent = t; };
  box.querySelector("#sIssueCopy").onclick = async () => { const t = ta.value.trim(); if (!t) return msg("Write what happened first."); try { await navigator.clipboard.writeText(report(t)); msg("Copied. Paste it to Claude."); } catch (e) { ta.select(); msg("Select the words and copy them."); } };
  const sd = box.querySelector("#sIssueSend"); if (!sd) return;
  sd.onclick = async () => { const t = ta.value.trim(); if (!t) return msg("Write what happened first.");
    if (sd.dataset.sure !== "1") { sd.dataset.sure = "1"; sd.textContent = "Yes, post it"; return msg("Your project on GitHub is public, so this can be seen there. Your writing is not included. Tap again to post."); }
    sd.disabled = true; msg("Sending…");
    try { const r = await fetch("https://api.github.com/repos/obrianwatson/tree-of-life/issues", { method: "POST", headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify({ title: "Core: " + t.split("\n")[0].replace(/@/g, "(at)").slice(0, 60), body: "```\n" + report(t) + "\n```\n_Sent from Settings in BOLW Core. No writing is included._" }) });
      if (!r.ok) throw new Error("GitHub answered " + r.status); ta.value = ""; sd.dataset.sure = ""; sd.textContent = "Send to Claude"; sd.disabled = false; msg("Sent. Tell Claude “I sent one” and it will read it.");
    } catch (e) { sd.disabled = false; msg("Couldn't send (" + (e.message || e) + "). Tap Copy and paste it to Claude instead."); } }; } });
add({ order: 95, title: "About", id: "about", build(box) { box.innerHTML = `<p class="nt">The Book of Living Waters · Core · version ${esc(g.CORE_VERSION || "?")}. When a newer version is published, BOLW waits until you're not typing, updates, and takes you back to where you were.</p>`; } });
Page.view({ order: 99, label: "Settings", open });
g.Settings = { add, open };
})(window);
