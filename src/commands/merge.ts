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
import { calculateDifferenceMs } from '../services/syncManager.ts';
import { renderComparison, buildSyncOptions } from '../views/mergeView.ts';
import { buildGroupedOptions } from '../views/streamOptions.ts';
import { ValidationError } from '../utils/errors.ts';
import type { FFprobeData, SelectedStream } from '../types/media';
import type { FallbackRules } from '../types/config';

import fallbackRulesData from '../config/fallback_rules.yaml';

const fallbackRules = fallbackRulesData as FallbackRules;

export async function mergeCommand(args: string[]) {
  const pathAInput = onCancel(await text({
    message: t('mergePathA'),
    placeholder: './spider-man_4k.mkv',
    validate(value) {
      const clean = sanitizePath(value);
      if (!clean) return t('pathRequired');
      if (!fs.existsSync(clean)) return t('fileNotFound');
    }
  }));

  const pathBInput = onCancel(await text({
    message: t('mergePathB'),
    placeholder: './spider-man_pt-br.mkv',
    validate(value) {
      const clean = sanitizePath(value);
      if (!clean) return t('pathRequired');
      if (!fs.existsSync(clean)) return t('fileNotFound');
    }
  }));

  const pathA = sanitizePath(pathAInput);
  if (!pathA) {
    throw new ValidationError(t('pathRequired'));
  }

  const pathB = sanitizePath(pathBInput);
  if (!pathB) {
    throw new ValidationError(t('pathRequired'));
  }

  const sourcePathA: string = pathA;
  const sourcePathB: string = pathB;

  const infoA: FFprobeData = getMediaInfo(sourcePathA);
  const infoB: FFprobeData = getMediaInfo(sourcePathB);
  const durA = infoA.format?.duration ? Number.parseFloat(infoA.format.duration) : 0;
  const durB = infoB.format?.duration ? Number.parseFloat(infoB.format.duration) : 0;
  const durationDiffMs = calculateDifferenceMs(durA, durB);

  const vStreamRef = getPrimaryVideoStream(infoA);
  const totalFrames = calculateTotalFrames(vStreamRef, Math.max(durA, durB));
  const suggestedVideo = getPreferredVideoSource(infoA, infoB);

  note(renderComparison(infoA, infoB), t('mergeComparison'));

  let { groups, initialValues } = buildGroupedOptions({
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
  }));

  selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, true);

  let currentDelayMs = 0;
  let applyShortest = false;

  const askForSync = async (currentDelayMs: number, applyShortest: boolean) => {
    const options = buildSyncOptions(durationDiffMs);

    const chosenSyncAction = onCancel(await select({
      message: t('mergeHowToSync'),
      options
    }));

    let nextDelayMs = currentDelayMs;
    let nextApplyShortest = applyShortest;

    if (chosenSyncAction === 'auto') {
      nextDelayMs = durationDiffMs;
    } else if (chosenSyncAction === 'manual') {
      const delayStr = onCancel(await text({
        message: t('mergeAskDelay'),
        initialValue: nextDelayMs.toString(),
        validate(value) {
          if (value && isNaN(Number.parseInt(value, 10))) return t('validNumber');
        }
      }));

      nextDelayMs = Number.parseInt(delayStr, 10) || 0;
    } else {
      nextDelayMs = 0;
    }

    nextApplyShortest = onCancel(await confirm({
      message: t('mergeStrictCut'),
      initialValue: nextApplyShortest
    }));

    return {
      currentDelayMs: nextDelayMs,
      applyShortest: nextApplyShortest
    };
  };

  if (Math.abs(durationDiffMs) > 1000) {
    note(pc.yellow(t('mergeDurationAlert')), t('durationAlertTitle'));
    const syncState = await askForSync(currentDelayMs, applyShortest);
    currentDelayMs = syncState.currentDelayMs;
    applyShortest = syncState.applyShortest;
  }

  const dir = path.dirname(sourcePathA);
  const name = path.basename(sourcePathA, path.extname(sourcePathA));
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
      sourcePathA,
      sourcePathB,
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
      sourcePathA,
      sourcePathB,
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

    const fullScanInputs = [sourcePathA, sourcePathB];
    const fullScanMaps = [
      ...infoA.streams.filter((stream) => stream.codec_type === 'video' || stream.codec_type === 'audio').map((stream) => `0:${stream.index}`),
      ...infoB.streams.filter((stream) => stream.codec_type === 'video' || stream.codec_type === 'audio').map((stream) => `1:${stream.index}`)
    ];

    const { action, deepScanCompleted, hasErrors } = await handleExecutionMenu({
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

    dsCompleted = deepScanCompleted;
    hasMediaErrors = hasErrors;

    if (action === 'select_streams') {
      const refreshedOptions = buildGroupedOptions({
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
      }));

      selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, true);
    } else if (action === 'edit_tags') {
      selectedStreams = await editTagsMenu(selectedStreams, infoA, infoB, false);
    } else if (action === 'adjust_sync') {
      const syncState = await askForSync(currentDelayMs, applyShortest);
      currentDelayMs = syncState.currentDelayMs;
      applyShortest = syncState.applyShortest;
    } else {
      menuLoop = false;
    }
  }
}
