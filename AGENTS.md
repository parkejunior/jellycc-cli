# 🤖 Agent Directives: JellyCC CLI - Jellyfin Codec & Integrity Checker

This document provides architectural context, coding standards, and directives for any AI agent working on this repository. **Read these constraints carefully before modifying the codebase.**

## 🎯 Project Context

This is a Node.js/Bun CLI application (written in TypeScript) designed to automate media server maintenance. It features a modular architecture supporting two primary operations:

1. **`check`**: Inspects a single video file, checks its compatibility against a client matrix, verifies file integrity, and suggests optimized FFmpeg conversion commands.
2. **`merge`**: Performs interactive remuxing of two files, automatically electing the best video stream and allowing the user to select audio/subtitle streams to preserve.

## 🏗️ Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript (`.ts`)
- **Module System:** ES Modules (ESM) `type: "module"`
- **CLI UI:** `@clack/prompts` (Bombshell)
- **Styling:** `picocolors`
- **System Interaction:** `child_process` (execSync, spawn), `fs`, `path`, `clipboardy`
- **Data Parsing & Build:** `yaml` (Source of truth) -> Compiled to `json` at build time.

## 📜 Architectural Rules & Constraints

### 1. Build Step & Configurations (Strict Rule)

- **DO NOT read `.yaml` files at runtime.** The application relies on a build step (`prebuild.ts`) that converts `fallback_rules.yaml` and `jellyfin-codec-support.yaml` into `.json` files inside the `dist/` folder.
- All runtime code must import the configurations from `../../dist/matrix.json` and `../../dist/rules.json` using the `with { type: 'json' }` import assertion.

### 2. FFmpeg & Dynamic Quality Engine

- **Passthrough is Sacred:** Always prioritize `-c:v copy` and `-c:a copy` when streams are already compatible. Do not force recoding unless strictly necessary to avoid generation loss.
- **Dynamic Encoders:** Do not hardcode bitrates or presets for transcodes. Always use `getDynamicVideoEncoder()` (which aims for Visually Lossless quality via CRF 18) and `getDynamicAudioEncoder()` (which calculates bitrates based on channel count) located in `src/utils/ffmpeg.ts`.
- **Media Preservation:** Always include `-map 0` (preserve all streams) or explicit stream mapping, and `-c:s copy` (preserve subtitles) when building ffmpeg conversion strings.
- **Execution:** - For quick data extraction, use `execSync` with `ffprobe`.
  - For long-running tasks (like Deep Scan), use `spawn` and parse `stderr` to extract the `time=HH:MM:SS.ms` string for real-time progress bars via Clack `spinner()`.
  - For interactive conversions where the user needs to see the native output, use `execSync(cmd, { stdio: 'inherit' })`.

### 3. Path Management

- Use the `sanitizePath()` function before `fs.existsSync` to handle file paths dropped into Linux terminals (which are often wrapped in single/double quotes).

### 4. UI & Interaction (Clack Prompts)

- Do not use standard `console.log()` for main UI elements. Rely on Clack's primitives (`intro`, `outro`, `note`, `spinner`, `select`, `multiselect`, `text`).
- Ensure graceful exits using the custom `onCancel` wrapper when a user triggers `Ctrl+C`.
- When copying commands to the clipboard, account for `@clack/prompts` formatting (avoid copying the visual `|` borders).

### 5. Execution Context (Bun)

- **Always use full paths for Bun in background scripts:** When running commands or scripts in automation, assume paths like `~/.bun/bin/bun` and `~/.bun/bin/bunx` to ensure agents use the correct executable globally.

### 6. Code Style

- Keep logic functional and procedural. Avoid over-engineering with complex OOP structures.
- Keep comments and CLI output **strictly in Portuguese**, maintaining a clear, direct, and user-friendly tone.
- Do not remove the Quick Scan function; it is a mandatory safeguard against malformed containers.
