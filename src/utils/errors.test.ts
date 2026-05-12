import { describe, expect, test } from 'bun:test';
import { JellyError, ValidationError, UserCancelError } from './errors.ts';

describe('utils/errors.ts', () => {
  test('ValidationError inherits from JellyError', () => {
    const error = new ValidationError('File invalid.');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(JellyError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('File invalid.');
  });

  test('UserCancelError identifies user cancellation', () => {
    const error = new UserCancelError('Operation cancelled.');

    expect(error).toBeInstanceOf(JellyError);
    expect(error).toBeInstanceOf(UserCancelError);
    expect(error.name).toBe('UserCancelError');
    expect(error.code).toBe('USER_CANCELLED');
  });
});
