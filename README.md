# 1.6X Launcher

**Status: active development** — usable day-to-day, but still evolving; the
screenshots below reflect the current version, not a final design.

A custom launcher for a **licensed Steam copy of Counter-Strike 1.6** — a game
wrapper around a curated content build, with a live server browser and
self-updates. Windows and Linux, built with Electron + React.

The launcher never bundles or redistributes any Steam game files. It detects
your existing CS 1.6 install and layers an optional, versioned content pack
(models/sounds/sprites/configs) on top of it, tracking exactly what it
changed so it can restore your original files at any time.

## Features

- **Steam detection** — finds your Steam install and CS 1.6 library across
  Windows/Linux automatically (registry on Windows, `libraryfolders.vdf`
  parsing everywhere), no manual path entry required.
- **Server browser** — live GoldSrc/Source A2S queries (map, players, ping),
  favorites, quick-connect, and a "last server" card on Home that re-checks
  its live status every time you return.
- **Variant content packs** — a manifest-driven content system with
  selectable slots (e.g. pick one HUD/model theme out of several) and
  optional feature toggles, synced by hash against a remote manifest.
  Every file the launcher touches is tracked and **backed up before being
  overwritten**, so `Verify & Repair` can always restore your original files
  — the real game install is never modified outside that tracked set.
- **Config presets** — variant/feature `.cfg` files are exec'd through a
  managed block the launcher maintains inside your own `cstrike/autoexec.cfg`;
  everything outside that block is left untouched.
- **Self-updates** — the launcher updates itself via GitHub Releases
  (`electron-updater`), independently of content-pack versioning.
- **Headshot design system** — a from-scratch dark UI: an olive-accent token
  system, a live content-sync screen (per-file progress, ETA, verify/repair),
  a `Ctrl+K` command palette, and toasts — no legacy styling left over from
  earlier milestones.

## Screenshots

| Home | Servers |
| --- | --- |
| ![Home](docs/screenshots/Home.png) | ![Servers](docs/screenshots/Servers.png) |

| Content | Settings / Sync |
| --- | --- |
| ![Content](docs/screenshots/Content.png) | ![Settings / Sync](docs/screenshots/Settings.png) |

| Server Sources |
| --- |
| ![Server Sources](docs/screenshots/Settings2.png) |

## Install

Download the latest release for your platform from the
[Releases page](https://github.com/JoK3Rbro1337/cs16-launcher/releases/latest):

- **Windows** — download `16x-launcher-<version>.exe` and run the installer.
- **Linux** — download `16x-launcher-<version>.AppImage`, mark it executable,
  and run it:

  ```sh
  chmod +x 16x-launcher-*.AppImage
  ./16x-launcher-*.AppImage
  ```

The launcher checks for its own updates on startup; you generally only need
to do this once.

## Build from source

Requires Node.js 22+.

```sh
git clone https://github.com/JoK3Rbro1337/cs16-launcher.git
cd cs16-launcher
npm ci
npm run dev          # electron-vite dev server + Electron
```

Other useful scripts:

```sh
npm run typecheck    # tsc, main + preload + renderer projects
npm run build        # electron-vite build (no packaging)
npm run build:linux  # electron-vite build + electron-builder --linux (AppImage)
npm run build:win    # electron-vite build + electron-builder --win (NSIS installer)
```

Packaged builds are produced by `electron-builder` per `electron-builder.yml`
and are published automatically by CI (`.github/workflows/release.yml`) when
a `vX.Y.Z` tag is pushed.

## Authoring a content pack

Content packs are plain folders hashed into a manifest by
`scripts/generate-manifest.mjs`, then published as GitHub Release assets.

Folder convention (point `--content` at the directory containing these):

```
content/
  base/                    # always-synced, no selection needed
  slots/<slot>/<variant>/  # pick-one-of groups, e.g. slots/theme/aesthetic-models/
  features/<feature>/      # optional on/off toggles, e.g. features/hud-pack/
```

Every leaf folder is walked like a flat content tree — a file at
`slots/theme/aesthetic-models/cstrike/models/v_deagle.mdl` maps to the
in-game path `cstrike/models/v_deagle.mdl`. An optional `meta.json`
(`{"label": "Aesthetic Models"}`) in any slot/variant/feature folder sets its
display label; otherwise it's derived from the folder name. Any
`cstrike/*.cfg` file (other than `config.cfg`/`autoexec.cfg`) is
automatically treated as an exec'd config and wired into the managed
autoexec block when its variant/feature is active.

Generate and stage a manifest for release:

```sh
node scripts/generate-manifest.mjs \
  --content ./content \
  --version 1.4.2 \
  --repo <owner>/<repo> \
  --tag content-v2 \
  --stage ./release-assets
```

Then publish (content packs should **not** become the repo's default
release):

```sh
gh release create content-v2 ./release-assets/* manifest.json \
  --title "Content pack v1.4.2" --latest=false
```

Finally, point the launcher's Settings → Content manifest URL at the raw
`manifest.json` published for that tag.

## License

MIT
