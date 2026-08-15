# 🎶 Smart Spectrum Sync

Smart Spectrum Sync is a feature that automatically synchronizes audio tracks from different files, aligning audio streams when merging media with different starting points.

## ✏️ Practical Example

Imagine you want to merge tracks from the following files:

* **File A (Main Video):** 4K WEB-DL release with excellent image quality and original English audio.
* **File B (Dubbing Source):** Lower-quality DVD-Rip release containing Portuguese dubbing.

### The Problem

File B has an extra 3.5 seconds of intro/silence at the beginning compared to File A. If the dubbed track from File B is extracted and combined directly with Video A, the audio will be completely out of sync.

### The Solution with Spectrum Sync

1. You specify a reference point near the start of a distinctive sound effect (e.g., `00:01:15` where a door slams).
2. Smart Spectrum Sync extracts and compares the audio signatures of both media files in that interval.
3. The algorithm calculates that the dubbed track requires an offset of **+3500 ms** (3.5 seconds).
4. JellyCC applies the time compensation during the final merge. The result is a dubbed track that aligns perfectly with the video, without any lag or lead.

## ⚙️ How It Works

The alignment process consists of three steps:

1. **Audio Extraction**
   FFmpeg extracts a snippet from each file: from File A, 10 seconds starting from the user-specified point; from File B, a 30-second window starting 10 seconds prior to that point.
   The snippets are extracted as mono, 1000 Hz, 32-bit float (`f32le`), yielding one sample per millisecond.

2. **Correlation Calculation**
   The analyzer compares the two snippets using the [Pearson Correlation Coefficient (PCC)](https://en.wikipedia.org/wiki/Pearson_correlation_coefficient), sliding File A's sample across File B's window to find the point of highest absolute correlation.

3. **Time Compensation**
   The difference between this point and File B's initial margin provides the exact delay. The system rounds the value in milliseconds and applies it during the final merge.

## 💡 Recommendations

> [!TIP]
> **Choose scenes with distinct sound effects or music:** Gunshots, explosions, stings, door slams, or isolated instrument chords offer unique waveform signatures and high correlation accuracy.

> [!WARNING]
> **Avoid snippets based solely on speech/dialogue:** Dubbing in different languages alters the audio waveform of the voice and articulation timing, which can reduce correlation accuracy.
