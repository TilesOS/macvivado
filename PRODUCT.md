# MacVivado

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron desktop application for Apple Silicon macOS.

## Users

People doing basic digital-logic labs with Verilog and a Nexys A7-100T.

## Product Purpose

Edit ordinary HDL and XDC files, simulate testbenches, build real Artix-7 bitstreams locally, and program volatile FPGA memory when a verified target is connected.

## Operating Context

Board-independent development on a Mac. Physical detection and programming verification are recorded separately from software checks.

## Capabilities and Constraints

React, TypeScript, Monaco, typed isolated Electron IPC. Native openXC7 and a matched OSS CAD Suite. Versioned macvivado.json projects. Separate Simulate, Build, and Program actions. Nexys A7-100T / xc7a100tcsg324-1 only initially. No Vivado import, IP, block diagrams, ILA, DDR, VHDL, or flash programming.

## Brand Commitments

Name: MacVivado. The user selected the standard VS Code layout and keyboard shortcuts.

## Evidence on Hand

No physical board is available. Never fabricate hardware detection or programming success. Upstream Digilent constraints and pinned native tool sources provide software inputs.

## Product Principles

- Editing, simulation, and builds work without a board.
- Only successful, current, fingerprinted bitstreams can be programmed.
- Tool output is real and cancellable.
- Projects remain portable ordinary files.
