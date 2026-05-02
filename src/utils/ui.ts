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
  originalPath: string;
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
}): Promise<{ action: string, deepScanCompleted: boolean, hasErrors: boolean }> {
  let action;
  let keepMenuOpen = true;
  let dsCompleted = options.deepScanCompleted || false;
  let fileHasErrors = options.hasErrors || false;

  while (keepMenuOpen) {
    const menuOptions = [];

    if (!options.isPerfect) {
      if (options.isJustRemux) {
        menuOptions.push({ label: t('menuRunClean'), value: 'run_and_scan' });
        menuOptions.push({ label: t('menuRunCleanOnly'), value: 'run' });
      } else {
        menuOptions.push({ label: t('menuRunTranscode'), value: 'run_and_scan' });
        menuOptions.push({ label: t('menuRunTranscodeOnly'), value: 'run' });
      }
    }

    if (fileHasErrors && options.ffmpegRepairCmd) {
      menuOptions.push({ label: pc.yellow(t('menuRunRepair')), value: 'run_repair' });
    }

    if (options.allowStreamSelection) {
      menuOptions.push({ label: t('menuModifyStreams'), value: 'select_streams' });
    }

    if (options.allowSyncAdjustment) {
      menuOptions.push({ label: t('menuAdjustSync'), value: 'adjust_sync' });
    }

    if (!dsCompleted) {
      menuOptions.push({ label: t('menuDeepScan'), value: 'deep_scan' });
    }

    menuOptions.push({ label: t('exit'), value: 'exit' });

    action = onCancel(await select({
      message: t('whatToDo'),
      options: menuOptions
    }));

    if (action === 'deep_scan') {
      fileHasErrors = await runDeepScan(options.originalPath, options.totalDuration);
      dsCompleted = true;
    } else if (action === 'select_streams' || action === 'adjust_sync') {
      return { action: action, deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
    } else {
      keepMenuOpen = false;
    }
  }

  if (action === 'run' || action === 'run_and_scan' || action === 'run_repair') {
    try {
      const cmdToRun = action === 'run_repair' ? options.ffmpegRepairCmd! : options.ffmpegCmd;
      await runConversion(cmdToRun, options.totalDuration, options.totalFrames);
      
      if (action === 'run_and_scan' || action === 'run_repair') {
        await runDeepScan(options.outputPath, options.totalDuration);
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