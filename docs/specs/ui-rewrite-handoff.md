# Notes for the UI rewrite branch

Things the backend already supports that the UI rewrite should pick up, and
behaviour the current UI has that a redesign must not lose.

## Deferred to this branch: moving a folder

The API can move a folder under another folder; there is no UI for it yet.

- `PATCH /api/folders/{id}` with `{"parent_id": <folder id>}` moves it;
  `{"parent_id": null}` moves it to the top level. Omitting `parent_id`
  leaves the position alone (so rename/recolour calls are unaffected).
- `400` if the target is the folder itself or one of its own descendants.
- `404` if the target folder does not exist or belongs to someone else.
- Frontend state: folders are a flat list with `parent_id`
  (`keys.folders` in `src/api/queryClient.js`); `AppShell.jsx` has the
  optimistic handlers. `flattenFolderTree` in
  `components/Sidebar/WorkspaceListItem.jsx` already produces the indented
  list used by the workspace "Move to folder" picker and can be reused; a
  folder's own subtree must be excluded from its list of targets.

## Behaviour to keep

- Server data goes through TanStack Query (`src/api/queryClient.js`). Update
  it with `writeCache(key, updater)`, not local `useState` copies.
- Destructive actions confirm through `components/shared/ConfirmModal.jsx`:
  workspace delete/leave (Settings, Members tab, sidebar menu), Kanban trash,
  folder delete.
- "Saving…" style indicators appear only after one second
  (`hooks/useDelayedFlag.js`).
- Due dates are stored as local-midnight ISO strings
  (`toDateInputValue` / `dateInputToISO` in `utils/date.js`).
- Text inputs never get a focus glow.
- Theme order is dark, midnight, light.
- Conversation threads: newest 50 first, older on scroll, member threads
  poll every 4 s, the list re-reads every 15 s while the panel is open,
  Enter sends and Shift+Enter adds a line.
- Registration sends the optional photo with the signup
  (`POST /api/users/with-picture`, multipart: `username`, `email`,
  `password`, `file`).

## Coordination with `async-rewrite`

That branch changes `backend/` only and must not change any URL, status code
or response body. This branch should stay out of `backend/`. If the UI needs
an API change, make it on `followup-fixes` (or main) so both branches pick it
up, not here.
