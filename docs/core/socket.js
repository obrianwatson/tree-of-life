/* socket.js · MODULE "ai" (part 1) · THE SOCKET: where a fast AI plugs in.
   Built in: Claude (Anthropic), and ANY OpenAI-compatible AI: ChatGPT, Venice, OpenRouter, or another address you add.
   Every provider gives the same two things, so the AI window never cares which one is in use:
     models() → [{ id, label }]
     stream({ model, system, messages, tools, signal, onText }) → { content: [{type:"text",text} | {type:"tool_use",id,name,input}], stop, usage: { in, out } }
   (messages and tools are passed in Claude's shape; the OpenAI-compatible provider translates them.)
   KEYS: kept only on this device, read only inside this file, sent only to that AI's own address. No tool, command,
   automation or setting hands a key to anything else. Socket.keyHint() shows the last four letters, never the key.
   ONE SPENDING LIMIT for all of them, per month. Cost is an estimate from the tokens used (it leans high for models
   whose price isn't known); when the limit is reached, nothing more is sent until you raise it or the month turns. */
(function (g) {
"use strict";
const CLAUDE = "tol-ai", OTHERS = "bolw-ai-keys", SPEND = "bolw-ai-spend";         // drawers on this device, never synced (the Claude key is the one the old book and Essentials use)
const get = k => { try { return JSON.parse(localStorage.getItem(k) || "null") || {}; } catch (e) { return {}; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const PRESETS = { openai: { label: "ChatGPT (OpenAI)", base: "https://api.openai.com/v1" }, venice: { label: "Venice", base: "https://api.venice.ai/api/v1" }, openrouter: { label: "OpenRouter", base: "https://openrouter.ai/api/v1" } };
const PRICE = { "claude-haiku-5-5": [0.10, 0.50], "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20] }, UNKNOWN = [4, 20];         // dollars per million tokens in / out
const KNOWN = [["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-haiku-5-5", "Claude Haiku 5.5"], ["claude-opus-5-5", "Claude Opus 5.5"]].map(m => ({ id: m[0], label: m[1] }));
const offline = () => new Error(navigator.onLine === false ? "You're offline." : "Couldn't reach the AI. Check your connection.");
function explain(status, msg, who) {
  if (/workspace/i.test(msg || "") && /scoped|anthropic-workspace-id/i.test(msg || "")) return "This key works across several workspaces, so Anthropic needs your Workspace ID too (Settings → The fast AI).";
  if (status === 401 || status === 403) return "The key for " + who + " wasn't accepted (Settings → The fast AI).";
  if (status === 429) return "Too many requests right now, or the account is out of credit. Try again in a minute.";
  if (status === 529 || status === 503) return who + " is very busy right now. Try again in a minute.";
  if (/credit balance|insufficient_quota|billing/i.test(msg || "")) return "The account for " + who + " is out of credit.";
  return msg || (who + " answered with a problem (" + status + ").");
}
/* read a stream of "data: …" lines */
async function sse(res, onEvent) { const rd = res.body.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let k; while ((k = buf.indexOf("\n\n")) >= 0) { const chunk = buf.slice(0, k); buf = buf.slice(k + 2); const data = chunk.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join(""); if (!data || data === "[DONE]") continue; let ev; try { ev = JSON.parse(data); } catch (e) { continue; } onEvent(ev); } } }

/* ---------- Claude ---------- */
const claude = {
  id: "claude", label: "Claude", kind: "anthropic", who: "Claude",
  cfg: () => get(CLAUDE), hasKey() { return !!get(CLAUDE).key; },
  headers(c) { return Object.assign({ "content-type": "application/json", "x-api-key": c.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, c.ws ? { "anthropic-workspace-id": c.ws } : {}); },
  async models() { const c = get(CLAUDE); if (!c.key || navigator.onLine === false) return KNOWN;
    try { const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: this.headers(c) }); if (!r.ok) return KNOWN; const j = await r.json(); const l = (j.data || []).filter(m => m && m.id).map(m => ({ id: m.id, label: m.display_name || m.id })); return l.length ? l : KNOWN; } catch (e) { return KNOWN; } },
  async stream({ model, system, messages, tools, signal, onText }) {
    const c = get(CLAUDE); if (!c.key) throw new Error("There's no key for Claude on this device yet (Settings → The fast AI).");
    const body = { model, max_tokens: 4096, system, messages, stream: true }; if (tools && tools.length) body.tools = tools;
    let r; try { r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal, headers: this.headers(c), body: JSON.stringify(body) }); } catch (e) { if (e.name === "AbortError") throw e; throw offline(); }
    if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) {} throw new Error(explain(r.status, j && j.error && j.error.message, "Claude")); }
    const out = { content: [], stop: null, usage: { in: 0, out: 0 } };
    if (!(r.headers.get("content-type") || "").includes("event-stream") || !r.body) { const j = await r.json(); out.content = j.content || []; out.stop = j.stop_reason; out.content.filter(b => b.type === "text").forEach(b => onText(b.text)); return out; }
    await sse(r, ev => {
      if (ev.type === "message_start" && ev.message && ev.message.usage) out.usage.in = ev.message.usage.input_tokens || 0;
      else if (ev.type === "content_block_start") out.content[ev.index] = Object.assign({}, ev.content_block, ev.content_block.type === "tool_use" ? { _json: "" } : { text: ev.content_block.text || "" });
      else if (ev.type === "content_block_delta") { const b = out.content[ev.index]; if (!b) return; if (ev.delta.type === "text_delta") { b.text += ev.delta.text; onText(ev.delta.text); } else if (ev.delta.type === "input_json_delta") b._json += ev.delta.partial_json || ""; }
      else if (ev.type === "content_block_stop") { const b = out.content[ev.index]; if (b && b.type === "tool_use") { try { b.input = b._json ? JSON.parse(b._json) : (b.input || {}); } catch (e) { b.input = {}; } delete b._json; } }
      else if (ev.type === "message_delta") { if (ev.delta && ev.delta.stop_reason) out.stop = ev.delta.stop_reason; if (ev.usage) out.usage.out = ev.usage.output_tokens || out.usage.out; }
      else if (ev.type === "error") throw new Error(explain(0, ev.error && ev.error.message, "Claude"));
    });
    out.content = out.content.filter(b => b && (b.type === "text" || b.type === "tool_use")); return out;
  }
};
/* ---------- any OpenAI-compatible AI ---------- */
function openai(id) {
  const rec = () => (get(OTHERS).providers || {})[id] || {}, meta = () => Object.assign({}, PRESETS[id] || {}, rec());
  return { id, kind: "openai", get label() { return meta().label || id; }, get who() { return meta().label || "the AI"; }, get base() { return (meta().base || "").replace(/\/+$/, ""); }, hasKey: () => !!rec().key,
    async models() { const c = rec(); if (!c.key || navigator.onLine === false) return []; try { const r = await fetch(this.base + "/models", { headers: { "Authorization": "Bearer " + c.key } }); if (!r.ok) return []; const j = await r.json(); return (j.data || []).filter(m => m && m.id).map(m => ({ id: m.id, label: m.name || m.id })).sort((a, b) => a.id < b.id ? -1 : 1); } catch (e) { return []; } },
    async stream({ model, system, messages, tools, signal, onText }) {
      const c = rec(); if (!c.key) throw new Error("There's no key for " + this.who + " on this device yet (Settings → The fast AI)."); if (!model) throw new Error("Choose a model for " + this.who + " first (tap the model's name at the top of the AI window).");
      const msgs = [{ role: "system", content: system }];
      messages.forEach(m => { if (typeof m.content === "string") return msgs.push({ role: m.role, content: m.content });
        if (m.role === "assistant") { const text = m.content.filter(b => b.type === "text").map(b => b.text).join(""), calls = m.content.filter(b => b.type === "tool_use").map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input || {}) } })); const a = { role: "assistant", content: text || null }; if (calls.length) a.tool_calls = calls; msgs.push(a); }
        else m.content.forEach(b => { if (b.type === "tool_result") msgs.push({ role: "tool", tool_call_id: b.tool_use_id, content: typeof b.content === "string" ? b.content : JSON.stringify(b.content) }); else if (b.type === "text") msgs.push({ role: "user", content: b.text }); }); });
      const body = { model, messages: msgs, stream: true }; if (tools && tools.length) body.tools = tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      let r; try { r = await fetch(this.base + "/chat/completions", { method: "POST", signal, headers: { "content-type": "application/json", "Authorization": "Bearer " + c.key }, body: JSON.stringify(body) }); } catch (e) { if (e.name === "AbortError") throw e; throw offline(); }
      if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) {} throw new Error(explain(r.status, j && j.error && (j.error.message || j.error), this.who)); }
      const out = { content: [], stop: "end_turn", usage: { in: 0, out: 0 } }; let text = ""; const calls = [];
      const take = ch => { const d = ch && (ch.delta || ch.message); if (!d) return; if (d.content) { text += d.content; onText(d.content); }
        (d.tool_calls || []).forEach((tc, n) => { const i = tc.index == null ? n : tc.index, c0 = calls[i] = calls[i] || { id: "", name: "", args: "" }; if (tc.id) c0.id = tc.id; if (tc.function) { if (tc.function.name) c0.name = tc.function.name; if (tc.function.arguments) c0.args += tc.function.arguments; } }); };
      if (!(r.headers.get("content-type") || "").includes("event-stream") || !r.body) { const j = await r.json(); take(j.choices && j.choices[0]); if (j.usage) out.usage = { in: j.usage.prompt_tokens || 0, out: j.usage.completion_tokens || 0, usd: j.usage.cost }; }
      else await sse(r, ev => { if (ev.error) throw new Error(explain(0, ev.error.message || String(ev.error), this.who)); take(ev.choices && ev.choices[0]); if (ev.usage) out.usage = { in: ev.usage.prompt_tokens || 0, out: ev.usage.completion_tokens || 0, usd: ev.usage.cost }; });
      if (text) out.content.push({ type: "text", text });
      calls.filter(Boolean).forEach((c0, i) => { let input = {}; try { input = c0.args ? JSON.parse(c0.args) : {}; } catch (e) {} out.content.push({ type: "tool_use", id: c0.id || ("call_" + i + "_" + Date.now().toString(36)), name: c0.name, input }); });
      if (calls.filter(Boolean).length) out.stop = "tool_use";
      if (!out.usage.in && !out.usage.out) out.usage = { in: Math.ceil(JSON.stringify(msgs).length / 4), out: Math.ceil((text.length + calls.reduce((s, c0) => s + (c0 ? c0.args.length : 0), 0)) / 4) };       // (this AI didn't say what it used: estimated from the length)
      return out;
    } };
}
const ids = () => ["claude"].concat(Object.keys(PRESETS), Object.keys(get(OTHERS).providers || {}).filter(k => !PRESETS[k]));
const prov = id => id === "claude" ? claude : openai(id);
const extra = {};                                           // (a stand-in AI for the guided tests' Show me: Socket.plug)
const cur = () => { const u = get(OTHERS).current; return extra[u] ? u : (u && ids().indexOf(u) >= 0 ? u : "claude"); };
const P = () => extra[cur()] || prov(cur());
const month = () => new Date().toISOString().slice(0, 7);
const spend = () => { const s = get(SPEND); return s.month === month() ? s : { month: month(), usd: 0, calls: 0 }; };
const limit = () => { const l = get(OTHERS).limit; return l == null ? 10 : +l; };
function charge(model, u) { if (extra[cur()]) return; const p = PRICE[model] || UNKNOWN, s = spend(); s.usd += u.usd != null && u.usd >= 0 ? +u.usd : ((u.in || 0) * p[0] + (u.out || 0) * p[1]) / 1e6; s.calls++; put(SPEND, s); }
g.Socket = {
  PRESETS, ids, list: () => ids().map(id => { const p = prov(id); return { id, label: p.label, kind: p.kind, hasKey: p.hasKey(), base: p.base || "" }; }),
  get using() { return cur(); }, get label() { return P().who || P().label; }, use(id) { const o = get(OTHERS); o.current = id; put(OTHERS, o); },
  plug(id, p) { extra[id] = p; }, unplug(id) { delete extra[id]; },
  hasKey: id => (id ? prov(id) : P()).hasKey(),
  keyHint(id) { const k = id === "claude" ? (get(CLAUDE).key || "") : (((get(OTHERS).providers || {})[id] || {}).key || ""); return k ? "saved (ends in …" + k.slice(-4) + ")" : "none yet"; },
  setKey(id, key, more) { if (id === "claude") { const c = get(CLAUDE); if (key != null) c.key = String(key).trim(); if (more && more.ws != null) c.ws = String(more.ws).trim(); put(CLAUDE, c); return; }
    const o = get(OTHERS); o.providers = o.providers || {}; const r = o.providers[id] = o.providers[id] || {}; if (key != null) r.key = String(key).trim(); if (more && more.base) r.base = String(more.base).trim(); if (more && more.label) r.label = String(more.label).trim(); put(OTHERS, o); },
  model(id) { id = id || cur(); return id === "claude" ? (get(OTHERS).claudeModel || get(CLAUDE).model || "claude-sonnet-5-5") : (((get(OTHERS).providers || {})[id] || {}).model || ""); },
  setModel(model, id) { id = id || cur(); const o = get(OTHERS); if (id === "claude") o.claudeModel = model; else { o.providers = o.providers || {}; (o.providers[id] = o.providers[id] || {}).model = model; } put(OTHERS, o); },
  models: () => P().models(),
  spend, limit, setLimit(usd) { const o = get(OTHERS); o.limit = Math.max(0, +usd || 0); put(OTHERS, o); }, overLimit: () => limit() > 0 && spend().usd >= limit(),
  async stream(o) { if (!extra[cur()] && this.overLimit()) throw new Error("This month's AI spending limit ($" + limit() + ") is reached. Raise it in Settings → The fast AI, or wait for next month."); const out = await P().stream(o); charge(o.model, out.usage || {}); return out; }
};
})(window);
