import { describe, expect, it } from 'bun:test';
import { matchesLanguage, normalizeLanguageCode } from './language.ts';

describe('language utils', () => {
  describe('normalizeLanguageCode', () => {
    it('normalizes common ISO 639-1 and 639-2 codes for Portuguese', () => {
      expect(normalizeLanguageCode('pt')).toBe('por');
      expect(normalizeLanguageCode('por')).toBe('por');
      expect(normalizeLanguageCode('pt-BR')).toBe('por');
      expect(normalizeLanguageCode('PT-PT')).toBe('por');
      expect(normalizeLanguageCode('pb')).toBe('por');
    });

    it('normalizes common codes for English', () => {
      expect(normalizeLanguageCode('en')).toBe('eng');
      expect(normalizeLanguageCode('eng')).toBe('eng');
      expect(normalizeLanguageCode('en-US')).toBe('eng');
    });

    it('handles undefined or missing language codes as und', () => {
      expect(normalizeLanguageCode(undefined)).toBe('und');
      expect(normalizeLanguageCode(null)).toBe('und');
      expect(normalizeLanguageCode('')).toBe('und');
      expect(normalizeLanguageCode('und')).toBe('und');
    });

    it('returns lowercase clean code for unknown languages', () => {
      expect(normalizeLanguageCode('swe')).toBe('swe');
      expect(normalizeLanguageCode('POL')).toBe('pol');
    });
  });

  describe('matchesLanguage', () => {
    it('returns true when preferred languages list is empty', () => {
      expect(matchesLanguage('por', [])).toBe(true);
      expect(matchesLanguage('eng', [])).toBe(true);
      expect(matchesLanguage(undefined, [])).toBe(true);
    });

    it('matches stream language against preferred languages using ISO 639 equivalences', () => {
      const prefs = ['por', 'eng'];
      expect(matchesLanguage('pt-BR', prefs)).toBe(true);
      expect(matchesLanguage('en', prefs)).toBe(true);
      expect(matchesLanguage('spa', prefs)).toBe(false);
      expect(matchesLanguage('jpn', prefs)).toBe(false);
    });

    it('ignores untagged / und streams if preferred languages are defined without und', () => {
      const prefs = ['por', 'eng'];
      expect(matchesLanguage(undefined, prefs)).toBe(false);
      expect(matchesLanguage('und', prefs)).toBe(false);
    });

    it('includes untagged / und streams if und is in preferred languages list', () => {
      const prefs = ['por', 'und'];
      expect(matchesLanguage(undefined, prefs)).toBe(true);
      expect(matchesLanguage('und', prefs)).toBe(true);
    });
  });
});
