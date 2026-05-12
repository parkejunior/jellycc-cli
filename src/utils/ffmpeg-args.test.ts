import { describe, expect, test } from 'bun:test';
import {
  getVideoArgs,
  getAudioArgs,
  getSubtitleArgs,
  getMetadataArgs
} from './ffmpeg-args.ts';
import type { FallbackRules } from '../types/config';
import type { FFprobeData, SelectedStream } from '../types/media';

describe('utils/ffmpeg-args.ts', () => {
  const mockRules = {
    container: 'mkv',
    video: { target: 'h264_8bit' },
    audio: {
      acceptable: ['aac', 'ac3'],
      mappings: {
        dts: { target: 'ac3' },
        default: { target: 'aac' }
      }
    }
  } as FallbackRules;

  const mockInfo = {
    streams: [
      { index: 0, codec_type: 'audio', codec_name: 'aac', channels: 2, bit_rate: '128000' },
      { index: 1, codec_type: 'audio', codec_name: 'ac3', channels: 6, bit_rate: '640000' },
      { index: 2, codec_type: 'audio', codec_name: 'dts', channels: 6, bit_rate: '1500000' },
      { index: 3, codec_type: 'audio', codec_name: 'flac', channels: 2, bit_rate: '1000000' }
    ]
  } as FFprobeData;

  test('getVideoArgs should handle compatible and incompatible video streams', () => {
    const stream = { codec: 'hevc', type: 'video', streamIndex: 0 } as SelectedStream;

    expect({
      compatible: getVideoArgs(stream, true, mockRules, 0),
      incompatible: getVideoArgs(stream, false, mockRules, 1)
    }).toMatchObject({
      compatible: ['-c:v:0 copy'],
      incompatible: ['-c:v:1 libx264 -preset slow -crf 18 -pix_fmt yuv420p']
    });
  });

  test('getAudioArgs should handle copy, mapping and forced transcoding', () => {
    const streamAac = { codec: 'aac', streamIndex: 0, type: 'audio' } as SelectedStream;
    const streamAc3 = { codec: 'ac3', streamIndex: 1, type: 'audio' } as SelectedStream;
    const streamDts = { codec: 'dts', streamIndex: 2, type: 'audio' } as SelectedStream;
    const streamFlac = { codec: 'flac', streamIndex: 3, type: 'audio' } as SelectedStream;

    expect({
      compatibleCopy: getAudioArgs(streamAac, mockInfo, mockRules, 0),
      compatibleForce: getAudioArgs(streamAc3, mockInfo, mockRules, 1, { forceTranscode: true }),
      incompatibleMap: getAudioArgs(streamDts, mockInfo, mockRules, 2),
      incompatibleDef: getAudioArgs(streamFlac, mockInfo, mockRules, 3)
    }).toMatchObject({
      compatibleCopy: ['-c:a:0 copy'],
      compatibleForce: ['-c:a:1 ac3 -b:a:1 640k'],
      incompatibleMap: ['-c:a:2 ac3 -b:a:2 640k'],
      incompatibleDef: ['-c:a:3 aac -b:a:3 224k']
    });
  });

  test('getSubtitleArgs should map text subtitles or copy others', () => {
    expect({
      srt: getSubtitleArgs({ codec: 'subrip' } as SelectedStream, 0),
      ass: getSubtitleArgs({ codec: 'ass' } as SelectedStream, 1),
      copy: getSubtitleArgs({ codec: 'pgs' } as SelectedStream, 2)
    }).toMatchObject({
      srt: ['-c:s:0 srt'],
      ass: ['-c:s:1 ass'],
      copy: ['-c:s:2 copy']
    });
  });

  test('getMetadataArgs should generate metadata flags only if language is provided', () => {
    expect({
      noLang: getMetadataArgs({} as SelectedStream, 'v', 0),
      langNoTitle: getMetadataArgs({ language: 'por' } as SelectedStream, 'a', 1),
      langAndTitle: getMetadataArgs({ language: 'eng', title: 'Director Cut' } as SelectedStream, 's', 2)
    }).toMatchObject({
      noLang: [],
      langNoTitle: [
        '-metadata:s:a:1 language="por"',
        '-metadata:s:a:1 title=""'
      ],
      langAndTitle: [
        '-metadata:s:s:2 language="eng"',
        '-metadata:s:s:2 title="Director Cut"'
      ]
    });
  });
});