# Third-party assets

All licences below were checked on 2026-10-07 against the sources named.

| Asset | Author / source | Licence | Where used | How verified |
|---|---|---|---|---|
| Chess pieces (12 SVGs, Cburnett set) | Cburnett. Files `Chess_{k,q,r,b,n,p}{l,d}t45.svg` on Wikimedia Commons, e.g. [`https://commons.wikimedia.org/wiki/File:Chess_klt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_klt45.svg) | **CC BY-SA 3.0** (attribution; share-alike applies to modified versions of the artwork). The author also offers GFDL 1.2+, GPL 2+ and BSD 3-clause on at least `Chess_klt45.svg`, but only CC BY-SA 3.0 was confirmed on all twelve files, so that is the one we rely on | `design/pieces/` | Wikimedia Commons API `extmetadata` for all 12 files: each reports CC BY-SA 3.0 |
| Atkinson Hyperlegible Next | The Atkinson Hyperlegible Next Project Authors (Braille Institute, Applied Design Works, Elliott Scott, Megan Eiswerth, Letters From Sweden), [`https://github.com/googlefonts/atkinson-hyperlegible-next`](https://github.com/googlefonts/atkinson-hyperlegible-next) | **SIL Open Font License 1.1.** Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors | `design/fonts/` | `OFL.txt` and `METADATA.pb` (`license: "OFL"`) in the google/fonts repository; text saved as `design/fonts/OFL-AtkinsonHyperlegibleNext.txt` |
| Zilla Slab | The Mozilla Foundation; designer Typotheque | **SIL Open Font License 1.1.** Copyright 2017 The Mozilla Foundation | `design/fonts/` | `OFL.txt` and `METADATA.pb` (`license: "OFL"`) in the google/fonts repository; text saved as `design/fonts/OFL-ZillaSlab.txt` |
| chessops | Niklas Fiekas, [`https://github.com/niklasf/chessops`](https://github.com/niklasf/chessops) | GPL-3.0-or-later | Dev dependency, used only as a test oracle; not shipped | `package.json` `license` field. Because it is not part of the shipped site, it does not affect the site's licence |

## Obligations
- **Pieces:** show the attribution below on /rules and keep the SVGs unmodified. If a piece is ever edited, the edited artwork must be released under CC BY-SA 3.0.
- **Fonts:** the OFL text ships alongside the font files (done). The fonts may be bundled and served but not sold on their own.

Attribution text for pieces (shown on /rules): "Chess pieces by Cburnett, licensed CC BY-SA 3.0 (`https://creativecommons.org/licenses/by-sa/3.0/`)."

## Code dependencies

Versions and licences read from each package's own `package.json` on 2026-10-07.

### Shipped in the running product
| Package | Version | Licence | Where |
|---|---|---|---|
| svelte | 5.57.2 | MIT | Client framework; compiled into the bundle |
| ws | 8.22.0 | MIT | WebSocket server, Node adapter only (the Cloudflare adapter uses the platform's own sockets) |

### Build and test only (not shipped)
| Package | Version | Licence |
|---|---|---|
| vite | 6.4.4 | MIT |
| @sveltejs/vite-plugin-svelte | 5.x | MIT |
| svelte-check | 4.7.6 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vitest | 2.1.9 | MIT |
| @playwright/test | 1.64.0 | Apache-2.0 |
| @axe-core/playwright | 4.13.0 | MPL-2.0 |
| @types/node, @types/ws | 22.x, 8.x | MIT |
| chessops | 0.14.2 | GPL-3.0-or-later |

**On chessops.** It is GPL-3.0-or-later and is used *only* as a test oracle: the engine's own move
generation is compared against it in `packages/engine/test/oracle.test.ts`. It is a devDependency,
is never imported by `packages/web` or `packages/server`, and is not present in any built artefact,
so it does not impose the GPL on the shipped site. If that ever changes, the licence must be
revisited before release.
