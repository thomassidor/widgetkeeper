# Chart · Timeline and Chart · Stacked

**Built in 1.2.0** (2026-10-29); the widgets' notes (`.claude/rules/widgets/timeline.md`, `stacked.md`) say how they work
now. The user settled the open questions below: a colour setting per row and per layer (defaults the kit's `COLORS` in
order), per-capability words for true (open, motion, active, on), booleans only for now (no number thresholds), and a
layer below zero stacking downwards (two stacks) rather than being left out. This is the plan as it was.

Two chart types mocked up while planning 1.2.0's charts (2026-10-28) and kept for later; the user picked Chart · Scatter (XY),
Chart · Daily Profile, Chart · Min/Max and Chart · Ranking for 1.2.0, and wants these two too. Both build on what 1.2.0 made for chart
widgets, so each is mostly its own drawing:

- **The chart frame and mount helper** (`createFrame()`, `wireChart()` in `widgets/electricity/public/chart.js`;
  `.claude/rules/widgets/charts.md`).
- **One `/state` route** (`lib/chartState.ts`): the widget sends each value's window; `SparklineService.getWindows()`
  reads the Insights logs `planLogs()` picks (`lib/logPlan.ts`).
- **The settings catalog** (`scripts/chart-settings.json`, `npm run chart-settings`): the value pickers, the time span
  block (count, unit, leave out the current period), colour, header, colour style, already in 13 languages.
- **The four 1.2.0 chart widgets as patterns:** Chart · Ranking (rows of devices) is the closest to Timeline; Chart · Scatter (XY)
  (`alignSeries()`) to Stacked.

## Chart · Timeline (`timeline`)

When was it on, open or moving? A row per device over the day, bands where the value was true: the heating's on-time,
the hall's motion, the front door's openings, the TV.

**Mock-up** (2026-10-28): four rows (Heating orange, Hall motion yellow, Front door red, TV blue) over 00–24, each its
name above a thin track with bands, the hours to come dimmed, a dashed line at now. Header: `5:40 h · Heating on ·
today` and `4 · Front door opened`.

**Data: booleans, which Insights barely keeps.**
- A boolean log is only the last 50 changes, whatever the resolution (CLAUDE.md, *Insights*): under a day for a busy
  motion sensor.
- The Heatmap already solves this. `HeatmapService` records each boolean it's asked for (subscribing to its changes),
  keeps 15 days of `[t, 0 | 1]` in `/userdata/heatmap-history.json` (presence data, so not in an app setting), and
  backfills from Insights' 50 changes.
- So the Timeline should share that recording rather than read Insights. Add a getter there (e.g.
  `getChanges(deviceId, capabilityId, from)` returning the changes and the value now), and a route of the Timeline's
  own. `getWindows()` is for numbers.
- A value's first request starts its recording: before that, only the backfill. Draw what's known, the time before
  the first change hatched or empty, never guessed.
- Pickers list booleans with Insights: a `listSlots(query, 'boolean')` kind (the `kind` parameter exists for counters),
  from `heatmapCaps()`' booleans.

**Settings** (catalog):
- `slot1` … `slot8` ("Value 1" …, U+00A0 before the number, one slots card in the web editor, as Chart · Ranking's).
- The time span block, default today (`1d!`). Over days the bands get thin; the recording reaches about 14 days.
- Colours, to decide when building:
  - a colour per row (eight more rows of settings), or
  - the widget's colour for all rows, or
  - the kit's `COLORS` in order, row by row (the mock-up's look, no extra settings).

  The last is likely best.
- `title`, `showHeader`, `colorStyle`.

**Layout:**
- About 32 px per row, as Chart · Ranking sizes its height by its rows: the name, then a 10 px track (the text colour at 7 %),
  bands in the row's colour.
- The x axis from the chart kit's `timeLabels()` (0:00, 6:00, 12:00, Now), a dashed line at now, the future dimmed.
- A short band (a door opened for seconds) is at least 2–3 px wide.

**Header and taps:**
- Default: the first row's on-time over the span (`5:40 h`), and how often the second turned on. Or decide: the row
  with the most on-time.
- A tapped row shows its on-time and how many times it turned on.
- A tapped band shows `16:05–17:30`.

**Open questions:**
- What "true" means per capability: `alarm_contact` true is open, `onoff` true is on. The labels may want
  per-capability words ("open" against "on").
- Whether numbers above a threshold count (power over 10 W as "on").
- Activity Dots already shows recent activity; the Timeline is the day's history, not a status.

## Chart · Stacked (`stacked`)

Who uses the power? Several values stacked on one time axis: the heat pump, the EV charger, the oven, and with a total
the rest as Other.

**Mock-up** (2026-10-28): 24 hours of power, layers Other (grey), Heat pump (orange), Oven (red), EV (green) as filled
areas with a line on top, a legend row of dots and names. Header: `3.4 kW · Now · total` and `38 % · Heat pump · today`.

