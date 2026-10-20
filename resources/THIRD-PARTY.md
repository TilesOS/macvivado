# Third-party components

MacVivado application code is MIT licensed. Bundled tools retain their upstream licenses, copyright notices, and source provenance.

- Electron: https://github.com/electron/electron/tree/v44.9.0 — licenses in the app's Electron resources.
- Monaco: https://github.com/microsoft/monaco-editor — version 0.57.0; MIT notices in packaged dependencies.
- React / React DOM: https://github.com/facebook/react — version 19.3.1; MIT notices in packaged dependencies.
- OSS CAD Suite: https://github.com/YosysHQ/oss-cad-suite-build/releases/tag/2026-10-19 — original unmodified darwin-arm64 archive. Its `oss-cad-suite/license/` directory contains the individual tool/dependency licenses. The upstream build repository records component source recipes and version pins.
- openXC7 nextpnr: https://github.com/openXC7/nextpnr/tree/3e5c2cdd256745fb5adb93f3ffe8c3795b1e7abf — ISC license in `openxc7/licenses/nextpnr.txt`.
- Project X-Ray: https://github.com/openXC7/prjxray/tree/ed3331c6200f421164101388759fc2860b0f5634 — ISC license in `openxc7/licenses/prjxray.txt`.
- Project X-Ray database: https://github.com/openXC7/prjxray-db/tree/517d66a383676cb971177ea92b0ff3b6ea6e8690 — CC0 1.0 license in `resources/licenses/prjxray-db.txt`.
- FASM: openXC7/prjxray's pinned FASM submodule, commit `2f57ccb1727a120e8cacbb95c578f3c71bdcc95a` — Apache 2.0 license in `openxc7/licenses/fasm.txt`.
- textX 4.3.0, Arpeggio 2.0.3, simplejson 3.20.2, intervaltree 3.1.0, sortedcontainers 2.4.0, PyYAML 6.0.3: notices included in their bundled Python distribution metadata.
- Boost 1.92.0, xz 5.8.4, and zstd 1.5.7: native libraries relocated from the local Homebrew build dependencies; license copies in `resources/licenses/`.

All build/data/tool archive checksums and matched source revisions are in `resources/toolchain.lock.json`. Native openXC7 binaries are locally built, then ad-hoc signed for this release, rather than presented as an upstream binary distribution.

Board presets are derived from Digilent's official https://github.com/Digilent/digilent-xdc/blob/master/Nexys-A7-100T-Master.xdc, retrieved 2026-10-19. An unchanged master XDC accompanies this file. SHA-256: `40b8d2b557673d90fbb20018210e4e3460c52e071696edaebd4b6ad5b00599e2`.
