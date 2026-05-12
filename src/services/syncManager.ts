import type { MediaStream } from '../types/media';

export const calculateDifferenceMs = (durA: number, durB: number): number =>
  Math.round((durA - durB) * 1000);

export const getNativePtsDelayMs = (stream: Pick<MediaStream, 'start_time'> | undefined): number => {
  if (!stream?.start_time) return 0;

  const ptsDelay = Number.parseFloat(stream.start_time);
  if (Number.isNaN(ptsDelay)) return 0;

  return Math.round(ptsDelay * 1000);
};

export const getSourceDelayMs = (sourceFileIndex: number, delayMs: number): number => {
  if (sourceFileIndex === 0 && delayMs < 0) return Math.abs(delayMs);
  if (sourceFileIndex === 1 && delayMs > 0) return delayMs;
  return 0;
};

export const buildOffsetArg = (userDelayMs: number = 0, ptsDelayMs: number = 0): string => {
  const totalDelayMs = userDelayMs + ptsDelayMs;
  return totalDelayMs > 0 ? `-itsoffset ${totalDelayMs / 1000} ` : '';
};
