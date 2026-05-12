import { describe, expect, test } from 'bun:test';
import {
  formatFps,
  formatBitrate,
  getBitDepth,
  formatSampleRate,
  formatChannels,
  formatDuration,
  formatSize,
  padLabel,
  formatSubtitleCodec,
  calculateTotalFrames
} from './formatters.ts';
import { t } from './i18n.ts';
import type { MediaStream } from '../types/media.d.ts';

describe('utils/formatters.ts', () => {
  test('formatFps should format fractional, decimal and undefined framerates', () => {
    expect({
      fractional: formatFps('24000/1001'),
      decimal: formatFps('25.000000'),
      missing: formatFps(undefined)
    }).toMatchObject({
      fractional: '23.98 fps',
      decimal: '25.00 fps',
      missing: '?? fps'
    });
  });

  test('formatBitrate should convert bps to kbps or Mbps', () => {
    expect({
      kbps: formatBitrate('384000'),
      mbps: formatBitrate(5000000),
      missing: formatBitrate(undefined)
    }).toMatchObject({
      kbps: '384 kbps',
      mbps: '5.00 Mbps',
      missing: 'N/A'
    });
  });

  test('getBitDepth should extract bit depth from pix_fmt', () => {
    expect({
      eight: getBitDepth({ pix_fmt: 'yuv420p' } as MediaStream),
      ten: getBitDepth({ pix_fmt: 'yuv420p10le' } as MediaStream),
      twelve: getBitDepth({ pix_fmt: 'yuv420p12le' } as MediaStream),
      missing: getBitDepth(undefined)
    }).toMatchObject({
      eight: '8-bit',
      ten: '10-bit',
      twelve: '12-bit',
      missing: '8-bit'
    });
  });

  test('formatSampleRate should convert hz to kHz', () => {
    expect({
      khz: formatSampleRate('48000'),
      missing: formatSampleRate(undefined)
    }).toMatchObject({
      khz: '48 kHz',
      missing: 'N/A'
    });
  });

  test('formatChannels should format standard and custom audio channels', () => {
    expect({
      stereo: formatChannels(2),
      surround51: formatChannels('6'),
      surround71: formatChannels(8),
      custom: formatChannels(3),
      missing: formatChannels(undefined)
    }).toMatchObject({
      stereo: t('fmtStereo'),
      surround51: '5.1',
      surround71: '7.1',
      custom: '3 ch',
      missing: '?? ch'
    });
  });

  test('formatDuration should convert seconds to HH:MM:SS format', () => {
    expect({
      standard: formatDuration(3665),
      short: formatDuration(45),
      missing: formatDuration(undefined)
    }).toMatchObject({
      standard: '01:01:05',
      short: '00:00:45',
      missing: 'N/A'
    });
  });

  test('formatSize should convert bytes to MB or GB', () => {
    expect({
      megabytes: formatSize(1048576 * 500),
      gigabytes: formatSize(1048576 * 1500),
      missing: formatSize(undefined)
    }).toMatchObject({
      megabytes: '500.00 MB',
      gigabytes: '1.46 GB',
      missing: 'N/A'
    });
  });

  test('padLabel should pad or truncate strings based on length limit', () => {
    expect({
      padded: padLabel('Video', 10),
      truncated: padLabel('VeryLongLabel', 10)
    }).toMatchObject({
      padded: 'Video     ',
      truncated: 'VeryLon...'
    });
  });

  test('formatSubtitleCodec should map codec names to display labels', () => {
    expect({
      pgs: formatSubtitleCodec('hdmv_pgs_subtitle'),
      vobsub: formatSubtitleCodec('dvd_subtitle'),
      srt: formatSubtitleCodec('subrip'),
      ass: formatSubtitleCodec('ass'),
      missing: formatSubtitleCodec(undefined)
    }).toMatchObject({
      pgs: 'PGS',
      vobsub: 'VobSub',
      srt: 'SRT',
      ass: 'ASS',
      missing: t('unknown')
    });
  });

  test('calculateTotalFrames should return the total frames based on fps and duration', () => {
    expect({
      fractional: calculateTotalFrames({ r_frame_rate: '24000/1001' } as MediaStream, 3600),
      decimal: calculateTotalFrames({ avg_frame_rate: '25.00' } as MediaStream, 100),
      missing: calculateTotalFrames(undefined, 100)
    }).toMatchObject({
      fractional: 86314,
      decimal: 2500,
      missing: 0
    });
  });
});