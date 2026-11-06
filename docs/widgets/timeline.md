# Chart · Timeline

[← All widgets](../../README.md#widgets)

<img src="../screenshots/timeline.png" alt="Chart · Timeline on a Homey dashboard: today's heating, hall motion, front door and TV as rows with coloured bands where each was on, open or moving" width="358">

When was it on, open or moving? A row for each of up to eight on/off values (the heating, a motion sensor, a door), over today or up to about two weeks, with a band where it was. Homey keeps only a value's last 50 changes, so the app records them itself from the first time they're shown, shared with the [Insights Heatmap](heatmap.md); before that, a row is dotted.

A row can also be a number, on above or below a threshold (the heater above 50 W, the bedroom below 18 °C), from Insights' history.

**Settings:** values 1 to 8 each with its colour, for a number its threshold and above or below, and an optional name, [time span](charts.md#time-spans), title, the values at the top, [colour style](../../README.md#colour-style).

## Looks

<p>
<img src="../variants/timeline-light.webp" alt="Chart · Timeline: Light" width="300" align="top">
<img src="../variants/timeline-vivid.webp" alt="Chart · Timeline: Vivid" width="300" align="top">
<img src="../variants/timeline-no-header.webp" alt="Chart · Timeline: Without the header" width="300" align="top">
<img src="../variants/timeline-threshold.webp" alt="Chart · Timeline: Light · Numbers: on above or below a limit" width="300" align="top">
<img src="../variants/timeline-week.webp" alt="Chart · Timeline: 7 days" width="300" align="top">
<img src="../variants/timeline-names.webp" alt="Chart · Timeline: Light · Your own names, in Vivid" width="300" align="top">
</p>

---
[← All widgets](../../README.md#widgets)
