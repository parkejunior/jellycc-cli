import { describe, expect, test } from 'bun:test';
import { buildCheckCommand, buildMergeCommand } from './builder.ts';
import type { FallbackRules } from '../types/config';
import type { FFprobeData, SelectedStream } from '../types/media';

describe('utils/builder.ts', () => {
  const mockRules = {
    container: 'mkv',
    video: { target: 'h264_8bit' },
    audio: {
      acceptable: ['aac'],
      mappings: { default: { target: 'aac' } }
    }
  } as FallbackRules;

  const mockInfoA = {
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'hevc' },
      { index: 1, codec_type: 'audio', codec_name: 'ac3', channels: 6, bit_rate: '640000' },
      { index: 2, codec_type: 'subtitle', codec_name: 'subrip' }
    ]
  } as FFprobeData;

  const mockInfoB = {
    streams: [
      { index: 0, codec_type: 'audio', codec_name: 'aac', channels: 2, bit_rate: '128000' },
      { index: 1, codec_type: 'video', codec_name: 'h264' },
      { index: 2, codec_type: 'subtitle', codec_name: 'ass' }
    ]
  } as FFprobeData;

  test('buildCheckCommand should generate correct standard ffmpeg command', () => {
    const streams: SelectedStream[] = [
      { streamIndex: 0, type: 'video', codec: 'hevc' },
      { streamIndex: 1, type: 'audio', codec: 'ac3' },
      { streamIndex: 2, type: 'subtitle', codec: 'subrip' }
    ];

    const result = buildCheckCommand(streams, mockInfoA, mockRules, false, 'input.mkv', 'output.mkv', false);

    expect({
      hasInput: result.includes('-i "input.mkv"'),
      hasVideoMap: result.includes('-map 0:0'),
      hasAudioMap: result.includes('-map 0:1'),
      hasSubMap: result.includes('-map 0:2'),
      hasVideoTranscode: result.includes('-c:v:0 libx264'),
      hasAudioTranscode: result.includes('-c:a:0 aac'),
      hasSubCopy: result.includes('-c:s:0 srt'),
      hasOutput: result.endsWith('"output.mkv"')
    }).toMatchObject({
      hasInput: true,
      hasVideoMap: true,
      hasAudioMap: true,
      hasSubMap: true,
      hasVideoTranscode: true,
      hasAudioTranscode: true,
      hasSubCopy: true,
      hasOutput: true
    });
  });

  test('buildCheckCommand should generate correct repair mode command chain', () => {
    const streams: SelectedStream[] = [
      { streamIndex: 0, type: 'video', codec: 'h264' },
      { streamIndex: 1, type: 'audio', codec: 'aac' },
      { streamIndex: 2, type: 'subtitle', codec: 'ass' }
    ];

    const result = buildCheckCommand(streams, mockInfoA, mockRules, true, 'input.mkv', '/out/final.mkv', true);

    expect({
      hasMkdir: result.startsWith('mkdir -p'),
      hasTempVideoOutput: result.includes('temp_video_0.mp4'),
      hasTempAudioOutput: result.includes('temp_audio_0.w64'),
      hasMapFromTempV: result.includes('-map 1:0'),
      hasMapFromTempA: result.includes('-map 2:0'),
      hasRm: result.includes('rm -rf'),
      hasRepairedSuffix: result.includes('final_repaired.mkv')
    }).toMatchObject({
      hasMkdir: true,
      hasTempVideoOutput: true,
      hasTempAudioOutput: true,
      hasMapFromTempV: true,
      hasMapFromTempA: true,
      hasRm: true,
      hasRepairedSuffix: true
    });
  });

  test('buildMergeCommand should correctly map streams from multiple sources and apply delay', () => {
    const streams: SelectedStream[] = [
      { streamIndex: 0, fileIndex: 0, type: 'video', codec: 'hevc' },
      { streamIndex: 0, fileIndex: 1, type: 'audio', codec: 'aac', language: 'por' }
    ];

    const result = buildMergeCommand(streams, mockInfoA, mockInfoB, mockRules, 'A.mkv', 'B.mkv', 'merged.mkv', 2000, true, true);

    expect({
      hasInputA: result.includes('-i "A.mkv"'),
      hasInputB: result.includes('-i "B.mkv"'),
      hasOffsetB: result.includes('-itsoffset 2 -i "B.mkv"'),
      hasMapA: result.includes('-map 0:0'),
      hasMapB: result.includes('-map 1:0'),
      hasAudioCopy: result.includes('-c:a:0 copy'),
      hasMetadata: result.includes('-metadata:s:a:0 language="por"'),
      hasShortest: result.includes('-shortest')
    }).toMatchObject({
      hasInputA: true,
      hasInputB: true,
      hasOffsetB: true,
      hasMapA: true,
      hasMapB: true,
      hasAudioCopy: true,
      hasMetadata: true,
      hasShortest: true
    });
  });

  test('buildMergeCommand should generate complex repair chain across multiple inputs', () => {
    const streams: SelectedStream[] = [
      { streamIndex: 0, fileIndex: 0, type: 'video', codec: 'hevc' },
      { streamIndex: 1, fileIndex: 1, type: 'video', codec: 'h264' },
      { streamIndex: 0, fileIndex: 1, type: 'audio', codec: 'ac3' },
      { streamIndex: 2, fileIndex: 1, type: 'subtitle', codec: 'ass' }
    ];

    const result = buildMergeCommand(streams, mockInfoA, mockInfoB, mockRules, 'A.mkv', 'B.mkv', '/out/merged.mkv', 0, false, false);

    expect({
      hasTempAudioRepair: result.includes('temp_audio_0.w64'),
      hasTempVideoRepair1: result.includes('temp_video_0.mp4'),
      hasTempVideoRepair2: result.includes('temp_video_1.mp4'),
      hasTempSubRepair: result.includes('temp_sub_0.ass'),
      hasComplexMap1: result.includes('-map 2:0'),
      hasComplexMap2: result.includes('-map 3:0')
    }).toMatchObject({
      hasTempAudioRepair: true,
      hasTempVideoRepair1: true,
      hasTempVideoRepair2: true,
      hasTempSubRepair: true,
      hasComplexMap1: true,
      hasComplexMap2: true
    });
  });

  test('buildMergeCommand with isLegacy = false (Optimized Repair) should skip extraction for Audio A but extract Audio B', () => {
    const streams: SelectedStream[] = [
      { streamIndex: 1, fileIndex: 0, type: 'audio', codec: 'ac3' },
      { streamIndex: 0, fileIndex: 1, type: 'audio', codec: 'aac' }
    ];

    const result = buildMergeCommand(streams, mockInfoA, mockInfoB, mockRules, 'A.mkv', 'B.mkv', '/out/merged.mkv', 0, false, false);

    expect(result.includes('temp_audio_0.w64')).toBe(false); // Audio A (no repair)
    expect(result.includes('temp_audio_1.w64')).toBe(true);  // Audio B (repair)
    expect(result.includes('-map 0:1')).toBe(true);          // Audio A (mapped from original)
    expect(result.includes('-map 2:0')).toBe(true);          // Audio B (mapped from temp)
  });
});