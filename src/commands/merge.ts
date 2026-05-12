import { t } from '../utils/i18n.ts';
import { text, groupMultiselect, note, confirm, select, log } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';

import { onCancel, sanitizePath, handleExecutionMenu, editTagsMenu } from '../utils/ui.ts';
import { getMediaInfo } from '../utils/ffprobe.ts';
import { buildMergeCommand } from '../utils/builder.ts';
import { formatFps, formatDuration, formatSize, padLabel, isImageSubtitle, formatSubtitleCodec, calculateTotalFrames } from '../utils/formatters.ts';
import type { FFprobeData, MediaStream, SelectedStream, GroupedStreamOptions } from '../types/media';
import type { FallbackRules } from '../types/config';

import fallbackRulesData from '../config/fallback_rules.yaml';

const fallbackRules = fallbackRulesData as FallbackRules;

type VideoInfo = {
  width: number;
  height: number;
  bitrate: number;
};

export async function mergeCommand(args: string[]) {
  let pathA = onCancel(await text({
    message: t('mergePathA'),
    placeholder: './spider-man_4k.mkv',
    validate(value) {
      const clean = sanitizePath(value);
      if (!clean) return t('pathRequired');
      if (!fs.existsSync(clean)) return t('fileNotFound');
    }
  }));

  let pathB = onCancel(await text({
    message: t('mergePathB'),
    placeholder: './spider-man_pt-br.mkv',
    validate(value) {
      const clean = sanitizePath(value);
      if (!clean) return t('pathRequired');
      if (!fs.existsSync(clean)) return t('fileNotFound');
    }
  }));

  pathA = sanitizePath(pathA as string)!;
  pathB = sanitizePath(pathB as string)!;

  const infoA: FFprobeData = getMediaInfo(pathA as string);
  const infoB: FFprobeData = getMediaInfo(pathB as string);
  const durA = infoA.format?.duration ? parseFloat(infoA.format.duration) : 0;
  const durB = infoB.format?.duration ? parseFloat(infoB.format.duration) : 0;

  const vStreamRef = infoA.streams.find((s) => s.codec_type === 'video' && s.codec_name !== 'mjpeg');
  const totalFrames = calculateTotalFrames(vStreamRef, Math.max(durA, durB));

  const getVideoStreamInfo = (info: FFprobeData): VideoInfo | null => {
    const stream = info.streams.find((s) => s.codec_type === 'video');
    if (!stream) return null;
    return { width: stream.width || 0, height: stream.height || 0, bitrate: stream.bit_rate ? Number.parseInt(stream.bit_rate, 10) : 0 };
  };

  const vA = getVideoStreamInfo(infoA);
  const vB = getVideoStreamInfo(infoB);

  let suggestedVideo: 'A' | 'B' = 'A';
  if (vA && vB) {
    const pixelsA = vA.width * vA.height;
    const pixelsB = vB.width * vB.height;
    if (pixelsB > pixelsA || (pixelsB === pixelsA && vB.bitrate > vA.bitrate)) suggestedVideo = 'B';
  }

  const buildGroupedOptions = (infoA: FFprobeData, infoB: FFprobeData, currentSelected?: SelectedStream[]) => {
    const groupVideo = t('groupVideo');
    const groupAudio = t('groupAudio');
    const groupSubs = t('groupSubs');
    const groups: GroupedStreamOptions = { [groupVideo]: [], [groupAudio]: [], [groupSubs]: [] };
    const initialValues: SelectedStream[] = [];

    const processStream = (s: MediaStream, fileLabel: string, fileIndex: number) => {
      if (s.codec_type === 'video' && ['mjpeg', 'png', 'bmp'].includes(s.codec_name)) return;
      let label = '';
      const lang = s.tags && s.tags.language ? s.tags.language.toUpperCase() : 'UND';
      
      if (s.codec_type === 'video') {
        const fps = formatFps(s.r_frame_rate || s.avg_frame_rate).replace(' fps', '');
        const bitrate = s.bit_rate ? Math.round(parseInt(s.bit_rate) / 1000) + ' kbps' : 'N/A';
        label = `[${s.codec_name}] ${s.width}x${s.height} @ ${fps}fps - ${bitrate}`;
      } else if (s.codec_type === 'audio') {
        const hz = s.sample_rate ? Math.round(parseInt(s.sample_rate) / 1000) + ' kHz' : 'N/A';
        const bitrate = s.bit_rate ? Math.round(parseInt(s.bit_rate) / 1000) + ' kbps' : 'N/A';
        const channels = s.channels === 6 ? '5.1' : s.channels === 2 ? t('fmtStereo') : s.channels;
        label = `[${s.codec_name}] (${lang}) ${channels} Ch | ${hz} | ${bitrate}`;
      } else if (s.codec_type === 'subtitle') {
        const subStatus = isImageSubtitle(s.codec_name) ? pc.yellow(` ⚠ ${t('checkBurnIn')}`) : pc.green(` ✔ ${t('checkSafe')}`);
        label = `[${formatSubtitleCodec(s.codec_name)}] (${lang})${s.tags?.title ? ` - "${s.tags.title}"` : ''}${subStatus}`;
      } else {
        label = `[${s.codec_type}] ${s.codec_name}`;
      }
      
      const optionValue: SelectedStream = { fileIndex, streamIndex: s.index, type: s.codec_type, codec: s.codec_name };
      const option = { value: optionValue, label: `${label}${t('fileSuffix', fileLabel)}` };

      if (s.codec_type === 'video') groups[groupVideo]!.push(option);
      else if (s.codec_type === 'audio') groups[groupAudio]!.push(option);
      else groups[groupSubs]!.push(option);

      if (currentSelected) {
        if (currentSelected.some((cs) => cs.fileIndex === fileIndex && cs.streamIndex === s.index)) {
          initialValues.push(optionValue);
        }
      } else {
        if (suggestedVideo === fileLabel && s.codec_type === 'video') initialValues.push(optionValue);
      }
    };

    infoA.streams.forEach((s) => processStream(s, 'A', 0));
    infoB.streams.forEach((s) => processStream(s, 'B', 1));
    Object.keys(groups).forEach(k => { if (groups[k]!.length === 0) delete groups[k]; });
    return { groups, initialValues };
  };

  const buildFileSummary = (info: FFprobeData) => {
    const duration = info.format?.duration ? formatDuration(parseFloat(info.format.duration)) : 'N/A';
    const size = info.format?.size ? formatSize(parseInt(info.format.size)) : 'N/A';
    const videos = info.streams.filter((s) => s.codec_type === 'video');
    const audios = info.streams.filter((s) => s.codec_type === 'audio');
    const subs = info.streams.filter((s) => s.codec_type === 'subtitle');
    const firstVideo = videos[0];
    return {
      duration, size,
      vSummary: firstVideo ? `${firstVideo.codec_name} (${firstVideo.width}x${firstVideo.height})` : t('mergeNone'),
      aSummary: audios.length > 0 ? `${audios.length} ${t('checkTrack')} (${audios.map((a) => a.codec_name).join(', ')})` : t('mergeNone'),
      sSummary: subs.length > 0 ? `${subs.length} ${t('checkTrack')}` : t('mergeNone')
    };
  };

  const sumA = buildFileSummary(infoA);
  const sumB = buildFileSummary(infoB);

  note([
    `${pc.bold(padLabel(t('mergeInfo'), 10))} | ${pc.bold(padLabel(t('mergeFileA'), 30))} | ${pc.bold(t('mergeFileB'))}`,
    `${padLabel('----------', 10)}-|-${padLabel('------------------------------', 30)}-|------------------------------`,
    `${pc.dim(padLabel(t('mergeDuration'), 10))} | ${padLabel(sumA.duration, 30)} | ${sumB.duration}`,
    `${pc.dim(padLabel(t('mergeSize'), 10))} | ${padLabel(sumA.size, 30)} | ${sumB.size}`,
    `${pc.dim(padLabel(t('checkVideo').replace(':', ''), 10))} | ${padLabel(sumA.vSummary, 30)} | ${sumB.vSummary}`,
    `${pc.dim(padLabel(t('checkAudio').replace(':', ''), 10))} | ${padLabel(sumA.aSummary, 30)} | ${sumB.aSummary}`,
    `${pc.dim(padLabel(t('checkSubs'), 10))} | ${padLabel(sumA.sSummary, 30)} | ${sumB.sSummary}`,
  ].join('\n'), t('mergeComparison'));

  let { groups, initialValues } = buildGroupedOptions(infoA, infoB);
  let selectedStreams: SelectedStream[] = onCancel(await groupMultiselect<SelectedStream>({
    message: `${t('mergeSelectStreams')} (${t('fileSuggest', suggestedVideo)})`,
    options: groups,
    required: true,
    initialValues,
  })) as SelectedStream[];

  selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, true);

  let currentDelayMs = 0;
  let applyShortest = false;

  const askForSync = async () => {
    const exactDiffMs = Math.round((durA - durB) * 1000);
    const options: Array<{ label: string; value: string }> = [];

    // O "Auto-alinhar" só aparece se houver diferença de duração física
    if (Math.abs(exactDiffMs) > 1000) {
      options.push({ 
        label: t('mergeAutoSync', exactDiffMs > 0 ? t('delayBehind', Math.abs(exactDiffMs)) : t('delayAhead', Math.abs(exactDiffMs))), 
        value: 'auto' 
      });
    }

    // As opções manuais aparecem SEMPRE
    options.push({ label: t('mergeManualSync'), value: 'manual' });
    options.push({ label: t('mergeNoSync'), value: 'none' });

    const chosenSyncAction = onCancel(await select({
      message: t('mergeHowToSync'),
      options: options
    }));

    if (chosenSyncAction === 'auto') {
      currentDelayMs = exactDiffMs;
    } else if (chosenSyncAction === 'manual') {
      const delayStr = await text({
        message: t('mergeAskDelay'),
        initialValue: currentDelayMs.toString(),
        validate(value) {
          if (value && isNaN(parseInt(value as string))) return t('validNumber');
        }
      });
      if (onCancel(delayStr) !== undefined) {
        currentDelayMs = parseInt(delayStr as string) || 0;
      }
    } else {
      currentDelayMs = 0;
    }

    applyShortest = await confirm({
      message: t('mergeStrictCut'),
      initialValue: applyShortest
    }) as boolean;
    if (onCancel(applyShortest) === false) applyShortest = false;
  };

  if (Math.abs(durA - durB) > 1) {
    note(pc.yellow(t('mergeDurationAlert')), t('durationAlertTitle'));
    await askForSync();
  }

  const dir = path.dirname(pathA as string);
  const name = path.basename(pathA as string, path.extname(pathA as string));
  const outputPath = path.join(dir, `${name}.jellycc_merged.${fallbackRules.container}`);

  let menuLoop = true;
  let dsCompleted = false;
  let hasMediaErrors = false;

  while (menuLoop) {
    const ffmpegCmd = buildMergeCommand(selectedStreams, infoA, infoB, fallbackRules, pathA as string, pathB as string, outputPath, currentDelayMs, applyShortest, false);
    const ffmpegRepairCmd = buildMergeCommand(selectedStreams, infoA, infoB, fallbackRules, pathA as string, pathB as string, outputPath, currentDelayMs, applyShortest, true);

    let syncMsg = currentDelayMs !== 0 ? pc.dim(t('syncAdjusted', currentDelayMs)) : '';
    let cutMsg = applyShortest ? pc.yellow(t('strictCut')) : '';

    // UI Contextual elegante usando o log do Clack
    const hasSubs = selectedStreams.some((s) => s.type === 'subtitle');
    if (currentDelayMs !== 0 && hasSubs) {
      log.info(pc.cyan(t('syncWarning')));
    }

    note(pc.yellow(ffmpegCmd), `${t('mergeCmdSuggested')}${syncMsg}${cutMsg}`);

    // Mapeamento Total: Todos os vídeos/áudios do Arquivo 0 (A) e do Arquivo 1 (B)
    const fullScanInputs = [pathA as string, pathB as string];
    const fullScanMaps = [
      ...infoA.streams.filter((s) => s.codec_type === 'video' || s.codec_type === 'audio').map((s) => `0:${s.index}`),
      ...infoB.streams.filter((s) => s.codec_type === 'video' || s.codec_type === 'audio').map((s) => `1:${s.index}`)
    ];

    const result = await handleExecutionMenu({
      ffmpegCmd,
      ffmpegRepairCmd,
      fullScanInputs,
      fullScanMaps,
      outputPath,
      totalDuration: Math.max(durA, durB),
      totalFrames,
      isMerge: true,
      allowStreamSelection: true,
      allowSyncAdjustment: true,
      deepScanCompleted: dsCompleted,
      hasErrors: hasMediaErrors,
      allowMyopicScan: false
    });

    dsCompleted = result.deepScanCompleted;
    hasMediaErrors = result.hasErrors;

    if (result.action === 'select_streams') {
      const refreshedOptions = buildGroupedOptions(infoA, infoB, selectedStreams);
      selectedStreams = onCancel(await groupMultiselect<SelectedStream>({
        message: t('mergeModifyStreams'),
        options: refreshedOptions.groups,
        required: true,
        initialValues: refreshedOptions.initialValues,
      })) as SelectedStream[];

      selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, true);
      
    } else if (result.action === 'edit_tags') {
      // Direto ao ponto
      selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, false);
    } else if (result.action === 'adjust_sync') {
      await askForSync();
    } else {
      menuLoop = false;
    }
  }
}
