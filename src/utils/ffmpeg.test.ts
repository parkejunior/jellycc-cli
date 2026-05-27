import { describe, expect, test, mock, spyOn, afterEach } from 'bun:test';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import {
  parseFfmpegTime,
  getDynamicVideoEncoder,
  getDynamicAudioEncoder,
  runDeepScan,
  runConversion,
  extractRawAudio
} from './ffmpeg.ts';
import { JellyError } from './errors.ts';

mock.module('@clack/prompts', () => ({
  spinner: () => ({
    start: mock(),
    stop: mock(),
    message: mock()
  })
}));

describe('utils/ffmpeg.ts', () => {
  const spawnSpy = spyOn(child_process, 'spawn');

  afterEach(() => {
    spawnSpy.mockClear();
  });

  test('parseFfmpegTime should convert time strings correctly', () => {
    expect({
      standard: parseFfmpegTime('01:30:15.50'),
      zero: parseFfmpegTime('00:00:00.00'),
      invalidFormat: parseFfmpegTime('12:34'),
      empty: parseFfmpegTime('')
    }).toMatchObject({
      standard: 5415.5,
      zero: 0,
      invalidFormat: 0,
      empty: 0
    });
  });

  test('getDynamicVideoEncoder should return valid ffmpeg flags', () => {
    expect({
      hevc10: getDynamicVideoEncoder('hevc_10bit'),
      hevc8: getDynamicVideoEncoder('hevc_8bit'),
      h26410: getDynamicVideoEncoder('h264_10bit'),
      h2648: getDynamicVideoEncoder('h264_8bit'),
      fallback: getDynamicVideoEncoder('unknown')
    }).toMatchObject({
      hevc10: '-c:v libx265 -preset slow -crf 20 -pix_fmt yuv420p10le',
      hevc8: '-c:v libx265 -preset slow -crf 20 -pix_fmt yuv420p',
      h26410: '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p10le',
      h2648: '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p',
      fallback: '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p'
    });
  });

  test('getDynamicAudioEncoder should restrict bitrates appropriately', () => {
    expect({
      flac: getDynamicAudioEncoder({ channels: 2, bit_rate: '2000000' } as any, 'flac', 0),
      eac3High: getDynamicAudioEncoder({ channels: 8, bit_rate: '2000000' } as any, 'eac3', 1),
      ac3High: getDynamicAudioEncoder({ channels: 6, bit_rate: '2000000' } as any, 'ac3', 0),
      aacLow: getDynamicAudioEncoder({ channels: 2, bit_rate: '128000' } as any, 'aac', 2),
      undefinedStream: getDynamicAudioEncoder(undefined, 'aac', 0)
    }).toMatchObject({
      flac: '-c:a:0 flac',
      eac3High: '-c:a:1 eac3 -b:a:1 768k',
      ac3High: '-c:a:0 ac3 -b:a:0 640k',
      aacLow: '-c:a:2 aac -b:a:2 128k',
      undefinedStream: '-c:a:0 aac -b:a:0 224k'
    });
  });

  test('runDeepScan should process streams and resolve correctly', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess);

    const scanPromise = runDeepScan(['in.mkv'], ['0:v'], 100);

    mockProcess.stderr.emit('data', Buffer.from('frame=150 fps=30 time=00:00:50.00\n'));
    mockProcess.stderr.emit('data', Buffer.from('size=1024kB time=00:01:00.00\n'));
    mockProcess.emit('close', 0);

    const result = await scanPromise;
    expect({ hasErrors: result }).toMatchObject({ hasErrors: false });
  });

  test('runDeepScan should flag errors on bad output or non-zero exit', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess);

    const scanPromise = runDeepScan(['in.mkv'], ['0:v'], 100);

    mockProcess.stderr.emit('data', Buffer.from('[hevc @ 0x123] corrupted frame\n'));
    mockProcess.emit('close', 1);

    const result = await scanPromise;
    expect({ hasErrors: result }).toMatchObject({ hasErrors: true });
  });

  test('runDeepScan should throw JellyError if spawn fails', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess);

    const scanPromise = runDeepScan(['in.mkv'], ['0:v'], 100);

    mockProcess.emit('error', new Error('spawn failed'));

    let caught: any;
    try { await scanPromise; } catch (e) { caught = e; }

    expect({
      isJelly: caught instanceof JellyError,
      code: caught?.code
    }).toMatchObject({
      isJelly: true,
      code: 'FFMPEG_START_FAILED'
    });
  });

  test('runConversion should track progress and resolve on success', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess);

    const convPromise = runConversion('ffmpeg -i test.mkv', 100, 2400);

    mockProcess.stderr.emit('data', Buffer.from('frame= 1200 fps=30 time=00:00:50.00\n'));
    mockProcess.stderr.emit('data', Buffer.from('some random log\n'));
    mockProcess.emit('close', 0);

    await expect(convPromise).resolves.toBeUndefined();
  });

  test('runConversion should reject with JellyError on non-zero exit or error', async () => {
    const mockProcess1 = new EventEmitter() as any;
    mockProcess1.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess1);

    const convPromise1 = runConversion('ffmpeg -i test.mkv', 100);
    mockProcess1.emit('close', 1);

    let caughtClose: any;
    try { await convPromise1; } catch (e) { caughtClose = e; }

    const mockProcess2 = new EventEmitter() as any;
    mockProcess2.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess2);

    const convPromise2 = runConversion('ffmpeg -i test.mkv', 100);
    mockProcess2.emit('error', new Error('crash'));

    let caughtErr: any;
    try { await convPromise2; } catch (e) { caughtErr = e; }

    expect({
      closeCode: caughtClose?.code,
      errCode: caughtErr?.code
    }).toMatchObject({
      closeCode: 'FFMPEG_FAILED',
      errCode: 'FFMPEG_START_FAILED'
    });
  });

  test('extractRawAudio should resolve with Float32Array on success', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess);

    const extractPromise = extractRawAudio('fake.mkv', '00:00:00', 2);

    const fakeData = Buffer.alloc(16);
    fakeData.writeFloatLE(0.1, 0);
    fakeData.writeFloatLE(0.2, 4);
    fakeData.writeFloatLE(0.3, 8);
    fakeData.writeFloatLE(0.4, 12);

    mockProcess.stdout.emit('data', fakeData);
    mockProcess.emit('close', 0);

    const result = await extractPromise;
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBeCloseTo(0.1);
  });

  test('extractRawAudio should reject with JellyError on non-zero exit', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess);

    const extractPromise = extractRawAudio('fake.mkv', '00:00:00', 2);

    mockProcess.stderr.emit('data', Buffer.from('Extraction failed\n'));
    mockProcess.emit('close', 1);

    let caught: any;
    try { await extractPromise; } catch (e) { caught = e; }

    expect({
      isJelly: caught instanceof JellyError,
      code: caught?.code,
      message: caught?.message
    }).toMatchObject({
      isJelly: true,
      code: 'FFMPEG_EXTRACTION_FAILED',
      message: expect.stringContaining('Extraction failed')
    });
  });

  test('extractRawAudio should throw JellyError if spawn fails', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    spawnSpy.mockReturnValue(mockProcess);

    const extractPromise = extractRawAudio('fake.mkv', '00:00:00', 2);

    mockProcess.emit('error', new Error('ENOENT'));

    let caught: any;
    try { await extractPromise; } catch (e) { caught = e; }

    expect({
      isJelly: caught instanceof JellyError,
      code: caught?.code
    }).toMatchObject({
      isJelly: true,
      code: 'FFMPEG_START_FAILED'
    });
  });
});