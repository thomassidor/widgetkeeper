---
paths:
  - "widgets/groupaction/**"
  - "test/groupaction-*.test.ts"
  - "dev/groupaction-preview.html"
---
# Group Quick Action widget (`groupaction`)

- 1.4.0, the user's ask (2026-11-25): several devices with the same kind of quick action in one full-width tile (the living room's lights on and off with one tap), handling their mixed states. Five directions were mocked up (`temp/group-action-mockup.html`: a summary with a three-state switch, a segment strip, a group button with device chips, a fill by share, All on | All off); the user picked **the summary with a three-state switch**, and the mixed tap rule **any on → all off**.
- Built on Device Quick Actions (`quickactions.md`): its service (`app.quickActions`, so no service of its own), its quick action per device (`quickActionId()`: the override, else the driver's), its realtime `quickactions:state` and its trigger, sent once per device (`POST /trigger {deviceId, value}`, at once, as Lights' rooms). `GET /state` is `getState(ids, {zones: true})`, which adds each device's `zone` (`zoneRef()` with the room namer; Quick Actions' own answer has none), wrapped as `{state, tileShadow}` like Flow Buttons' (no tile names: one tile, with a Name setting).
- The tile: Quick Actions' pill at full width (56 px, `#2B2C36` in dark mode, no rim): the first device's icon, the name over the state line and a dot per device (lit while `true`, an orange ring while unavailable or gone; none for one device or more than 12), and a 46 × 26 switch: off, on, or the knob in the middle with a dash while they disagree. All `true`: Quick Actions' tint (Vivid the solid shade); some: a faint 9 % tint (Vivid 18 %). A momentary group (`button*`) shows the button glyph in place of the switch and `N devices`, and flashes as Quick Actions' tile.
- The name: the `name` setting, else the room every found device is in (more than one device), else the first device's name and `and N more`.
- The group's kind is the first device whose quick action can be set (its capability's base: `onoff`, `locked` …); devices with another kind or none are left out, named under the tile (`leftOut`). The state line words by kind: `All off`/`All on`/`2 of 5 on`, locks `All locked`/`1 of 3 unlocked`, garage doors open/closed, speakers playing/paused; `· N unavailable` after it (an offline member or a gone device). Orange while something's unavailable, or a lock or garage door is open.
- **A tap:** the resting value is `false`, but `true` for `locked` and `garagedoor_closed`. Any readable member away from rest (on, unlocked, open, playing) → every member to rest; none → every member to the other. Only members not already at the target are sent; an unavailable (offline) member is judged by nothing but still sent. Optimistic for 10 s per device. A failure: the tile shakes and `Could not change <names>.` for a while, those devices' optimism dropped.
- `press` (Quick Actions' setting and strings: single, double, long) for the whole tile; no `pressFor` (one tile). Double: a change of any member's state between the taps asks again (the guard's `from` is the members' values).
- Settings: `name`, `press`, `color` (blue), `colorStyle`. Haptic on a tap that sends, and Long's as the finger lifts.
- An unavailable member (CLAUDE.md *Unavailable devices*): out of the count, its dot ringed; `markOffline()` on the tile only when every member is.
- Dev page `dev/groupaction-preview.html`; README screenshot and Looks from `SCREENSHOTS.groupaction` in `dev/mock-dashboard.js` (the living room's four lights, the outdoor lights, the doors; scenes `offline`, `leftout`, `buttons`); `npm run test-dashboards -- groupaction`.
- Not tried on a Homey or a phone yet.
