import { select, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { setLanguage, availableLanguages, t } from '../utils/i18n.ts';
import type { FallbackRules } from '../types/config';

import fallbackRulesData from '../config/fallback_rules.yaml';

const fallbackRules = fallbackRulesData as FallbackRules;

const displayNames: Record<string, string> = {
  'pt-BR': '🇧🇷 Português (Brasil)',
  'en-US': '🇺🇸 English (US)'
};

// XDG Base Directory
const CONFIG_DIR = path.join(os.homedir(), '.config', 'jellycc');
const NEW_CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const OLD_CONFIG_PATH = path.join(os.homedir(), '.jellycc.json');

function ensureConfigDirAndMigrate() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (fs.existsSync(OLD_CONFIG_PATH) && !fs.existsSync(NEW_CONFIG_PATH)) {
    try {
      fs.renameSync(OLD_CONFIG_PATH, NEW_CONFIG_PATH);
    } catch (e) {
    }
  }
}

function generateTemplate() {
  ensureConfigDirAndMigrate();
  const templatePath = path.join(CONFIG_DIR, 'rules.example.json');
  
  fs.writeFileSync(templatePath, JSON.stringify(fallbackRules, null, 2), 'utf-8');
  
  outro(pc.green(t('configTemplateGenerated', pc.cyan(templatePath))));
}

async function promptLanguage() {
  const options = availableLanguages.map(lang => ({
    label: displayNames[lang] || lang,
    value: lang
  }));

  const selectedLang = await select({
    message: t('langSelect'),
    options: options
  });

  if (isCancel(selectedLang)) {
    cancel(t('cancel'));
    process.exit(0);
  }

  try {
    setLanguage(selectedLang as string);
    outro(pc.green(t('langChanged')));
  } catch (err) {
    cancel(pc.red(t('langError')));
    process.exit(1);
  }
}

export async function configCommand(args: string[]) {
  ensureConfigDirAndMigrate();

  if (args.includes('--init')) {
    generateTemplate();
    return;
  }
  
  if (args.includes('--lang')) {
    const langIdx = args.indexOf('--lang') + 1;
    if (args[langIdx] && availableLanguages.includes(args[langIdx])) {
      setLanguage(args[langIdx]);
      outro(pc.green(`${t('langChangedTo')} ${args[langIdx]}`));
      return;
    }
  }

  // Interactive Menu 
  const action = await select({
    message: pc.bold(t('whatToDo')),
    options: [
      { label: t('configMenuLang'), value: 'lang' },
      { label: t('configMenuInit'), value: 'init' },
      { label: t('exit'), value: 'exit' }
    ]
  });

  if (isCancel(action) || action === 'exit') {
    cancel(t('cancel'));
    process.exit(0);
  }

  if (action === 'lang') {
    await promptLanguage();
  } else if (action === 'init') {
    generateTemplate();
  }
}
