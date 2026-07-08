import fs from 'fs';
import path from 'path';
import { confirm, groupMultiselect, log, note, select, text, spinner } from '@clack/prompts';
import pc from 'picocolors';

import { getPreferredVideoSource, getPrimaryVideoStream } from '../services/analyzer.ts';
import { calculateDifferenceMs } from '../services/syncManager.ts';
import fallbackRulesData from '../config/fallback_rules.yaml';
import type { FallbackRules } from '../types/config';
import type { FFprobeData, SelectedStream } from '../types/media';
import { buildMergeCommand } from '../utils/builder.ts';
import { ValidationError } from '../utils/errors.ts';
import { getMediaInfo } from '../utils/ffprobe.ts';
import { calculateTotalFrames, parseTimestampToSeconds, formatSecondsToTimestamp } from '../utils/formatters.ts';
import { t } from '../utils/i18n.ts';
import { editTagsMenu, handleExecutionMenu, onCancel, sanitizePath } from '../utils/ui.ts';
import { buildSyncOptions, renderComparison } from '../views/mergeView.ts';
import { buildGroupedOptions } from '../views/streamOptions.ts';
import { calculateSpectrumDelay } from '../services/spectrumAnalyzer.ts';
import { extractRawAudio } from '../utils/ffmpeg.ts';

const fallbackRules = fallbackRulesData as FallbackRules;

interface MergeSourcePaths {
  sourcePathA: string;
  sourcePathB: string;
}

interface MergeMediaContext extends MergeSourcePaths {
  infoA: FFprobeData;
  infoB: FFprobeData;
  durationDiffMs: number;
  totalDuration: number;
  totalFrames: number;
  suggestedVideo: string;
  outputPath: string;
}

interface MergeSessionState {
  selectedStreams: SelectedStream[];
  currentDelayMs: number;
  applyShortest: boolean;
  deepScanCompleted: boolean;
  hasMediaErrors: boolean;
}

interface MergeSyncState {
  currentDelayMs: number;
  applyShortest: boolean;
}

interface MergeLoopContext {
  ffmpegCmd: string;
  ffmpegRepairCmd: string;
  totalDuration: number;
  totalFrames: number;
  fullScanInputs: string[];
  fullScanMaps: string[];
}

export async function mergeCommand(_args: string[]) {
  const paths = await resolveSourcePaths();
  const media = buildMediaContext(paths);

  showComparison(media);

  const state: MergeSessionState = {
    selectedStreams: await promptInitialStreamSelection(media),
    currentDelayMs: 0,
    applyShortest: false,
    deepScanCompleted: false,
    hasMediaErrors: false
  };

  if (Math.abs(media.durationDiffMs) > 1000) {
    note(pc.yellow(t('mergeDurationAlert')), t('durationAlertTitle'));
    applySyncState(state, await promptSyncAdjustment(media, state));
  }

  while (true) {
    const context = buildLoopContext(media, state);

    showCommandPreview(context, state);

    const result = await handleExecutionMenu({
      ffmpegCmd: context.ffmpegCmd,
      ffmpegRepairCmd: context.ffmpegRepairCmd,
      fullScanInputs: context.fullScanInputs,
      fullScanMaps: context.fullScanMaps,
      outputPath: media.outputPath,
      totalDuration: context.totalDuration,
      totalFrames: context.totalFrames,
      isMerge: true,
      allowStreamSelection: true,
      allowSyncAdjustment: true,
      deepScanCompleted: state.deepScanCompleted,
      hasErrors: state.hasMediaErrors,
      allowMyopicScan: false
    });

    state.deepScanCompleted = result.deepScanCompleted;
    state.hasMediaErrors = result.hasErrors;

    if (result.action === 'select_streams') {
      state.selectedStreams = await promptStreamSelection(state.selectedStreams, media);
      continue;
    }

    if (result.action === 'edit_tags') {
      state.selectedStreams = await editTagsMenu(state.selectedStreams, media.infoA, media.infoB, false);
      continue;
    }

    if (result.action === 'adjust_sync') {
      applySyncState(state, await promptSyncAdjustment(media, state));
      continue;
    }

    return;
  }
}

