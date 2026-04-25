# 🤖 Agent Directives: JellyCC CLI

This document provides architectural context, coding standards, and directives for any AI agent modifying this repository. **Read these constraints carefully.**

## 🎯 Project Context
A Node.js/Bun CLI application (TypeScript) designed to automate media server maintenance, ensuring absolute *Direct Play* compatibility for Jellyfin. It features two primary operations:
1. **`check`**: Inspects a single video file, verifies integrity, checks compatibility, and suggests precise FFmpeg conversions.
2. **`merge`**: Interactive remuxing of multiple files, automatically electing the best video stream base.

## 🏗️ Tech Stack
- **Runtime:** Bun (`type: "module"`)
- **CLI UI:** `@clack/prompts` & `picocolors`
- **System Interaction:** `child_process` (execSync, spawn), `fs`, `path`
- **Data Parsing:** `yaml` (Source of truth) -> Compiled to `json` at build time.

## 📜 Architectural Rules & Constraints (Strict)

### 1. Separation of Concerns (Clean Code)
- **Commands (`src/commands/`)**: Must remain thin orchestrators. They only gather data, trigger UI, and execute processes.
- **FFmpeg Builder (`src/utils/builder.ts`)**: All complex FFmpeg string construction, stream mapping (`-map`), and codec assignments (`-c:v`, `-c:a`) must be isolated here.
- **Universal UI (`src/utils/ui.ts`)**: The execution menu and async process triggers must be handled by `handleExecutionMenu`.
- **Formatters (`src/utils/formatters.ts`)**: Codec translations, subtitle burn-in warnings (PGS/VobSub), and math calculations (e.g., total frames) belong here.

### 2. Media Handling (FFmpeg)
- **Passthrough is Sacred:** Always prioritize `-c:v copy` and `-c:a copy` if the stream is already compatible.
- **Dynamic Engine (`ffmpeg.ts`):** Never hardcode transcoder bitrates. Use `getDynamicVideoEncoder()` (Visually Lossless CRF 18) and `getDynamicAudioEncoder()` (calculates bitrate per channel without exceeding the source bitrate).
- **Surgical Mapping:** Attached pictures (MJPEG/PNG covers) must be excluded using negative mapping (`-map -0:v:X`) to prevent FFmpeg's 30,000 FPS container bug.
- **Async Execution:** Long-running tasks (Conversion, Deep Scan) must use `spawn`. Parse `stderr` in real-time to render Clack progress bars and tail logs without flooding the terminal.

### 3. Build & Configurations
- **DO NOT read `.yaml` at runtime.** The application relies on `../../dist/matrix.json` and `../../dist/rules.json` (using `with { type: 'json' }` import assertions).

### 4. Code Style
- Keep logic functional and procedural. Avoid complex OOP structures.
- CLI output, prompts, and user-facing logs must be **strictly in Brazilian Portuguese (pt-BR)**.