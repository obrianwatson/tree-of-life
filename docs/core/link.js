/* link.js · MODULE "link" · LINK: webs.
   Link any line to any other, anywhere in the book. Add a label if you want ("rhymes with"); each label gets its
   own color automatically (the labels you type ARE the kinds of link; nothing to set up). Both ends know.
   A linked line shows ∞ at its end: tap it to see its links, tap a link to jump.
   A link: links[id] = { id, a: line id, b: line id, label?, by, at, updatedAt, gone? }  (gone = removed; kept as a marker for sync)
   Actions: link { from, to, label? } · unlink { link } · relabel { link, label } */
(function (g) {
"use strict";
const B = g.Book, Page = g.Page, Mods = g.Mods, D = () => B.D, esc = Page.esc, el = Page.el;
Mods.add({ id: "link", name: "Link", about: "Link any line to any other, with a label if you want. Both ends know." });
const COLORS = ["#b5482f", "#1d9e75", "#c9892b", "#8a55b5", "#2f6fb5", "#3d8f8f", "#a8427f", "#6d8a2f"], PLAIN = "#8b8a84";
const colorOf = label => { const s = String(label || "").trim().toLowerCase(); if (!s) return PLAIN; let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; };
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const liveLine = id => { const L = D().lines[id]; return !!L && B.alive(L.in); };
const now = () => Date.now();

B.action("link", function (needs, who, T) {
  const A = D().lines[needs.from], Z = D().lines[needs.to]; if (!A || !Z) throw B.plain("One of those lines isn't there."); if (A.id === Z.id) throw B.plain("A line can't be linked to itself.");
  const label = String(needs.label || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (Object.values(D().links).some(l => !l.gone && ((l.a === A.id && l.b === Z.id) || (l.a === Z.id && l.b === A.id)) && (l.label || "").toLowerCase() === label.toLowerCase())) throw B.plain("Those two lines are already linked" + (label ? " that way." : "."));
  T.table("links"); const id = B.uid("k"); D().links[id] = { id, a: A.id, b: Z.id, label: label || undefined, by: who, at: now(), updatedAt: now() };
  return { link: id, label, structural: true, log: { what: "link", leaf: A.in, line: A.id, n: label } };
}, "link");
B.action("unlink", function (needs, who, T) {
  const K = D().links[needs.link]; if (!K || K.gone) throw B.plain("That link isn't there."); T.table("links"); D().links[K.id] = Object.assign({}, K, { gone: true, updatedAt: now() });
  return { structural: true, log: { what: "unlink", leaf: B.leafOf(K.a), n: K.label || "" } };
}, "link");
B.action("relabel", function (needs, who, T) {
  const K = D().links[needs.link]; if (!K || K.gone) throw B.plain("That link isn't there."); const label = String(needs.label || "").trim().replace(/\s+/g, " ").slice(0, 40);
  T.table("links"); D().links[K.id] = Object.assign({}, K, { label: label || undefined, updatedAt: now() }); return { link: K.id, label, structural: true, log: { what: "link", leaf: B.leafOf(K.a), n: label } };
}, "link");

/* ---------- reading: both ends know ---------- */
let cache = null; B.on(() => { cache = null; });
function index() { if (cache) return cache; cache = {}; Object.values(D().links).forEach(K => { if (K.gone || !D().lines[K.a] || !D().lines[K.b]) return; (cache[K.a] = cache[K.a] || []).push(K); (cache[K.b] = cache[K.b] || []).push(K); }); return cache; }
const of = line => (index()[line] || []).map(K => { const other = K.a === line ? K.b : K.a; return { id: K.id, other, label: K.label || "", color: colorOf(K.label), text: D().lines[other].text, leaf: D().lines[other].in }; }).filter(x => liveLine(x.other));
const labels = () => { const s = {}; Object.values(D().links).forEach(K => { if (!K.gone && K.label && D().lines[K.a] && D().lines[K.b]) s[K.label] = (s[K.label] || 0) + 1; }); return Object.keys(s).sort((a, b) => s[b] - s[a]); };

/* ---------- on the page ---------- */
Page.marker({ order: 50, mod: "link", glyph: "∞", has: L => !!index()[L.id] && of(L.id).length > 0, tap: (L, e) => { const r = e.getBoundingClientRect(); showLinks(L.id, { left: r.right - 260, top: r.top, bottom: r.bottom }); } });
function jump(x) { Page.go(x.leaf, x.other, { flash: true }); }
function showLinks(line, at) { const ls = of(line), items = ls.map(x => [(x.label ? x.label + " → " : "→ ") + clip(x.text.trim() || "(empty)", 26) + "  ·  " + clip(B.where(x.other), 24), () => jump(x)]);
  items.push(null); items.push(["Link this line to…", () => pick(line)]); if (ls.length) items.push(["Change or remove a link…", () => manage(line)]); Page.openMenu(at, items); }
/* the strip: when the cursor rests on a linked line, its links float under the top row (they never push the page down) */
const strip = Page.$("#strip");
Page.on("moved", c => { if (!Mods.on("link") || !c || !c.line) return hideStrip(); const ls = of(c.line); if (!ls.length) return hideStrip(); strip.textContent = "";
  ls.forEach(x => { const b = el("button", "", (x.label ? x.label + ": " : "∞ ") + clip(x.text.trim() || "(empty)", 30)); b.style.borderColor = x.color; b.style.color = x.color; Page.press(b, () => jump(x)); strip.appendChild(b); }); strip.classList.remove("hide"); });
function hideStrip() { if (!strip.classList.contains("hide")) { strip.classList.add("hide"); strip.textContent = ""; } }
Page.on("leaf", hideStrip);
/* choose the other line (search the whole book), then an optional label */
function pick(from) {
  const A = D().lines[from]; if (!A) return;
  Page.sheet("Link “" + clip(A.text.trim() || "this line", 24) + "” to…", body => {
    const inp = el("input"); inp.type = "search"; inp.placeholder = "Find the other line (search the whole book)"; body.appendChild(inp); const out = el("div"); body.appendChild(out);
    const draw = () => { const q = inp.value.trim(); let hits;
      if (q) hits = B.search(q, 60).filter(h => h.line !== from); else { const lf = D().leaves[A.in]; hits = lf.lines.filter(l => l !== from && D().lines[l].text.trim()).slice(0, 40).map(l => ({ leaf: lf.id, line: l, text: D().lines[l].text })); }
      out.innerHTML = `<h2>${q ? "Lines with those words" : "Lines in this leaf"}</h2><div class="rows">` + (hits.map(h => `<button class="rowi" data-line="${h.line}"><b>${esc(h.text.trim())}</b><small>within ${esc(B.where(h.line))}</small></button>`).join("") || `<div class="none">No line found.</div>`) + `</div>`;
      out.querySelectorAll("[data-line]").forEach(b => { b.onclick = () => askLabel(from, b.dataset.line); }); };
    inp.oninput = draw; draw(); if (!Page.TOUCH) setTimeout(() => inp.focus(), 50); });
}
function askLabel(from, to) {
  Page.sheet("What kind of link?", body => { const have = labels();
    body.innerHTML = `<p class="nt">“${esc(clip(D().lines[from].text.trim(), 40))}” ↔ “${esc(clip(D().lines[to].text.trim(), 40))}”. A label is optional. Each label gets its own color.</p><input type="text" id="lkLabel" placeholder="rhymes with, answers, see also… (or leave empty)" autocapitalize="off"><div class="chips">${have.map(l => `<button class="chip" data-l="${esc(l)}" style="border-color:${colorOf(l)};color:${colorOf(l)}">${esc(l)}</button>`).join("")}</div><div class="row"><button class="go" id="lkOk">Link</button></div>`;
    const done = label => { const r = B.act("link", { from, to, label }); if (!r.ok) return Page.say(r.why) || alert(r.why); Page.closeSheet(true); Page.toast("Linked" + (label ? " (" + label + ")" : "") + ". Both lines show ∞.", "Undo", Page.doUndo); };
    body.querySelector("#lkOk").onclick = () => done(body.querySelector("#lkLabel").value); body.querySelector("#lkLabel").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); done(e.target.value); } };
    body.querySelectorAll("[data-l]").forEach(b => { b.onclick = () => done(b.dataset.l); }); if (!Page.TOUCH) setTimeout(() => body.querySelector("#lkLabel").focus(), 50); });
}
function manage(line) {
  Page.sheet("Links of this line", body => { const draw = () => { const ls = of(line);
      body.innerHTML = `<div class="rows">` + (ls.map(x => `<div class="rowi"><button class="go" data-j="${x.id}"><b style="color:${x.color}">${esc(x.label || "∞ (no label)")}</b><small>${esc(clip(x.text.trim(), 60))} · within ${esc(B.where(x.other))}</small></button><button class="mini" data-l="${x.id}">Label</button><button class="mini" data-x="${x.id}">Remove</button></div>`).join("") || `<div class="none">This line has no links now.</div>`) + `</div><div class="row"><button id="lkMore">Link this line to…</button></div>`;
      body.querySelectorAll("[data-j]").forEach(b => { b.onclick = () => jump(ls.find(x => x.id === b.dataset.j)); });
      body.querySelectorAll("[data-x]").forEach(b => { b.onclick = () => { B.act("unlink", { link: b.dataset.x }); draw(); }; });
      body.querySelectorAll("[data-l]").forEach(b => { b.onclick = () => { const cur = ls.find(x => x.id === b.dataset.l), v = prompt("Label for this link (empty for none)", cur.label); if (v == null) return; B.act("relabel", { link: b.dataset.l, label: v }); draw(); }; });
      body.querySelector("#lkMore").onclick = () => pick(line); }; draw(); });
}
Page.menu(c => { if (!c.has) return []; const n = of(c.line).length, out = [["Link to…", () => pick(c.line)]]; if (n) out.push(["Its links (" + n + ")…", () => manage(c.line)]); return out; }, "link", 35);
g.Link = { of, labels, colorOf, pick, manage, showLinks };
})(window);
