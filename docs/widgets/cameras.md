# Cameras

[← All widgets](../../README.md#widgets)

<img src="../screenshots/cameras.png" alt="Cameras on a Homey dashboard" width="358">

Your cameras as a grid of snapshots that refresh every few seconds (cameras with only a video stream show a still from it). Tap one to watch it live, or pick one to be **Always live**: it plays by itself and fills the widget, a tap shows the other cameras, and it comes back after a minute. Where live video can't play, it stays on snapshots.

**Away from home:** snapshots come through Homey's cloud like everything else, but live video connects straight to the Homey, which Homey's cloud doesn't carry. So live view works on your home network, or away from home through a VPN to it (WireGuard, Tailscale, your router's own VPN). Without one, a tap says *Live view needs your home network or a VPN.*

**Battery cameras:** set **Refresh snapshots every** to anything from 5 minutes to 12 hours. The app then keeps each camera's last picture, so opening a dashboard shows that one and doesn't wake the camera. A new picture is only asked for when one is due and the dashboard is open. A tap still goes live.

**Settings:** cameras, layout (a large camera at the top or bottom, or one per row), refresh interval, how long live view stays on, always live, [rename tiles](../../README.md#tile-names), and Camera 1 to 6 for cameras missing from the device list, such as Synology Surveillance Station's: they list every device with a snapshot or video.

## Looks

<p>
<img src="../variants/cameras-light.webp" alt="Cameras: Light" width="300" align="top">
<img src="../variants/cameras-top.webp" alt="Cameras: Three cameras, the first large" width="300" align="top">
<img src="../variants/cameras-bottom.webp" alt="Cameras: Three cameras, the last large" width="300" align="top">
<img src="../variants/cameras-single.webp" alt="Cameras: Each camera at full width" width="300" align="top">
</p>

---
[← All widgets](../../README.md#widgets)
