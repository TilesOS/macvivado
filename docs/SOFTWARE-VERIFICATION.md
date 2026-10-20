# Software verification — MacVivado 0.1.0

Software verification completed on October 19, 2026 (America/New_York), on an ARM64 Mac running macOS 27.0.1. **No Nexys board was available. No successful physical detection or programming is claimed.**

## Delivered build

- Installed app: `/Users/tylermcclure/Applications/MacVivado.app`.
- Packaged app: `release/mac-arm64/MacVivado.app`.
- Installer: `release/MacVivado-0.1.0-arm64.dmg` (offline tool archives included).
- Native tools: `xc7-3e5c2cdd-oss-20261019`, with 1057 checked tool/support/database files and pinned archive checksums.
- Distribution: Apple Silicon, macOS 27+. Locally ad-hoc signed; not Developer ID notarized.

## Passed software checks

| Check | Evidence / result |
|---|---|
| Native blink baseline before UI expansion | Real Yosys → nextpnr → Project X-Ray build, 3.6 MiB `.bit` |
| All three example bitstreams | Blink, switch-to-LED, seven-segment counter: success |
| All three self-checking simulations | Success; real Icarus VCDs captured; no error diagnostics |
| Installed tool path with spaces | All six example operations also passed using tools under `Library/Application Support/MacVivado/` |
| Core/native tests | 26 tests passed across three suites |
| Desktop workflow | Electron test passed: Monaco editing, save/reopen, navigator shortcut, simulation, signal selection/filtering, binary values, zoom, cursor delta, build, syntax-error navigation |
| Installed packaged app | Electron test passed with `app.isPackaged === true`, system-only PATH, app-managed tools, real simulation/build, and Program disabled while disconnected |
| Offline tool installation | Bundled archives extracted into app-managed storage after size/SHA-256 validation; installed file checksums verified |
| Finder launch | Opened `~/Applications/MacVivado.app` through Finder; verified the rendered workbench and native tools status |
| Native example creation | Used the installed app's native save panel to create `.cache/Finder verified blink`; its real simulation and bitstream build both passed |
| Native keyboard action | F5 in the Finder-launched app started and completed another real simulation with VCD output |
| Native ARM64 / signing | Main executable identified as ARM64; `codesign --verify --deep --strict` passed |
| Installer integrity | `hdiutil verify` passed |

The 26 automated tests include missing tools, HTTP download failure, corrupt checksums, unsupported project versions, path traversal/symlink rejection, unsafe/unknown/duplicate pin assignments, missing or incorrect clock constraints, missing top-level constraints, actual HDL syntax errors, process cancellation, runtime/output/VCD limits, stale inputs, tampered bitstreams, failed-build readiness, and source/include/project paths containing spaces.

Programmer orchestration tests use **isolated software fixtures only**. They verify USB serial selection, target mismatch refusal, the exact volatile-SRAM command, fresh provenance checks, multiple targets, disconnection, post-write disconnection, and transfer failures. Fixtures cannot be selected through the production preload/IPC interface. The actual openFPGALoader scan on this Mac returned no USB devices.

## Evidence files

- `docs/example-verification.json`: six real example results, input fingerprints, timestamps, stages, and bitstream hashes.
- `docs/verification/unit-native-tests.txt`: passing automated core/native output.
- `docs/verification/desktop-test.txt`: passing desktop workflow test.
- `docs/verification/installed-app-test.txt`: passing installed packaged-app workflow test.
- `release/example-artifacts/`: bitstreams, VCDs, complete logs, run records, and a checksum manifest.
- `release/SHA256SUMS.txt`: final installer/source artifact checksums.

## Deferred physical checks

USB detection with an actual board, FPGA identity on that board, volatile programming, visible LED/switch/seven-segment behavior, and physical disconnect/reconnect behavior remain **unverified**. Complete `docs/HARDWARE-CHECKLIST.md` when the board is available. A passing software build or fixture test does not change that status.
