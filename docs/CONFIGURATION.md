# JellyCC Configuration

JellyCC follows the **XDG Base Directory** standard. All configuration files are located in:

```
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

To generate the rules template:

```bash
jellycc config --init
```

To change the language directly via the command line:

```bash
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

| Field | Type | Accepted Values | Description |
| --- | --- | --- | --- |
| `lang` | `string` | `pt-BR`, `en-US` | CLI interface language |

## `rules.json`

Defines your server's **conversion targets**. This file is **optional** — without it, JellyCC uses the default rules.

To create yours from the template:

```bash
jellycc config --init
```

A `rules.example.json` file will be created in `~/.config/jellycc/`. Rename it to `rules.json` and edit as needed:

```bash
cp ~/.config/jellycc/rules.example.json ~/.config/jellycc/rules.json
```

### Partial Overwrite

You **do not need** to keep the full `rules.json` file. Keep **only** the keys you want to change in the file. Anything deleted will automatically inherit the default.

**Example:** HEVC 10-bit and the rest as default, your `rules.json` should only have this:

```json
{
  "video": {
    "target": "hevc_10bit"
  }
}
```

### Full Structure

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

Target video codec. Files already in this format are copied without *transcoding*.

| Value | Description |
| --- | --- |
| `h264_8bit` | **Recommended default.** Maximum compatibility with all clients |
| `h264_10bit` | HDR in H.264; more limited compatibility (e.g., Firefox does not support it) |
| `hevc_8bit` | Higher compression; requires compatible hardware on the client |
| `hevc_10bit` | HDR in HEVC; variable support by device |

### `audio.acceptable`

List of codecs that JellyCC considers **already ideal**. Tracks in these formats are always copied without *transcoding*, regardless of `mappings`.

Valid values: `aac`, `eac3`, `ac3`, `flac`, `mp3`, `opus`, `vorbis`, `alac`, `dts`

### `audio.mappings`

Defines which codec to convert to when the original is **not** in the `acceptable` list. The `default` key serves as a fallback for any codec not explicitly mapped.

The output bitrate is automatically calculated: `112 kbps × number of channels`, respecting the source's original bitrate and codec limits (`eac3` ≤ 768 kbps).

| Input Codec | Recommended Target | Reason |
| --- | --- | --- |
| `ac3` | `eac3` | Upgrade without noticeable loss, wide support |
| `dts` | `eac3` | `dts` does not have Direct Play in most browsers |
| `alac` | `flac` | Both lossless; FLAC has wider support |
| `default` | `aac` | Greatest universal compatibility |

## Docker Configuration

When running JellyCC inside Docker, configuration files (`config.json` and `rules.json`) are stored in `/root/.config/jellycc/` inside the container.

To persist your custom settings and language preferences across container executions, mount your host system's configuration directory:

### Using Docker Run

```bash
docker run --rm -it \
  -v /path/to/media:/media \
  -v ~/.config/jellycc:/root/.config/jellycc \
  ghcr.io/parkejunior/jellycc-cli:latest
```

### Using Docker Compose

The `docker-compose.yml` automatically mounts your configuration directory:

```yaml
volumes:
  - ${MEDIA_DIR:-.}:/media
  - ${CONFIG_DIR:-~/.config/jellycc}:/root/.config/jellycc
```

If you want to use a custom configuration directory via Docker Compose, set the `CONFIG_DIR` variable:

```bash
CONFIG_DIR=/path/to/config docker compose run --rm jellycc
```

> [!NOTE]
> On Windows (PowerShell / CMD), replace `~/.config/jellycc` with `$env:USERPROFILE\.config\jellycc` or `%USERPROFILE%\.config\jellycc`.