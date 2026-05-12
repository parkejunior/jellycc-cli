import { describe, expect, test } from 'bun:test';
import {
  calculateDifferenceMs,
  getNativePtsDelayMs,
  getSourceDelayMs,
  buildOffsetArg
} from './syncManager.ts';
import type { MediaStream } from '../types/media.d.ts';

describe('services/syncManager.ts', () => {
  test('calculateDifferenceMs converts the difference in seconds to milliseconds', () => {
    expect(calculateDifferenceMs(3.5, 2)).toBe(1500);
    expect(calculateDifferenceMs(2, 3.5)).toBe(-1500);
  });

  test('getNativePtsDelayMs returns the native delay in milliseconds', () => {
    const stream: Pick<MediaStream, 'start_time'> = { start_time: '1.25' };

    expect(getNativePtsDelayMs(stream)).toBe(1250);
    expect(getNativePtsDelayMs({ start_time: '0.5' })).toBe(500);
  });

  test('getNativePtsDelayMs returns zero when start_time is invalid or missing', () => {
    expect(getNativePtsDelayMs(undefined)).toBe(0);
    expect(getNativePtsDelayMs({ start_time: undefined })).toBe(0);
    expect(getNativePtsDelayMs({ start_time: 'abc' })).toBe(0);
  });

  test('getSourceDelayMs applies the delay only to the correct source', () => {
    expect(getSourceDelayMs(0, -1200)).toBe(1200);
    expect(getSourceDelayMs(1, 1200)).toBe(1200);

    expect(getSourceDelayMs(0, 1200)).toBe(0);
    expect(getSourceDelayMs(1, -1200)).toBe(0);
    expect(getSourceDelayMs(2, 1200)).toBe(0);
  });

  test('buildOffsetArg builds the ffmpeg argument only when the final delay is positive', () => {
    expect(buildOffsetArg(500, 250)).toBe('-itsoffset 0.75 ');
    expect(buildOffsetArg(0, 0)).toBe('');
    expect(buildOffsetArg(-500, 100)).toBe('');
  });
});
