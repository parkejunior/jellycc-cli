import { isCancel, select, outro, text, confirm, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { runConversion, runDeepScan, runSilenceScan } from './ffmpeg.ts';
import { getRepairOutputPath } from '../services/repair.ts';
import { t } from './i18n.ts';
import { UserCancelError } from './errors.ts';
import type { FFprobeData, SelectedStream } from '../types/media';

export function onCancel<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    throw new UserCancelError(t('cancel'));
  }
  return value as Exclude<T, symbol>;
}

export const sanitizePath = (p: string | undefined | null) => p ? p.trim().replace(/^['"]|['"]$/g, '') : p;

export interface ExecutionMenuResult {
  action: string;
  deepScanCompleted: boolean;
  hasErrors: boolean;
}

export async function handleExecutionMenu(options: {
  ffmpegCmd: string;
  ffmpegRepairCmd?: string;
  fullScanInputs: string[];
  fullScanMaps: string[];
  fullAudioScanMaps?: string[];
  selectedScanInputs?: string[];
  selectedScanMaps?: string[];
  selectedAudioScanMaps?: string[];
  outputPath: string;
  totalDuration: number;
  totalFrames: number;
  isPerfect?: boolean;
  isJustRemux?: boolean;
  deepScanCompleted?: boolean;
  hasErrors?: boolean;
  isMerge?: boolean;
  allowStreamSelection?: boolean;
  allowSyncAdjustment?: boolean;
  allowMyopicScan?: boolean;
}): Promise<ExecutionMenuResult> {
  let dsCompleted = options.deepScanCompleted || false;
  let fileHasErrors = options.hasErrors || false;

  while (true) {
    const menuOptions: Array<{ label: string; value: string }> = [];

    if (!options.isPerfect) {
      if (options.isJustRemux) {
        menuOptions.push({ label: t('menuRunClean'), value: 'run_and_scan' });
        menuOptions.push({ label: t('menuRunCleanOnly'), value: 'run' });
      } else {
        menuOptions.push({ label: t('menuRunTranscode'), value: 'run_and_scan' });
        menuOptions.push({ label: t('menuRunTranscodeOnly'), value: 'run' });
      }
    }

    if (options.ffmpegRepairCmd) {
      if (fileHasErrors) {
        menuOptions.push({ label: pc.yellow(t('menuRunRepairScan')), value: 'run_repair_and_scan' });
      }
      menuOptions.push({ label: pc.yellow(t('menuRunRepairOnly')), value: 'run_repair' });
    }

    if (options.allowStreamSelection) {
      menuOptions.push({ label: t('menuModifyStreams'), value: 'select_streams' });
      menuOptions.push({ label: t('menuEditTags'), value: 'edit_tags' });
    }

    if (options.allowSyncAdjustment) {
      menuOptions.push({ label: t('menuAdjustSync'), value: 'adjust_sync' });
    }

    if (!dsCompleted) {
      if (options.allowMyopicScan) {
        menuOptions.push({ label: t('menuDeepScanSelected'), value: 'deep_scan_selected' });
        menuOptions.push({ label: t('menuDeepScanFull'), value: 'deep_scan_full' });
      } else {
        menuOptions.push({ label: t('menuDeepScanFull'), value: 'deep_scan_full' });
      }
    }
    
    menuOptions.push({ label: t('menuSilenceScan'), value: 'silence_scan' });
    menuOptions.push({ label: t('exit'), value: 'exit' });

    const action = onCancel(await select({
      message: t('whatToDo'),
      options: menuOptions
    }));

    if (action === 'deep_scan_selected') {
      const dsErrors = await runDeepScan(options.selectedScanInputs!, options.selectedScanMaps!, options.totalDuration);
      let silenceErrors = false;
      if (options.selectedAudioScanMaps && options.selectedAudioScanMaps.length > 0) {
        silenceErrors = await runSilenceScan(options.selectedScanInputs!, options.selectedAudioScanMaps);
      }
      fileHasErrors = fileHasErrors || dsErrors || silenceErrors;
      dsCompleted = true;
      continue;
    } 
    
    if (action === 'deep_scan_full') {
      const dsErrors = await runDeepScan(options.fullScanInputs, options.fullScanMaps, options.totalDuration);
      let silenceErrors = false;
      if (options.fullAudioScanMaps && options.fullAudioScanMaps.length > 0) {
        silenceErrors = await runSilenceScan(options.fullScanInputs, options.fullAudioScanMaps);
      }
      fileHasErrors = fileHasErrors || dsErrors || silenceErrors;
      dsCompleted = true;
      continue;
    }

    if (action === 'silence_scan') {
      const inputs = options.selectedScanInputs || options.fullScanInputs;
      const audioMaps = options.selectedAudioScanMaps || options.fullAudioScanMaps || [];
      
      if (audioMaps.length > 0) {
        const silenceErrors = await runSilenceScan(inputs, audioMaps);
        fileHasErrors = fileHasErrors || silenceErrors;
      } else {
        const scanSpinner = spinner();
        scanSpinner.start(t('scanSilenceStart'));
        scanSpinner.stop(pc.green(t('scanSilencePass')));
      }
      continue;
    }

    if (action === 'select_streams' || action === 'adjust_sync' || action === 'edit_tags') {
      return { action, deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
    }

    const runActions = ['run', 'run_and_scan', 'run_repair', 'run_repair_and_scan'];
    
    if (runActions.includes(action)) {
      const isRepair = action === 'run_repair' || action === 'run_repair_and_scan';
      const cmdToRun = isRepair ? options.ffmpegRepairCmd! : options.ffmpegCmd;
      
      let actualOutputPath = options.outputPath;
      if (isRepair) {
        actualOutputPath = getRepairOutputPath(options.outputPath);
      }

      await runConversion(cmdToRun, options.totalDuration, options.totalFrames);
      
      if (action === 'run_and_scan' || action === 'run_repair_and_scan') {
        const dsErrors = await runDeepScan([actualOutputPath], ['0'], options.totalDuration);
        let silenceErrors = false;
        
        if (options.selectedAudioScanMaps && options.selectedAudioScanMaps.length > 0) {
          silenceErrors = await runSilenceScan([actualOutputPath], ['0:a?']);
        }
        
        fileHasErrors = fileHasErrors || dsErrors || silenceErrors;
      }

      const successMsg = options.isMerge ? t('successMerge') : t('successOp');
      outro(pc.green(successMsg));
      return { action: 'done', deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
    } 
    
    if (action === 'exit') {
      if (!options.isPerfect) {
        console.log(`\n${pc.dim(t('cleanCmdGenerated'))}\n${pc.yellow(options.ffmpegCmd)}\n`);
      }
      outro(t('opFinished'));
      return { action: 'exit', deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
    }
  }
}

export async function editTagsMenu(
  selectedStreams: SelectedStream[],
  infoA: FFprobeData,
  infoB?: FFprobeData,
  autoPromptUnd: boolean = false
): Promise<SelectedStream[]> {
  selectedStreams = selectedStreams.map((stream) => {
    const sourceInfo = (stream.fileIndex === 1 && infoB) ? infoB : infoA;
    const fullStream = sourceInfo.streams.find((st) => st.index === stream.streamIndex);

    return {
      ...stream,
      language: stream.language === undefined ? (fullStream?.tags?.language || 'und') : stream.language,
      title: stream.title === undefined ? (fullStream?.tags?.title || '') : stream.title
    };
  });

  if (autoPromptUnd) {
    const hasUnd = selectedStreams.some((stream) => (stream.language ?? 'und').toLowerCase() === 'und' && stream.type !== 'video');

    if (!hasUnd) return selectedStreams;

    const editing = onCancel(await confirm({
      message: t('tagEditUndDetected'),
      initialValue: true
    }));
    if (editing === false) return selectedStreams;
  }

  while (true) {
    const options = selectedStreams.map((s, index) => {
      const typeLabel = s.type === 'subtitle' ? t('typeSub') : (s.type === 'audio' ? t('typeAudio') : t('typeVideo'));
      let label = `[${typeLabel}] ${s.codec.toUpperCase()}`;
      if (s.fileIndex !== undefined) label += t('fileArq', s.fileIndex === 0 ? 'A' : 'B');
      label += `${t('tagLang')}${(s.language ?? 'und').toUpperCase()}`;
      if (s.title) label += `${t('tagTitle')}"${s.title}"`;

      return { label, value: index };
    });

    options.push({ label: pc.green(t('tagEditDone')), value: -1 });

    const pickedIdx = onCancel(await select({
      message: t('tagEditSelect'),
      options
    }));

    if (pickedIdx === -1) {
      break;
    }

    const st = selectedStreams[pickedIdx];
    if (!st) continue;

    const updatedStream = {
      ...st,
      language: onCancel(await text({
        message: t('tagEditLang'),
        initialValue: st.language,
      })),
      title: onCancel(await text({
        message: t('tagEditTitle'),
        initialValue: st.title,
      }))
    };

    selectedStreams = selectedStreams.map((stream, index) => (
      index === pickedIdx ? updatedStream : stream
    ));
  }

  return selectedStreams;
}