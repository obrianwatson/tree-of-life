/* search.js · MODULE "search" · SEARCH across the whole book (☰ → Search, or ⌘F / Ctrl F).
   It only looks: leaves whose name matches, then every line with the words. Tap one to go there. */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, esc = Page.esc;
Mods.add({ id: "search", name: "Search", about: "Find words anywhere in the book." });
let last = "";
function open(q) {
  Page.sheet("Search", body => {
    const inp = Page.el("input"); inp.type = "search"; inp.placeholder = "Search the whole book"; inp.value = q != null ? q : last; inp.autocapitalize = "off"; body.appendChild(inp);
    const out = Page.el("div"); body.appendChild(out);
    const draw = () => { const v = inp.value.trim(); last = v; if (!v) { out.innerHTML = `<div class="none">Type a word or a few.</div>`; return; }
      const lv = v.toLowerCase(), leaves = B.leaves().filter(id => id !== B.D.trunk && B.title(id).toLowerCase().indexOf(lv) >= 0).slice(0, 12), hits = B.search(v, 120);
      const extra = Page.fire("search", v) || "";
      out.innerHTML = (leaves.length ? `<h2>Leaves</h2><div class="rows">` + leaves.map(id => `<button class="rowi" data-leaf="${id}"><b>${esc(B.title(id))}</b><small>${esc(B.path(id).slice(0, -1).map(B.title).join(" › "))}</small></button>`).join("") + `</div>` : "") + extra +
        `<h2>Lines</h2><div class="rows">` + (hits.map(h => `<button class="rowi" data-leaf="${h.leaf}" data-line="${h.line}"><b>${esc(h.text.trim() || "(empty)")}</b><small>in ${esc(B.title(h.leaf))}</small></button>`).join("") || `<div class="none">No line has those words.</div>`) + `</div>`;
      out.querySelectorAll("[data-leaf]").forEach(b => { b.onclick = () => Page.go(b.dataset.leaf, b.dataset.line || null, { flash: true }); }); Page.fire("searchDrawn", out, v); };
    inp.oninput = draw; draw(); if (!Page.TOUCH || !inp.value) setTimeout(() => inp.focus(), 50);
  });
}
Page.view({ mod: "search", order: 10, label: "Search", open: () => open() });
Page.key(e => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "f") { open(); return true; } }, "search", true);
g.Search = { open };
})(window);
