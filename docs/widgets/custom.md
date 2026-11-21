# Widget Builder

[← All widgets](../../README.md#widgets)

For [web dashboards](../../README.md#web-dashboards) only, for now: a widget you design yourself. On the web dashboards' front page, under **Widget Builder**, tap **New design**. The builder shows your design at its real size, with its live values:

- Tap a component on the left to add it at the bottom (or into the selected container), or drag it to where you want it.
- Drag a component to move it, or drag its corner to resize it. The components below move down to make room.
- On the right, the selected component's **Settings** (what it shows or changes, its position and size), **Style** (colour, icon, and a tile, pill or no background), **Rules** and **Flows**.
- The moon or sun in the bar switches the editor and the preview between dark and light.

Changes are saved as you go, and Undo takes them back. **Add to dashboard** puts the design on a web dashboard, or add it there yourself with Add widget → Widget Builder and pick it in the widget's settings. A change to a design shows on every dashboard that has it.

**Components:**
- **Layout:** Container, Text (with values in it: *Inside {1} · humidity {2}*, each a device value, a variable, a calculated value, the time, the date or the weekday), Icon, Shape (a rectangle, circle or line, in a colour or a gradient), Image (a picture from the web, or a device's own: a camera's snapshot, album art, read again every few minutes).
- **Display:** Value (large over two rows, with a graph if you like), Mini chart, Gauge, Level bar, Status (a dot that lights up), Flow value (only Flows fill it), Calculated value (up to 12 values summed, averaged, the lowest or highest and which one it is, a difference, a count such as *3 open*, or a formula like `(a + b) / 2`; it can stay hidden and only feed texts and rules), Time (a clock, the date, how long since a value changed, or the time left until a time of day), Ring (up to three rings, each a value between its minimum and maximum, the first value in the middle), Repeater (every device with a value, in a room or everywhere, listed by name; only those that are on or open if you like, as rows or tiles; a tap can switch one, and other components can use how many it shows: *{1} open*), Segmented bar (several values as shares of their sum or of a maximum, as a bar or a donut, listed under it), Trend (how much a value changed over the last hour, day or week, as an arrow and the change, or a percentage).
- **Controls:** Switch, Button (starts a Flow, or triggers *A Widget Builder button was tapped*), Slider, Stepper (− and +, for a setpoint or a number variable), Choice (one of a few options: a mode, a scene, a variable's value), Variable (a yes/no switches with a tap; a number or text is typed right in the tile), Widget state (an on/off or a choice that only the widget keeps, on that screen: for rules, texts, buttons, or to switch a container's pages).
- **Buttons** can do several things in order: set a device value or a variable (on, off, toggle or a value), start a Flow, open another web dashboard, set a widget state. They can ask for a second tap, or to be held.

**Make your own pieces from the built-in ones:** in a component's Style tab, turn off its icon, label, value or graph to keep only what you need: a bare bar, a bare line, a gauge's arc, a switch's toggle. A Text can be Big (32 px) and bold, so a text with a value in it is the big number. An Icon can follow a device value (a lock open or closed), and a rule can swap a component's icon as well as its colour. Any component that isn't a control can do things when tapped, like a button: a shape, a text, a picture or a whole container.

A **container** is a background (a colour or a gradient) that holds components of its own, snapped to a finer grid (12 columns), placed freely, or on **pages** (up to six) switched with tabs, dots or a widget state.

**Rules:** a component can change with its value, or with another one. When the value is above, below, is or is not something you type, it takes a colour or is hidden. The first rule that matches is used. Shapes, texts, icons, buttons and containers have no value of their own, so their rules check another: a dot that turns red while the front door is unlocked, a container that turns orange when the calculated power goes over 2,000 W. A Time's rules compare minutes (*no motion for 30 minutes*).

**Flow cards:** Flows can't change anything until you allow it. In a component's Flows tab you choose what Flows may change: its text, value, colour, icon, or whether it's shown. Only those components appear in the cards, named *Design · Component*. You also choose when those changes are reset: never, after 1 hour, or at midnight.
- *Set the text of …*, *Set the value of …*, *Colour …*, *Give … a custom colour*, *Give … the icon …*, *Show or hide …*, *Put … back as designed*
- *… is shown* (a condition)
- *A Widget Builder button was tapped* and *A Widget Builder choice was made* (triggers)

Starting a Flow or setting a variable needs the [API key](../../README.md#api-key).

**Settings:** the design; [colour style](../../README.md#colour-style).

## Looks

<p>
<img src="../variants/custom-light.webp" alt="Widget Builder: Light" width="300" align="top">
<img src="../variants/custom-vivid.webp" alt="Widget Builder: Vivid" width="300" align="top">
<img src="../variants/custom-container.webp" alt="Widget Builder: A container on its fine grid" width="300" align="top">
<img src="../variants/custom-free.webp" alt="Widget Builder: Light · Free-form, with a Flow's message" width="300" align="top">
<img src="../variants/custom-rules.webp" alt="Widget Builder: Rules: a door in red, a charger hidden" width="300" align="top">
<img src="../variants/custom-controls.webp" alt="Widget Builder: Light · Stepper, choice, variables, gauge" width="300" align="top">
<img src="../variants/custom-blocks.webp" alt="Widget Builder: Text with values, sums, the time and shapes" width="300" align="top">
<img src="../variants/custom-more.webp" alt="Widget Builder: Light · Pages by a state, ring, picture, repeater" width="300" align="top">
<img src="../variants/custom-split.webp" alt="Widget Builder: Segmented bar, donut and trends" width="300" align="top">
<img src="../variants/custom-bare.webp" alt="Widget Builder: Light · Parts turned off, big text, an icon" width="300" align="top">
</p>

---
[← All widgets](../../README.md#widgets)
