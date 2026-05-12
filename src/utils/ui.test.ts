import { describe, expect, test, mock, afterEach, spyOn } from 'bun:test';
import { onCancel, sanitizePath, handleExecutionMenu, editTagsMenu } from './ui.ts';
import * as clack from '@clack/prompts';
import * as ffmpeg from './ffmpeg.ts';

mock.module('@clack/prompts', () => ({
  isCancel: (val: any) => val === Symbol.for('cancel'),
  select: mock(),
  confirm: mock(),
  text: mock(),
  outro: mock(),
  log: { info: mock() }
}));

describe('utils/ui.ts', () => {
  afterEach(() => {
    mock.restore();
  });

  test('sanitizePath should remove surrounding quotes and trim whitespace', () => {
    expect({
      clean: sanitizePath('  /path/file.mkv  '),
      singleQuotes: sanitizePath("'./movie.mp4'"),
      doubleQuotes: sanitizePath('"C:\\video.avi"'),
      empty: sanitizePath(null)
    }).toMatchObject({
      clean: '/path/file.mkv',
      singleQuotes: './movie.mp4',
      doubleQuotes: 'C:\\video.avi',
      empty: null
    });
  });

  test('onCancel should throw UserCancelError on cancel symbol or return the value', () => {
    const cancelSymbol = Symbol.for('cancel');
    let caughtError: any;

    try {
      onCancel(cancelSymbol);
    } catch (e) {
      caughtError = e;
    }

    expect({
      errorType: caughtError?.name,
      validReturn: onCancel('valid_input')
    }).toMatchObject({
      errorType: 'UserCancelError',
      validReturn: 'valid_input'
    });
  });

  test('handleExecutionMenu should return exit state immediately when exit is selected', async () => {
    (clack.select as any).mockResolvedValueOnce('exit');

    const result = await handleExecutionMenu({
      ffmpegCmd: 'ffmpeg -i in.mkv out.mkv',
      fullScanInputs: [],
      fullScanMaps: [],
      outputPath: 'out.mkv',
      totalDuration: 100,
      totalFrames: 2400
    });

    expect(result).toMatchObject({
      action: 'exit',
      deepScanCompleted: false,
      hasErrors: false
    });
  });

  test('handleExecutionMenu should return immediately for menu actions that modify state', async () => {
    (clack.select as any).mockResolvedValueOnce('select_streams');

    const result = await handleExecutionMenu({
      ffmpegCmd: 'cmd',
      fullScanInputs: [],
      fullScanMaps: [],
      outputPath: 'out.mkv',
      totalDuration: 100,
      totalFrames: 2400,
      allowStreamSelection: true
    });

    expect(result).toMatchObject({
      action: 'select_streams',
      deepScanCompleted: false,
      hasErrors: false
    });
  });

  test('handleExecutionMenu should execute deep scan and loop back to menu', async () => {
    (clack.select as any)
      .mockResolvedValueOnce('deep_scan_selected')
      .mockResolvedValueOnce('exit');
    
    const runScanSpy = spyOn(ffmpeg, 'runDeepScan').mockResolvedValueOnce(true as any); 
    const result = await handleExecutionMenu({
      ffmpegCmd: 'cmd',
      fullScanInputs: [],
      fullScanMaps: [],
      selectedScanInputs: ['in.mkv'],
      selectedScanMaps: ['0'],
      outputPath: 'out.mkv',
      totalDuration: 100,
      totalFrames: 2400,
      allowMyopicScan: true
    });

    expect(runScanSpy).toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'exit',
      deepScanCompleted: true,
      hasErrors: true
    });
  });

  test('handleExecutionMenu should execute conversion and return done state', async () => {
    (clack.select as any).mockResolvedValueOnce('run');
    
    const runConvSpy = spyOn(ffmpeg, 'runConversion').mockResolvedValueOnce(undefined as any);

    const result = await handleExecutionMenu({
      ffmpegCmd: 'ffmpeg cmd',
      fullScanInputs: [],
      fullScanMaps: [],
      outputPath: 'out.mkv',
      totalDuration: 100,
      totalFrames: 2400
    });

    expect(runConvSpy).toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'done',
      deepScanCompleted: false,
      hasErrors: false
    });
  });

  test('handleExecutionMenu should run repair command and subsequent scan', async () => {
    (clack.select as any).mockResolvedValueOnce('run_repair_and_scan');
    
    const runConvSpy = spyOn(ffmpeg, 'runConversion').mockResolvedValueOnce(undefined as any);
    const runScanSpy = spyOn(ffmpeg, 'runDeepScan').mockResolvedValueOnce(false as any);

    const result = await handleExecutionMenu({
      ffmpegCmd: 'cmd',
      ffmpegRepairCmd: 'repair_cmd',
      fullScanInputs: [],
      fullScanMaps: [],
      outputPath: '/fake/out.mkv',
      totalDuration: 100,
      totalFrames: 2400,
      hasErrors: true
    });

    expect(runConvSpy).toHaveBeenCalledWith('repair_cmd', 100, 2400); 
    expect(runScanSpy).toHaveBeenCalled();
    expect(result.action).toBe('done');
  });

  test('editTagsMenu should initialize missing tags from ffprobe data and allow early exit', async () => {
    (clack.select as any).mockResolvedValueOnce(-1);

    const selectedStreams = [{ streamIndex: 0, type: 'audio', codec: 'aac' } as any];
    const infoA = { streams: [{ index: 0, tags: { language: 'por', title: 'Dublado' } }] } as any;

    const result = await editTagsMenu(selectedStreams, infoA);

    expect(result[0]).toMatchObject({
      language: 'por',
      title: 'Dublado'
    });
  });

  test('editTagsMenu should map from infoB for secondary files and handle subtitles', async () => {
    (clack.select as any).mockResolvedValueOnce(-1);

    const selectedStreams = [{ streamIndex: 0, type: 'subtitle', codec: 'srt', fileIndex: 1 } as any];
    const infoA = { streams: [] } as any;
    const infoB = { streams: [{ index: 0, tags: { language: 'eng', title: 'Subs' } }] } as any;

    const result = await editTagsMenu(selectedStreams, infoA, infoB);

    expect(result[0]).toMatchObject({
      language: 'eng',
      title: 'Subs'
    });
  });

  test('editTagsMenu should skip autoPromptUnd if no undefined non-video languages exist', async () => {
    const selectedStreams = [{ streamIndex: 0, type: 'video', codec: 'h264', language: 'und', title: '' } as any];
    const infoA = { streams: [{ index: 0 }] } as any;
    
    const result = await editTagsMenu(selectedStreams, infoA, undefined, true);
    
    expect(result).toMatchObject(selectedStreams);
  });

  test('editTagsMenu should handle autoPromptUnd rejection', async () => {
    (clack.confirm as any).mockResolvedValueOnce(false);
    
    const selectedStreams = [{ streamIndex: 0, type: 'audio', codec: 'aac', language: 'und', title: '' } as any];
    const infoA = { streams: [{ index: 0 }] } as any;
    
    const result = await editTagsMenu(selectedStreams, infoA, undefined, true);
    
    expect(result).toMatchObject(selectedStreams);
  });

  test('editTagsMenu should update stream tags through interactive text prompts', async () => {
    (clack.select as any)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(-1);
    (clack.text as any)
      .mockResolvedValueOnce('jpn')
      .mockResolvedValueOnce('Original Mix');

    const selectedStreams = [{ streamIndex: 0, type: 'audio', codec: 'aac', language: 'und', title: '' } as any];
    const infoA = { streams: [{ index: 0 }] } as any;

    const result = await editTagsMenu(selectedStreams, infoA);

    expect(result[0]).toMatchObject({
      language: 'jpn',
      title: 'Original Mix'
    });
  });
});