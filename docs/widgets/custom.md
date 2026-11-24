# Widget Builder

[← All widgets](../../README.md#widgets)

For [web dashboards](../../README.md#web-dashboards) only, for now: a widget you design yourself. Open **Widget Builder** from the side pane (or the banner on the front page): it lists your designs; open one, or tap **New design**. The builder shows your design at its real size, with its live values:

- Tap a component on the left to add it at the bottom (or into the selected container), or drag it to where you want it: the cells it will cover light up.
- A tap on the design selects the whole thing under it: a container (a ready-made tile) with everything in it. Tap again for the component inside under your finger, and again for one hidden underneath; a tap on a pages container's tab shows that page.
- Drag a component to move it, into a container or out of one, or drag an edge or corner to resize it. The components below move down to make room.
- Keys: the arrows move the selected component a cell (Shift resizes it), **Delete** removes it, **Escape** goes up to its container and then lets go; Ctrl or ⌘ with **Z** undoes, **Shift+Z** redoes and **D** duplicates.
- On the right, the selected component's **Settings** (what it shows or does, its position and size), **Style** (how it looks: a tile, a pill (Quick Actions' and Device Values' pill) or no background, its colour and text colour, a text's size, an icon), **Rules** and **Flows**. Every colour is one of the twelve, drawn as Muted or Vivid draws them, or one of your own.
- At the top: how many dashboard columns the design spans (its grid gets four columns per column), a column's width, Muted or Vivid. The moon or sun in the bar switches the editor and the preview between dark and light.

Changes are saved as you go; Undo and Redo are in the bar, and Duplicate beside a component's name. **Add to dashboard** puts the design on a web dashboard, as wide as it's made for, or add it there yourself: Add widget lists every design under **Widget Builder**. A change to a design shows on every dashboard that has it.

**Any device:** a device value can be *the widget's device* instead of one device: the design then works with any device, picked in the widget's settings where it's placed. The builder shows it with a preview device of your choosing.

**Your own ready-mades:** **Save as ready-made** (a component's Settings) keeps a copy of it, a whole tile with everything in it, to drag into this design or another, and for a **Repeater**, which shows it once for each of its devices (those you pick, or every device with a value, in a room or everywhere), its values of the widget's device filled in with each. They're under the library's **Ready-made** tab. One dragged into a design is a **Linked ready-made**: a change to the ready-made shows wherever it's used, and you can move and resize it but not change it there; **Detach** (its Settings) turns it into a copy of its own to change. The bin beside one in the library deletes it, and its linked copies become copies of their own.

**Components** are primitives, each one thing, to put together as you like:
- **Ready-made:** Value tile, Two values (a value with a second one at the end of its name's line, as Device Values' second value), Chart tile, Gauge tile, Level tile, Status tile, Slider tile, Trend tile, Clock and Flow value tile. Each asks for its device value and adds a container of the primitives below (an icon, the value, the device's name, a graph), to change or take apart. They look like the normal widgets: the Value tile as [Device Values](values.md)', the Chart tile as [Sparklines](sparklines.md)', the Gauge tile as [Chart · Gauge](gauge.md)'s dial, the Slider tile as [Light Controls](lights.md)'.
- **Layout:** Container, Text, Icon, Shape (a rectangle, circle or line, in a colour or a gradient), Image (a picture from the web, or a device's own: a camera's snapshot, album art, read again every few minutes), Repeater (a ready-made of your own, once per device).
- **Display:** Sparkline (a value's history as a line, as [Sparklines](sparklines.md)' line, smoothed if you like), Chart ([Chart · Basic](charts.md)'s chart of up to three values over any [time span](charts.md#time-spans), as areas, lines or bars, smoothed, the scale fitted or from zero, below zero in yellow, the values at the top, the legend above, below or not at all, and the scale and times), Arc ([Chart · Gauge](gauge.md)'s dial, with its colour by level and the range over a time span), Bar (a level bar, the same options as the Arc), Ring (up to three rings, each a value between its minimum and maximum), Segmented bar (several values as shares of their sum or of a maximum, as a bar or a donut), List (every device with a value, in a room or everywhere, listed by name; only those that are on or open if you like; a tap can switch one, and other components can use how many it shows: *{1} open*), Calculated value (not drawn: up to 12 values summed, averaged, the lowest or highest, a difference, a count, a formula like `(a + b) / 2`, a value's change over the last hour, day or week, or the minutes since it changed, for texts and rules to use).
- **Controls:** Switch ([Quick Actions](quickactions.md)' tile with [Variables](variables.md)' switch; on as a tint or a lighter tile), Button ([Flow Buttons](flows.md)' round button: starts a Flow, or triggers *A Widget Builder button was tapped*), Slider ([Light Controls](lights.md)' bar), Stepper (Variables' − and +, for a setpoint or a number variable), Choice ([Variable Presets](varpresets.md)' buttons: a mode, a scene, a variable's value), Variable (as a row of Variables: a yes/no switches with a tap, a number has − and +, a number or text is typed right in the tile; or read only), Widget state (an on/off or a choice that only the widget keeps, on that screen: for rules, texts, buttons, or to switch a container's pages).
- **Buttons** can do several things in order: set a device value or a variable (on, off, toggle or a value), start a Flow, open another web dashboard, set a widget state. They can ask for a second tap, or to be held.

**A Text** holds values where you put `{1}`, `{2}` …: a device value or its device's name, a variable, a calculated value, the time (with or without seconds), the date, the weekday, how long since a value changed (*8 min. ago*), or the time until a time of day. Its sizes are [Notes](textline.md)' (Small, Default, Large) and Big (32 px, its values' units smaller as Chart · Gauge's), its long text cut short, scrolling or on more lines, as Notes'; it can be a Notes Post-it, or secondary (lighter) text, and a Flow can set its text or a value with units. **An Icon** can follow a device value (a lock open or closed), and a rule can swap any component's icon as well as its colour. Any component that isn't a control can do things when tapped, like a button: a shape, a text, a picture or a whole container. Switch, Stepper, Choice, Variable and Button can turn off their own icon or label in the Style tab.

A **container** is a tile, a pill or just a background (a colour or a gradient), filled by a value's level if you like (Device Values' *Fill percentages by level*), that holds components of its own, snapped to a finer grid (12 columns), placed freely, or on **pages** (up to six) switched with tabs, dots or a widget state.

**Rules:** a component can change with its value, or with another one. When the value is above, below, is or is not something you type, it takes a colour or is hidden. The first rule that matches is used. Shapes, texts, icons, buttons and containers have no value of their own, so their rules check another: a dot that turns red while the front door is unlocked, a container that turns orange when the calculated power goes over 2,000 W. A calculated *minutes since a change* lets a rule say *no motion for 30 minutes*.

**Flow cards:** Flows can't change anything until you allow it. In a component's Flows tab you choose what Flows may change: its text, value, colour, icon, or whether it's shown. Only those components appear in the cards, named *Design · Component*. You also choose when those changes are reset: never, after 1 hour, or at midnight.
- *Set the text of …*, *Set the value of …*, *Colour …*, *Give … a custom colour*, *Give … the icon …*, *Show or hide …*, *Put … back as designed*
- *… is shown* (a condition)
- *A Widget Builder button was tapped* and *A Widget Builder choice was made* (triggers)

Starting a Flow or setting a variable needs the [API key](../../README.md#api-key).

**Settings:** the design; the device, for a design that works with any device; [colour style](../../README.md#colour-style).

## Looks

<p>
<img src="../variants/custom-light.webp" alt="Widget Builder: Light" width="300" align="top">
<img src="../variants/custom-vivid.webp" alt="Widget Builder: Vivid" width="300" align="top">
<img src="../variants/custom-container.webp" alt="Widget Builder: A container on its fine grid" width="300" align="top">
<img src="../variants/custom-free.webp" alt="Widget Builder: Light · Free-form, with a Flow's message" width="300" align="top">
<img src="../variants/custom-rules.webp" alt="Widget Builder: Rules: a door in red, a charger hidden" width="300" align="top">
<img src="../variants/custom-controls.webp" alt="Widget Builder: Light · Stepper, choice, variables, gauge" width="300" align="top">
<img src="../variants/custom-blocks.webp" alt="Widget Builder: Text with values, sums, the time and shapes" width="300" align="top">
<img src="../variants/custom-more.webp" alt="Widget Builder: Light · Pages by a state, ring, picture, list" width="300" align="top">
<img src="../variants/custom-split.webp" alt="Widget Builder: Segmented bar, donut and trends" width="300" align="top">
<img src="../variants/custom-bare.webp" alt="Widget Builder: Light · The primitives on their own" width="300" align="top">
<img src="../variants/custom-widgets.webp" alt="Widget Builder: A pill, two values, zones, a Post-it" width="300" align="top">
</p>

---
[← All widgets](../../README.md#widgets)
