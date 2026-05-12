import fs from 'fs';
import path from 'path';
import os from 'os';

// Importa os dicionários de forma limpa
import ptBR from '../locales/pt-BR.ts';
import enUS from '../locales/en-US.ts';
import type { UserSettings } from '../types/config';

const CONFIG_PATH = path.join(os.homedir(), '.config', 'jellycc', 'config.json');

const dictionaries = {
  'pt-BR': ptBR,
  'en-US': enUS
} as const;

function detectLanguage(): keyof typeof dictionaries {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<UserSettings>;
      if (config.lang && config.lang in dictionaries) {
        return config.lang;
      }
    } catch (e) {}
  }

  const sysLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  if (sysLocale.toLowerCase().includes('pt')) return 'pt-BR';
  
  return 'en-US'; 
}

const currentLang = detectLanguage();

// Modifiquei a função t() para aceitar variáveis dinâmicas (ex: {0})
export function t(key: string, ...args: unknown[]): string {
  const dictionary: Record<string, string> = dictionaries[currentLang];
  let text = dictionary[key] || key;
  
  // Se houver argumentos, substitui {0}, {1}, etc. no texto
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
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<UserSettings>;
    } catch (e) {
      config = {};
    }
  }
  
  config.lang = lang as UserSettings['lang'];
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export const availableLanguages = Object.keys(dictionaries);
