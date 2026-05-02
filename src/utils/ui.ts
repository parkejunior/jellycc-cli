import { isCancel, cancel, select, outro } from '@clack/prompts';
import pc from 'picocolors';
import { runConversion, runDeepScan } from './ffmpeg.ts';
import { t } from './i18n.ts';

export function onCancel(value: any) {
  if (isCancel(value)) {
    cancel(t('cancel'));
    process.exit(0);
  }
  return value;
}

export const sanitizePath = (p: string | undefined | null) => p ? p.trim().replace(/^['"]|['"]$/g, '') : p;

export async function handleExecutionMenu(options: {
  ffmpegCmd: string;
  ffmpegRepairCmd?: string;
  fullScanInputs: string[];
  fullScanMaps: string[];
  selectedScanInputs?: string[]; // Tornou-se opcional
  selectedScanMaps?: string[];   // Tornou-se opcional
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
  allowMyopicScan?: boolean;     // <-- A CHAVE NOVA AQUI
}): Promise<{ action: string, deepScanCompleted: boolean, hasErrors: boolean }> {
  let action;
  let keepMenuOpen = true;
  let dsCompleted = options.deepScanCompleted || false;
  let fileHasErrors = options.hasErrors || false;

  while (keepMenuOpen) {
    const menuOptions = [];

    if (fileHasErrors && options.ffmpegRepairCmd) {
      menuOptions.push({ label: pc.yellow(t('menuRunRepairScan')), value: 'run_repair_and_scan' });
      menuOptions.push({ label: pc.yellow(t('menuRunRepairOnly')), value: 'run_repair' });
    } else if (!options.isPerfect) {
      if (options.isJustRemux) {
        menuOptions.push({ label: t('menuRunClean'), value: 'run_and_scan' });
        menuOptions.push({ label: t('menuRunCleanOnly'), value: 'run' });
      } else {
        menuOptions.push({ label: t('menuRunTranscode'), value: 'run_and_scan' });
        menuOptions.push({ label: t('menuRunTranscodeOnly'), value: 'run' });
      }
    }

    if (options.allowStreamSelection) {
      menuOptions.push({ label: t('menuModifyStreams'), value: 'select_streams' });
    }

    if (options.allowSyncAdjustment) {
      menuOptions.push({ label: t('menuAdjustSync'), value: 'adjust_sync' });
    }

    if (!dsCompleted) {
      // A MÁGICA VISUAL AQUI
      if (options.allowMyopicScan) {
        menuOptions.push({ label: t('menuDeepScanSelected'), value: 'deep_scan_selected' });
        menuOptions.push({ label: t('menuDeepScanFull'), value: 'deep_scan_full' });
      } else {
        menuOptions.push({ label: t('menuDeepScanFull'), value: 'deep_scan_full' });
      }
    }

    menuOptions.push({ label: t('exit'), value: 'exit' });

    action = onCancel(await select({
      message: t('whatToDo'),
      options: menuOptions
    }));

    if (action === 'deep_scan_selected') {
      fileHasErrors = await runDeepScan(options.selectedScanInputs!, options.selectedScanMaps!, options.totalDuration);
      dsCompleted = true;
    } else if (action === 'deep_scan_full') {
      fileHasErrors = await runDeepScan(options.fullScanInputs, options.fullScanMaps, options.totalDuration);
      dsCompleted = true;
    } else if (action === 'select_streams' || action === 'adjust_sync') {
      return { action: action as string, deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
    } else {
      keepMenuOpen = false;
    }
  }

  const runActions = ['run', 'run_and_scan', 'run_repair', 'run_repair_and_scan'];
  
  if (action && runActions.includes(action as string)) {
    try {
      const isRepair = action === 'run_repair' || action === 'run_repair_and_scan';
      const cmdToRun = isRepair ? options.ffmpegRepairCmd! : options.ffmpegCmd;
      
      await runConversion(cmdToRun, options.totalDuration, options.totalFrames);
      
      if (action === 'run_and_scan' || action === 'run_repair_and_scan') {
        await runDeepScan([options.outputPath], ['0'], options.totalDuration);
      }

      const successMsg = options.isMerge ? t('successMerge') : t('successOp');
      outro(pc.green(successMsg));
    } catch (err) {
      console.error(pc.red(t('errorOp')));
      process.exit(1);
    }
    return { action: 'done', deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
  } else if (action === 'exit') {
    if (!options.isPerfect) {
      console.log(`\n${pc.dim(t('cleanCmdGenerated'))}\n${pc.yellow(options.ffmpegCmd)}\n`);
    }
    outro(t('opFinished'));
    return { action: 'exit', deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
  }
  
  return { action: 'exit', deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
}