**Data:**
- Each value's window through `/state` (`lib/chartState.ts`, as Charts' several series), drawn on one grid with the
  chart module's `alignSeries()` (by `barUnit()`, or finer as Chart · Scatter (XY)'s `dotUnit()`), so the layers add up time by
  time.
- An optional total (the house's meter or main power): Other is total minus the layers, at zero at least, never
  negative.
- Units: the layers must share one unit. Homey's `measure_power` is W everywhere, but mixed capabilities may not be: show
  only those in the first layer's units, or scale (W/kW) where the units say so; the hint should say "the same kind of
  value, such as power".

**Settings** (catalog):
- `total` (optional "Total (the rest shows as Other)").
- `slot1` … `slot6` ("Value 1" …).
- The time span block, default 24 hours.
- `style` (area, as the mock-up, or bars: Charts' `style` values without line).
- Colours: the kit's `COLORS` in order per layer, Other grey (the same question as Timeline's).
- `legend` (above or below, Charts' setting).
- `title`, `showHeader`, `colorStyle` (Vivid: stronger areas, as Charts').

**Layout:**
- Charts' one-chart plot (122 px) with a value scale from zero (stacking needs zero).
- Each layer an area from the sum below it to the sum with it, drawn bottom up (Other first), a line on each top.
- The legend wraps over two lines where it must (the chips' row today doesn't wrap: Charts' legend CSS would need
  `flex-wrap`).

**Header and taps:**
- Default: the total now and the biggest layer's share of the span (`38 % · Heat pump`).
- A tap shows the total at that time and the layer under the pointer with its share.
- A cursor line, as Charts'.

**Open questions:**
- Whether a layer can go below zero (solar, a battery charging): stacking with negatives splits into two stacks. Leave
  them out at first, and say so in the hint.
- Share of what for a span: energy (the area) or the average power (the same over equal steps). Compute from the
  aligned rows' sums.

## Building each (the 1.2.0 checklist)

1. `widgets/<id>/`:
   - `api.ts` (a few lines, as `widgets/compare/api.ts`; Timeline's own reader as above)
   - `public/mount.js` (`wireChart()`; the kit's `spanSetting()`)
   - `public/widget.js` (a type on `createFrame()`)
   - `public/widget.css` (a `.wk-deep` Vivid rule; the colour from `--wk-c-bright`)
   - `public/index.html` (copy Chart · Ranking's)
2. **The catalog:** settings, hints and the widget's list in `scripts/chart-settings.json` (13 languages), then
   `npm run chart-settings` (writes `widget.compose.json`). Its name, height and `api` go in the compose file
   first.
3. **Strings** in `locales/*.json` (13, the widget's `DEFAULT_STRINGS` equal to en's), and `web.about.<id>` with the
   same line in `settings/dashboard.js`' fallback table.
4. **Wiring** (what 1.2.0's chart widgets each needed):
   - `lib/StackService.ts`' types; `lib/WebDashboardService.ts`' `CAPABILITY_SLOTS`; `lib/widgetAutocompletes.ts`
   - `widgets/stack/api.ts`, `widgets/stack/public/mount.js`' `DEPS` and `widget.js`' mounts
   - the Smart Stack's Flow card (`.homeycompose/flow/actions/stack_show.json`, the widget's name)
   - `test/helpers/loadWidget.ts`' `DEPS` and `WidgetName`
   - the lists in `test/color-scheme.test.ts`, `test/widget-mount.test.ts` and `test/widget-html.test.ts`, and a
     case in `test/widget-routes.test.ts`
   - `dev/mock-web-api.js`' pickers
   - `types/widgets.d.ts`
   - `scripts/render-previews.mjs`' frame map
5. **Renders:**
   - preview art in `dev/widget-previews.html` (`<prefix>-dark/-light`, a colour the other chart widgets don't use);
     `npm run previews -- <prefix>-dark <prefix>-light`
   - `dev/<id>-preview.html` with `dev/mock-<id>.js` (made-up readings of the showcase house, **on their steps' clock
     marks and the value now the last point's**, or the ticking render clock makes every render differ)
   - the screenshot page (`dev/screenshots.html`, `dev/showcase-mount.js`, `dev/mock-dashboard.js`);
     `npm run screenshots -- <id>`
6. **Docs:**
   - README gallery entry and section (alphabetical among the `Chart · …` ones), a sentence in each of the 13 store
     texts (before Days Since's), `CHANGELOG.md` under the version being built
   - `.claude/rules/widgets/<id>.md` and its CLAUDE.md row
7. **Test dashboards:** a builder in `scripts/test-dashboards.mjs` (lands under Test charts by itself: the section
   takes every widget in the catalog).
8. **Tests:** `test/<id>-widget.test.ts` (drawing, header, taps, windows, the mount's request). Then
   `npm run typecheck`, `npm test`, `npx homey app validate --level debug`.
