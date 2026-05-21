# AGENTS.md — JellyCC CLI

## Project Overview

JellyCC is a Bun-based CLI tool that analyzes, repairs, remuxes, and transcodes media files to ensure Direct Play compatibility on Jellyfin. It wraps FFmpeg and FFprobe.

## Runtime and Language

- **Runtime:** Bun
- **Language:** TypeScript (strict)
- **External hard dependencies:** `ffmpeg` and `ffprobe` installed globally on the system.

## Project Structure

```
src/
  index.ts                  # Entry point, command routing
  commands/                 # Command modules
  services/                 # Service modules
  utils/                    # Utility modules
  views/                    # UI modules
  locales/                  # Internationalization modules
  types/                    # Type definitions
  config/
    fallback_rules.yaml         # Default conversion rules (container, video, audio)
    jellyfin_codec_support.yaml # Client compatibility matrix
```

## Configuration

Follow the [configuration docs](docs/CONFIGURATION.md).

## Internationalization

All user-visible strings go through `t(key, ...args)` in `src/utils/i18n.ts`. Positional placeholders use `{0}`, `{1}`, etc. Locale dictionaries are in `src/locales/`. Adding a new string requires entries in both `en-US.ts` and `pt-BR.ts` with identical keys.

## Error Handling

Three error classes in `src/utils/errors.ts`:
- `JellyError` — operational FFmpeg/FFprobe failures; exits with code 1.
- `UserCancelError` — user cancelled an interactive prompt; exits with code 0.
- `ValidationError` — bad input (missing file, invalid path); treated as a user error.

The main catch block in `index.ts` handles all three. Do not `process.exit()` inside commands; throw the appropriate error class instead.

## UI Library

Interactive prompts use `@clack/prompts` (`text`, `confirm`, `groupMultiselect`, `note`, `log`, `spinner`). Colors use `picocolors`. Do not use `console.log` for user-facing output; prefer `log.info`, `log.warn`, or `note` from `@clack/prompts`.