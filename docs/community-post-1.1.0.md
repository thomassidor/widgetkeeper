<!--
A reply in the Homey Community topic (homeyCommunityTopicId 160453) announcing 1.1.0 in the test version.
Paste everything below this comment into the forum editor.

- Images are on GitHub main: the poster docs/whats-next-1.1.0.png (`npm run whats-next`) and docs/forum/*.jpg
  (`npm run forum-images`); Discourse copies them on save. Push them before posting. No transparent PNGs here:
  Discourse turns a large one into a JPEG on white.
- Post it once build 10 (1.1.0) is released to Test, so the link opens 1.1.0. When it goes live, say so in a short
  reply of its own and update the first post (docs/community-post.md).
-->

## :test_tube: Widgetkeeper 1.1.0 is in testing

1.0.3 is live in the App Store, and the next version is in the test version now: five new widgets, popups from your Flows, and wide widgets on web dashboards. Try it here: https://homey.app/a/com.thomassidor.widgetkeeper/test/

![What's new in Widgetkeeper 1.1.0|690x1249](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/whats-next-1.1.0.png)

**Five new widgets**

* **Pollen and UV:** today's pollen at your Homey's location, a bar per type from low to very high, and when the UV peaks. Pick any of alder, birch, olive, grass, mugwort and ragweed; Detailed adds the next three days. Pollen forecasts cover Europe; elsewhere it shows the UV.
* **Web Page:** any web page on the dashboard, scaled to fill the widget on a phone and a tablet alike, with up to four buttons to switch addresses, such as a rain radar's hours or a map's zoom levels.
* **Lights by Room:** every room's lights on a card that switches and dims the whole room. Tap a room to open it: its Moods, then each light's brightness and colour.
* **Keypad:** up to three buttons behind a code, each starting a Flow or setting a device or variable: arm the alarm, unlock a door, allow an hour of TV. The codes are made on the app settings page, and a Flow card tells you whose code it was.
* **Popups:** see below.

**Popups**

A Flow shows a message, or asks a question with one or two buttons of your own (*Yes* and *No*, *Open* and *Ignore*, or just *Got it*), in front of everything: on a web dashboard, or on the phones and tablets with a Popups widget on their dashboard. A camera's picture or a doorbell's snapshot can come along, and a chime, a doorbell or an alert as it opens. The first answer from any screen closes it everywhere and goes back to the Flow as tags, in an Advanced Flow. On Homey's own dashboards the popup opens in the Homey app's browser, as a widget can't draw over the dashboard.

![A popup from a Flow over a web dashboard|690x470](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-popup.jpg)

**Web dashboards**

* **Wide widgets** across two or more columns, for a floor plan, a camera or a chart. Drag the handle on its right edge, or set its Width.
* **Column width** per dashboard: a phone's, normal, wide, or fit to the window.
* **Sections** on the front page: your dashboards under headings of your own.
* **A Keypad code** on a dashboard keeps a wall tablet on it: editing it, or going back to the others, takes the code.
* **Safer:** changing the password asks for the current one, and a browser's key needs permission to control devices to switch them.

![A chart across two columns on a web dashboard|690x470](https://raw.githubusercontent.com/thomassidor/widgetkeeper/main/docs/forum/web-wide.jpg)

**Also new**

* **Device Quick Actions:** activate with a double or a long press, so a stray tap can't unlock a door. For every tile, or only locks and garage doors. Contributed by Stefan Schweiger on GitHub.
* **Thermostat Presets:** Flow cards to run a button, check whether one is active, and start a Flow when one is tapped.
* **Charts and Sparklines:** Today and Yesterday as time spans, a calendar day instead of the last 24 hours.
* **Days Since:** show only the counters that are due, and it can be a Smart Stack page now.
* **Media:** up to eight buttons behind ⋯. **Notes:** a long note on as many lines as it needs.
* **App settings:** tidier, each part a card folded to one line that says where it stands.
* **Lighter on the Homey:** less kept in the app's settings, fewer large reads, and Smart Stack pages off screen pause.

Full list: https://github.com/thomassidor/widgetkeeper/blob/main/CHANGELOG.md

**Especially useful to hear**

* **Popups on Android:** I've only tried them on an iPhone. Do they open by themselves, and does the sound play?
* **Pollen and UV** outside Denmark: do the levels match what you're told locally?
* **Web Page** with the pages you'd like to show: which ones stay empty?
* **The Keypad** with your alarm or lock: does its state show, and do the buttons set it?
* **Lights by Room** with many rooms and lights, and **wide widgets** on your wall tablet.

I'll keep 1.1.0 in testing for a while before it goes to the App Store, so now is a good time for feedback :slight_smile:
