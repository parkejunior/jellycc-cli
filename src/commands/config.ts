import { select, text, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { setLanguage, availableLanguages, t } from '../utils/i18n.ts';
import { getUserLanguagePreferences, setUserLanguagePreferences } from '../utils/language.ts';
import { onCancel } from '../utils/ui.ts';
import { JellyError } from '../utils/errors.ts';
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
    fs.renameSync(OLD_CONFIG_PATH, NEW_CONFIG_PATH);
  }
}

function generateTemplate() {
  ensureConfigDirAndMigrate();
  const templatePath = path.join(CONFIG_DIR, 'rules.example.json');
  
  fs.writeFileSync(templatePath, JSON.stringify(fallbackRules, null, 2), 'utf-8');
  
  outro(pc.green(t('configTemplateGenerated', pc.cyan(templatePath))));
}

function parseCommaList(input: string): string[] {
  return input.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function promptLanguage() {
  const options = availableLanguages.map(lang => ({
    label: displayNames[lang] || lang,
    value: lang
  }));

  const selectedLang = onCancel(await select({
    message: t('langSelect'),
    options: options
  }));

  try {
    setLanguage(selectedLang as string);
    outro(pc.green(t('langChanged')));
  } catch {
    throw new JellyError(t('langError'), 'LANG_SAVE_ERROR');
  }
}

async function promptPreferredAudio() {
  const current = getUserLanguagePreferences().preferredAudio;
  const initialValue = current.join(', ');

  const rawInput = onCancel(await text({
    message: t('configAskAudioLang'),
    initialValue,
    placeholder: 'eng, spa, por'
  }));

  const list = parseCommaList(rawInput);
  setUserLanguagePreferences(list, undefined);
  const displayValue = list.length > 0 ? list.join(', ') : t('configLangCleared');
  outro(pc.green(t('configAudioLangSaved', displayValue)));
}

async function promptPreferredSubtitles() {
  const current = getUserLanguagePreferences().preferredSubtitles;
  const initialValue = current.join(', ');

  const rawInput = onCancel(await text({
    message: t('configAskSubLang'),
    initialValue,
    placeholder: 'eng, spa, por'
  }));

  const list = parseCommaList(rawInput);
  setUserLanguagePreferences(undefined, list);
  const displayValue = list.length > 0 ? list.join(', ') : t('configLangCleared');
  outro(pc.green(t('configSubLangSaved', displayValue)));
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
      try {
        setLanguage(args[langIdx]);
      } catch {
        throw new JellyError(t('langError'), 'LANG_SAVE_ERROR');
      }
      outro(pc.green(`${t('langChangedTo')} ${args[langIdx]}`));
      return;
    }
  }

  if (args.includes('--audio-lang')) {
    const idx = args.indexOf('--audio-lang') + 1;
    const value = args[idx] ?? '';
    const list = parseCommaList(value);
    setUserLanguagePreferences(list, undefined);
    const displayValue = list.length > 0 ? list.join(', ') : t('configLangCleared');
    outro(pc.green(t('configAudioLangSaved', displayValue)));
    return;
  }

  if (args.includes('--sub-lang')) {
    const idx = args.indexOf('--sub-lang') + 1;
    const value = args[idx] ?? '';
    const list = parseCommaList(value);
    setUserLanguagePreferences(undefined, list);
    const displayValue = list.length > 0 ? list.join(', ') : t('configLangCleared');
    outro(pc.green(t('configSubLangSaved', displayValue)));
    return;
  }

  // Interactive Menu 
  const action = onCancel(await select({
    message: pc.bold(t('whatToDo')),
    options: [
      { label: t('configMenuLang'), value: 'lang' },
      { label: t('configMenuAudioLang'), value: 'audio' },
      { label: t('configMenuSubLang'), value: 'sub' },
      { label: t('configMenuInit'), value: 'init' },
      { label: t('exit'), value: 'exit' }
    ]
  }));

  if (action === 'exit') {
    return;
  }

  if (action === 'audio') {
    await promptPreferredAudio();
  } else if (action === 'sub') {
    await promptPreferredSubtitles();
  } else if (action === 'lang') {
    await promptLanguage();
  } else if (action === 'init') {
    generateTemplate();
  }
}

