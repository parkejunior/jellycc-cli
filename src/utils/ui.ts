import { isCancel, cancel, select, outro, text, confirm } from '@clack/prompts';
import pc from 'picocolors';
import { runConversion, runDeepScan } from './ffmpeg.ts';
import { t } from './i18n.ts';
import path from 'path';

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
    } else if (action === 'select_streams' || action === 'adjust_sync' || action === 'edit_tags') {
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
      
      let actualOutputPath = options.outputPath;
      if (isRepair) {
        const parsed = path.parse(options.outputPath);
        actualOutputPath = path.join(parsed.dir, `${parsed.name}_repaired${parsed.ext}`);
      }
      
      await runConversion(cmdToRun, options.totalDuration, options.totalFrames);
      
      if (action === 'run_and_scan' || action === 'run_repair_and_scan') {
        await runDeepScan([actualOutputPath], ['0'], options.totalDuration);
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
    process.exit(0);
  }
  
  return { action: 'exit', deepScanCompleted: dsCompleted, hasErrors: fileHasErrors };
}

export async function editTagsMenu(selectedStreams: any[], infoA: any, infoB?: any, autoPromptUnd: boolean = false) {
  // 1. Preenche as tags vazias com os dados originais silenciosamente
  selectedStreams.forEach(s => {
    const sourceInfo = (s.fileIndex === 1 && infoB) ? infoB : infoA;
    const fullStream = sourceInfo.streams.find((st: any) => st.index === s.streamIndex);
    if (s.language === undefined) s.language = fullStream?.tags?.language || 'und';
    if (s.title === undefined) s.title = fullStream?.tags?.title || '';
  });

  // 2. Se for modo automático, verifica se tem lixo (UND) apenas em Áudios e Legendas!
  if (autoPromptUnd) {
    const hasUnd = selectedStreams.some(s => s.language.toLowerCase() === 'und' && s.type !== 'video');
    
    if (!hasUnd) return selectedStreams; // Vídeos UND são ignorados e passam reto

    const editing = await confirm({
      message: t('tagEditUndDetected'),
      initialValue: true
    });
    if (onCancel(editing) === false) return selectedStreams;
  }

  // 3. O Menu de Edição em si
  let looping = true;
  while (looping) {
    const options = selectedStreams.map((s, index) => {
      let typeLabel = s.type === 'subtitle' ? t('typeSub') : (s.type === 'audio' ? t('typeAudio') : t('typeVideo'));
      let label = `[${typeLabel}] ${s.codec.toUpperCase()}`;
      if (s.fileIndex !== undefined) label += t('fileArq', s.fileIndex === 0 ? 'A' : 'B');
      label += `${t('tagLang')}${s.language.toUpperCase()}`;
      if (s.title) label += `${t('tagTitle')}"${s.title}"`;

      return { label, value: index };
    });

    options.push({ label: pc.green(t('tagEditDone')), value: -1 });

    const pickedIdx = onCancel(await select({
      message: t('tagEditSelect'),
      options
    })) as number;

    if (pickedIdx === -1) {
      looping = false;
      break;
    }

    const st = selectedStreams[pickedIdx];

    st.language = onCancel(await text({
      message: t('tagEditLang'),
      initialValue: st.language,
    })) as string;

    st.title = onCancel(await text({
      message: t('tagEditTitle'),
      initialValue: st.title,
    })) as string;
  }

  return selectedStreams;
}