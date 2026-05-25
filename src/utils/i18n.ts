import fs from 'fs';
import path from 'path';
import os from 'os';
import type { UserSettings } from '../types/config';

import ptBR from '../locales/pt-BR.ts';
import enUS from '../locales/en-US.ts';

const CONFIG_PATH = path.join(os.homedir(), '.config', 'jellycc', 'config.json');

const dictionaries = {
  'pt-BR': ptBR,
  'en-US': enUS
} as const;

export function detectLanguage(): keyof typeof dictionaries {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<UserSettings>;
    if (config.lang && config.lang in dictionaries) {
      return config.lang;
    }
  } catch (e) {
    // Ignored: File doesn't exist or JSON is invalid
  }

  const sysLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  if (sysLocale.toLowerCase().includes('pt')) return 'pt-BR';
  
  return 'en-US'; 
}

const currentLang = detectLanguage();

export function t(key: string, ...args: unknown[]): string {
  const dictionary: Record<string, string> = dictionaries[currentLang];
  let text = dictionary[key] || key;
  
  if (args.length > 0) {
    args.forEach((arg, index) => {
      text = text.replace(`{${index}}`, String(arg));
    });
  }
  
  return text;
}

export function setLanguage(lang: string) {
  if (!(lang in dictionaries)) throw new Error(`Idioma ${lang} não suportado.`);
  
  let config: Partial<UserSettings> = {};
  
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<UserSettings>;
  } catch (e) {
    config = {};
  }
  
  config.lang = lang as UserSettings['lang'];
  
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export const availableLanguages = Object.keys(dictionaries);
