# The six actions, as built (Trial #01 · Book Phase)

The card itself, with the council's reasons, is `claude/six-action-card.md` in the BOLW project. This page is the
builder's side of it: exactly what the action layer (`docs/trial/core.js`) takes and gives back.

Everything goes through `Book.act(name, needs, by)`. `by` is who is doing it: `"me"` for now.
Before any action runs it passes **one checkpoint**, `Book.checkpoint(name, needs, by)`. Today it lets everything
through. Later the riverbanks plug in there (`Book.banks` is the list they will read). If the checkpoint gives back
a sentence instead of `true`, nothing happens and that sentence is shown.

| # | In your words | Code name | Needs | Gives back | Undo |
|---|---|---|---|---|---|
| 1 | Write | `write` | `where` (note or fold), `line`, `words`; optional `at` (where in the line) and `remove` (letters to take out there) | the line as it now reads, and where the caret is | the lines go back to how they read before |
| 2 | Open a note | `open_note` | `note` (its id, or `"new"`) | the note that's now open | back to the note you were on; a new, empty note disappears |
| 3 | Fold this line | `fold_line` | `where`, `from` (the line), optional `to` (last line) | the new fold, open, with its first line ready | the fold disappears (if it holds writing by then, it's kept under Recently removed) |
| 4 | Open or close a fold | `open_fold` | `fold`, `open` (yes or no) | whether it's now open | back the way it was |
| 5 | Remove a fold | `remove_fold` | `fold` | the line without its fold | the fold comes back with everything inside |
| 6 | Trace a fold back to its parent | `trace_parent` | `fold` | the path: note → fold → … → this fold | nothing to undo |

- **Undo is a rule, not an action:** `Book.undo()`. A removed fold that holds writing also stays under
  "Recently removed folds" in the list of notes, with **Put back**, even after the page was closed.
- **Hold and the writing clock are not in the layer.** Nothing but the writer's own hand can reach them.
- **Whose words:** every line stores `by`. A line someone types into becomes theirs. Lines not by "me" are drawn
  in another color (nothing writes such lines yet).
- **Room left for the breath:** an empty ✦ corner at the top right of the note (phone), an empty side column
  beside the page (laptop), and ⌘K is left unused.
- A note left empty disappears (like Apple Notes). There is no "delete a note": that would be a seventh action.