async function resolveSourcePaths(): Promise<MergeSourcePaths> {
  return {
    sourcePathA: await promptSourcePath('mergePathA', './spider-man_4k.mkv'),
    sourcePathB: await promptSourcePath('mergePathB', './spider-man_pt-br.mkv')
  };
}

async function promptSourcePath(messageKey: string, placeholder: string) {
  const rawPath = onCancel(await text({
    message: t(messageKey),
    placeholder,
    validate(value) {
      const clean = sanitizePath(value);
      if (!clean) return t('pathRequired');
      if (!fs.existsSync(clean)) return t('fileNotFound');
    }
  }));

  const cleanPath = sanitizePath(rawPath);

  if (!cleanPath) {
    throw new ValidationError(t('pathRequired'));
  }

  return cleanPath;
}

function buildMediaContext(paths: MergeSourcePaths): MergeMediaContext {
  const infoA = getMediaInfo(paths.sourcePathA);
  const infoB = getMediaInfo(paths.sourcePathB);
  const durationA = getDurationSeconds(infoA);
  const durationB = getDurationSeconds(infoB);
  const totalDuration = Math.max(durationA, durationB);
  const vStreamRef = getPrimaryVideoStream(infoA);

  return {
    ...paths,
    infoA,
    infoB,
    durationDiffMs: calculateDifferenceMs(durationA, durationB),
    totalDuration,
    totalFrames: calculateTotalFrames(vStreamRef, totalDuration),
    suggestedVideo: getPreferredVideoSource(infoA, infoB),
    outputPath: buildOutputPath(paths.sourcePathA)
  };
}

function getDurationSeconds(probeData: FFprobeData) {
  return probeData.format?.duration ? Number.parseFloat(probeData.format.duration) : 0;
}

function buildOutputPath(sourcePathA: string) {
  const dir = path.dirname(sourcePathA);
  const name = path.basename(sourcePathA, path.extname(sourcePathA));
  return path.join(dir, `${name}.jellycc_merged.${fallbackRules.container}`);
}

function showComparison(media: MergeMediaContext) {
  note(renderComparison(media.infoA, media.infoB), t('mergeComparison'));
}

async function promptInitialStreamSelection(media: MergeMediaContext) {
  const { groups, initialValues } = buildGroupedOptions({
    sources: buildStreamOptionSources(media),
    preferredSourceLabel: media.suggestedVideo,
    includeAttachedPictures: false,
    includeAudioTitle: false
  });

  const selectedStreams = onCancel(await groupMultiselect<SelectedStream>({
    message: `${t('mergeSelectStreams')} (${t('fileSuggest', media.suggestedVideo)})`,
    options: groups,
    required: true,
    initialValues
  }));

  return editTagsMenu(selectedStreams, media.infoA, media.infoB, true);
}

async function promptStreamSelection(selectedStreams: SelectedStream[], media: MergeMediaContext) {
  const { groups, initialValues } = buildGroupedOptions({
    sources: buildStreamOptionSources(media),
    currentSelected: selectedStreams,
    includeAttachedPictures: false,
    includeAudioTitle: false
  });

  const nextSelection = onCancel(await groupMultiselect<SelectedStream>({
    message: t('mergeModifyStreams'),
    options: groups,
    required: true,
    initialValues
  }));

  return editTagsMenu(nextSelection, media.infoA, media.infoB, true);
}

function buildStreamOptionSources(media: MergeMediaContext) {
  return [
    { info: media.infoA, fileIndex: 0, label: 'A' },
    { info: media.infoB, fileIndex: 1, label: 'B' }
  ];
}

