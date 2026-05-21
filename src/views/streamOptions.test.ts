import { describe, expect, test } from 'bun:test';
import { buildGroupedOptions } from './streamOptions.ts';
import { t } from '../utils/i18n.ts';
import type { FFprobeData, SelectedStream } from '../types/media.d.ts';

describe('views/streamOptions.ts', () => {
  const mockInfo = {
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'h264', r_frame_rate: '24/1', bit_rate: '5000000', width: 1920, height: 1080 },
      { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000', bit_rate: '192000', tags: { language: 'eng', title: 'Main' } },
      { index: 2, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'por' } },
      { index: 3, codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } }
    ]
  } as FFprobeData;

  test('buildGroupedOptions should categorize streams correctly and ignore attached pictures by default', () => {
    const result = buildGroupedOptions({
      sources: [{ info: mockInfo, fileIndex: 0 }]
    });

    expect({
      videoGroup: result.groups[t('groupVideo')]?.[0]?.value,
      audioGroup: result.groups[t('groupAudio')]?.[0]?.value,
      subGroup: result.groups[t('groupSubs')]?.[0]?.value,
      videoLength: result.groups[t('groupVideo')]?.length,
      initialValuesCount: result.initialValues.length
    }).toMatchObject({
      videoGroup: { streamIndex: 0, type: 'video', codec: 'h264', fileIndex: 0 },
      audioGroup: { streamIndex: 1, type: 'audio', codec: 'aac', fileIndex: 0 },
      subGroup: { streamIndex: 2, type: 'subtitle', codec: 'subrip', fileIndex: 0 },
      videoLength: 1,
      initialValuesCount: 0
    });
  });

  test('buildGroupedOptions should include attached pictures when explicitly requested', () => {
    const result = buildGroupedOptions({
      sources: [{ info: mockInfo }],
      includeAttachedPictures: true
    });

    expect({
      videoLength: result.groups[t('groupVideo')]?.length,
      attachedPicValue: result.groups[t('groupVideo')]?.[1]?.value
    }).toMatchObject({
      videoLength: 2,
      attachedPicValue: { streamIndex: 3, type: 'video', codec: 'mjpeg' }
    });
  });

  test('buildGroupedOptions should pre-select the video stream if it matches the preferred source label', () => {
    const result = buildGroupedOptions({
      sources: [{ info: mockInfo, label: 'B' }],
      preferredSourceLabel: 'B'
    });

    expect({
      initialCount: result.initialValues.length,
      initialStream: result.initialValues[0]
    }).toMatchObject({
      initialCount: 1,
      initialStream: { streamIndex: 0, type: 'video', codec: 'h264' }
    });
  });

  test('buildGroupedOptions should pre-select streams matching currentSelected parameters', () => {
    const currentSelected: SelectedStream[] = [
      { streamIndex: 1, type: 'audio', codec: 'aac', fileIndex: 1 }
    ];

    const result = buildGroupedOptions({
      sources: [{ info: mockInfo, fileIndex: 1 }],
      currentSelected
    });

    expect({
      initialCount: result.initialValues.length,
      initialStream: result.initialValues[0]
    }).toMatchObject({
      initialCount: 1,
      initialStream: currentSelected[0]
    });
  });
});