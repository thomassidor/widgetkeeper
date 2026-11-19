<!--
A reply in the Homey Community topic (homeyCommunityTopicId 160453) announcing 1.3.2 in the test version.
Paste everything below this comment into the forum editor.

- Post it once 1.3.2 is released to Test, so the link opens 1.3.2. The full list is main's CHANGELOG.md: merge
  v1.3.2 into main and push before posting. No images.
-->

## :test_tube: Widgetkeeper 1.3.2 is in testing

Everything from 1.3.1, and: https://homey.app/a/com.thomassidor.widgetkeeper/test/

* **Temperatures in °C or °F:** a new **Configure → Temperature** setting. *Automatic* follows your Homey's units, so a Homey set to imperial now shows °F everywhere: Device Values, the charts, Room Health, Value Matrix, Thermostat Presets, Weather Forecast and the rest. The temperatures you type in widget settings (Room Health's range, an OK range, a chart's threshold) are in that unit too. Thanks to @Martin_Martinez for asking.
  If you typed a °C threshold before and your Homey uses °F, type it again in °F. Room Health's default range becomes 64–75 °F.
* **Tile shadows:** the light-mode shadow under the tiles is no longer cut off at the bottom. Thanks again to @saschaeggi.

Full list: https://github.com/thomassidor/widgetkeeper/blob/main/CHANGELOG.md
