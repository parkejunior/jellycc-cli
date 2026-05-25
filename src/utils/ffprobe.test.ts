import { describe, expect, test, mock, spyOn, afterEach } from 'bun:test';
import * as child_process from 'child_process';
import { runQuickScan, getMediaInfo } from './ffprobe.ts';
import { JellyError, ValidationError } from './errors.ts';

mock.module('@clack/prompts', () => ({
  spinner: () => ({
    start: mock(),
    stop: mock()
  })
}));

describe('utils/ffprobe.ts', () => {
  const execFileSyncSpy = spyOn(child_process, 'execFileSync');

  afterEach(() => {
    execFileSyncSpy.mockClear();
  });

  test('runQuickScan should complete successfully on valid media', () => {
    execFileSyncSpy.mockReturnValueOnce(Buffer.from(''));
    
    expect(() => runQuickScan('valid.mkv')).not.toThrow();
  });

  test('runQuickScan should throw ValidationError when media is corrupted', () => {
    execFileSyncSpy.mockImplementationOnce(() => {
      throw new Error('Command failed');
    });

    let caughtError: any;
    try {
      runQuickScan('corrupted.mkv');
    } catch (e) {
      caughtError = e;
    }

    expect({
      isValidationError: caughtError instanceof ValidationError,
      name: caughtError?.name,
      code: caughtError?.code
    }).toMatchObject({
      isValidationError: true,
      name: 'ValidationError',
      code: 'VALIDATION_ERROR'
    });
  });

  test('runQuickScan should throw JellyError when ffprobe is missing', () => {
    execFileSyncSpy.mockImplementationOnce(() => {
      const err = new Error('spawn ENOENT');
      (err as any).code = 'ENOENT';
      throw err;
    });

    let caughtError: any;
    try {
      runQuickScan('file.mkv');
    } catch (e) {
      caughtError = e;
    }

    expect({
      isJellyError: caughtError instanceof JellyError,
      name: caughtError?.name,
      code: caughtError?.code
    }).toMatchObject({
      isJellyError: true,
      name: 'JellyError',
      code: 'FFPROBE_NOT_FOUND'
    });
  });

  test('getMediaInfo should return parsed JSON data', () => {
    const mockData = { format: { format_name: 'matroska' }, streams: [] };
    execFileSyncSpy.mockReturnValueOnce(Buffer.from(JSON.stringify(mockData)));

    const result = getMediaInfo('video.mkv');

    expect(result).toMatchObject({
      format: { format_name: 'matroska' },
      streams: []
    });
  });

  test('getMediaInfo should throw JellyError on execution failure', () => {
    execFileSyncSpy.mockImplementationOnce(() => {
      throw new Error('Parse fail');
    });

    let caughtError: any;
    try {
      getMediaInfo('bad.mkv');
    } catch (e) {
      caughtError = e;
    }

    expect({
      isJellyError: caughtError instanceof JellyError,
      name: caughtError?.name,
      code: caughtError?.code
    }).toMatchObject({
      isJellyError: true,
      name: 'JellyError',
      code: 'FFPROBE_JSON_ERROR'
    });
  });
});