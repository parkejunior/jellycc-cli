import { describe, expect, test, spyOn } from 'bun:test';
import fs from 'fs';
import { t, setLanguage, availableLanguages } from './i18n.ts';

describe('utils/i18n.ts', () => {
  test('availableLanguages should expose only supported locales', () => {
    expect(availableLanguages).toEqual(['pt-BR', 'en-US']);
  });

  test('t should return valid translations, replace arguments and fallback to original key', () => {
    expect({
      isValidCancel: ['Operação cancelada.', 'Operation cancelled.'].includes(t('cancel')),
      hasInjectedArg: t('checkRemuxOnly', 3).includes('3'),
      fallbackString: t('non_existent_key_123')
    }).toMatchObject({
      isValidCancel: true,
      hasInjectedArg: true,
      fallbackString: 'non_existent_key_123'
    });
  });

  test('setLanguage should validate support and persist configuration to disk', () => {
    const writeSpy = spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    expect(() => setLanguage('es-ES')).toThrow();

    setLanguage('en-US');

    expect({
      callCount: writeSpy.mock.calls.length,
      passedValidPath: typeof writeSpy.mock.calls[0]?.[0] === 'string',
      passedValidConfig: String(writeSpy.mock.calls[0]?.[1]).includes('"lang": "en-US"')
    }).toMatchObject({
      callCount: 1,
      passedValidPath: true,
      passedValidConfig: true
    });

    writeSpy.mockRestore();
  });
});