async function promptSyncAdjustment(
  media: MergeMediaContext,
  currentState: MergeSyncState
): Promise<MergeSyncState> {
  const options = buildSyncOptions(media.durationDiffMs);

  const chosenSyncAction = onCancel(await select({
    message: t('mergeHowToSync'),
    options
  }));

  let nextDelayMs = currentState.currentDelayMs;
  let nextApplyShortest = currentState.applyShortest;

  if (chosenSyncAction === 'spectrum') {
    log.info(pc.cyan(t('mergeSpectrumHint')));
    
    const tsStr = onCancel(await text({
      message: t('mergeAskTimestamp'),
      placeholder: '00:15:30',
      validate(value) {
        if (!value || !value.includes(':')) return t('validNumber');
      }
    }));

    // 10s of sample window to 30s search window
    const durA = 10;
    const durB = 30; 

    const tsSecs = parseTimestampToSeconds(tsStr);
    const tsBSecs = Math.max(0, tsSecs - 10); // Starts 10s before the timestamp
    const startTsB = formatSecondsToTimestamp(tsBSecs);

    const s = spinner();
    s.start(t('mergeSpectrumExtracting'));

    try {
      const bufferA = await extractRawAudio(media.sourcePathA, tsStr, durA);
      const bufferB = await extractRawAudio(media.sourcePathB, startTsB, durB);

      s.message(t('mergeSpectrumCalculating'));

      const rawOffsetMs = calculateSpectrumDelay(bufferA, bufferB);
      const diffSecs = tsSecs - tsBSecs;
      
      const realDelayMs = rawOffsetMs - (diffSecs * 1000);
      nextDelayMs = Math.round(realDelayMs * -1);

      s.stop(pc.green(t('successOp')));
      log.success(pc.green(t('mergeSpectrumResult', nextDelayMs)));
      
    } catch (err) {
      s.stop(pc.red(t('mergeSpectrumFailed')));
      if (err instanceof Error) {
        log.error(err.message);
      }
    }
  } else if (chosenSyncAction === 'auto') {
    nextDelayMs = media.durationDiffMs;
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
}

function applySyncState(state: MergeSessionState, syncState: MergeSyncState) {
  state.currentDelayMs = syncState.currentDelayMs;
  state.applyShortest = syncState.applyShortest;
}

function buildLoopContext(media: MergeMediaContext, state: MergeSessionState): MergeLoopContext {
  return {
    ffmpegCmd: buildMergeCommand(
      state.selectedStreams,
      media.infoA,
      media.infoB,
      fallbackRules,
      media.sourcePathA,
      media.sourcePathB,
      media.outputPath,
      state.currentDelayMs,
      state.applyShortest,
      false
    ),
    ffmpegRepairCmd: buildMergeCommand(
      state.selectedStreams,
      media.infoA,
      media.infoB,
      fallbackRules,
      media.sourcePathA,
      media.sourcePathB,
      media.outputPath,
      state.currentDelayMs,
      state.applyShortest,
      true
    ),
    totalDuration: media.totalDuration,
    totalFrames: media.totalFrames,
    fullScanInputs: [media.sourcePathA, media.sourcePathB],
    fullScanMaps: buildFullScanMaps(media)
  };
}

function buildFullScanMaps(media: MergeMediaContext) {
  return [
    ...buildSourceScanMaps(media.infoA, 0),
    ...buildSourceScanMaps(media.infoB, 1)
  ];
}

function buildSourceScanMaps(probeData: FFprobeData, fileIndex: number) {
  return probeData.streams
    .filter((stream) => stream.codec_type === 'video' || stream.codec_type === 'audio')
    .map((stream) => `${fileIndex}:${stream.index}`);
}

function showCommandPreview(context: MergeLoopContext, state: MergeSessionState) {
  const syncMsg = state.currentDelayMs !== 0 ? pc.dim(t('syncAdjusted', state.currentDelayMs)) : '';
  const cutMsg = state.applyShortest ? pc.yellow(t('strictCut')) : '';
  const hasSubs = state.selectedStreams.some((stream) => stream.type === 'subtitle');

  if (state.currentDelayMs !== 0 && hasSubs) {
    log.info(pc.cyan(t('syncWarning')));
  }

  note(pc.yellow(context.ffmpegCmd), `${t('mergeCmdSuggested')}${syncMsg}${cutMsg}`);
}
