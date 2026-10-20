# MacVivado

An Electron, React, TypeScript, and Monaco desktop IDE for Verilog labs on the **Nexys A7-100T**. Editing, simulation, waveform inspection, and real bitstream generation work without a board. The Program action requires a live, identified target and a current successful build.

The delivered native build targets **Apple Silicon, macOS 27 or later** and was built on macOS 27.0.1. The openXC7 binaries and bundled Homebrew-derived libraries in this release have a macOS 27 deployment target. Intel Macs and earlier macOS versions are not verified by this bundle.

## Install

1. Open `release/MacVivado-0.1.0-arm64.dmg` and drag MacVivado into Applications, or use the delivered `.app`. A local installed copy is also provided in `~/Applications/MacVivado.app`.
2. Launch MacVivado from Finder. Open **Toolchain & board settings → Install tools**. This verifies the bundled archive SHA-256 checksums and installs tools under `~/Library/Application Support/MacVivado/toolchains/`.
3. Choose an example, select a new project folder, and run **Simulate** or **Build**.

The tool archives are included for offline installation; the installer can fetch the exact official OSS CAD archive if that bundled archive is missing. No Homebrew, Vivado, Docker, Rosetta, or shell configuration is needed to run the delivered app. The build is ad-hoc signed locally, not Developer ID notarized; distribution to other Macs may require the recipient's normal macOS approval for a downloaded application. MacVivado is an independent project, not an AMD or Digilent product.

## Workflow

- **Open** chooses a folder containing `macvivado.json`. The last opened project is restored at launch.
- Edit ordinary `.v`, `.sv`, `.vh`, `.svh`, and `.xdc` files in the project tree. Tabs show unsaved changes. Simulate and Build save open files before running.
- **Project configuration** opens `macvivado.json`. Add new files to the appropriate source list; synthesis and simulation have separate top modules.
- **Simulate** runs Icarus with `-g2012` and the configured testbench top. The testbench must write `wave.vcd` in its working directory using `$dumpfile("wave.vcd")` and `$dumpvars`. `$fatal` fails a run. Runtime is limited to 100 ms–60 seconds (10 seconds by default), tool output to 16 MiB, and waveform output is monitored while running and limited to 16 MiB. A producer can briefly overshoot the VCD threshold between 50 ms checks. The viewer limits itself to 512 signals / 250,000 transitions and labels truncation. Very dense rows request zooming instead of drawing a misleading trace.
- **Waveforms** offers signal filtering and selection, binary/hex values, zoom, pan, and two independent cursors. Times are VCD ticks; the timescale is displayed. Click a trace to move the selected cursor, or use its numeric field / arrow keys.
- **Build** runs Yosys `synth_xilinx`, openXC7 nextpnr's native Himbaechel Xilinx backend, Project X-Ray `fasm2frames`, and `xc7frames2bit` for `xc7a100tcsg324-1`. The preprocessor and synthesizer support a subset of SystemVerilog. Successful software generation does not establish physical board operation.
- **Cancel** terminates the running process group, escalating to SIGKILL after one second.
- **Run history** loads retained diagnostics/logs; **Artifacts** opens that run's directory in Finder.
- **Program** uses `openFPGALoader --board nexys_a7_100 --usb-serial-num SERIAL --write-sram`. USB enumeration alone does not enable programming. The selected Digilent cable must expose exactly one XC7A100T IDCODE (`0x03631093`, revision nibble masked). The app rechecks the target, input fingerprint, tool checksums, and bitstream SHA-256 immediately before a write, then checks detection again afterwards. No flash option is exposed.

Each run retains `run.json`, `run.log`, its complete input snapshot, and produced files under `.macvivado/builds/`, `.macvivado/simulations/`, or `.macvivado/programming/`. Runs are never silently deleted. The navigator shows up to 60 recent records. Build fingerprints include all ordinary non-hidden project files and the toolchain ID, including include/data files; files must stay inside the project with no symlinks. Input limits are 4096 files, 16 MiB per file, 64 MiB total. The editor limit is 2 MiB per file. Keep unrelated assets outside the project directory. Hidden source files are not supported. A failed or canceled new build clears the previous ready state. Changes invalidate the ready state, and program-time hashing catches external changes even if a file watcher misses an event.

Run directories can contain a generated `iverilog-support` symlink to the installed tool bundle. This works around Icarus's internal launcher quoting; source project symlinks remain rejected. Synthesis similarly stages include directories under safe relative aliases when necessary. Neither workaround changes project HDL or XDC files.

## Project format

