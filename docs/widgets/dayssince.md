# Days Since

[← All widgets](../../README.md#widgets)

<img src="../screenshots/dayssince.png" alt="Days Since on a Homey dashboard: a list of chores with a bar each, plants watered 6 days ago in amber with 1 day left, the vacuum filter 3 months in red and 2 days overdue, and the fish just fed with Undo" width="358">

Counters for things you do every so often, such as watering the plants or changing the vacuum filter, in a list on one card. Each bar fills up towards the day the counter is due, with the time left under it; it turns amber, then red, after the days you set, and then shows how long it's overdue (*+2 d*). Tap a row when it's done to start again from *Today* (with **Undo** for a few seconds). Counters are kept on Homey by name, so every widget and screen with the same counter shows the same one.

Flow cards: *Reset [counter]*, *Set [counter] to [days] days ago*, the trigger *[counter] became overdue* (even with no dashboard open) and the condition *[counter] is overdue*; the last two also take *Any counter*.

**Settings:** days only or days, weeks and months; all counters, or only those that are amber and red (or only red), so the ones far from due don't take up room; [colour style](../../README.md#colour-style); up to eight counters, each with a name, an icon and the days until amber and red.

## Looks

<p>
<img src="../variants/dayssince-light.webp" alt="Days Since: Light" width="300" align="top">
<img src="../variants/dayssince-vivid.webp" alt="Days Since: Vivid" width="300" align="top">
<img src="../variants/dayssince-days.webp" alt="Days Since: Counted in days" width="300" align="top">
<img src="../variants/dayssince-due.webp" alt="Days Since: Light · Only what is due" width="300" align="top">
</p>

---
[← All widgets](../../README.md#widgets)
