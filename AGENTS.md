# 🤖 Agent Directives: Jellyfin Codec & Integrity Checker

This document provides architectural context, coding standards, and directives for any AI agent working on this repository.

## 🎯 Project Context

This is a Node.js/Bun CLI application designed to automate media server maintenance. It inspects video files, checks their compatibility against a YAML matrix, verifies file integrity, and executes optimized FFmpeg commands.

## 🏗️ Tech Stack

- **Runtime:** Bun
- **Module System:** ES Modules (ESM) `type: "module"`
- **CLI UI:** `@clack/prompts` (Bombshell)
- **Styling:** `picocolors`
- **System Interaction:** `child_process` (execSync, spawn), `fs`, `path`, `clipboardy`
- **Data Parsing:** `yaml`

## 📜 Architectural Rules & Constraints

### 1. Path Management (Strict Rule)

- **Always use absolute paths relative to the script:** Do not use `./file.yaml` to read configs. The tool must be executable globally via aliases.
- Use the following pattern to resolve the current directory in ESM:
  ```javascript
  import { fileURLToPath } from "url";
  import path from "path";
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  ```
- **Path Sanitization:** File paths dropped into Linux terminals are often wrapped in single/double quotes. Always pass user input through the existing `sanitizePath()` function before `fs.existsSync`.

### 2. UI & Interaction (Clack Prompts)

- Do not use standard `console.log()` for main UI elements. Rely on Clack's primitives (`intro`, `outro`, `note`, `spinner`, `select`, `text`).
- Ensure graceful exits using the custom `onCancel` wrapper when a user triggers `Ctrl+C`.
- When copying commands to the clipboard, account for `@clack/prompts` formatting (avoid copying the visual `|` borders).

### 3. FFmpeg Interfacing

- **Execution:** - For quick data extraction, use `execSync` with `ffprobe`.
  - For long-running tasks (like Deep Scan), use `spawn` and parse `stderr` to extract the `time=HH:MM:SS.ms` string. Map this against the total duration to create a real-time progress bar via a Clack `spinner()`.
  - For interactive conversions where the user needs to see the native output, use `execSync(cmd, { stdio: 'inherit' })`.
- **Media Preservation:** Always include `-map 0` (preserve all streams) and `-c:s copy` (preserve subtitles) when building ffmpeg conversion strings.

### 4. Code Style

- Keep logic functional and procedural. Avoid over-engineering with complex OOP structures for now.
- Keep comments strictly in Portuguese, maintaining a clear and direct tone.
- Do not remove the Quick Scan function; it is a mandatory safeguard against malformed containers.

## 🚀 Next Steps / Roadmap

- Implement **Batch Processing Mode** to scan entire directories, summarize required transcodes, and execute them sequentially.
- Add support to parse internal subtitle formats and alert if image-based subtitles (PGS/VOBSUB) require manual extraction.
