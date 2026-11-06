---
paths:
  - "widgets/sensoralarms/**"
  - "test/sensoralarms-*.test.ts"
  - "dev/sensoralarms-preview.html"
  - "lib/SensorAlarmService.ts"
---
# Sensor Alarms widget (`sensoralarms`)

- Tiles in the style of Homey's native temperature tiles, 2 or 3 per row (`columns`, "Tiles per row", after `renameTiles`, `"2"` by default so placed widgets are unchanged, a missing or unknown value too; `data-columns`; Quick Actions' setting and strings; the user's ask, 2026-11-01) (no `devices` filter, so custom alarm capabilities count); `lib/SensorAlarmService.ts`; transparent.
- A tile, all measured from a phone screenshot (matched on the phone, 2026-10-04): the 24 px muted device icon, the name (14 bold) and the alarm text (14 muted), both on an 18 px line (a deliberate exception); `#2B2C36` in dark mode, flat, 10 px radius, 52 px high, the text 1 px below centre (7/5 px padding).
- Alarms are every boolean capability whose base id starts with `alarm_` (`alarmCaps()`), custom ones too (`alarm_radon`), each with its `title` (localised by Homey) and `state`: true for `alarm_motion`/`alarm_presence`/`alarm_contact` and the cameras' `alarm_person`/`alarm_vehicle`/`alarm_pet`, which only count with `includeStates` (off; the widget filters, not the service). Active alarms count once per title without a trailing `(…)` (the Airthings reports radon three times).
- Text: `No alarm`, the one active alarm's title, or `__count__ alarms` (the user chose a count over a list); `No alarm sensors` without counted capabilities. Any active alarm makes the tile red (`.alarm`; the user chose always red over a colour per type).
- A tap opens a panel (`.sa-panel`) under the tile's row (by `columns`), the grid's full width, listing every alarm of the device (`alarmRows()`: one row per title without `(…)`, active when any unit is, `–` for `null`); active counted alarms red, active ones that don't count only bold. The widget grows (`onHeight`); it's in the widget because a widget can't draw over the dashboard (see Homey API facts). Tap again or another tile to close or move it; it closes when the device goes missing.
- `/state` entries are `{id, name, icon, alarms}`; it re-tracks when the set of alarm capabilities changed. Realtime `sensoralarms:state`. Diagnostics list each device's alarms.
- Tile names: Rename tiles only (`tile-names.md`). The `names` textarea (`Device name = Tile name` lines, or one per position; shipped in 0.9.0) was removed in 1.0.0, with no carry-over (the user's choice, 2026-10-18).
- Colour style (`colorStyle`, Muted/Vivid; CLAUDE.md *Widget styling*, `kit.css`): after `includeStates`. Vivid: an alarm tile is the red shade, solid, with white text and icon (the panel is unchanged).
- `wideLast` ("Widen the last tile", after `columns`, off; Light Controls' setting and strings; the settings review's second batch, 2026-11-05): `.wide` on the last of an odd number of tiles, only at 2 per row (3 per row leaves it alone; the hint doesn't say so). The panel's row counts by `columns` as before; the wide tile is the last row on its own.
- An unavailable device (CLAUDE.md *Unavailable devices*): `markOffline()` on the tile; the text is `Unavailable` where it would say `No alarm` or `No alarm sensors`, while an alarm it last reported stays, red.
