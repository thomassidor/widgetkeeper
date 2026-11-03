---
paths:
  - "lib/dashboardSync.ts"
  - "lib/WebSyncService.ts"
  - "test/dashboard-sync.test.ts"
  - "test/web-sync*.test.ts"
---
# Syncing web dashboards with Homey dashboards (1.2.0, in progress)

The user's ask (2026-11-03): a web dashboard can be linked to a Homey dashboard in its editor and is then synced both
ways, on demand or every night at a time set in the web dashboards' Settings; a sync icon shows on the linked ones.

## Decisions (the user, 2026-11-03)
- Conflicts (a field changed differently on both sides since the last sync): **a per-link choice of which side wins**,
  Homey by default (most editing happens on the phone).
- **Homey's own widgets** (light groups, device tiles …) stay on the Homey dashboard where they are, invisible on the web.
- **One nightly time** for every linked dashboard (`webSyncSchedule {nightly, time}`, default on at 03:00).
- Merge rules confirmed (2026-11-03): settings one by one; **devices combined** (both sides' additions and removals,
  the preferred side's order); edited on one side and deleted on the other is kept; the layout whole from the side that
  rearranged; the first sync copies the picked side; **tile names sync too**, per tile like a setting.
- **Also sync when a web dashboard is opened** and the last sync is over 10 minutes old, so a phone edit shows the
  same day.

## The merge (`lib/dashboardSync.ts`, done; `test/dashboard-sync.test.ts`)
- Each side as a `SyncView` (name, columns of widget keys, each widget's type, title (`''` hidden ↔ `titleHidden`),
  settings, deviceIds). A key is the web widget id; a widget from Homey keeps its Homey UUID as its web id. The link's
  `idMap` gives each key's Homey id: Homey wants UUIDs for every dashboard, column and widget id (the specification's
  pattern), and the web's `newId()` ids aren't.
- Three-way against **each side's own base** (what that side looked like right after the last sync, read back after
  writing), so one side's normalising (the web fills defaults, Homey keeps removed settings) never reads as a change.
  Per field (title, each setting on its own, the name; the device list is combined instead, `mergeDevices()`): changed on one side → both; on both, differently →
  the preferred side's, recorded as a conflict; on neither → each side keeps its own.
- Added on one side → added on the other after the same neighbour (first if it was first; at the end when its
  neighbours moved away). Deleted on one side → deleted on the other, unless edited there since (then it comes back).
- Layout (column count and the order of the widgets both had): from the side that moved them; both → the preferred
  side's (a `layout` conflict); neither → each keeps its own.
- First sync (no base): the side the user picks as the start is copied over the other.
- Not synced, kept on their side (`Opaque`, put back after the item they followed): Homey's own widgets and our types
  this version doesn't have; the web's Dashboard Shortcuts (`WEB_ONLY_TYPES`). Web-only fields kept: theme, backdrop,
  section, code, columnWidth, a widget's `span`/`at`/`trusted`/`scaled`. Homey's kept: column ids by place, a hidden
  title's text, our settings no longer in the manifest. Columns past six fold into the web's sixth.

## The service (`lib/WebSyncService.ts`, done; `test/web-sync.test.ts`)
- `app.webSync`, started after the web dashboards; stopped with the services that have a pending write. Links in
  `/userdata/web-sync.json` (`DebouncedSetting`), per web dashboard id: `{homeyId, prefer, start?, idMap, base, lastSync}`;
  the web dashboard itself carries nothing, so Duplicate and backups don't carry a link. A Homey dashboard links to one
  web dashboard at most.
- `link(id, {homeyId | 'new', start, prefer})`: `new` makes a Homey dashboard named as the web one (`createDashboard`)
  and starts from the web. Then `sync()`.
