import { t } from './utils/i18n.ts';
import { intro, cancel, updateSettings } from '@clack/prompts';
import pc from 'picocolors';
import pkg from '../package.json';

import { checkCommand } from './commands/check.ts';
import { mergeCommand } from './commands/merge.ts';
import { configCommand } from './commands/config.ts';
import { JellyError, UserCancelError } from './utils/errors.ts';

updateSettings({
  messages: {
    cancel: t('cancel'),
  },
});

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  let currentCmd = 'check';
  if (command === 'merge' || command === 'm') currentCmd = 'merge';
  else if (command === 'config' || command === 'lang') currentCmd = 'config'; 

  const titleMap: Record<string, string> = {
    check: t('titleCheck'),
    merge: t('titleMerge'),
    config: t('titleConfig')
  };

  intro(`                           
    ░█████            ░██ ░██              ░██████    ░██████  
      ░██             ░██ ░██             ░██   ░██  ░██   ░██ 
      ░██   ░███████  ░██ ░██ ░██    ░██ ░██        ░██        
      ░██  ░██    ░██ ░██ ░██ ░██    ░██ ░██        ░██        
░██   ░██  ░█████████ ░██ ░██ ░██    ░██ ░██        ░██        
░██   ░██  ░██        ░██ ░██ ░██   ░███  ░██   ░██  ░██   ░██ 
 ░██████    ░███████  ░██ ░██  ░█████░██   ░██████    ░██████  
                                     ░██                       
                               ░███████  v${pkg.version}
⛬  ${pc.bold(titleMap[currentCmd])}`);
  if (currentCmd === 'check') {
    await checkCommand(command === 'check' || command === 'c' ? args.slice(1) : args);
  } else if (currentCmd === 'merge') {
    await mergeCommand(args.slice(1));
  } else if (currentCmd === 'config') {
    await configCommand(args.slice(1)); 
  }
}

void main().catch((error: unknown) => {
  if (error instanceof UserCancelError) {
    cancel(pc.red(error.message || t('cancel')));
    process.exit(0);
  }

  if (error instanceof JellyError) {
    cancel(pc.red(error.message));
    process.exit(1);
  }

  const message = error instanceof Error ? error.message : String(error);
  cancel(pc.red(`Erro interno inesperado: ${message}`));
  process.exit(1);
});
