# Nexys A7-100T physical verification

**Status: ALL THREE EXAMPLES, USB RECONNECT, AND SOURCE-CHANGE BUILD GATING VERIFIED — real USB detection, FPGA identity, SRAM programming, LED blink, all 16 switch-to-LED mappings, the button-controlled seven-segment counter, idle USB disconnect/reconnect, and requiring a fresh build after saving an HDL change passed on October 20, 2026. Interrupted-transfer recovery and power-cycle checks remain pending.**

Software bitstream generation and testbench results are recorded separately. Fixture tests of programmer orchestration are not hardware results.

Record date, board revision, macOS version, app version, USB serial, detected FPGA IDCODE, build/run IDs, bitstream SHA-256, and observations for every completed item.

- [x] Connect the board and detect its real Digilent USB serial.
- [x] Confirm exactly one FPGA, XC7A100T / IDCODE 0x03631093 (revision nibble may differ).
- [ ] Confirm the physical board label is A7-100T and record its revision. The package and speed grade are board preset facts; JTAG IDCODE alone does not establish package/speed grade.
- [x] Open LED blink, Build, Program volatile SRAM, and observe LED0 blinking. The user confirmed the requested approximately 0.5-second on/off behavior; timing was not instrument-measured.
- [x] Open Switch to LED, Build, Program SRAM. Toggle all 16 switches and confirm one-to-one LED behavior, including switches 8/9.
- [x] Open Button counter, Build, Program SRAM. Confirm center increments 0–9 on the rightmost digit, wraps to 0, holds without repeating, and down resets. Check active-low segments and decimal point off.
- [x] Disconnect USB and confirm Program disables after refresh/poll. Reconnect and confirm the app identifies the target and Program becomes available again.
- [x] Save an HDL change and confirm Program disables until a fresh build succeeds.
- [ ] Manually cause a syntax error/cancel a build while connected and confirm it cannot be programmed. Automated checks of these guards have already passed separately.
- [ ] Disconnect during programming and confirm a failure is reported, then reconnect/rebuild/retry. Never label an interrupted transfer successful.
- [ ] Power-cycle the board and confirm SRAM contents are volatile. This release does not write flash.

## Results

### LED blink — October 20, 2026

The real programming log confirms successful SRAM loading and FPGA identification before and after the transfer. After being asked to verify programming completion and approximately half-second LED0 on/off behavior, the user replied, “yep it works.” This is a user-observed blink result; precise timing was not measured.

| Field | Recorded value |
| --- | --- |
| Local date | October 20, 2026 (America/New_York) |
| Programming interval (UTC) | 2026-10-21 01:11:57.703–01:12:03.776 |
| App / macOS | MacVivado 0.1.0 / macOS 27.0.1 (26A434) |
| Board revision / physical label | Not yet recorded |
| USB cable | Digilent FTDI2232, VID:PID 0403:6010 |
| USB serial | 210292BFA3D2 |
| FPGA | One XC7A100T, IDCODE 0x03631093 |
| Project | `.cache/Finder verified blink` |
| Build ID | `1792545104346-212a3cfc` |
| Programming ID | `1792545117702-5444563b` |
| Toolchain | `xc7-3e5c2cdd-oss-20261019` |
| Input fingerprint | `bcc9056ffaf161670e4f0ce1f2e842a0795fdbbd62c6abec8ad1e04bb639d9f8` |
| Programmed bitstream SHA-256 | `e9364f4f059dcf6e500eb2af195a42c5269f2b712abb90e32271262b234c3a02` |
| Programming mode | Volatile SRAM |
| Tool result | Load SRAM 100%; DONE; post-transfer identification matched |
| Physical observation | User confirmed blink works; timing not instrument-measured |

Retained real-device evidence: [programming and detection log](verification/hardware-blink-program.log). This log contains actual tool output, not fixture responses.

### Switch to LED — October 20, 2026

After being asked to toggle every switch and check its corresponding LED, explicitly including switches 8 and 9, the user confirmed, “yep all 16 work.” The real programming log records a complete SRAM transfer and matching FPGA identity before and after programming.

