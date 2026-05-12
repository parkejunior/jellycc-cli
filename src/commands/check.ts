import { t } from '../utils/i18n.ts';
import { text, cancel, note, confirm, groupMultiselect, log } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';

import { onCancel, sanitizePath, handleExecutionMenu, editTagsMenu } from '../utils/ui.ts';
import { runQuickScan, getMediaInfo } from '../utils/ffprobe.ts';
import { buildCheckCommand } from '../utils/builder.ts';
import { getDiagnostic } from '../services/analyzer.ts';
import { filterGarbageStreams } from '../utils/mediaUtils.ts';
import { renderMatrix, renderActionPlan } from '../views/checkView.ts';
import { buildGroupedOptions } from '../views/streamOptions.ts';
import type { SelectedStream } from '../types/media';
import type { FallbackRules, JellyfinSupportMatrix } from '../types/config';

import supportMatrixData from '../config/jellyfin_codec_support.yaml';
import fallbackRulesData from '../config/fallback_rules.yaml';

const supportMatrix = supportMatrixData as JellyfinSupportMatrix;
const fallbackRules = fallbackRulesData as FallbackRules;

export async function checkCommand(args: string[]) {
  const deepScanFlag = args.includes('--deep-scan');
  const rawPathArg = args.find((arg) => arg !== '--deep-scan');
  let videoPath = sanitizePath(rawPathArg);

  if (!videoPath) {
    const rawPath = onCancel(await text({
      message: t('checkAskVideo'),
      placeholder: './spider-man.mkv',
      validate(value) {
        const clean = sanitizePath(value);
        if (!clean) return t('pathRequired');
        if (!fs.existsSync(clean)) return t('fileNotFound');
      }
    }));
    videoPath = sanitizePath(rawPath);
  } else if (!fs.existsSync(videoPath)) {
    cancel(t('filePassedNotFound'));
    process.exit(1);
  }

  runQuickScan(videoPath as string);

  const probeData = getMediaInfo(videoPath as string);
  const initialDiagnostic = getDiagnostic(probeData, fallbackRules, supportMatrix, undefined, videoPath as string);

  note(renderMatrix(initialDiagnostic), t('checkMatrixResults'));
  note(renderActionPlan(initialDiagnostic), t('checkActionPlan'));

  let autoClean = false;
  if (initialDiagnostic.hasGarbage) {
    autoClean = await confirm({
      message: pc.yellow(t('checkGarbageDetected')),
      initialValue: true
    }) as boolean;
    if (onCancel(autoClean) === false) autoClean = false;
  }

  let selectedStreams: SelectedStream[] = probeData.streams.map((stream) => ({
    streamIndex: stream.index,
    type: stream.codec_type,
    codec: stream.codec_name
  }));

  selectedStreams = await editTagsMenu(selectedStreams, probeData, undefined, true);

  if (autoClean) {
    const cleanIndices = new Set(filterGarbageStreams(probeData.streams).map((stream) => stream.index));
    selectedStreams = selectedStreams.filter((stream) => cleanIndices.has(stream.streamIndex));
  }

  const dir = path.dirname(videoPath as string);
  const name = path.basename(videoPath as string, path.extname(videoPath as string));
  const outputPath = path.join(dir, `${name}.jellycc.${fallbackRules.container}`);

  let menuLoop = true;
  let dsCompleted = deepScanFlag;
  let hasMediaErrors = false;

  while (menuLoop) {
    const currentDiagnostic = getDiagnostic(probeData, fallbackRules, supportMatrix, selectedStreams, videoPath as string);
    const ffmpegCmd = buildCheckCommand(
      selectedStreams,
      probeData,
      fallbackRules,
      currentDiagnostic.selection.isVideoCompatible,
      videoPath as string,
      outputPath,
      false
    );
    const ffmpegRepairCmd = buildCheckCommand(
      selectedStreams,
      probeData,
      fallbackRules,
      currentDiagnostic.selection.isVideoCompatible,
      videoPath as string,
      outputPath,
      true
    );

    const totalDuration = currentDiagnostic.metadata.durationSec;
    const totalFrames = currentDiagnostic.metadata.totalFrames;

    const fullScanInputs = [videoPath as string];
    const fullScanMaps = ['0'];
    const selectedScanInputs = [videoPath as string];
    const selectedScanMaps = selectedStreams.map((stream) => `0:${stream.streamIndex}`);

    if (!currentDiagnostic.selection.needsAction) {
      note(pc.green(t('checkPerfect')), t('readyToUse'));
    } else if (currentDiagnostic.selection.isJustRemux) {
      const droppedCount = currentDiagnostic.selection.originalCount - currentDiagnostic.selection.selectedCount;
      log.info(pc.cyan(t('checkRemuxOnly', droppedCount)));
      note(pc.yellow(ffmpegCmd), t('checkRemuxCmd'));
    } else {
      note(pc.yellow(ffmpegCmd), t('checkTranscodeCmd'));
    }

    const result = await handleExecutionMenu({
      ffmpegCmd,
      ffmpegRepairCmd,
      fullScanInputs,
      fullScanMaps,
      selectedScanInputs,
      selectedScanMaps,
      outputPath,
      totalDuration,
      totalFrames,
      isPerfect: !currentDiagnostic.selection.needsAction,
      isJustRemux: currentDiagnostic.selection.isJustRemux,
      deepScanCompleted: dsCompleted,
      hasErrors: hasMediaErrors,
      isMerge: false,
      allowStreamSelection: true,
      allowMyopicScan: true
    });

    dsCompleted = result.deepScanCompleted;
    hasMediaErrors = result.hasErrors;

    if (result.action === 'select_streams') {
      const { groups, initialValues } = buildGroupedOptions({
        sources: [{ info: probeData }],
        currentSelected: selectedStreams,
        includeAttachedPictures: true,
        includeAudioTitle: true
      });

      selectedStreams = onCancel(await groupMultiselect<SelectedStream>({
        message: t('checkSelectKeep'),
        options: groups,
        required: true,
        initialValues
      }));

      selectedStreams = await editTagsMenu(selectedStreams, probeData, undefined, true);
    } else if (result.action === 'edit_tags') {
      selectedStreams = await editTagsMenu(selectedStreams, probeData, undefined, false);
    } else {
      menuLoop = false;
    }
  }
}
