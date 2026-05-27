import fs from 'fs';
import path from 'path';
import { confirm, groupMultiselect, log, note, text } from '@clack/prompts';
import pc from 'picocolors';

import { getDiagnostic } from '../services/analyzer.ts';
import fallbackRulesData from '../config/fallback_rules.yaml';
import supportMatrixData from '../config/jellyfin_codec_support.yaml';
import type { CheckDiagnostic } from '../services/analyzer.ts';
import type { FallbackRules, JellyfinSupportMatrix } from '../types/config';
import type { FFprobeData, SelectedStream } from '../types/media';
import { buildCheckCommand } from '../utils/builder.ts';
import { ValidationError } from '../utils/errors.ts';
import { getMediaInfo, runQuickScan } from '../utils/ffprobe.ts';
import { t } from '../utils/i18n.ts';
import { filterGarbageStreams } from '../utils/mediaUtils.ts';
import { editTagsMenu, handleExecutionMenu, onCancel, sanitizePath } from '../utils/ui.ts';
import { renderActionPlan, renderMatrix } from '../views/checkView.ts';
import { buildGroupedOptions } from '../views/streamOptions.ts';

const supportMatrix = supportMatrixData as JellyfinSupportMatrix;
const fallbackRules = fallbackRulesData as FallbackRules;

interface CheckSessionState {
  selectedStreams: SelectedStream[];
  deepScanCompleted: boolean;
  hasMediaErrors: boolean;
}

interface CheckLoopContext {
  diagnostic: CheckDiagnostic;
  ffmpegCmd: string;
  ffmpegRepairCmd: string;
  totalDuration: number;
  totalFrames: number;
  fullScanInputs: string[];
  fullScanMaps: string[];
  fullAudioScanMaps: string[];
  fullAudioScanLabels: string[];
  selectedScanInputs: string[];
  selectedScanMaps: string[];
  selectedAudioScanMaps: string[];
  selectedAudioScanLabels: string[];
}

export async function checkCommand(args: string[]) {
  const deepScanRequested = args.includes('--deep-scan');
  const targetFile = await resolveTargetFile(args);

  runQuickScan(targetFile);

  const probeData = getMediaInfo(targetFile);
  const initialDiagnostic = getDiagnostic(probeData, fallbackRules, supportMatrix, undefined, targetFile);

  showInitialDiagnosis(initialDiagnostic);

  const shouldAutoClean = await shouldAutoCleanSelection(initialDiagnostic);
  const outputPath = buildOutputPath(targetFile);

  const state: CheckSessionState = {
    selectedStreams: await buildInitialSelection(probeData, shouldAutoClean),
    deepScanCompleted: deepScanRequested,
    hasMediaErrors: false
  };

  while (true) {
    const context = buildLoopContext(targetFile, outputPath, probeData, state.selectedStreams);

    showCommandPreview(context);

    const result = await handleExecutionMenu({
      ffmpegCmd: context.ffmpegCmd,
      ffmpegRepairCmd: context.ffmpegRepairCmd,
      fullScanInputs: context.fullScanInputs,
      fullScanMaps: context.fullScanMaps,
      fullAudioScanMaps: context.fullAudioScanMaps,
      fullAudioScanLabels: context.fullAudioScanLabels,
      selectedScanInputs: context.selectedScanInputs,
      selectedScanMaps: context.selectedScanMaps,
      selectedAudioScanMaps: context.selectedAudioScanMaps,
      selectedAudioScanLabels: context.selectedAudioScanLabels,
      outputPath,
      totalDuration: context.totalDuration,
      totalFrames: context.totalFrames,
      isPerfect: !context.diagnostic.selection.needsAction,
      isJustRemux: context.diagnostic.selection.isJustRemux,
      deepScanCompleted: state.deepScanCompleted,
      hasErrors: state.hasMediaErrors,
      isMerge: false,
      allowStreamSelection: true,
      allowMyopicScan: true
    });

    state.deepScanCompleted = result.deepScanCompleted;
    state.hasMediaErrors = result.hasErrors;

    if (result.action === 'select_streams') {
      state.selectedStreams = await promptStreamSelection(state.selectedStreams, probeData);
      continue;
    }

    if (result.action === 'edit_tags') {
      state.selectedStreams = await editTagsMenu(state.selectedStreams, probeData, undefined, false);
      continue;
    }

    return;
  }
}

async function resolveTargetFile(args: string[]) {
  const argPath = sanitizePath(args.find((arg) => arg !== '--deep-scan'));

  if (argPath) {
    if (!fs.existsSync(argPath)) {
      throw new ValidationError(t('filePassedNotFound'));
    }

    return argPath;
  }

  const rawPath = onCancel(await text({
    message: t('checkAskVideo'),
    placeholder: './spider-man.mkv',
    validate(value) {
      const clean = sanitizePath(value);
      if (!clean) return t('pathRequired');
      if (!fs.existsSync(clean)) return t('fileNotFound');
    }
  }));

  const promptedPath = sanitizePath(rawPath);

  if (!promptedPath) {
    throw new ValidationError(t('pathRequired'));
  }

  if (!fs.existsSync(promptedPath)) {
    throw new ValidationError(t('fileNotFound'));
  }

  return promptedPath;
}

