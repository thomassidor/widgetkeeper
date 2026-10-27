<!--
A reply in the Homey Community topic (homeyCommunityTopicId 160453) announcing 1.1.1 in the test version.
Paste everything below this comment into the forum editor.

- Post it once 1.1.1 is released to Test, so the link opens 1.1.1. The full list is main's CHANGELOG.md: merge
  v1.1.1 into main and push before posting. No images.
-->

## :test_tube: Widgetkeeper 1.1.1 is in testing

Everything from 1.1.0, and: https://homey.app/a/com.thomassidor.widgetkeeper/test/

* **Charts:** two values on one chart can share one scale (*One scale for both*), so they compare directly, such as the temperature inside and out. Contributed by [Stefan Schweiger](https://github.com/stefan-schweiger) on GitHub.
* **Light Controls and Lights by Room:** a room's brightness counts only its dimmable lights that are on. Lights that only switch on and off counted as 100 %, so one light at 30 % with three switches on showed 83 %. A new *Room brightness* setting shows their average or the brightest one.
* **Web Page:** a site that doesn't allow being shown inside another page now says so, instead of leaving the widget blank.

Full list: https://github.com/thomassidor/widgetkeeper/blob/main/CHANGELOG.md
