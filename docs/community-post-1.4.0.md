<!--
A reply in the Homey Community topic (homeyCommunityTopicId 160453) announcing 1.4.0 in the test version.
Paste everything below this comment into the forum editor.

- Post it once 1.4.0 is released to Test, so the link opens 1.4.0. The full list and the Widget Builder's page are on
  GitHub main: merge v1.4.0 into main and push before posting. The teaser is docs/whats-next-1.4.0.png: upload it to
  the post.
-->

## :test_tube: Widgetkeeper 1.4.0 is in testing

Everything from 1.3.2, and: https://homey.app/a/com.thomassidor.widgetkeeper/test/

* **Widget Builder:** design a widget of your own from parts and put it on any Homey or web dashboard. You build it on the web dashboards (Widget Builder in the side pane), at its real size with live values:
  * Ready-made tiles that look like the normal widgets, and the parts they're made of: texts with values, icons, shapes, pictures, charts, gauges, rings, lists, calculated values, switches, buttons, sliders and more.
  * Rules that change a colour or an icon, or hide something, by a value: a dot that turns red while the front door is unlocked.
  * Buttons that set devices and variables, start Flows or open a dashboard, and designs that work with any device you pick where you place them.
  * Flow inputs: texts, numbers, colours and icons your Flows set, which any part can follow.
  * How it works: https://github.com/thomassidor/widgetkeeper/blob/main/docs/widgets/custom.md
* **New widget, Group Quick Action:** one tile that switches several devices at once, such as every light in a room or every lock, and shows when they're mixed.
* **Custom colours from Flows:** type `#FF8800` or `rgb()` for Device Values, Flow Buttons, Notes and Flow Tiles, plus White and Black on every colour card.
* **Smart Stack:** tabs instead of dots, with each page's icon and name.
* **Web dashboards:** every app setting can now be changed in their Settings.
* **Media:** one of its buttons beside ⋯, such as a power button. Thanks to @Ray_S for asking.
* **Decimals** for Device Values, Sparklines, Combined Value and Value Matrix.

The Widget Builder is new and large, so I'd love to hear what you build with it and what's missing.

Full list: https://github.com/thomassidor/widgetkeeper/blob/main/CHANGELOG.md
