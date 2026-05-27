import { t } from '../utils/i18n.ts';
import pc from 'picocolors';
import { formatDuration, formatSize, padLabel } from '../utils/formatters.ts';
import { getPrimaryVideoStream } from '../services/analyzer.ts';
import type { FFprobeData } from '../types/media';

export type SyncMenuOption = {
  label: string;
  value: 'auto' | 'manual' | 'none' | 'spectrum';
};

export function buildSyncOptions(exactDiffMs: number): SyncMenuOption[] {
  const options: SyncMenuOption[] = [];

  if (Math.abs(exactDiffMs) > 1000) {
    options.push({
      label: t('mergeAutoSync', exactDiffMs > 0 ? t('delayBehind', Math.abs(exactDiffMs)) : t('delayAhead', Math.abs(exactDiffMs))),
      value: 'auto'
    });
  }

  options.push({ label: t('mergeSpectrumSync'), value: 'spectrum' });
  options.push({ label: t('mergeManualSync'), value: 'manual' });
  options.push({ label: t('mergeNoSync'), value: 'none' });

  return options;
}
const buildFileSummary = (info: FFprobeData) => {
  const duration = info.format?.duration ? formatDuration(Number.parseFloat(info.format.duration)) : 'N/A';
  const size = info.format?.size ? formatSize(Number.parseInt(info.format.size, 10)) : 'N/A';
  const video = getPrimaryVideoStream(info);
  const audios = info.streams.filter((stream) => stream.codec_type === 'audio');
  const subs = info.streams.filter((stream) => stream.codec_type === 'subtitle');

  return {
    duration,
    size,
    vSummary: video ? `${video.codec_name} (${video.width || '?'}x${video.height || '?'})` : t('mergeNone'),
    aSummary: audios.length > 0 ? `${audios.length} ${t('checkTrack')} (${audios.map((audio) => audio.codec_name).join(', ')})` : t('mergeNone'),
    sSummary: subs.length > 0 ? `${subs.length} ${t('checkTrack')}` : t('mergeNone')
  };
};

export function renderComparison(infoA: FFprobeData, infoB: FFprobeData) {
  const sumA = buildFileSummary(infoA);
  const sumB = buildFileSummary(infoB);

  return [
    `${pc.bold(padLabel(t('mergeInfo'), 10))} | ${pc.bold(padLabel(t('mergeFileA'), 30))} | ${pc.bold(t('mergeFileB'))}`,
    `${padLabel('----------', 10)}-|-${padLabel('------------------------------', 30)}-|------------------------------`,
    `${pc.dim(padLabel(t('mergeDuration'), 10))} | ${padLabel(sumA.duration, 30)} | ${sumB.duration}`,
    `${pc.dim(padLabel(t('mergeSize'), 10))} | ${padLabel(sumA.size, 30)} | ${sumB.size}`,
    `${pc.dim(padLabel(t('checkVideo').replace(':', ''), 10))} | ${padLabel(sumA.vSummary, 30)} | ${sumB.vSummary}`,
    `${pc.dim(padLabel(t('checkAudio').replace(':', ''), 10))} | ${padLabel(sumA.aSummary, 30)} | ${sumB.aSummary}`,
    `${pc.dim(padLabel(t('checkSubs'), 10))} | ${padLabel(sumA.sSummary, 30)} | ${sumB.sSummary}`
  ].join('\n');
}
