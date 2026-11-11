---
paths:
  - "widgets/typicalday/**"
  - "test/typicalday-*.test.ts"
  - "dev/typicalday-preview.html"
  - "dev/mock-typicalday.js"
---
# Chart · Daily Profile widget (`typicalday`, called Typical Day while it was built; renamed 2026-10-30, as the other chart widgets, by what it offers)

- A value's line today over its usual day: each local clock hour's average over the last 7 (or 3) days, today left out, dashed, with their lowest to highest as a band (`C.profile()`: `buckets()` by the hour, the last value carried over gaps, grouped by `getHours()`). One of the four chart types the user picked from the 1.2.0 mock-ups ("is today unusual?"). Not transparent: `homey-widget`. On the chart frame and mount helper (Charts' note); Charts' one-chart layout (122 px), today's window as the x axis (00–24, the chart kit's `timeLabels()`), each usual hour at its half past today.
- Settings (11, from `scripts/chart-settings.json`): `slot` ("Value", Sparklines' `listSlots`), `usual` ("Usual day from": `7` default, `3` — the days Insights' hourly logs reach: `last7Days`, `last3Days`; a longer one would be 6-hourly), `band` ("Show the spread", on), `smooth` and `range` (Charts' templates on their own rows), `title`, `showHeader` (its own hint), `color` (blue), `colorStyle` (Vivid: the band at 32 % instead of 16 %).
- Two windows (`windows()`): today (`1d!`, the `today` log, 5 min) and the last 7 or 3 days rolling (`7d`/`3d`: one hourly log; whole days would need `last31Days`' 6-hour steps). The usual day takes the past points before today's midnight, so the hours before now's hour have a day fewer (and a DST change a week back moves that by an hour).
- Header: today's value now (or the tapped hour's average today, `HH:00`) in the widget's colour, then the usual one for that hour, muted (`usualAt`). Chips: the value's and `Usual · 7 d`. A tap picks the hour under the pointer (kept as its number, a cursor line at its half past, the dot on today's line as drawn there, `yOnLine()`: smoothed or not, not at the hour's average, which left it off the line; 2026-11-11).
- Live: `values:state` onto today's line; redrawn every minute; refetched every 5 min.
- `dev/typicalday-preview.html` (`mock-typicalday.js`: the showcase house's power, never a real meter's), the preview frames `td-dark`/`td-light` (a green line over a soft band), the README screenshot `typicalday`. `npm run test-dashboards -- typicalday` (under Test charts). Not yet tried on the Homey or the phones.
- A tapped hour is the kit's `clockTime()` (`14:00`, or `2:00 PM` in 12 hours: the app's Time format, CLAUDE.md, 1.3.0).
- `smooth` is titled *Smooth chart lines* (Electricity's strings, in the catalog) since the settings review's second batch (2026-11-05).
- Legend (`legend`, right before `title`; 1.3.0, hint `legend.values`): Chart · Basic's setting, above (default), below or hidden, through `C.legendPlace()` (Charts' note). A missing value says Unavailable in the note when hidden.
- Chart height (`plotHeight`, right before `legend`; 1.3.0): Charts' note.
