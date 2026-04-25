import { isCancel, cancel, select, outro } from '@clack/prompts';
import pc from 'picocolors';
import { runConversion, runDeepScan } from './ffmpeg.ts';

export function onCancel(value: any) {
  if (isCancel(value)) {
    cancel('Operação cancelada.');
    process.exit(0);
  }
  return value;
}

export const sanitizePath = (p: string | undefined | null) => p ? p.trim().replace(/^['"]|['"]$/g, '') : p;

export async function handleExecutionMenu(options: {
  ffmpegCmd: string;
  originalPath: string;
  outputPath: string;
  totalDuration: number;
  totalFrames: number;
  isPerfect?: boolean;
  deepScanCompleted?: boolean;
  isMerge?: boolean;
}) {
  let action;
  let keepMenuOpen = true;
  let dsCompleted = options.deepScanCompleted || false;

  while (keepMenuOpen) {
    const menuOptions = [];

    if (!options.isPerfect) {
      menuOptions.push({ label: '🚀 Executar conversão + 🔍 Deep Scan', value: 'run_and_scan' });
      menuOptions.push({ label: '🚀 Executar conversão apenas', value: 'run' });
    }

    if (!dsCompleted) {
      menuOptions.push({ label: '🔍 Rodar Deep Scan (Verificar falhas no arquivo original)', value: 'deep_scan' });
    }

    menuOptions.push({ label: '❌ Sair', value: 'exit' });

    action = onCancel(await select({
      message: 'O que deseja fazer?',
      options: menuOptions
    }));

    if (action === 'deep_scan') {
      await runDeepScan(options.originalPath, options.totalDuration);
      dsCompleted = true;
    } else {
      keepMenuOpen = false;
    }
  }

  if (action === 'run' || action === 'run_and_scan') {
    try {
      await runConversion(options.ffmpegCmd, options.totalDuration, options.totalFrames);
      
      if (action === 'run_and_scan') {
        await runDeepScan(options.outputPath, options.totalDuration);
      }

      const successMsg = options.isMerge ? '✔ Arquivo mesclado e verificado com sucesso! 🚀' : '✔ Operação finalizada com sucesso! 🚀';
      outro(pc.green(successMsg));
    } catch (err) {
      console.error(pc.red('\nErro ou cancelamento durante a operação.'));
      process.exit(1);
    }
  } else if (action === 'exit') {
    if (!options.isPerfect) {
      console.log(`\n${pc.dim('Comando limpo gerado:')}\n${pc.yellow(options.ffmpegCmd)}\n`);
    }
    outro('Operação finalizada. 🚀');
  }
}