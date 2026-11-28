/* map.js · MODULE "map" · THE MAP: one view of where you are.
   Centered on the line you're on: UP is what it grew from (trace back, all the way to the trunk), DOWN is what
   grows from it (its branch, and its leaf if it has one), and to the SIDES are its links (the web), in their
   labels' colors, filtered by label if you want. Tap anything to center the map on it; "Go there" opens it.
   The map only looks: it changes nothing. (Trace back, the family tree and the web are this one view.) */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, D = () => B.D, esc = Page.esc;
Mods.add({ id: "map", name: "Map", about: "One view centered on where you are: branches up and down, links to the sides." });
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const txt = id => (D().lines[id] && D().lines[id].text.trim()) || "(empty line)";
/* what the map shows around a line (null = the trunk itself) */
function around(line) {
  const L = line ? D().lines[line] : null, up = [], down = [];
  if (L) { let cur = L, n = 0; while (cur && n++ < 200) { const lf = D().leaves[cur.in], i = lf.lines.indexOf(cur.id), p = B.parentLine(lf, i); if (p >= 0) cur = D().lines[lf.lines[p]]; else if (lf.parent && D().lines[lf.parent]) cur = D().lines[lf.parent]; else cur = null; if (cur) up.unshift(cur.id); }
    const lf = D().leaves[L.in], i = lf.lines.indexOf(L.id), e = B.branchEnd(lf, i); for (let k = i + 1; k < e; k++) if (D().lines[lf.lines[k]].d === L.d + 1) down.push(lf.lines[k]);
    if (L.leaf && D().leaves[L.leaf]) D().leaves[L.leaf].lines.forEach(l => { if (D().lines[l].d === 0 && (D().lines[l].text.trim() || D().lines[l].leaf)) down.push(l); }); }
  else D().leaves[D().trunk].lines.forEach(l => { if (D().lines[l].d === 0 && (D().lines[l].text.trim() || D().lines[l].leaf)) down.push(l); });
  const links = L && g.Link && Mods.on("link") ? g.Link.of(L.id) : [];
  return { line: L ? L.id : null, up, down, links };
}
function open(line) {
  const c = Page.ctx(); let center = line !== undefined ? line : (c.has ? c.line : (D().leaves[Page.leaf].parent || null)), only = "", trail = [];
  Page.sheet("Map", body => {
    const draw = () => { const m = around(center), L = center ? D().lines[center] : null, labs = []; m.links.forEach(x => { if (labs.indexOf(x.label) < 0) labs.push(x.label); });
      if (only && labs.indexOf(only) < 0) only = ""; const links = m.links.filter(x => !only || x.label === only), left = links.filter((x, i) => i % 2 === 0), right = links.filter((x, i) => i % 2 === 1);
      const node = (id, cls) => `<button class="mn ${cls || ""}${D().lines[id].leaf ? " leaf" : ""}" data-c="${id}">${esc(clip(txt(id), 60))}</button>`;
      const side = x => `<button class="mn web" data-c="${x.other}" data-k="${x.id}" style="--c:${x.color}">${x.label ? `<i>${esc(x.label)}</i>` : ""}${esc(clip(x.text.trim() || "(empty line)", 46))}<small>${esc(clip(B.title(x.leaf), 22))}</small></button>`;
      const folds = L && g.Fold && Mods.on("fold") ? g.Fold.covering(L.in, L.id).filter(F => F.name).map(F => F.name) : [];
      body.innerHTML = (labs.length > 1 || labs[0] ? `<div class="chips"><button class="chip${only ? "" : " on"}" data-only="">All links</button>${labs.map(l => `<button class="chip${only === l && l ? " on" : ""}" data-only="${esc(l)}" style="border-color:${g.Link.colorOf(l)};color:${g.Link.colorOf(l)}">${esc(l || "no label")}</button>`).join("")}</div>` : "") +
        `<div class="map" id="map"><svg id="mapSvg"></svg>
          <div class="mup"><button class="mn root${center ? "" : " here"}" data-c="">Trunk</button>${m.up.map(id => node(id, "up")).join("")}</div>
          <div class="mmid"><div class="mside">${left.map(side).join("")}</div>
            <div class="mhere" id="mHere">${L ? `<b>${esc(txt(center))}</b><small>in ${esc(B.title(L.in))}${folds.length ? " · folds: " + esc(folds.join(", ")) : ""}</small>` : `<b>Trunk</b><small>the start of the book</small>`}</div>
            <div class="mside">${right.map(side).join("")}</div></div>
          <div class="mdown">${m.down.slice(0, 14).map(id => node(id, "down")).join("")}${m.down.length > 14 ? `<span class="nt">and ${m.down.length - 14} more</span>` : ""}${!m.down.length ? `<span class="nt">Nothing grows from here yet.</span>` : ""}</div></div>
        <div class="row"><button class="go" id="mGo">Go there</button>${trail.length ? '<button id="mBack">Back on the map</button>' : ""}</div><p class="nt">Up: what it grew from. Down: what grows from it. Sides: its links. Tap anything to center the map on it.</p>`;
      body.querySelectorAll("[data-c]").forEach(b => { b.onclick = () => { trail.push(center); center = b.dataset.c || null; only = ""; draw(); }; });
      body.querySelectorAll("[data-only]").forEach(b => { b.onclick = () => { only = b.dataset.only; draw(); }; });
      body.querySelector("#mGo").onclick = () => { if (center) Page.go(D().lines[center].in, center, { flash: true }); else Page.go(D().trunk); };
      const bk = body.querySelector("#mBack"); if (bk) bk.onclick = () => { center = trail.pop(); only = ""; draw(); };
      requestAnimationFrame(wires); };
    const wires = () => { const box = body.querySelector("#map"), svg = body.querySelector("#mapSvg"), here = body.querySelector("#mHere"); if (!box || !here) return; const o = box.getBoundingClientRect(), h = here.getBoundingClientRect(); let s = "";
      const mid = r => ({ x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 }), hc = mid(h);
      const ups = box.querySelectorAll(".mup .mn"); let prev = null; ups.forEach(e => { const r = e.getBoundingClientRect(), p = mid(r); if (prev) s += `<line x1="${prev.x}" y1="${prev.y}" x2="${p.x}" y2="${p.y}" class="tree"/>`; prev = p; }); if (prev) s += `<line x1="${prev.x}" y1="${prev.y}" x2="${hc.x}" y2="${h.top - o.top}" class="tree"/>`;
      box.querySelectorAll(".mdown .mn").forEach(e => { const r = e.getBoundingClientRect(); s += `<path d="M${hc.x} ${h.bottom - o.top} C ${hc.x} ${h.bottom - o.top + 18}, ${r.left - o.left + 14} ${r.top - o.top - 18}, ${r.left - o.left + 14} ${r.top - o.top}" class="tree"/>`; });
      box.querySelectorAll(".mn.web").forEach(e => { const r = e.getBoundingClientRect(), lft = r.left < h.left, x1 = lft ? h.left - o.left : h.right - o.left, x2 = lft ? r.right - o.left : r.left - o.left, y2 = r.top - o.top + r.height / 2; s += `<path d="M${x1} ${hc.y} C ${(x1 + x2) / 2} ${hc.y}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}" style="stroke:${e.style.getPropertyValue("--c")}" class="web"/>`; });
      svg.setAttribute("width", o.width); svg.setAttribute("height", o.height); svg.innerHTML = s; };
    draw(); });
}
Page.view({ mod: "map", order: 30, label: "Map", open: () => open() });
Page.menu(c => c.has ? [["Map from here", () => open(c.line)]] : [], "map", 36);
g.MapView = { open, around };
})(window);
