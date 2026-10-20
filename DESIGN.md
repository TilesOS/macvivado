---
name: MacVivado
description: A focused desktop workbench for digital logic labs
colors:
  accent: "#78b9ff"
  canvas: "#1e1e1e"
  panel: "#252526"
  chrome: "#323233"
  text: "#e0e0e0"
  muted: "#aaaaae"
  success: "#89d3a2"
  error: "#ff9696"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "13px"
    lineHeight: 1.5
  code:
    fontFamily: "SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    lineHeight: 1.6
rounded:
  control: "4px"
spacing:
  small: "8px"
  medium: "16px"
---

# MacVivado design system

## Overview

A familiar VS Code workbench, as selected by the user. Operate mode: code and waveform inspection occupy the workspace; project navigation, run controls, and target state remain easy to scan. Dark surfaces suit extended lab sessions while offering a selectable light theme.

## Colors

Neutral layers distinguish the editor from the navigator and chrome. Blue marks selection and focus. Green marks successful software operations; it never implies hardware verification. Red and amber describe failures and warnings with accompanying text.

## Typography

System UI text for controls. Monospace for code, tool logs, signal values, and timestamps. Labels use sentence case.

## Layout

Desktop title bar and action strip; left project navigator; tabbed central editor; resizable lower diagnostics/log/waveform panel; persistent status bar. Narrow windows can collapse the navigator. Keyboard access follows VS Code conventions.

## Elevation & Depth

Flat tonal layers and one-pixel separators. Shadows are reserved for menus and dialogs.

## Shapes

Square pane boundaries, modestly rounded controls, compact tab indicators.

## Components

Run controls have distinct labels and disabled reasons. Target state is always textual. Diagnostics navigate to an exact file and line. Waveforms use a calibrated time ruler, separate signal selection, binary/hex values, and two movable cursors. Long tool actions expose progress and Cancel.

## Do's and Don'ts

- Do keep the editor usable when no target is connected.
- Do pair state colors with labels.
- Do provide visible keyboard focus and accessible names.
- Don't substitute demonstration data for detected hardware.
