import fs from 'fs';
import path from 'path';
import os from 'os';
import type { UserSettings } from '../types/config';

const CONFIG_PATH = path.join(os.homedir(), '.config', 'jellycc', 'config.json');

const ISO_MAP: Record<string, string> = {
  // Portuguese
  pt: 'por',
  por: 'por',
  'pt-br': 'por',
  'pt-pt': 'por',
  pb: 'por',

  // English
  en: 'eng',
  eng: 'eng',
  'en-us': 'eng',
  'en-gb': 'eng',

  // Spanish
  es: 'spa',
  spa: 'spa',

  // French
  fr: 'fra',
  fre: 'fra',
  fra: 'fra',

  // German
  de: 'deu',
  ger: 'deu',
  deu: 'deu',

  // Italian
  it: 'ita',
  ita: 'ita',

  // Japanese
  ja: 'jpn',
  jpn: 'jpn',

  // Chinese
  zh: 'zho',
  chi: 'zho',
  zho: 'zho',

  // Russian
  ru: 'rus',
  rus: 'rus',

  // Korean
  ko: 'kor',
  kor: 'kor',

  // Undefined / Unknown
  und: 'und',
  unk: 'und',
  unknown: 'und'
};

export function normalizeLanguageCode(code: string | undefined | null): string {
  if (!code) return 'und';
  const clean = code.trim().toLowerCase();
  if (ISO_MAP[clean]) {
    return ISO_MAP[clean];
  }
  // Try splitting locale tags like "pt-BR" -> "pt"
  const base = clean.split(/[-_]/)[0];
  if (base && ISO_MAP[base]) {
    return ISO_MAP[base];
  }
  return clean;
}

export function matchesLanguage(streamLang: string | undefined | null, preferredLangs: string[]): boolean {
  if (!preferredLangs || preferredLangs.length === 0) {
    return true;
  }

  const normStream = normalizeLanguageCode(streamLang);
  const normPrefs = preferredLangs.map((l) => normalizeLanguageCode(l));

  return normPrefs.includes(normStream);
}

export function getUserLanguagePreferences(): { preferredAudio: string[]; preferredSubtitles: string[] } {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<UserSettings>;
      return {
        preferredAudio: Array.isArray(config.preferredAudio) ? config.preferredAudio : [],
        preferredSubtitles: Array.isArray(config.preferredSubtitles) ? config.preferredSubtitles : []
      };
    }
  } catch {
    // Ignore JSON errors or missing file
  }
  return { preferredAudio: [], preferredSubtitles: [] };
}

export function setUserLanguagePreferences(preferredAudio?: string[], preferredSubtitles?: string[]) {
  let config: Partial<UserSettings> = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<UserSettings>;
    }
  } catch {
    config = {};
  }

  if (preferredAudio !== undefined) {
    config.preferredAudio = preferredAudio;
  }

  if (preferredSubtitles !== undefined) {
    config.preferredSubtitles = preferredSubtitles;
  }

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
