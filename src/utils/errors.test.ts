import { describe, expect, test } from 'bun:test';
import { JellyError, ValidationError, UserCancelError } from './errors.ts';

describe('utils/errors.ts', () => {
  test('ValidationError herda de JellyError', () => {
    const error = new ValidationError('Arquivo inválido.');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(JellyError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Arquivo inválido.');
  });

  test('UserCancelError identifica cancelamento do usuário', () => {
    const error = new UserCancelError('Operação cancelada.');

    expect(error).toBeInstanceOf(JellyError);
    expect(error).toBeInstanceOf(UserCancelError);
    expect(error.name).toBe('UserCancelError');
    expect(error.code).toBe('USER_CANCELLED');
  });
});
