Never run destructive or corruption test scenarios against the real CS 1.6 install. Use a temporary sandbox game directory for all sync/switching/corruption tests. The real install may only be touched by the normal user-facing sync flow.

CDP monkeypatching of `window.launcher` (contextBridge objects) NEVER works — they are frozen; the patch fails silently and real IPC fires. This has now caused two incidents (M8, M10d). For UI verification of sync/launch flows, use an isolated harness with a mock bridge, never the live app against the real install.

## Project status

M0-M9 are all done and pushed to origin/master. Launcher v0.1.0 is released (win+linux artifacts via GitHub Actions on tag push). v0.2.0 is pending: README, version bump, and tag. content-v1 is published with 5 theme packs.

Next steps: user is curating config/HUD/voiceover packs for content-v2 — generate the manifest with `scripts/generate-manifest.mjs`, publish via `gh release create` with `--tag content-v2 --latest=false` (so it doesn't become the default GitHub Release), then update the manifest URL in Settings once published.

Known conventions:
- Sandbox-only for destructive tests (see rule above).
- Stock CS 1.6 paths are flat, e.g. `cstrike/models/v_deagle.mdl` — there is no `models/weapons/` subfolder in the vanilla depot.
- The config mechanism (M9) execs variant/feature `.cfg` files via a managed block in `cstrike/autoexec.cfg`, delimited by BEGIN/END markers; everything outside the block is left untouched.

## Roadmap

- **M11.2** — server browser speed: source catalog cache with ~15min TTL + background refresh, raise A2S concurrency with short timeout + single retry, stream results to UI as they answer, measure time-to-first-20-servers.
- **M12** — background polling of favorites + system notifications with rules (player threshold, map match, quiet hours).
- **M13** — nickname tracking from A2S_PLAYER + profile export/import json.
- **Content tasks (manual, no code)**: content-v2 pack curation, README screenshots, custom map thumbnails.
- **Deferred**: crosshair overlay, Windows test, social/accounts, v0.3.0 release after M12-M13.