```json
{
  "version": 1,
  "name": "LED blink",
  "board": "nexys-a7-100t",
  "top": "top",
  "sources": ["rtl/top.v"],
  "includeDirectories": [],
  "defines": {},
  "constraints": ["constraints/nexys.xdc"],
  "simulation": {
    "sources": ["sim/tb.v"],
    "top": "tb",
    "timeoutMs": 10000
  }
}
```

Paths are relative to the project folder. Define values are simple preprocessor literals. Synthesis sources are also available to simulation. Paths containing spaces are tested, including source filenames and include directories. Changing `version` to an unsupported value fails explicitly.

## Board constraints

The preset is derived from [Digilent’s official Nexys A7-100T master XDC](https://github.com/Digilent/digilent-xdc/blob/master/Nexys-A7-100T-Master.xdc); an unchanged copy is in `resources/boards/`. Both `PACKAGE_PIN` and `IOSTANDARD` are required for every synthesized top-level port. `SW[8]` and `SW[9]` require **LVCMOS18**; the preset preserves those standards. Duplicate pins, unknown ports, voltage mismatches, missing constraints, and unsupported Tcl fail before routing. Supported constraints are `set_property PACKAGE_PIN`, `set_property IOSTANDARD`, their `-dict` form, and a single `create_clock -period 10` on the E3 oscillator input. Simple `-name`, `-add`, and the board's `{0 5}` waveform can be normalized. Multi-port targets, wildcards, generated clocks, timing exceptions, arbitrary Tcl, and other properties fail with diagnostics.

## Examples

| Project | Board behavior to verify later | Simulation checks |
|---|---|---|
| LED blink | LED0 toggles every 0.5 seconds | Exact toggle period with a shorter simulation parameter |
| Switch to LED | Each of 16 switches drives its LED | 256 switch patterns |
| Button counter | Center increments the rightmost decimal digit; down resets | Short-bounce rejection, no hold-repeat, decimal wrap, segment encoding, reset |

All three produce real bitstreams with the delivered native toolchain. Evidence is in [docs/example-verification.json](docs/example-verification.json); physical verification remains pending in [docs/HARDWARE-CHECKLIST.md](docs/HARDWARE-CHECKLIST.md).

The delivery also includes `release/example-artifacts/`, containing all three generated `.bit` files, VCDs, run logs, fingerprints, and bitstream checksums. Those artifacts do not bypass the app's current-build programming checks.

## Keyboard controls

| Action | Shortcut |
|---|---|
| Open project | ⌘O |
| Save file | ⌘S |
| Save all | ⌥⌘S |
| Close tab | ⌘W |
| Toggle navigator | ⌘B |
| Simulate / cancel | F5 / ⇧F5 |
| Build | ⇧⌘B |
| Program SRAM | ⌥⌘P |
| Editor find / replace | ⌘F / ⌥⌘F |

Click a problem to navigate to its file and line. Tabs and controls are keyboard accessible. The result-panel divider supports arrow keys. Appearance can be switched between dark and light.

## Build from source

Requires Node 24+, Apple's Command Line Tools, and a native ARM64 Mac. Dependency versions are pinned in `package-lock.json`. The app intentionally exposes no fake-device mode or fixture injection through IPC.

```sh
npm ci
node node_modules/electron/install.js
# Only needed if the delivered resources/tools archives are absent:
brew install cmake ninja boost eigen pkgconf python@3.12
bash scripts/bootstrap-native.sh
npm test
npm run verify:examples
npm run package
```

The bootstrap script checks out exact openXC7 source/database revisions, verifies the pinned official OSS CAD Suite archive, builds native Xilinx tools and the XC7A100T chip database, copies their dependent dylibs into the bundle, and emits `resources/toolchain.lock.json`. `npm run tools:prepare` repackages an existing `.cache/toolchain` after a local source build. Its output is a new local lock, not an upstream-published binary release. Python FASM conversion uses the supported pure-Python textX parser; its upstream fallback notice in logs is expected.

For a development launch using staged tools: `MACVIVADO_TOOLCHAIN_ROOT="$PWD/.cache/toolchain" npm start`. Development-only `MACVIVADO_USER_DATA` and `MACVIVADO_PROJECT` select isolated test folders. Packaged releases ignore these overrides. `npm run test:e2e` runs the actual Electron workbench with Playwright; native integration tests require the staged tool bundle. Programmer fixtures are confined to `tests/programmer.test.ts`, never used by the app.

Initial scope excludes Vivado project/IP import, block diagrams, ILA, DDR, VHDL, and persistent flash programming.
