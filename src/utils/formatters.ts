import { t } from './i18n.ts';
import { isImageSubtitle } from './mediaUtils.ts';
import type { MediaStream } from '../types/media';

export const formatFps = (fpsStr: string | undefined) => {
  if (!fpsStr) return '?? fps';
  const parts = fpsStr.split('/');
  if (parts.length === 2 && parseInt(parts[1]!) > 0) {
    return (parseInt(parts[0]!) / parseInt(parts[1]!)).toFixed(2) + ' fps';
  }
  return parseFloat(fpsStr).toFixed(2) + ' fps';
};

export const formatBitrate = (bps: string | number | undefined) => {
  if (!bps) return 'N/A';
  const bpsNum = typeof bps === 'string' ? parseInt(bps) : bps;
  if (isNaN(bpsNum)) return 'N/A';
  if (bpsNum > 1000000) return (bpsNum / 1000000).toFixed(2) + ' Mbps';
  return Math.round(bpsNum / 1000) + ' kbps';
};

export const getBitDepth = (stream: Pick<MediaStream, 'pix_fmt'> | undefined) => {
  if (!stream || !stream.pix_fmt) return '8-bit';
  if (stream.pix_fmt.includes('10')) return '10-bit';
  if (stream.pix_fmt.includes('12')) return '12-bit';
  return '8-bit';
};

export const formatSampleRate = (hz: string | number | undefined) => {
  if (!hz) return 'N/A';
  const hzNum = typeof hz === 'string' ? parseInt(hz) : hz;
  if (isNaN(hzNum)) return 'N/A';
  return Math.round(hzNum / 1000) + ' kHz';
};

export const formatChannels = (ch: string | number | undefined) => {
  const chNum = typeof ch === 'string' ? parseInt(ch) : ch;
  if (!chNum) return '?? ch';
  if (chNum === 2) return t('fmtStereo');
  if (chNum === 6) return '5.1';
  if (chNum === 8) return '7.1';
  return `${chNum} ch`;
};

export const formatDuration = (seconds: number | undefined) => {
  if (!seconds || isNaN(seconds)) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const formatSize = (bytes: number | undefined) => {
  if (!bytes || isNaN(bytes)) return 'N/A';
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) {
    return (mb / 1024).toFixed(2) + ' GB';
  }
  return mb.toFixed(2) + ' MB';
};

// Helper universal para alinhar textos no terminal
export const padLabel = (text: string, len: number = 12) => {
  return text.length > len ? text.substring(0, len - 3) + '...' : text.padEnd(len, ' ');
};

export const formatSubtitleCodec = (codecName: string | undefined): string => {
  if (!codecName) return t('unknown');
  const lower = codecName.toLowerCase();
  if (isImageSubtitle(codecName)) {
    if (lower === 'dvd_subtitle' || lower === 'vobsub') return 'VobSub';
    return 'PGS';
  }
  if (lower === 'subrip') return 'SRT';
  return codecName.toUpperCase();
};

export const calculateTotalFrames = (
  videoStream: Pick<MediaStream, 'r_frame_rate' | 'avg_frame_rate'> | undefined,
  totalDurationSec: number
): number => {
  if (videoStream && totalDurationSec > 0) {
    const fpsStr = videoStream.r_frame_rate || videoStream.avg_frame_rate;
    if (fpsStr) {
      const parts = fpsStr.split('/');
      const fps = parts.length === 2 && parseInt(parts[1]!) > 0 ? parseInt(parts[0]!) / parseInt(parts[1]!) : parseFloat(fpsStr);
      if (!isNaN(fps)) return Math.round(totalDurationSec * fps);
    }
  }
  return 0;
};

export const parseTimestampToSeconds = (ts: string): number => {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return (parts[0]! * 3600) + (parts[1]! * 60) + parts[2]!;
  if (parts.length === 2) return (parts[0]! * 60) + parts[1]!;
  return Number(ts) || 0;
};

export const formatSecondsToTimestamp = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};