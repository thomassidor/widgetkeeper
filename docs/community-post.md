<!--
The first post of the Homey Community topic (homeyCommunityTopicId 160453).
Paste everything below this comment into the forum editor.

- The images are on GitHub main (push before posting); Discourse copies them on save.
  The widget previews are the README's (docs/previews/*-dark.png, 480 × 420, shown at 120 × 105). The dashboards and
  the web dashboards are docs/forum/*.jpg (`npm run forum-images`: on the brand background, since Discourse turns a
  large transparent PNG into a JPEG on white), 1380 wide, shown at 690. The poster is docs/whats-new-1.0.0.png.
- The widgets are only their previews and names, each linking to its README section: with 33 widgets, a description
  each made the post too long. The poster of the next version is docs/whats-next-1.1.0.png (`npm run whats-next`).
- Mark anything that's only in the test version with ":soon:". When a version goes live, remove its marks, update
  "What's new in the next version" and the version numbers.
-->

![Widgetkeeper widgets on a Homey dashboard on a tablet|690x457](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/showcase-home.jpg)

Hi all,

I've been building **Widgetkeeper**, an app with dashboard widgets for Homey Pro. My aim was widgets that sit next to Homey's own without standing out: the same tile sizes, fonts, colours and dark mode, so a dashboard still looks like one dashboard.

> :white_check_mark: **Widgetkeeper 1.0.3 is live in the Homey App Store:** https://homey.app/a/com.thomassidor.widgetkeeper/
>
> :test_tube: **Test version:** the next version (1.1.2), with five new widgets, popups from your Flows and wide widgets on web dashboards, is in testing. Widgets marked :soon: are only in the test version for now: https://homey.app/a/com.thomassidor.widgetkeeper/test/

## The widgets

Tap a widget for what it does and its settings on GitHub. Every widget follows Homey's light and dark mode and is translated into all 13 of Homey's languages.

| | | | |
|---|---|---|---|
| [![Activity Dots|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/sensordots-dark.png)](https://github.com/thomassidor/widgetkeeper#activity-dots)<br>**[Activity Dots](https://github.com/thomassidor/widgetkeeper#activity-dots)** | [![Cameras|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/cameras-dark.png)](https://github.com/thomassidor/widgetkeeper#cameras)<br>**[Cameras](https://github.com/thomassidor/widgetkeeper#cameras)** | [![Charts|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/charts-dark.png)](https://github.com/thomassidor/widgetkeeper#charts)<br>**[Charts](https://github.com/thomassidor/widgetkeeper#charts)** | [![Clock|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/clock-dark.png)](https://github.com/thomassidor/widgetkeeper#clock)<br>**[Clock](https://github.com/thomassidor/widgetkeeper#clock)** |
| [![Curtains|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/curtains-dark.png)](https://github.com/thomassidor/widgetkeeper#curtains)<br>**[Curtains](https://github.com/thomassidor/widgetkeeper#curtains)** | [![Dashboard Shortcuts|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/shortcuts-dark.png)](https://github.com/thomassidor/widgetkeeper#dashboard-shortcuts)<br>**[Dashboard Shortcuts](https://github.com/thomassidor/widgetkeeper#dashboard-shortcuts)** | [![Days Since|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/dayssince-dark.png)](https://github.com/thomassidor/widgetkeeper#days-since)<br>**[Days Since](https://github.com/thomassidor/widgetkeeper#days-since)** | [![Device Quick Actions|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/quickactions-dark.png)](https://github.com/thomassidor/widgetkeeper#device-quick-actions)<br>**[Device Quick Actions](https://github.com/thomassidor/widgetkeeper#device-quick-actions)** |
| [![Device Values|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/values-dark.png)](https://github.com/thomassidor/widgetkeeper#device-values)<br>**[Device Values](https://github.com/thomassidor/widgetkeeper#device-values)** | [![Electricity Overview|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/electricity-dark.png)](https://github.com/thomassidor/widgetkeeper#electricity-overview)<br>**[Electricity Overview](https://github.com/thomassidor/widgetkeeper#electricity-overview)** | [![Energy Price Strip|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/price-dark.png)](https://github.com/thomassidor/widgetkeeper#energy-price-strip)<br>**[Energy Price Strip](https://github.com/thomassidor/widgetkeeper#energy-price-strip)** | [![Flow Buttons|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/flows-dark.png)](https://github.com/thomassidor/widgetkeeper#flow-buttons)<br>**[Flow Buttons](https://github.com/thomassidor/widgetkeeper#flow-buttons)** |
| [![Insights Heatmap|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/heatmap-dark.png)](https://github.com/thomassidor/widgetkeeper#insights-heatmap)<br>**[Insights Heatmap](https://github.com/thomassidor/widgetkeeper#insights-heatmap)** | [![Keypad|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/keypad-dark.png)](https://github.com/thomassidor/widgetkeeper#keypad)<br>**[Keypad](https://github.com/thomassidor/widgetkeeper#keypad)** :soon: | [![Light Controls|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/lights-dark.png)](https://github.com/thomassidor/widgetkeeper#light-controls)<br>**[Light Controls](https://github.com/thomassidor/widgetkeeper#light-controls)** | [![Lights by Room|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/lightrooms-dark.png)](https://github.com/thomassidor/widgetkeeper#lights-by-room)<br>**[Lights by Room](https://github.com/thomassidor/widgetkeeper#lights-by-room)** :soon: |
| [![Locks and Doors|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/locks-dark.png)](https://github.com/thomassidor/widgetkeeper#locks-and-doors)<br>**[Locks and Doors](https://github.com/thomassidor/widgetkeeper#locks-and-doors)** | [![Media|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/media-dark.png)](https://github.com/thomassidor/widgetkeeper#media)<br>**[Media](https://github.com/thomassidor/widgetkeeper#media)** | [![Notes|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/textline-dark.png)](https://github.com/thomassidor/widgetkeeper#notes)<br>**[Notes](https://github.com/thomassidor/widgetkeeper#notes)** | [![Pollen and UV|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/pollen-dark.png)](https://github.com/thomassidor/widgetkeeper#pollen-and-uv)<br>**[Pollen and UV](https://github.com/thomassidor/widgetkeeper#pollen-and-uv)** :soon: |
| [![Popups|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/popups-dark.png)](https://github.com/thomassidor/widgetkeeper#popups)<br>**[Popups](https://github.com/thomassidor/widgetkeeper#popups)** :soon: | [![Room Health|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/roomhealth-dark.png)](https://github.com/thomassidor/widgetkeeper#room-health)<br>**[Room Health](https://github.com/thomassidor/widgetkeeper#room-health)** | [![Sensor Alarms|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/sensoralarms-dark.png)](https://github.com/thomassidor/widgetkeeper#sensor-alarms)<br>**[Sensor Alarms](https://github.com/thomassidor/widgetkeeper#sensor-alarms)** | [![Smart Stack|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/stack-dark.png)](https://github.com/thomassidor/widgetkeeper#smart-stack)<br>**[Smart Stack](https://github.com/thomassidor/widgetkeeper#smart-stack)** |
| [![Spacer|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/spacer-dark.png)](https://github.com/thomassidor/widgetkeeper#spacer)<br>**[Spacer](https://github.com/thomassidor/widgetkeeper#spacer)** | [![Sparklines|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/sparklines-dark.png)](https://github.com/thomassidor/widgetkeeper#sparklines)<br>**[Sparklines](https://github.com/thomassidor/widgetkeeper#sparklines)** | [![Thermostat Presets|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/thermostat-dark.png)](https://github.com/thomassidor/widgetkeeper#thermostat-presets)<br>**[Thermostat Presets](https://github.com/thomassidor/widgetkeeper#thermostat-presets)** | [![Timers|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/timers-dark.png)](https://github.com/thomassidor/widgetkeeper#timers)<br>**[Timers](https://github.com/thomassidor/widgetkeeper#timers)** |
| [![Value Matrix|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/valuematrix-dark.png)](https://github.com/thomassidor/widgetkeeper#value-matrix)<br>**[Value Matrix](https://github.com/thomassidor/widgetkeeper#value-matrix)** | [![Variable Presets|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/varpresets-dark.png)](https://github.com/thomassidor/widgetkeeper#variable-presets)<br>**[Variable Presets](https://github.com/thomassidor/widgetkeeper#variable-presets)** | [![Variables|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/variables-dark.png)](https://github.com/thomassidor/widgetkeeper#variables)<br>**[Variables](https://github.com/thomassidor/widgetkeeper#variables)** | [![Weather Forecast|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/weather-dark.png)](https://github.com/thomassidor/widgetkeeper#weather-forecast)<br>**[Weather Forecast](https://github.com/thomassidor/widgetkeeper#weather-forecast)** |
| [![Web Page|120x105](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/previews/webpage-dark.png)](https://github.com/thomassidor/widgetkeeper#web-page)<br>**[Web Page](https://github.com/thomassidor/widgetkeeper#web-page)** :soon: |  |  |  |

## :soon: What's new in the next version (1.1.2)

* **Five new widgets:** Pollen and UV, Web Page, Lights by Room, Keypad (buttons behind a code, such as arming the alarm), and Popups.
* **Popups:** a Flow shows a message or asks a question with buttons of your own, with a camera's picture if you like, in front of everything on a web dashboard or on your phones and tablets. The answer goes back to the Flow.
* **Web dashboards:** wide widgets across two or more columns, a column width per dashboard, and sections on the front page.
* **Device Quick Actions:** activate with a double or long press, so a stray tap can't unlock a door (by @stefan-schweiger). **Thermostat Presets:** Flow cards for its buttons. **Charts and Sparklines:** Today and Yesterday.
* **Days Since:** show only the counters that are due, and as a Smart Stack page. **Media:** eight buttons. **Notes:** long text on more lines.
* **Charts:** one scale for both values on one chart (by @stefan-schweiger). **Light Controls and Lights by Room:** a room's brightness counts only its lit dimmable lights. **Web Page:** says so when a site can't be shown in it.
* **Charts and Sparklines:** this and last week, month and year, and averages without stray decimals. **Charts:** today and yesterday (or this and last week) on one chart, and the legend below the chart. **Keypad:** the state's colour across the whole widget. **Lights by Room:** rename rooms and lights.

![What's new in Widgetkeeper 1.1.0|690x1249](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/whats-next-1.1.0.png)

Full list: https://github.com/thomassidor/widgetkeeper/blob/main/CHANGELOG.md

## :desktop_computer: Web dashboards

Your Widgetkeeper widgets in any browser on your home network: a wall tablet, an old iPad, a computer or a TV. Build the dashboards on the page itself, with the same settings and live updates as on Homey, a background per dashboard, a menu to jump between them (Dashboard Shortcuts), and your other apps' widgets on them too. :soon: In the next version: wide widgets across columns, sections on the front page, and popups from your Flows over the dashboard. Turn them on under **Apps → Widgetkeeper → Configure**; the page asks for a Homey API key, and optionally a password. More on GitHub: https://github.com/thomassidor/widgetkeeper#web-dashboards

[grid mode=carousel]

![A web dashboard in a browser|690x470](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-dashboard.jpg)

![A light web dashboard|690x470](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-light.jpg)

![The web dashboards front page|690x470](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-front.jpg)

![Editing a web dashboard|690x470](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-editor.jpg)

![A widget's settings on a web dashboard|690x552](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-settings.jpg)

![A chart across two columns on a web dashboard|690x470](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-wide.jpg)

![A popup from a Flow over a web dashboard|690x470](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-popup.jpg)

[/grid]

## :key: API key

Flow Buttons, Variables and Variable Presets (to change a value), the Smart Stack, Media's buttons and Light Controls' Moods need a Homey API key, which you add under **Apps → Widgetkeeper → Configure**; :soon: so do the Keypad's buttons with a Flow or a variable, and Lights by Room's Moods. Tick these permissions when you create it under **Settings → API Keys**: **Variables** to change variables, **Start Flows** for Flow Buttons and flows on Media's and the Keypad's buttons, **Flows** for a speaker's own actions on Media's buttons, **Set Moods** for the Moods, and **Homey** for the Smart Stack (there's no permission for dashboards alone). The details, also for the web dashboards' key: https://github.com/thomassidor/widgetkeeper#api-key

## Dashboard examples

Seven dashboards from a made-up house, on a tablet in Homey's dark mode (the Garden in light mode); Security and Climate are in the Vivid colour style. Swipe through them:

[grid mode=carousel]

![Home dashboard|690x457](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/showcase-home.jpg)

![Energy dashboard|690x457](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/showcase-energy.jpg)

![Security dashboard|690x457](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/showcase-security.jpg)

![Climate dashboard|690x457](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/showcase-climate.jpg)

![Evening dashboard|690x457](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/showcase-evening.jpg)

![Garden dashboard|690x457](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/showcase-garden.jpg)

![Kitchen dashboard|690x457](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/showcase-kitchen.jpg)

[/grid]

**Home**, **Energy**, **Security**, **Climate**, **Evening**, **Garden** and **Kitchen**. Some of them use the next version's widgets: the Keypad on Security, a Web Page with a rain radar on Climate, Lights by Room on Evening, and Pollen and UV in the Garden. What's on each one: https://github.com/thomassidor/widgetkeeper#dashboard-examples

## :speech_balloon: Feedback wanted

All feedback is welcome. I'm especially interested in:

* **Does it look and feel like Homey?** Spacing, fonts or colours that look off next to Homey's own widgets, on a phone or on a tablet.
* **Your devices.** A thermostat, alarm or light that doesn't show up or behaves oddly. Please tell me the brand and model.
* **Translations.** If you speak one of the languages, wording that sounds wrong.
* **What's missing.** A widget you'd like to see next.

If something doesn't work, open **Apps → Widgetkeeper → Configure** in the Homey app and pick the device. That page has a diagnostics report you can paste here (it doesn't include passwords, API keys or camera URLs).

The source is on GitHub, and you can also open issues there: https://github.com/thomassidor/widgetkeeper

I hope you find this useful :slight_smile:
