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

export const getBitDepth = (stream: any) => {
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
  if (chNum === 2) return 'Estéreo';
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

export const isImageSubtitle = (codecName: string | undefined): boolean => {
  if (!codecName) return false;
  const lower = codecName.toLowerCase();
  return lower === 'hdmv_pgs_subtitle' || lower === 'dvd_subtitle' || lower === 'vobsub';
};

export const formatSubtitleCodec = (codecName: string | undefined): string => {
  if (!codecName) return 'UNKNOWN';
  const lower = codecName.toLowerCase();
  if (lower === 'hdmv_pgs_subtitle') return 'PGS';
  if (lower === 'subrip') return 'SRT';
  if (lower === 'dvd_subtitle' || lower === 'vobsub') return 'VobSub';
  return codecName.toUpperCase();
};