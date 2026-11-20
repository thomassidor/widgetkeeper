# Widget Builder

[← All widgets](../../README.md#widgets)

For [web dashboards](../../README.md#web-dashboards) only, for now: a widget you design yourself. On the web dashboards' **Widget Builder** page, you put parts on a grid of four columns and save the design. Then you place it on any web dashboard with Add widget → Widget Builder and pick the design in its settings. A change to a design shows on every dashboard that has it.

**Parts:**
- **Show:** Value (big on two rows, with its line over a span if you like), Mini chart, Gauge, Level bar, Status (a dot that lights up), Flow value (only Flows fill it).
- **Control:** Switch, Button (starts a Flow, or fires *A Widget Builder button was tapped*), Slider, Stepper (− and +, for a setpoint or a number variable), Choice (one of a few: a mode, a scene, a variable's value), Variable.
- **Layout:** Container, Text, Icon.

A **container** is a background (a colour or a gradient) that holds parts of its own, on a finer grid (12 columns, 8 px rows) or placed freely.

**Rules:** a part can change with its value: above, below, is or is not a value turns it a colour, or hides it. The first rule that holds wins.

**Flow cards:** nothing is open to Flows until you say so. In a part's Flow tab you choose what a Flow may change: its text, value, colour, icon, or whether it's shown. Only those parts appear in the cards, named *Design · Part*. You also choose when a Flow's change goes back: never, after an hour, or at midnight.
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
