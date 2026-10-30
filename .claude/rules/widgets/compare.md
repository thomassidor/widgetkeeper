---
paths:
  - "widgets/compare/**"
  - "test/compare-*.test.ts"
  - "dev/compare-preview.html"
  - "dev/mock-compare.js"
---
# Chart · Ranking widget (`compare`, called Compare while it was built; renamed 2026-10-30, as the other chart widgets, by what it offers)

- One value from up to eight devices side by side, a row each on one shared bottom scale (`kit.xValueScale()` with `left` past the names and `edge`): the name, its lowest to highest over the time span as a soft bar, the value now as a dot, the value with its units at the right (tight before °/%, as the header). Sorted highest first (or lowest first, or as picked); a missing value's row says Unavailable, last. One of the four chart types the user picked from the 1.2.0 mock-ups ("which room is warmest?"). Not transparent: `homey-widget`. On the chart frame and mount helper (Charts' note); its height follows its rows (26 px each).
- Names: the device's; one device's several values by their capability; a device name twice, both parts. Cut with … to about 36 % of the width.
- Settings (17, from `scripts/chart-settings.json`): `slot1`…`slot8` ("Value 1" …, U+00A0 before the number, so the web editor makes them one slots card; the hint on the first; Sparklines' `listSlots`), the time span block for the ranges (`count`, `span`, `leaveOut`; default today, `1d!`), `sort` ("Order": `high` default, `low`, `listed`), `showRange` ("Show the range", on), `title` (the chip's label, else the first value's capability), `showHeader` (its own hint), `color` (blue), `colorStyle` (Vivid: the ranges in the widget's colour).
- `GET /state?charts=<slot>~<span>~<from>~<end>~<unit>,…` → `{charts, language}`, one per picked value (empty ones left out by the mount; `count` tells the widget how many windows).
- Header: the highest now in the widget's colour and the lowest, muted, each `Highest · <name>`; a tapped row (kept as its value's place in the settings) shows its value and its range (`19,8–23,4°C`, `Range`), its dot ringed.
- Live: `values:state` onto every row with that value (not on 6-hourly spans); redrawn every minute; refetched every 5 min.
- `dev/compare-preview.html` (`mock-compare.js`: the showcase house's six rooms, never real readings), the preview frames `cp-dark`/`cp-light` (rows of soft bars and blue dots), the README screenshot `compare`. `npm run test-dashboards -- compare` (under Test charts). Not yet tried on the Homey or the phones.
