import { t } from '../utils/i18n.ts';
import { text, groupMultiselect, note, confirm, select } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';

import { onCancel, sanitizePath, handleExecutionMenu, editTagsMenu } from '../utils/ui.ts';
import { getMediaInfo } from '../utils/ffprobe.ts';
import { buildMergeCommand } from '../utils/builder.ts';
import { formatFps, formatDuration, formatSize, padLabel, isImageSubtitle, formatSubtitleCodec, calculateTotalFrames } from '../utils/formatters.ts';

import fallbackRules from '../../dist/rules.json' with { type: 'json' };

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

  pathA = sanitizePath(pathA as string);
  pathB = sanitizePath(pathB as string);

  const infoA = getMediaInfo(pathA as string);
  const infoB = getMediaInfo(pathB as string);
  const durA = infoA.format?.duration ? parseFloat(infoA.format.duration) : 0;
  const durB = infoB.format?.duration ? parseFloat(infoB.format.duration) : 0;

  const vStreamRef = infoA.streams.find((s: any) => s.codec_type === 'video' && s.codec_name !== 'mjpeg');
  const totalFrames = calculateTotalFrames(vStreamRef, Math.max(durA, durB));

  const getVideoStreamInfo = (info: any) => {
    const stream = info.streams.find((s: any) => s.codec_type === 'video');
    if (!stream) return null;
    return { width: stream.width || 0, height: stream.height || 0, bitrate: stream.bit_rate ? parseInt(stream.bit_rate) : 0 };
  };

  const vA = getVideoStreamInfo(infoA);
  const vB = getVideoStreamInfo(infoB);

  let suggestedVideo = 'A';
  if (vA && vB) {
    const pixelsA = vA.width * vA.height;
    const pixelsB = vB.width * vB.height;
    if (pixelsB > pixelsA || (pixelsB === pixelsA && vB.bitrate > vA.bitrate)) suggestedVideo = 'B';
  }

  const buildGroupedOptions = (infoA: any, infoB: any, currentSelected?: any[]) => {
    const groups: Record<string, any[]> = { '🎬 Vídeo': [], '🔊 Áudio': [], '💬 Legendas e Outros': [] };
    const initialValues: any[] = [];

    const processStream = (s: any, fileLabel: string, fileIndex: number) => {
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
        const channels = s.channels === 6 ? '5.1' : s.channels === 2 ? 'Stereo' : s.channels;
        label = `[${s.codec_name}] (${lang}) ${channels} Ch | ${hz} | ${bitrate}`;
      } else if (s.codec_type === 'subtitle') {
        const subStatus = isImageSubtitle(s.codec_name) ? pc.yellow(` ⚠ ${t('checkBurnIn')}`) : pc.green(` ✔ ${t('checkSafe')}`);
        label = `[${formatSubtitleCodec(s.codec_name)}] (${lang})${s.tags?.title ? ` - "${s.tags.title}"` : ''}${subStatus}`;
      } else {
        label = `[${s.codec_type}] ${s.codec_name}`;
      }
      
      const optionValue = { fileIndex, streamIndex: s.index, type: s.codec_type, codec: s.codec_name };
      const option = { value: optionValue, label: `${label} - Arquivo ${fileLabel}` };
      
      if (s.codec_type === 'video') groups['🎬 Vídeo']!.push(option);
      else if (s.codec_type === 'audio') groups['🔊 Áudio']!.push(option);
      else groups['💬 Legendas e Outros']!.push(option);

      if (currentSelected) {
        if (currentSelected.some((cs: any) => cs.fileIndex === fileIndex && cs.streamIndex === s.index)) {
          initialValues.push(optionValue);
        }
      } else {
        if (suggestedVideo === fileLabel && s.codec_type === 'video') initialValues.push(optionValue);
      }
    };

    infoA.streams.forEach((s: any) => processStream(s, 'A', 0));
    infoB.streams.forEach((s: any) => processStream(s, 'B', 1));
    Object.keys(groups).forEach(k => { if (groups[k]!.length === 0) delete groups[k]; });
    return { groups, initialValues };
  };

  const buildFileSummary = (info: any) => {
    const duration = info.format?.duration ? formatDuration(parseFloat(info.format.duration)) : 'N/A';
    const size = info.format?.size ? formatSize(parseInt(info.format.size)) : 'N/A';
    const videos = info.streams.filter((s: any) => s.codec_type === 'video');
    const audios = info.streams.filter((s: any) => s.codec_type === 'audio');
    const subs = info.streams.filter((s: any) => s.codec_type === 'subtitle');
    return {
      duration, size,
      vSummary: videos.length > 0 ? `${videos[0].codec_name} (${videos[0].width}x${videos[0].height})` : t('mergeNone'),
      aSummary: audios.length > 0 ? `${audios.length} ${t('checkTrack')} (${audios.map((a: any) => a.codec_name).join(', ')})` : t('mergeNone'),
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
  let selectedStreams = onCancel(await groupMultiselect({
    message: `${t('mergeSelectStreams')} (${t('fileSuggest', suggestedVideo)})`,
    options: groups,
    required: true,
    initialValues: initialValues.filter(Boolean),
  })) as any[];

  selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, true);

  let currentDelayMs = 0;
  let applyShortest = false;

  const askForSync = async () => {
    const exactDiffMs = Math.round((durA - durB) * 1000);
    let chosenSyncAction = 'manual';

    if (exactDiffMs !== 0) {
      const absDiff = Math.abs(exactDiffMs);
      const actionWord = exactDiffMs > 0 ? t('delayBehind', absDiff) : t('delayAhead', absDiff);
      
      chosenSyncAction = onCancel(await select({
        message: t('mergeHowToSync'),
        options: [
          { label: t('mergeAutoSync', actionWord), value: 'auto' },
          { label: t('mergeManualSync'), value: 'manual' },
          { label: t('mergeNoSync'), value: 'none' }
        ]
      })) as string;
    }

    if (chosenSyncAction === 'auto') {
      currentDelayMs = exactDiffMs;
    } else if (chosenSyncAction === 'manual') {
      const delayStr = await text({
        message: t('mergeAskDelay'),
        initialValue: currentDelayMs.toString(),
        validate(value) {
          if (value && isNaN(parseInt(value as string))) return 'Digite um número válido';
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
    note(pc.yellow(t('mergeDurationAlert')), 'Alerta de Duração');
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
    note(pc.yellow(ffmpegCmd), `${t('mergeCmdSuggested')}${syncMsg}${cutMsg}`);

    // Mapeamento Total: Todos os vídeos/áudios do Arquivo 0 (A) e do Arquivo 1 (B)
    const fullScanInputs = [pathA as string, pathB as string];
    const fullScanMaps = [
      ...infoA.streams.filter((s: any) => s.codec_type === 'video' || s.codec_type === 'audio').map((s: any) => `0:${s.index}`),
      ...infoB.streams.filter((s: any) => s.codec_type === 'video' || s.codec_type === 'audio').map((s: any) => `1:${s.index}`)
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
      selectedStreams = onCancel(await groupMultiselect({
        message: t('mergeModifyStreams'),
        options: refreshedOptions.groups,
        required: true,
        initialValues: refreshedOptions.initialValues,
      })) as any[];

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