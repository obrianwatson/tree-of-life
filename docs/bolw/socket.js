/* socket.js · THE SOCKET: where an AI plugs in.
   One provider is built in (Anthropic's Claude, straight from this browser with YOUR key).
   Another AI (ChatGPT, Venice) plugs in later with Socket.plug(name, provider) and its own key.
   A provider gives: models() → [{id, label}], and stream({model, system, messages, tools, signal, onText})
   → {content: [{type:"text",text} | {type:"tool_use",id,name,input}], stop, usage}.
   THE KEY: kept only on this device, read only inside this file, sent only to the AI's own address.
   Nothing else in the app is handed the key: not the breath, not a command, not a tool. */
(function (g) {
"use strict";
const CFG = "tol-ai";                         // (the same drawer the old book uses, so a key you already saved works here)
const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG) || "{}") || {}; } catch (e) { return {}; } };
const headers = c => Object.assign({ "content-type": "application/json", "x-api-key": c.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, c.ws ? { "anthropic-workspace-id": c.ws } : {});
function explain(status, msg) {
  if (/workspace/i.test(msg || "") && /scoped|anthropic-workspace-id/i.test(msg || "")) return "This key works across several workspaces, so Anthropic needs your Workspace ID too (Settings → AI key).";
  if (status === 401) return "The AI key wasn't accepted (Settings → AI key).";
  if (status === 429) return "Too many requests right now. Try again in a minute.";
  if (status === 529 || status === 503) return "The AI is very busy right now. Try again in a minute.";
  if (/credit balance/i.test(msg || "")) return "Your API credits have run out (console.anthropic.com → Billing).";
  return msg || ("The AI answered with a problem (" + status + ").");
}
const KNOWN = [["claude-haiku-5-5", "Claude Haiku 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-opus-5-5", "Claude Opus 5.5"]].map(m => ({ id: m[0], label: m[1] }));
let modelCache = null;
const anthropic = {
  label: "Claude",
  async models() {            // every Claude model your key can use, newest first; the known three if the list can't be fetched
    if (modelCache) return modelCache; const c = cfg(); if (!c.key || navigator.onLine === false) return KNOWN;
    try { const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: headers(c) }); if (!r.ok) return KNOWN; const j = await r.json();
      const list = (j.data || []).filter(m => m && m.id).map(m => ({ id: m.id, label: m.display_name || m.id })); if (list.length) modelCache = list; return list.length ? list : KNOWN; } catch (e) { return KNOWN; }
  },
  async stream({ model, system, messages, tools, signal, onText }) {
    const c = cfg(); if (!c.key) throw new Error("There's no AI key on this device yet (Settings → AI key).");
    const body = { model, max_tokens: 4096, system, messages, stream: true }; if (tools && tools.length) body.tools = tools;
    let r;
    try { r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal, headers: headers(c), body: JSON.stringify(body) }); }
    catch (e) { if (e.name === "AbortError") throw e; throw new Error(navigator.onLine === false ? "You're offline." : "Couldn't reach the AI. Check your connection."); }
    if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) {} throw new Error(explain(r.status, j && j.error && j.error.message)); }
    const out = { content: [], stop: null, usage: { in: 0, out: 0 } };
    if (!(r.headers.get("content-type") || "").includes("event-stream") || !r.body) {
      const j = await r.json(); out.content = j.content || []; out.stop = j.stop_reason; out.content.filter(b => b.type === "text").forEach(b => onText(b.text)); return out; }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    const handle = ev => {
      if (ev.type === "message_start" && ev.message && ev.message.usage) out.usage.in = ev.message.usage.input_tokens || 0;
      else if (ev.type === "content_block_start") out.content[ev.index] = Object.assign({}, ev.content_block, ev.content_block.type === "tool_use" ? { _json: "" } : { text: ev.content_block.text || "" });
      else if (ev.type === "content_block_delta") { const b = out.content[ev.index]; if (!b) return;
        if (ev.delta.type === "text_delta") { b.text += ev.delta.text; onText(ev.delta.text); } else if (ev.delta.type === "input_json_delta") b._json += ev.delta.partial_json || ""; }
      else if (ev.type === "content_block_stop") { const b = out.content[ev.index]; if (b && b.type === "tool_use") { try { b.input = b._json ? JSON.parse(b._json) : (b.input || {}); } catch (e) { b.input = {}; } delete b._json; } }
      else if (ev.type === "message_delta") { if (ev.delta && ev.delta.stop_reason) out.stop = ev.delta.stop_reason; if (ev.usage) out.usage.out = ev.usage.output_tokens || out.usage.out; }
      else if (ev.type === "error") throw new Error(explain(0, ev.error && ev.error.message));
    };
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let k; while ((k = buf.indexOf("\n\n")) >= 0) { const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
        const data = chunk.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
        if (data) { try { handle(JSON.parse(data)); } catch (e) { if (e instanceof SyntaxError) continue; throw e; } } } }
    out.content = out.content.filter(b => b && (b.type === "text" || b.type === "tool_use")); return out;
  }
};
const providers = { anthropic };
let using = "anthropic";
g.Socket = {
  plug(name, p) { providers[name] = p; }, use(name) { if (providers[name]) { using = name; modelCache = null; } }, get using() { return using; }, get label() { return providers[using].label || "the AI"; },
  hasKey: () => using !== "anthropic" || !!cfg().key,
  keyHint: () => { const k = cfg().key || ""; return k ? "saved (ends in …" + k.slice(-4) + ")" : "none yet"; },       // never the key itself
  hasWs: () => !!cfg().ws,
  setKey(key, ws) { const c = cfg(); if (key != null) c.key = String(key).trim(); if (ws != null) c.ws = String(ws).trim(); try { localStorage.setItem(CFG, JSON.stringify(c)); } catch (e) {} modelCache = null; },
  models: () => providers[using].models(),
  stream: o => providers[using].stream(o)
};
})(window);
