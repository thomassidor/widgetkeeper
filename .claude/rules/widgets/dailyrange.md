---
paths:
  - "widgets/dailyrange/**"
  - "test/dailyrange-*.test.ts"
  - "dev/dailyrange-preview.html"
  - "dev/mock-dailyrange.js"
---
# Chart · Daily Range widget (`dailyrange`)

- A value's lowest to highest in each bar's time as a floating bar, its average as a tick across it (`C.buckets()` three times, `agg` `min`, `max`, `avg`): how much did it swing? One of the four chart types the user picked from the 1.2.0 mock-ups. Not transparent: `homey-widget`. On the chart frame and mount helper (Charts' note); Charts' one-chart layout (122 px), the span as the x axis (the chart kit's `timeLabels()`), the bars by `C.barUnit()` (a day over up to 28 days, an hour over a day, a month over a year) on every slot to the span's end (future ones empty, as Totals per Period's).
- Settings (10, from `scripts/chart-settings.json`): `slot` ("Value"), the time span block (`count`, `span`, `leaveOut` on their own rows; default the last 4 weeks, `4w`: always 28 day bars, where this month had few early on and a rolling 30 days turns weekly), `average` ("Average tick", on), `range` (Charts' Scale), `title`, `showHeader` (its own hint), `color` (blue), `colorStyle` (Totals per Period's hint: Vivid bars at 90 %).
- `GET /state?charts=<slot>~<span>~<from>~<end>~<unit>~fine` (Charts' `lib/chartState.ts`): `fine` keeps up to 400 points of the window (`MAX_METER_POINTS`) instead of 120, so a day's low and high come from its hourly (or 5-minute) averages; over eight days Insights only has 6-hour averages, so the bars are milder than the real extremes (the README says so).
- Header: the latest bar's (or the tapped one's) high in the widget's colour and low, muted, each `High · tir. 28` (`whenText()` by the bar's unit, not its length: a rolling span's last bar ends now). A tap picks the bar under the pointer (kept as its start).
- Live: `values:state` into the bar under way (not on 6-hourly spans); redrawn every minute; refetched every 5 min.
- `dev/dailyrange-preview.html` (`mock-dailyrange.js`: the showcase house's outdoor temperature), the preview frames `dr-dark`/`dr-light` (yellow floating bars with ticks), the README screenshot `dailyrange` (the last 4 weeks). `npm run test-dashboards -- dailyrange` (under Test charts). Not yet tried on the Homey or the phones.
