# JellyCC Configuration

JellyCC follows the **XDG Base Directory** standard. All configuration files are located in:

```text
~/.config/jellycc/
├── config.json       # User preferences (language)
└── rules.json        # Custom conversion rules (optional)

```

## `config` Command

The `config` command manages all CLI preferences. Without arguments, it opens an interactive menu.

```bash
jellycc config

```

### Options

| Flag | Description |
| --- | --- |
| `--init` | Generates a `rules.example.json` file in the configuration directory as a starting point for customization |
| `--lang <code>` | Sets the language directly without opening the interactive menu |

```bash
# Generate the rules template
jellycc config --init

# Change language directly from the command line
jellycc config --lang en-US
jellycc config --lang pt-BR

```

## `config.json`

Stores user preferences. Automatically managed by the `config` command.

```json
{
  "lang": "pt-BR"
}

```

### Fields

| Field | Type | Accepted values | Description |
| --- | --- | --- | --- |
| `lang` | `string` | `pt-BR`, `en-US` | CLI interface language |

## `rules.json`

Defines the **conversion targets** for your server. This file is **optional** — without it, JellyCC uses the built-in default rules.

To create yours from the template:

```bash
jellycc config --init
# A rules.example.json file will be created in ~/.config/jellycc/
# Rename it to rules.json and edit as needed
cp ~/.config/jellycc/rules.example.json ~/.config/jellycc/rules.json

```

### Full structure

```json
{
  "container": "mkv",
  "video": {
    "target": "h264_8bit"
  },
  "audio": {
    "acceptable": [
      "aac",
      "eac3",
      "flac"
    ],
    "mappings": {
      "ac3":  { "target": "eac3" },
      "dts":  { "target": "eac3" },
      "alac": { "target": "flac" },
      "default": { "target": "aac" }
    }
  }
}

```

### `container`

Output container for all processed files.

| Value | Notes |
| --- | --- |
| `mkv` | **Recommended default.** Supported by most Jellyfin clients |
| `mp4` | Good compatibility, but limits subtitles to plain text formats |

### `video.target`

Target video codec. Files already in this format are copied without *transcode*.

| Value | Description |
| --- | --- |
| `h264_8bit` | **Recommended default.** Maximum compatibility with all clients |
| `h264_10bit` | HDR in H.264; more limited compatibility (e.g., Firefox does not support it) |
| `hevc_8bit` | Higher compression; requires compatible hardware on the client |
| `hevc_10bit` | HDR in HEVC; variable support by device |

### `audio.acceptable`

List of codecs that JellyCC considers **already ideal**. Tracks in these formats are always copied without re-encoding, regardless of the `mappings`.

Valid values: `aac`, `eac3`, `ac3`, `flac`, `mp3`, `opus`, `vorbis`, `alac`, `dts`

### `audio.mappings`

Defines which codec to convert to when the original is **not** in the `acceptable` list. The `default` key serves as a fallback for any codec not explicitly mapped.

The output bitrate is calculated automatically: `112 kbps × number of channels`, respecting the original source bitrate and the codec limits (`eac3` ≤ 768 kbps).

| Input codec | Recommended target | Reason |
| --- | --- | --- |
| `ac3` | `eac3` | Upgrade with no noticeable loss, wide support |
| `dts` | `eac3` | `dts` does not have Direct Play in most browsers |
| `alac` | `flac` | Both lossless; FLAC has wider support |
| `default` | `aac` | Greatest universal compatibility |