function showInitialDiagnosis(diagnostic: CheckDiagnostic) {
  note(renderMatrix(diagnostic), t('checkMatrixResults'));
  note(renderActionPlan(diagnostic), t('checkActionPlan'));
}

async function shouldAutoCleanSelection(diagnostic: CheckDiagnostic) {
  if (!diagnostic.hasGarbage) {
    return false;
  }

  return onCancel(await confirm({
    message: pc.yellow(t('checkGarbageDetected')),
    initialValue: true
  }));
}

async function buildInitialSelection(probeData: FFprobeData, shouldAutoClean: boolean) {
  let selectedStreams = probeData.streams.map<SelectedStream>((stream) => ({
    streamIndex: stream.index,
    type: stream.codec_type,
    codec: stream.codec_name
  }));

  selectedStreams = await editTagsMenu(selectedStreams, probeData, undefined, true);

  if (!shouldAutoClean) {
    return selectedStreams;
  }

  return keepCleanStreams(selectedStreams, probeData);
}

function keepCleanStreams(selectedStreams: SelectedStream[], probeData: FFprobeData) {
  const cleanIndices = new Set(filterGarbageStreams(probeData.streams).map((stream) => stream.index));
  return selectedStreams.filter((stream) => cleanIndices.has(stream.streamIndex));
}

function buildOutputPath(targetFile: string) {
  const dir = path.dirname(targetFile);
  const name = path.basename(targetFile, path.extname(targetFile));
  return path.join(dir, `${name}.jellycc.${fallbackRules.container}`);
}

function buildLoopContext(
  targetFile: string,
  outputPath: string,
  probeData: FFprobeData,
  selectedStreams: SelectedStream[]
): CheckLoopContext {
  const diagnostic = getDiagnostic(probeData, fallbackRules, supportMatrix, selectedStreams, targetFile);
  const isVideoCompatible = diagnostic.selection.isVideoCompatible;

  return {
    diagnostic,
    ffmpegCmd: buildCheckCommand(
      selectedStreams,
      probeData,
      fallbackRules,
      isVideoCompatible,
      targetFile,
      outputPath,
      false
    ),
    ffmpegRepairCmd: buildCheckCommand(
      selectedStreams,
      probeData,
      fallbackRules,
      isVideoCompatible,
      targetFile,
      outputPath,
      true
    ),
    totalDuration: diagnostic.metadata.durationSec,
    totalFrames: diagnostic.metadata.totalFrames,
    fullScanInputs: [targetFile],
    fullScanMaps: ['0'],
    fullAudioScanMaps: probeData.streams.filter(s => s.codec_type === 'audio').map(s => `0:${s.index}`),
    fullAudioScanLabels: probeData.streams.filter(s => s.codec_type === 'audio').map(s => (s.tags?.language || 'und').toUpperCase()),
    selectedScanInputs: [targetFile],
    selectedScanMaps: selectedStreams.map((stream) => `0:${stream.streamIndex}`),
    selectedAudioScanMaps: selectedStreams.filter(s => s.type === 'audio').map(s => `0:${s.streamIndex}`),
    selectedAudioScanLabels: selectedStreams.filter(s => s.type === 'audio').map(s => (s.language || 'und').toUpperCase())
  };
}

function showCommandPreview(context: CheckLoopContext) {
  if (!context.diagnostic.selection.needsAction) {
    note(pc.green(t('checkPerfect')), t('readyToUse'));
    return;
  }

  if (context.diagnostic.selection.isJustRemux) {
    const droppedCount =
      context.diagnostic.selection.originalCount - context.diagnostic.selection.selectedCount;

    log.info(pc.cyan(t('checkRemuxOnly', droppedCount)));
    note(pc.yellow(context.ffmpegCmd), t('checkRemuxCmd'));
    return;
  }

  note(pc.yellow(context.ffmpegCmd), t('checkTranscodeCmd'));
}

async function promptStreamSelection(selectedStreams: SelectedStream[], probeData: FFprobeData) {
  const { groups, initialValues } = buildGroupedOptions({
    sources: [{ info: probeData }],
    currentSelected: selectedStreams,
    includeAttachedPictures: true,
    includeAudioTitle: true
  });

  const nextSelection = onCancel(await groupMultiselect<SelectedStream>({
    message: t('checkSelectKeep'),
    options: groups,
    required: true,
    initialValues
  }));

  return editTagsMenu(nextSelection, probeData, undefined, true);
}
