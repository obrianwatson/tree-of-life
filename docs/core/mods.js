/* mods.js · CORE · THE MODULES and their switches.
   BOLW is a small core plus modules. Each module is one file that tells Mods who it is: Mods.add({ id, name, about }).
   Each has a switch in Settings. Switching a module off hides its buttons and refuses its actions;
   it NEVER deletes what the module made (folds, links, bookmarks… stay in the book and come back with the switch).
   The switches are kept per device. */
(function (g) {
"use strict";
const Keep = g.Keep, off = Keep.lsGet(Keep.K.mods) || {}, list = [], subs = [];
const Mods = {
  list,
  add(m) { if (!list.some(x => x.id === m.id)) list.push(m); return m; },
  on: id => !off[id],
  set(id, v) { if (v) delete off[id]; else off[id] = 1; Keep.lsSet(Keep.K.mods, off); subs.forEach(fn => { try { fn(id, v); } catch (e) { console.error(e); } }); },
  changed: fn => subs.push(fn)
};
g.Mods = Mods;
})(window);