| Field | Recorded value |
| --- | --- |
| Local date | October 20, 2026 (America/New_York) |
| Programming interval (UTC) | 2026-10-21 01:18:17.801–01:18:23.861 |
| App / macOS | MacVivado 0.1.0 / macOS 27.0.1 (26A434) |
| Board revision / physical label | Not yet recorded |
| USB serial | 210292BFA3D2 |
| FPGA | One XC7A100T, IDCODE 0x03631093 |
| Project | `examples/switch-to-led` |
| Build ID | `1792545478710-a4629e9b` |
| Programming ID | `1792545497801-a97e58a6` |
| Toolchain | `xc7-3e5c2cdd-oss-20261019` |
| Input fingerprint | `46efb5cdf5d2ee7590650dcfeef552d3d2fefcb41a263d94e254d06648a0dbee` |
| Programmed bitstream SHA-256 | `a4b571224a06901ed4138fabe244a47a4f6043930da79a191122e5960610cd42` |
| Programming mode | Volatile SRAM |
| Tool result | Load SRAM 100%; DONE; post-transfer identification matched |
| Physical observation | User confirmed all 16 switches control their corresponding LEDs |

Retained real-device evidence: [programming and detection log](verification/hardware-switch-program.log).

### Button counter — October 20, 2026

The user confirmed, “all of those pass,” after being asked to check initial zero on the rightmost digit, other digits and decimal point off, one increment per center-button press, wrap from 9 to 0, no repeated count while holding center, and down-button reset to zero. The real programming log confirms the SRAM transfer and matching FPGA identity before and after programming.

| Field | Recorded value |
| --- | --- |
| Local date | October 20, 2026 (America/New_York) |
| Programming interval (UTC) | 2026-10-21 01:20:51.153–01:20:57.237 |
| App / macOS | MacVivado 0.1.0 / macOS 27.0.1 (26A434) |
| Board revision / physical label | Not yet recorded |
| USB serial | 210292BFA3D2 |
| FPGA | One XC7A100T, IDCODE 0x03631093 |
| Project | `examples/seven-segment` |
| Build ID | `1792545636462-9950f187` |
| Programming ID | `1792545651153-1d0de137` |
| Toolchain | `xc7-3e5c2cdd-oss-20261019` |
| Input fingerprint | `e4ab8fcb5835b4b010abaad8f052750002cb14b6d084aebcab0c030e592392b3` |
| Programmed bitstream SHA-256 | `a48dd83c446671a4c48eab8318adb7a5f586e4d4de1e83dffd5a30a422706bc0` |
| Programming mode | Volatile SRAM |
| Tool result | Load SRAM 100%; DONE; post-transfer identification matched |
| Physical observation | User confirmed initial display, all decimal digits, wrap, hold behavior, reset, inactive digits, and decimal point |

Retained real-device evidence: [programming and detection log](verification/hardware-counter-program.log).

### Idle USB disconnect and reconnect — October 20, 2026

The user confirmed, “yep both happen,” after being asked to unplug USB while the app was idle, verify that Program disables after polling or Refresh USB, reconnect, and verify that the app returns to connected and identified with Program available again. Both behaviors passed by user observation in the same MacVivado 0.1.0 / macOS 27.0.1 board session recorded above.

This check did not create a new build or programming run. No timestamped enumeration log or precise detection latency was captured for the unplug/replug sequence; the last logged device serial in this session is `210292BFA3D2`. This result does not establish disconnect-during-transfer recovery or power-cycle behavior. Automated stale/failed/canceled-build checks are documented separately in the software verification report.

### Source-change build gating — October 20, 2026

The user confirmed, “yes this behaves as expected,” after being asked to add `// verification` to `rtl/top.v`, save, verify Program disables, build again, and verify Program becomes available after success. The saved source and retained build snapshot both contain the comment. The new build succeeded with a different input fingerprint, and its bitstream checksum was independently checked against the retained file.

| Field | Recorded value |
| --- | --- |
| Project | `examples/seven-segment` |
| Build interval (UTC) | 2026-10-21 01:27:07.012–01:27:11.402 |
| Build ID | `1792546027011-1fc22a2a` |
| Toolchain | `xc7-3e5c2cdd-oss-20261019` |
| Previous input fingerprint | `e4ab8fcb5835b4b010abaad8f052750002cb14b6d084aebcab0c030e592392b3` |
| New input fingerprint | `dbad73a26cf4760c88471406ff57561f95b43af121874feea2deae3b82c48e8c` |
| Rebuilt bitstream SHA-256 | `7a3324a5d01e591de72f5c75e2fa1b6dd923e7fe5a2382a41bfda20d37db73c2` |
| User-observed result | Program disabled after save and available again after successful rebuild |

Retained evidence: [successful rebuild record](verification/hardware-stale-rebuild.json). This check did not require programming the rebuilt bitstream and does not establish manual failed-build or cancellation behavior on the connected board.