- `sync(id, {ifOlderMs})`, one at a time per dashboard (a second call joins): reads the Homey dashboard with the stored
  key, fills each side's tile names into its view (`web-<id>-<key>` and the Homey widget id), merges, refuses past
  `MAX_WIDGETS` (`tooMany`, nothing written), writes both sides' previous state to
  `/userdata/web-sync-backup-<id>.json` (no backup, no sync), then `updateDashboard` (only when Homey's side changed,
  or the first time), `WebDashboardService.save()` (only when the web side changed), the tile names that changed
  (`tileNames.replace()`, one write), and the new bases from what was written (the web as saved). A widget from the
  web gets a random UUID on Homey (`idMap`). Failures keep the base and are the link's `lastSync`
  (`{ok: false, reason}`: `noKey`, `keyScope` (a read-only key fails on `updateDashboard`), `keyInvalid`, `homeyGone`,
  `webGone` (unlinks), `tooMany`, `failed`, logged); a passing error is retried once after 3 s.
- Nightly: `webSyncSchedule` `{nightly, time}` (missing: on, 03:00), `nextLocalTime()` in the Homey's time zone (a time
  a DST change skips comes an hour later), every link one after another, then the next night.
- Routes: `GET /web/sync` (`{schedule, links}`), `PUT /web/sync` (schedule), `POST /web/sync` (all now),
  `GET /web/sync/homey` (`{ok, dashboards: [{id, name, linked}]}` or `{ok: false, reason}`),
  `PUT /web/dashboards/:id/sync` (link; with only `{prefer}` on a linked one, changes it),
  `POST /web/dashboards/:id/sync?ifOlder=<s>` (the `LastSync`), `DELETE /web/dashboards/:id/sync`; deleting a web
  dashboard unlinks it. `/web/setup` has `sync` (each link's status). Realtime `websync:state {id, link}` when a sync
  starts and ends, and on a change of link.
- Diagnostics' `webSync`: the schedule, each link's ids, `prefer`, widget count and last result (conflicts by field).

## The page (`settings/dashboard-sync.js`, the part `sync`)
- `wd.syncLinks` (`/web/setup`'s `sync`), kept up to date by realtime `websync:state`, which repaints every
  `[data-sync-id]` (icons, the pill) and `[data-sync-line]` (the dialog's state line).
- The editor's bar: a Sync pill (`.wd-syncpill`, icon `sync`, accent colour while linked) before Delete and Done. Its
  dialog (`syncDialog()`) reads `GET /web/sync/homey`: without a usable key, the reason and that it needs a full-access
  key. Unlinked: the Homey dashboard (New Homey dashboard first; one synced with another web dashboard disabled), The
  first time (Homey's to here | This one to Homey; hidden for a new one), On a conflict, keep (Homey | This one), Start
  syncing (after `wd.saving`). Linked: Synced with <name> and its state, On a conflict, keep (saved at once), Sync now,
  Stop syncing (a second tap).
- A linked dashboard's viewing bar has a sync button (`.wd-bar-sync`: its state as the title, spinning while it syncs,
  red after a failure; a tap syncs now); opening it asks `POST …/sync?ifOlder=600`. Its front-page card has the icon
  before the widget count (`.wd-dash-count.synced`, so an unlinked card's line is as before and `docs/web` renders stay).
- A sync that changed the web side (the event going from syncing to done with `changes.web`) reloads `/web/setup` after
  `wd.saving` and redraws the dashboard on screen, its editor too (every change there is already saved), with
  *Updated from Homey*; on the front page, the list.
- The front page's Settings dialog: a *Sync with Homey dashboards* card between the backup and This browser: Sync every
  night (switch), Time (`<input type="time">`, hidden while off), Sync all now (with the count; disabled with none).
- Strings `web.sync*` in all 13 languages. `dev/mock-web-api.js` answers the sync routes (made-up Homey dashboards
  Kitchen, Phone, Energy) and takes `sync` (links); `dev/web-preview.html` starts with Kitchen tablet synced and Hallway
  failed (its Homey dashboard deleted).
- Checked in happy-dom on `dev/web-preview.html` (its scripts evaluated in order: happy-dom 21 doesn't run external
  scripts in order): the pill and dialog, linking, the linked dialog, changing the preferred side, Stop syncing, the
  bar button, the cards' icons and the Settings card. Not in a real browser or on the Homey; the realtime redraw is
  untested.

## Still to build
1. The settings page's API key card: say syncing needs a Homey (everything) key.
2. README; a check on the real Homey on a test dashboard (edits on both sides, a conflict, a delete, a Homey widget
   kept, the nightly run, the page in a real browser).
