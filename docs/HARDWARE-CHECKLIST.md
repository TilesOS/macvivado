# Nexys A7-100T physical verification

**Status: NOT PERFORMED — no physical board was available during software development.**

Software bitstream generation and testbench results are recorded separately. Fixture tests of programmer orchestration are not hardware results.

Record date, board revision, macOS version, app version, USB serial, detected FPGA IDCODE, build/run IDs, bitstream SHA-256, and observations for every completed item.

- [ ] Connect the Nexys A7-100T's USB programming port with a data-capable cable and power on the board. Refresh USB and select its real serial.
- [ ] Confirm exactly one FPGA, XC7A100T / IDCODE 0x03631093 (revision nibble may differ). The package and speed grade are board preset facts; JTAG IDCODE alone does not establish package/speed grade. Confirm the board label is A7-100T.
- [ ] Open LED blink, Build, Program volatile SRAM. Confirm LED0 toggles every 0.5 seconds; record observed timing and bitstream hash.
- [ ] Open Switch to LED, Build, Program SRAM. Toggle all 16 switches and confirm one-to-one LED behavior, including switches 8/9.
- [ ] Open Button counter, Build, Program SRAM. Confirm center increments 0–9 on the rightmost digit, wraps to 0, holds without repeating, and down resets. Check active-low segments and decimal point off.
- [ ] Disconnect USB and confirm Program disables after refresh/poll. Reconnect and confirm serial selection and FPGA identity are checked again.
- [ ] Change HDL or XDC and confirm Program requires rebuilding. Cause a syntax error/cancel a build and confirm it cannot be programmed.
- [ ] Disconnect during programming and confirm a failure is reported, then reconnect/rebuild/retry. Never label an interrupted transfer successful.
- [ ] Power-cycle the board and confirm SRAM contents are volatile. This release does not write flash.

## Results

No physical detection, programming, electrical behavior, display timing, or disconnect-during-transfer checks have passed yet. Fill this section with actual observations only.
