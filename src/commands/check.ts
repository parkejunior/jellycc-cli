import { t } from '../utils/i18n.ts';
import { text, note, confirm, groupMultiselect, log } from '@clack/prompts';
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
import { ValidationError } from '../utils/errors.ts';
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
    throw new ValidationError(t('filePassedNotFound'));
  }

  if (!videoPath) {
    throw new ValidationError(t('pathRequired'));
  }

  const targetFile: string = videoPath;

  runQuickScan(targetFile);

  const probeData = getMediaInfo(targetFile);
  const initialDiagnostic = getDiagnostic(probeData, fallbackRules, supportMatrix, undefined, targetFile);

  note(renderMatrix(initialDiagnostic), t('checkMatrixResults'));
  note(renderActionPlan(initialDiagnostic), t('checkActionPlan'));

  let autoClean = false;
  if (initialDiagnostic.hasGarbage) {
    autoClean = onCancel(await confirm({
      message: pc.yellow(t('checkGarbageDetected')),
      initialValue: true
    }));
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

  const dir = path.dirname(targetFile);
  const name = path.basename(targetFile, path.extname(targetFile));
  const outputPath = path.join(dir, `${name}.jellycc.${fallbackRules.container}`);

  let menuLoop = true;
  let dsCompleted = deepScanFlag;
  let hasMediaErrors = false;

  while (menuLoop) {
    const currentDiagnostic = getDiagnostic(probeData, fallbackRules, supportMatrix, selectedStreams, targetFile);
    const ffmpegCmd = buildCheckCommand(
      selectedStreams,
      probeData,
      fallbackRules,
      currentDiagnostic.selection.isVideoCompatible,
      targetFile,
      outputPath,
      false
    );
    const ffmpegRepairCmd = buildCheckCommand(
      selectedStreams,
      probeData,
      fallbackRules,
      currentDiagnostic.selection.isVideoCompatible,
      targetFile,
      outputPath,
      true
    );

    const totalDuration = currentDiagnostic.metadata.durationSec;
    const totalFrames = currentDiagnostic.metadata.totalFrames;

    const fullScanInputs = [targetFile];
    const fullScanMaps = ['0'];
    const selectedScanInputs = [targetFile];
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

    const { action, deepScanCompleted, hasErrors } = await handleExecutionMenu({
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

    dsCompleted = deepScanCompleted;
    hasMediaErrors = hasErrors;

    if (action === 'select_streams') {
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
    } else if (action === 'edit_tags') {
      selectedStreams = await editTagsMenu(selectedStreams, probeData, undefined, false);
    } else {
      menuLoop = false;
    }
  }
}
