# Atelier Mod Manager

Desktop mod manager for **Lobotomy Corporation** and **Library of Ruina**.

---

## Features

- **Project Moon Theme:** Dark charcoal and amber theme modeled after Roland's Atelier workshop and the Library.
- **Dual Game Support:** Switch between **Lobotomy Corporation** and **Library of Ruina** in the sidebar.
- **Browse Mods:** Search Nexus Mods by name, author, or all fields. Filter by category, sort by downloads or endorsements, and open listings in your browser. Browse excludes adult listings.
- **Top Bar Launchers:** **Launch Vanilla** and **Launch Modded ([X])** actions connected to Steam and game-specific loaders.
- **Mod Cards & Details Dialog:** Toggle switches, author/version metadata, category tags, folder shortcuts, screenshot previews, and editable version/Nexus tracking inside an accessible `<dialog>` modal.
- **Automatic Metadata Detection:** Reads `Info.txt`, `README.md`, configs, and extracts mod names and descriptions.
- **Drag-and-Drop Installation:** Drop a `.zip` mod archive onto the import dialog to validate, unpack, and activate it.
- **Atomic File Safety:** ZIP archives are validated and unpacked in a temporary transaction directory with rollback recovery on restart. Replacing and deleting a mod require confirmation.
- **Directory Detection:** Detects Steam libraries from VDF manifests and supports custom mod folders (such as `E:\Lobotomy mod manager\mod list`).

---

## Quick Start

### Launching the App
On Windows, double-click `Launch Atelier.wsf` to open the built app without a console window. You can also launch it from an existing terminal:
```bash
pnpm start
```

While Atelier is running, click its Windows tray icon to bring the window forward.

### Development Mode (with hot-reload)
```bash
pnpm run dev
```

To see renderer logs in the terminal while running the built app, use `pnpm debug`.

### Build for Production
```bash
pnpm run build
```

### Package Windows Installer
```bash
pnpm run package:win
```

Outputs an unpacked portable directory (`pnpm run package:dir`) and Windows x64 NSIS installer under `release/`.

### Contributor checks

Run `pnpm check` to type-check the renderer, run the offline catalog tests, and build the app.

Imports support ZIPs up to 512 MB, with up to 2 GB unpacked, 256 MB per file,
and 20,000 files and folders. Links, junctions, duplicate names, and paths that
leave the mod folder are rejected. The mods folder itself must be a real folder.

Settings are saved through `electron/config/store.js`. Path checks live in
`electron/files/paths.js`, archive inspection and installation in
`electron/install`, and app message validation in `electron/ipc/register.js`.
The file safety regression tests run with `pnpm test`.

### How Browse works

For 18+ mods, download them directly from Nexus Mods. If the download is a supported ZIP, use **Import** in Atelier and select the game.

`BrowseOnlineView` calls `atelierApi.searchCatalog` with the game, query,
page, sort, and filters.
The preload bridge passes the request to Electron's main process. The catalog
service validates the request and saves successful pages in Electron's user data
directory. Browse reuses matching results for five minutes and can show them
offline for up to seven days. Refresh requests current results as soon as Nexus
allows new requests. The offline cache only serves explicitly non-adult listings.

The Nexus adapter sends Atelier's name and version and applies filters and sorting
before pagination. The adapter and catalog service live in `electron/catalog`.
The preload and renderer share request and response types in `shared/contracts.ts`.
The catalog tests use a saved Nexus response and run without a network connection.

Nexus Browse uses its public API. It sends Atelier's name and version, keeps a
local cache, and excludes listings without a confirmed non-adult classification.
Downloads start on Nexus Mods in the browser. Atelier imports ZIP files from disk.

### Game folders and launch modes

- **Lobotomy Corporation** uses a BaseMod install for native mods. If the game
  folder points to Lobotomy Mod Manager, use that manager to enable mods and
  start the game. Vanilla requires a clean game install.
- **Library of Ruina** loads local mods from
  `LibraryOfRuina_Data/Mods` in modded mode. A legacy BaseMod-patched install
  requires a separate clean install for Vanilla. Steam Workshop items appear
  in the library and are managed through Steam.
- For native mods, disabling moves the folder to a sibling storage directory.
  Enabling moves it back. Atelier reads previews when you open a mod's details.

### Installing and updating mods

- Use **Import** for a ZIP containing one mod. Atelier recognises the standard
  BaseMod and Ruina folders and reports missing loader or folder requirements.
- Use **Check updates** in Library to compare versions and look for declared
  Nexus requirements. Add a Nexus mod link and the installed version in the
  mod's details if the ZIP did not provide them.
- Download the replacement ZIP from Nexus Mods, then use **Update from ZIP**
  in the installed mod's details. Atelier keeps the mod's existing enabled state.
- Use **Save profile** to save the current game's enabled mods. The profile
  selector switches layouts for that game when Atelier manages its native
  mods folder. Steam Workshop and external mod managers manage their own selections.
