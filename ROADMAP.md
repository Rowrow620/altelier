# Atelier roadmap

Refactor each area as we fix or extend it. Keep modules focused on a responsibility
and verify changes through the existing screens.

## Current structure

| Area | Finding | Planned boundary |
| --- | --- | --- |
| `electron/main.js` | Wires startup, the Windows tray, and application services. | Keep Steam discovery in `electron/games` and metadata scans in `electron/library`. |
| `src/App.tsx` | Composes the screens and reports launch status. Settings and installed mods have separate hooks. | Keep profile changes and update checks behind the desktop API. |
| `electron/preload.js` and `shared/contracts.ts` | The preload and renderer share types. Main-process handlers validate incoming requests. | Keep the bridge narrow as install and update actions expand. |
| `electron/catalog` | The Nexus adapter owns provider queries and headers. The catalog service owns cache expiry and rate limits. | Keep provider behavior in the adapter and caching in the service. |
| UI components | Browse separates filters and cards. Modal dialogs (`InstallModal`, `SaveProfileDialog`, `ModDetailsModal`) use native `<dialog>` elements with Escape handling and focus restoration. | Keep components focused and verify keyboard navigation across views. |

## Implementation order

### 1. Safe file operations and settings

- [x] Extract `electron/config/store.js` for validated settings, migration of existing
  settings, and atomic writes. Let callers update specific settings so an old
  screen snapshot cannot overwrite newly installed or enabled mods.
- [x] Extract `electron/files/paths.js` for checks that files stay inside the selected
  mods folder, including links and junctions.
- [x] Extract `electron/install/service.js` for archive inspection, temporary
  extraction, replacement decisions, and recovery if installation fails.
- [x] Move app message registration into `electron/ipc/register.js`. Validate the
  calling frame and inputs before invoking services. Apply the same boundary to
  deletion, folder opening, settings changes, and external links.
- [x] Update the vulnerable development dependency found during the audit.
  Rechecked via `pnpm audit`: no known vulnerabilities are currently flagged (`picomatch` 4.0.7).

**Done when** invalid requests cannot change unrelated files, oversized or invalid
archives fail safely, and replacement requires a decision from the user.
Add regression tests for the confirmed deletion and archive-name problems.

The file safety implementation, regression checks, and dependency audit are clear.
Imports currently allow 512 MB compressed, 2 GB unpacked, 256 MB per file, and
20,000 entries.

### 2. Reliable Browse and simpler screen state

- [x] Send Atelier's name and version in Nexus requests.
- [x] Reuse cached pages for five minutes, keep offline results for up to seven
  days, and pause requests when Nexus sends a rate limit.
- [x] Keep adult and unclassified listings out of Browse and its offline cache.
  Users can download adult mods directly from Nexus Mods and install supported
  ZIPs using Import.
- [x] Extract `src/hooks/useConfig.ts` and `src/hooks/useLibrary.ts`. Keep loading,
  errors, refreshes, and changes scoped to the right game.
- [x] Share request and response types in `shared/contracts.ts`. Use one set of
  game definitions and start without sample mods or demo paths.

**Done when** filters and offline results work across game switches, failed actions
produce clear messages, and Nexus requirements are documented for release.

### 3. Real game discovery and activation

- [x] Discover Steam libraries and game installs through the Steam manifests.
- [x] Use game-specific launch modes. Use Lobotomy Mod Manager when selected,
  and use Ruina's native mod mode for Steam Workshop and local mods.
- [x] Scan local and Ruina Workshop mods separately. Read bounded previews on demand.
- [x] Protect Workshop folders from editing or removal in Atelier.
- [x] Move disabled native mods outside the loader's folder and recover interrupted
  file operations before launch.
- [ ] Verify a clean Vanilla launch and in-game mod loading for each game. Real
  mod imports, enable and disable, and removal passed in isolated folders. Both
  local modified copies produced game windows in modded mode.

**Done when** one real mod per game can be imported, enabled, loaded, disabled, and
removed. Vanilla launch and modded launch must be verified in each game.

### 4. Better installation and updates

- [x] Recognize supported ZIP layouts and report missing loader or folder
  requirements.
- [x] Record installed files, Nexus IDs, and versions. Allow details to be added
  to older imports.
- [x] Check public, linked versions and declared Nexus requirements on demand.
  Download replacements through Nexus and apply them using **Update from ZIP**.
- [x] Save per-game profiles for the native mods folder and recover interrupted
  switches.
- [ ] Add signed-in Nexus downloads to a registered public build. Use the
  download API for eligible Premium accounts and the website's **Download with
  Manager** handoff for free accounts.

**Done when** imports, replacements, updates, and profile switches leave the
library consistent after failures and retries.

### 5. Windows test release

- [x] Configure Windows x64 installer packaging (`electron-builder` NSIS target) and generate app icons.
- [x] Complete `ModDetailsModal` native `<dialog>` keyboard access, Escape handling, and focus management parity with `InstallModal`.
- [x] Verify automated checks (`pnpm run check`), preload/contract consistency tests, and `pnpm audit`.
- [ ] Smoke-test the packaged NSIS installer on a clean Windows user account.
- [ ] Run end-to-end Vanilla and Modded game launch verification with clean game installs.
- [ ] Complete Nexus Mods registration for public distribution and document any loader caveats from testing.

**Done when** testers can complete the supported flow from Browse through Play
using the installer.

Packaging, keyboard dialog parity, and CI checks are complete. Clean-account
installer smoke testing, clean game launch verification, and Nexus Mods
registration remain manual pre-release steps.
