import { isCancel, cancel } from '@clack/prompts';

export function onCancel(value: any) {
  if (isCancel(value)) {
    cancel('Operação cancelada.');
    process.exit(0);
  }
  return value;
}

export const sanitizePath = (p: string | undefined | null) => p ? p.trim().replace(/^['"]|['"]$/g, '') : p;
