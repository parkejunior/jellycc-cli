import { intro } from '@clack/prompts';
import pc from 'picocolors';
import { checkCommand } from './commands/check.ts';
import { mergeCommand } from './commands/merge.ts';

async function main() {
  intro(pc.inverse(' 🎬 JellyCC CLI - Jellyfin Codec & Integrity Checker '));

  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'merge') {
    await mergeCommand(args.slice(1));
  } else if (command === 'check' || !command || command.startsWith('-')) {
    // se for "check", se não houver comando, ou se for apenas flag (ex: --deep-scan), roteia para check
    const checkArgs = command === 'check' ? args.slice(1) : args;
    await checkCommand(checkArgs);
  } else {
    // Tratar como se "command" fosse o path para o check (compatibilidade com versão antiga)
    await checkCommand(args);
  }
}

main().catch(console.error);
