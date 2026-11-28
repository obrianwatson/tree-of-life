/* clock.js · MODULE "clock" · THE WRITING CLOCK AND HOLD. They belong to the writer alone.
   - Typing counts, through short pauses (the "typing pause", about 4 seconds, adjustable); a longer pause stops the
     clock at the last key.
   - HOLD (the round button on the iPhone, the Option key on the laptop) counts thinking, singing and rereading.
   - Each second counts once. A daily goal you set.
   - The AI, commands and automations never add time and can't press Hold: nothing here is an action.
   Time is also told to the record of every move, per leaf. */
(function (g) {
"use strict";
const Keep = g.Keep, Page = g.Page, Mods = g.Mods, Log = g.Log, CK = Keep.K.clock;
Mods.add({ id: "clock", name: "Writing clock and Hold", about: "Counts the time you spend writing. Hold counts thinking, singing and rereading." });
const today = () => new Date().toDateString();
let clock = Object.assign({ day: today(), ms: 0, days: {}, pause: 4, goal: 0 }, Keep.lsGet(CK) || {});
let lastKey = 0, holdAt = null, beat = Date.now(), dirty = false;
const on = () => Mods.on("clock"), PAUSE = () => Math.max(1, Math.min(30, +clock.pause || 4)) * 1000;
const roll = () => { if (clock.day !== today()) { clock.day = today(); clock.ms = 0; } };
function bank(ms, kind) { if (!(ms > 0)) return; roll(); clock.ms += ms; clock.days[Keep.stamp()] = clock.ms; dirty = true; Log.time(Page.leaf, ms, kind); }
const saveNow = () => { if (dirty) { dirty = false; Keep.lsSet(CK, clock); } };
setInterval(saveNow, 2000); addEventListener("pagehide", saveNow);
function typed() { if (!on() || Page.demo) return; const n = Date.now(); if (!holdAt && lastKey && n - lastKey <= PAUSE()) bank(n - lastKey, "type"); lastKey = n; }
function setHold(v, endAt) { if (!on() || !!holdAt === v) return; if (v) holdAt = Date.now(); else { bank((endAt || Date.now()) - holdAt, "hold"); holdAt = null; lastKey = 0; saveNow(); } holdBtn.classList.toggle("on", v); paint(); }
Page.on("typed", leaf => { if (leaf) typed(); });
const fmt = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 3600) + ":" + String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
const face = Page.el("span", "clock"); Page.top(face, "clock", 1);
const other = () => (g.Lock && g.Lock.otherToday ? g.Lock.otherToday() : 0);
function paint() { if (!on()) return; roll(); const n = Date.now(), running = holdAt || (lastKey && n - lastKey <= PAUSE()), ms = clock.ms + (holdAt ? n - holdAt : 0) + other(), goal = (+clock.goal || 0) * 60000;
  face.textContent = (running ? "● " : "○ ") + fmt(ms) + (goal ? (ms >= goal ? " ✓" : " / " + fmt(goal).slice(0, -3)) : ""); face.classList.toggle("run", !!running); face.classList.toggle("met", !!goal && ms >= goal); }
setInterval(() => { const n = Date.now(); if (holdAt && n - beat > 10000) setHold(false, beat + 500); beat = n; paint(); }, 500);        // time asleep is never counted

/* the Hold button lives in the bar; only a finger or the Option key can press it */
const holdBtn = Page.el("button", "hold", "Hold");
holdBtn.addEventListener("touchstart", e => { e.preventDefault(); setHold(true); }, { passive: false });
["touchend", "touchcancel"].forEach(t => holdBtn.addEventListener(t, e => { e.preventDefault(); setHold(false); }));
holdBtn.addEventListener("mousedown", e => { e.preventDefault(); if (e.isTrusted) setHold(true); }); ["mouseup", "mouseleave"].forEach(t => holdBtn.addEventListener(t, () => setHold(false)));
holdBtn.addEventListener("contextmenu", e => e.preventDefault());
Page.bar({ id: "hold", mod: "clock", order: 90, title: "Hold: counts thinking, singing and rereading", make: () => holdBtn });
document.addEventListener("keydown", e => { if (e.key === "Alt" && !e.repeat && e.isTrusted) setHold(true); }); document.addEventListener("keyup", e => { if (e.key === "Alt") setHold(false); });
addEventListener("blur", () => setHold(false)); document.addEventListener("visibilitychange", () => { if (document.hidden) { setHold(false); saveNow(); } });

paint();
g.Clock = { get data() { return clock; }, set(ch) { Object.assign(clock, ch); dirty = true; saveNow(); paint(); }, get days() { return clock.days; }, paint, fmt, get holding() { return !!holdAt; } };
if (g.Settings) g.Settings.add({ order: 30, mod: "clock", title: "Writing clock", build(box) {
  box.innerHTML = `<label class="fld">Typing pause: the clock keeps running through a pause this long (seconds)<input id="ckPause" type="number" min="1" max="30" value="${+clock.pause || 4}"></label><label class="fld">Daily goal (minutes; 0 for none)<input id="ckGoal" type="number" min="0" max="1440" value="${+clock.goal || 0}"></label>`;
  box.querySelector("#ckPause").onchange = e => g.Clock.set({ pause: Math.max(1, Math.min(30, +e.target.value || 4)) }); box.querySelector("#ckGoal").onchange = e => g.Clock.set({ goal: Math.max(0, +e.target.value || 0) }); } });
})(window);
