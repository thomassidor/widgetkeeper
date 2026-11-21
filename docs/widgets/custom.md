# Widget Builder

[← All widgets](../../README.md#widgets)

For [web dashboards](../../README.md#web-dashboards) only, for now: a widget you design yourself. On the web dashboards' front page, under **Widget Builder**, tap **New design**. The builder shows your design at its real size, with its live values:

- Tap a component on the left to add it at the bottom (or into the selected container), or drag it to where you want it.
- Drag a component to move it, or drag its corner to resize it. The components below move down to make room.
- On the right, the selected component's **Settings** (what it shows or changes, its position and size), **Style** (colour, icon, and a tile, pill or no background), **Rules** and **Flows**.
- The moon or sun in the bar switches the editor and the preview between dark and light.

Changes are saved as you go, and Undo takes them back. **Add to dashboard** puts the design on a web dashboard, or add it there yourself with Add widget → Widget Builder and pick it in the widget's settings. A change to a design shows on every dashboard that has it.

**Components:**
- **Layout:** Container, Text, Icon.
- **Display:** Value (large over two rows, with a graph if you like), Mini chart, Gauge, Level bar, Status (a dot that lights up), Flow value (only Flows fill it).
- **Controls:** Switch, Button (starts a Flow, or triggers *A Widget Builder button was tapped*), Slider, Stepper (− and +, for a setpoint or a number variable), Choice (one of a few options: a mode, a scene, a variable's value), Variable.

A **container** is a background (a colour or a gradient) that holds components of its own, snapped to a finer grid (12 columns) or placed freely.

**Rules:** a component can change with its value. When the value is above, below, is or is not something you type, it takes a colour or is hidden. The first rule that matches is used.

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
</p>

---
[← All widgets](../../README.md#widgets)
