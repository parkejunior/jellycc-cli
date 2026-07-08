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

  test('sanitizePath should remove surrounding quotes, escaped spaces, and Bash idioms', () => {
    expect({
      clean: sanitizePath('  /path/file.mkv  '),
      singleQuotes: sanitizePath("'./movie.mp4'"),
      doubleQuotes: sanitizePath('"C:\\video.avi"'),
      bashEscapedQuote: sanitizePath("X-Men '\\''97.mkv"),
      escapedSpaces: sanitizePath("/My\\ Movie.mkv"),
      empty: sanitizePath(null),
      undef: sanitizePath(undefined),
      blank: sanitizePath("")
    }).toMatchObject({
      clean: '/path/file.mkv',
      singleQuotes: './movie.mp4',
      doubleQuotes: 'C:\\video.avi',
      bashEscapedQuote: "X-Men '97.mkv",
      escapedSpaces: '/My Movie.mkv',
      empty: null,
      undef: undefined,
      blank: ""
    });
  });

  test('onCancel should throw UserCancelError on cancel symbol or return the value', () => {
    let caughtError: any;
    try {
      onCancel(Symbol.for('cancel'));
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError?.name).toBe('UserCancelError');
    expect(onCancel('valid_input')).toBe('valid_input');
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

    expect(result.action).toBe('exit');
  });

  test('handleExecutionMenu should return immediately for state modifiers (select_streams, adjust_sync, edit_tags)', async () => {
    const baseOpts = { ffmpegCmd: 'cmd', fullScanInputs: [], fullScanMaps: [], outputPath: 'out', totalDuration: 100, totalFrames: 24 };
    
    (clack.select as any).mockResolvedValueOnce('select_streams');
    expect((await handleExecutionMenu({ ...baseOpts, allowStreamSelection: true })).action).toBe('select_streams');

    (clack.select as any).mockResolvedValueOnce('adjust_sync');
    expect((await handleExecutionMenu({ ...baseOpts, allowSyncAdjustment: true })).action).toBe('adjust_sync');

    (clack.select as any).mockResolvedValueOnce('edit_tags');
    expect((await handleExecutionMenu({ ...baseOpts, allowStreamSelection: true })).action).toBe('edit_tags');
  });

  test('handleExecutionMenu should execute partial and full deep scans and loop back', async () => {
    (clack.select as any)
      .mockResolvedValueOnce('deep_scan_selected')
      .mockResolvedValueOnce('deep_scan_full')
      .mockResolvedValueOnce('exit');
    
    const runScanSpy = spyOn(ffmpeg, 'runDeepScan').mockResolvedValue(true as any); 
    
    const result = await handleExecutionMenu({
      ffmpegCmd: 'cmd',
      fullScanInputs: ['full.mkv'],
      fullScanMaps: ['0'],
      selectedScanInputs: ['sel.mkv'],
      selectedScanMaps: ['0:0'],
      outputPath: 'out.mkv',
      totalDuration: 100,
      totalFrames: 2400,
      allowMyopicScan: true
    });

    expect(runScanSpy).toHaveBeenCalledTimes(2);
    expect(runScanSpy).toHaveBeenNthCalledWith(1, ['sel.mkv'], ['0:0'], 100); // selected
    expect(runScanSpy).toHaveBeenNthCalledWith(2, ['full.mkv'], ['0'], 100); // full
    expect(result.action).toBe('exit');
  });

  test('handleExecutionMenu should execute normal conversion with deep scan', async () => {
    (clack.select as any).mockResolvedValueOnce('run_and_scan');
    
    const runConvSpy = spyOn(ffmpeg, 'runConversion').mockResolvedValueOnce(undefined as any);
    const runScanSpy = spyOn(ffmpeg, 'runDeepScan').mockResolvedValueOnce(false as any);

    const result = await handleExecutionMenu({
      ffmpegCmd: 'normal_cmd',
      fullScanInputs: [],
      fullScanMaps: [],
      outputPath: '/fake/out.mkv',
      totalDuration: 100,
      totalFrames: 2400
    });

    expect(runConvSpy).toHaveBeenCalledWith('normal_cmd', 100, 2400); 
    expect(runScanSpy).toHaveBeenCalledWith(['/fake/out.mkv'], ['0'], 100);
    expect(result.action).toBe('done');
  });

  test('handleExecutionMenu should execute repair conversion, scan with correct output path, and exit', async () => {
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
    expect(runScanSpy).toHaveBeenCalledWith(['/fake/out_repaired.mkv'], ['0'], 100);
    expect(result.action).toBe('done');
  });

  test('editTagsMenu should initialize missing tags from ffprobe data and allow early exit', async () => {
    (clack.select as any).mockResolvedValueOnce(-1);

    const selectedStreams = [{ streamIndex: 0, type: 'audio', codec: 'aac' } as any];
    const infoA = { streams: [{ index: 0, tags: { language: 'por', title: 'Dublado' } }] } as any;

    const result = await editTagsMenu(selectedStreams, infoA);

    expect(result[0]).toMatchObject({ language: 'por', title: 'Dublado' });
  });

  test('editTagsMenu should map from infoB for secondary files and handle subtitles', async () => {
    (clack.select as any).mockResolvedValueOnce(-1);

    const selectedStreams = [{ streamIndex: 0, type: 'subtitle', codec: 'srt', fileIndex: 1 } as any];
    const infoA = { streams: [] } as any;
    const infoB = { streams: [{ index: 0, tags: { language: 'eng', title: 'Subs' } }] } as any;

    const result = await editTagsMenu(selectedStreams, infoA, infoB);

    expect(result[0]).toMatchObject({ language: 'eng', title: 'Subs' });
  });

  test('editTagsMenu should skip autoPromptUnd if no undefined non-video languages exist', async () => {
    const selectedStreams = [{ streamIndex: 0, type: 'video', codec: 'h264', language: 'und', title: '' } as any];
    const infoA = { streams: [{ index: 0 }] } as any;
    
    expect(await editTagsMenu(selectedStreams, infoA, undefined, true)).toMatchObject(selectedStreams);
  });

  test('editTagsMenu should handle autoPromptUnd rejection', async () => {
    (clack.confirm as any).mockResolvedValueOnce(false);
    
    const selectedStreams = [{ streamIndex: 0, type: 'audio', codec: 'aac', language: 'und', title: '' } as any];
    const infoA = { streams: [{ index: 0 }] } as any;
    
    expect(await editTagsMenu(selectedStreams, infoA, undefined, true)).toMatchObject(selectedStreams);
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

    expect(result[0]).toMatchObject({ language: 'jpn', title: 'Original Mix' });
  });

  test('handleExecutionMenu should execute silence scan, update error state, and loop back', async () => {
    (clack.select as any)
      .mockResolvedValueOnce('silence_scan')
      .mockResolvedValueOnce('exit');

    const runSilenceSpy = spyOn(ffmpeg, 'runSilenceScan').mockResolvedValueOnce(true as any);

    const result = await handleExecutionMenu({
      ffmpegCmd: 'cmd',
      fullScanInputs: ['full.mkv'],
      fullScanMaps: ['0'],
      fullAudioScanMaps: ['0:1'],
      outputPath: 'out.mkv',
      totalDuration: 100,
      totalFrames: 2400
    });

    expect(runSilenceSpy).toHaveBeenCalledWith(['full.mkv'], ['0:1'], 100, []);
    expect(result.action).toBe('exit');
    expect(result.hasErrors).toBe(true);
  });

  test('handleExecutionMenu should bypass silence scan (no spawn) if no audio tracks are mapped', async () => {
    (clack.select as any)
      .mockResolvedValueOnce('silence_scan')
      .mockResolvedValueOnce('exit');

    const runSilenceSpy = spyOn(ffmpeg, 'runSilenceScan');

    const result = await handleExecutionMenu({
      ffmpegCmd: 'cmd',
      fullScanInputs: ['full.mkv'],
      fullScanMaps: ['0'],
      fullAudioScanMaps: [],
      outputPath: 'out.mkv',
      totalDuration: 100,
      totalFrames: 2400
    });

    expect(runSilenceSpy).not.toHaveBeenCalled();
    expect(result.action).toBe('exit');
  });
});