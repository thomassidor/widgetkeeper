# Cameras

[← All widgets](../../README.md#widgets)

<img src="../screenshots/cameras.png" alt="Cameras on a Homey dashboard" width="358">

Your cameras as a grid of snapshots that refresh every few seconds (cameras with only a video stream show a still from it). Tap one to watch it live.

**Away from home:** snapshots come through Homey's cloud like everything else, but live video connects straight to the Homey, which Homey's cloud doesn't carry. So live view works on your home network, or away from home through a VPN to it (WireGuard, Tailscale, your router's own VPN). Without one, a tap says *Live view needs your home network or a VPN.*

**Settings:** Camera 1 to 6, which list every device with a snapshot or video (Synology Surveillance Station's too), layout (a large camera at the top or bottom, or one per row), refresh interval, how long live view stays on, time format and [rename tiles](../../README.md#tile-names).

A widget set up before version 1.2.1 keeps the cameras picked under Devices until you fill in any of Camera 1 to 6: from then on it shows only those. So to change or remove one, fill in the cameras you want.

## Looks

<p>
<img src="../variants/cameras-light.webp" alt="Cameras: Light" width="300" align="top">
<img src="../variants/cameras-top.webp" alt="Cameras: Three, the first large" width="300" align="top">
<img src="../variants/cameras-single.webp" alt="Cameras: One camera at a time" width="300" align="top">
</p>

---
[← All widgets](../../README.md#widgets)
