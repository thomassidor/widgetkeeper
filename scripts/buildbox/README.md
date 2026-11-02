# The NAS build box

A Docker container on the Synology NAS at home that runs the Homey CLI and Claude Code with Remote Control, so a cloud session can install the app and build test dashboards on the home network while away (the cloud relay to the Homey turns down app uploads; 2026-11-01). `rc.sh` keeps a `claude remote-control` running for every folder on its list (`/work/buildbox/folders`, the main clone first) and starts more on request.

## Setting it up (DSM in a browser)

1. Package Center → **Container Manager**. File Station → the folder `docker/buildbox`.
2. Container Manager → Registry → `node` → Download → tag `22-bookworm`.
3. Image → `node:22-bookworm` → Run: name `buildbox`, **Enable auto-restart**, volume `docker/buildbox` → `/work`, execution command `sleep infinity` (for now).
4. Container → `buildbox` → Action → Open terminal → Create → `bash`:
   ```
   apt-get update && apt-get install -y tmux
   npm install -g @anthropic-ai/claude-code
   cd /work && git clone https://github.com/thomassidor/widgetkeeper.git
   cd widgetkeeper && git config --global credential.helper store && npm ci
   claude        # log in once, then /exit
   ```
   (`git clone` asks for a GitHub user and a personal access token; the credential helper keeps it, in the container's home, so `rc.sh add` can fetch.)
5. Stop the container, change its execution command to `bash /work/widgetkeeper/scripts/buildbox/rc.sh supervise` and start it again. From then on a container or NAS restart brings the Remote Control back by itself.

The logins (Claude, GitHub, Homey CLI) live in the container's home, so they survive a restart, not a re-created container.

## Using it

- `scripts/buildbox/rc.sh list`: the folders and whether each one's Remote Control runs.
- `scripts/buildbox/rc.sh add <name> [branch]`: a git worktree `/work/<name>` on a new branch `<name>` from `origin/<branch>` (default the main clone's branch), `npm ci`, and its own Remote Control. One Remote Control serves every session in its folder, so this is only for work that needs its own copy of the code.
- `scripts/buildbox/rc.sh remove <name>`: stops it and takes it off the list; the main folder always keeps one. The worktree stays (`git worktree remove /work/<name>` deletes it).
- A Remote Control that exits is started again after 5 s; a window that was closed, within 15 s. `/work/buildbox/rc.log` has the starts and exits; `tmux attach -t rc` shows them (Ctrl-b d leaves).
- A supervised folder is marked trusted in `~/.claude.json`, as nobody is there to answer Claude Code's question.

## Homey CLI there

`npx homey login` prints a link; open it, and paste the code from the page it ends on (an address on `localhost` that won't load: the code is after `code=`). The NAS is on the home network, so `npx homey app install`, `npm run diagnostics` and `npm run test-dashboards` work as from the PC.
