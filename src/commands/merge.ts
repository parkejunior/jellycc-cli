import { t } from '../utils/i18n.ts';
import { text, groupMultiselect, note, confirm, select, log } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';

import { onCancel, sanitizePath, handleExecutionMenu, editTagsMenu } from '../utils/ui.ts';
import { getMediaInfo } from '../utils/ffprobe.ts';
import { buildMergeCommand } from '../utils/builder.ts';
import { calculateTotalFrames } from '../utils/formatters.ts';
import { getPreferredVideoSource, getPrimaryVideoStream } from '../services/analyzer.ts';
import { renderComparison, buildSyncOptions } from '../views/mergeView.ts';
import { buildStreamOptions } from '../views/streamOptions.ts';
import type { FFprobeData, SelectedStream } from '../types/media';
import type { FallbackRules } from '../types/config';

import fallbackRulesData from '../config/fallback_rules.yaml';

const fallbackRules = fallbackRulesData as FallbackRules;

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
  const durA = infoA.format?.duration ? Number.parseFloat(infoA.format.duration) : 0;
  const durB = infoB.format?.duration ? Number.parseFloat(infoB.format.duration) : 0;

  const vStreamRef = getPrimaryVideoStream(infoA);
  const totalFrames = calculateTotalFrames(vStreamRef, Math.max(durA, durB));
  const suggestedVideo = getPreferredVideoSource(infoA, infoB);

  note(renderComparison(infoA, infoB), t('mergeComparison'));

  let { groups, initialValues } = buildStreamOptions({
    sources: [
      { info: infoA, fileIndex: 0, label: 'A' },
      { info: infoB, fileIndex: 1, label: 'B' }
    ],
    preferredSourceLabel: suggestedVideo,
    includeAttachedPictures: false,
    includeAudioTitle: false
  });

  let selectedStreams: SelectedStream[] = onCancel(await groupMultiselect<SelectedStream>({
    message: `${t('mergeSelectStreams')} (${t('fileSuggest', suggestedVideo)})`,
    options: groups,
    required: true,
    initialValues
  })) as SelectedStream[];

  selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, true);

  let currentDelayMs = 0;
  let applyShortest = false;

  const askForSync = async () => {
    const exactDiffMs = Math.round((durA - durB) * 1000);
    const options = buildSyncOptions(exactDiffMs);

    const chosenSyncAction = onCancel(await select({
      message: t('mergeHowToSync'),
      options
    }));

    if (chosenSyncAction === 'auto') {
      currentDelayMs = exactDiffMs;
    } else if (chosenSyncAction === 'manual') {
      const delayStr = await text({
        message: t('mergeAskDelay'),
        initialValue: currentDelayMs.toString(),
        validate(value) {
          if (value && isNaN(Number.parseInt(value as string, 10))) return t('validNumber');
        }
      });

      if (onCancel(delayStr) !== undefined) {
        currentDelayMs = Number.parseInt(delayStr as string, 10) || 0;
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
    const ffmpegCmd = buildMergeCommand(
      selectedStreams,
      infoA,
      infoB,
      fallbackRules,
      pathA as string,
      pathB as string,
      outputPath,
      currentDelayMs,
      applyShortest,
      false
    );
    const ffmpegRepairCmd = buildMergeCommand(
      selectedStreams,
      infoA,
      infoB,
      fallbackRules,
      pathA as string,
      pathB as string,
      outputPath,
      currentDelayMs,
      applyShortest,
      true
    );

    const syncMsg = currentDelayMs !== 0 ? pc.dim(t('syncAdjusted', currentDelayMs)) : '';
    const cutMsg = applyShortest ? pc.yellow(t('strictCut')) : '';
    const hasSubs = selectedStreams.some((stream) => stream.type === 'subtitle');

    if (currentDelayMs !== 0 && hasSubs) {
      log.info(pc.cyan(t('syncWarning')));
    }

    note(pc.yellow(ffmpegCmd), `${t('mergeCmdSuggested')}${syncMsg}${cutMsg}`);

    const fullScanInputs = [pathA as string, pathB as string];
    const fullScanMaps = [
      ...infoA.streams.filter((stream) => stream.codec_type === 'video' || stream.codec_type === 'audio').map((stream) => `0:${stream.index}`),
      ...infoB.streams.filter((stream) => stream.codec_type === 'video' || stream.codec_type === 'audio').map((stream) => `1:${stream.index}`)
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
      const refreshedOptions = buildStreamOptions({
        sources: [
          { info: infoA, fileIndex: 0, label: 'A' },
          { info: infoB, fileIndex: 1, label: 'B' }
        ],
        currentSelected: selectedStreams,
        includeAttachedPictures: false,
        includeAudioTitle: false
      });

      groups = refreshedOptions.groups;
      initialValues = refreshedOptions.initialValues;

      selectedStreams = onCancel(await groupMultiselect<SelectedStream>({
        message: t('mergeModifyStreams'),
        options: groups,
        required: true,
        initialValues
      })) as SelectedStream[];

      selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, true);
    } else if (result.action === 'edit_tags') {
      selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, false);
    } else if (result.action === 'adjust_sync') {
      await askForSync();
    } else {
      menuLoop = false;
    }
  }
}
