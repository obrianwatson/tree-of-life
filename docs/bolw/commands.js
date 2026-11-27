/* commands.js · ROOM FOR ; COMMANDS (none are built yet).
   When you press Return on a line that starts with ";", the page asks Commands.run(words, where).
   A command that handles it gives back true, and the Return is swallowed. Today nothing is registered,
   so a line starting with ";" is just a line. Commands will be added here with Commands.add(name, fn).
   A command gets no keys and no storage: only the words, the place, and the joints. */
(function (g) {
"use strict";
const list = {};
g.Commands = { add(name, fn) { list[name] = fn; }, names: () => Object.keys(list),
  run(words, where) { const m = /^\s*(\S+)\s*(.*)$/.exec(words || ""); if (!m || !list[m[1]]) return false; try { return list[m[1]](m[2], where, g.Book) === true; } catch (e) { return false; } } };
})(window);
