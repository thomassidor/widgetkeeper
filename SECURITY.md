# Security

## Reporting a vulnerability

Please report it privately, through [GitHub's vulnerability reporting](https://github.com/thomassidor/widgetkeeper/security/advisories/new), not in a public issue or the community forum. Say what an attacker can do and how to reproduce it, and leave out real API keys, passwords and camera addresses.

This is a one-person project, so replies are best effort.

## What's covered

The latest version on the Homey App Store, and the code on `main` and the release branches. Most interesting:

- the web dashboards: the password, sessions, screen sign-in codes and everything reachable through Remote access
- the personal API key and the other secrets in `/userdata/secrets.json`
- the widgets' and the app's API routes, and the popups' prompt page
- anything that shows or runs other people's content, such as the Web Page widget or other apps' widgets

Not covered: Homey itself, its firmware or cloud, other Homey apps, and devices on the network. Please report those to their makers.

## Known and accepted

`npm audit` reports advisories in dependencies that have been looked at and accepted, each with its reason, in [`.github/audit-accepted.json`](.github/audit-accepted.json).
