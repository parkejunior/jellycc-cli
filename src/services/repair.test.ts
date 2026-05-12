import { describe, expect, test } from 'bun:test';
import path from 'path';
import type { MediaStream } from '../types/media.d.ts';
import {
  initRepair,
  getRepairOutputPath,
  getRepairPreCmds,
  getRepairPostCmds,
  buildCheckRepairVideoArgs,
  buildCheckRepairAudioArgs,
  buildMergeRepairVideoArgs,
  buildMergeRepairAudioArgs,
  buildMergeRepairSubtitleArgs
} from './repair.ts';

describe('services/repair.ts', () => {
  const mockOutputPath = path.join('/mock', 'dir', 'output.mkv');
  const mockOutputPathNoExt = path.join('/mock', 'dir', 'output');
  const mockTmpDir = path.join('/mock', 'dir', '.jellycc_tmp');
  const mockSourcePath = path.join('/mock', 'dir', 'source.mkv');

  test('initRepair builds the temporary directory path next to the output file', () => {
    expect(initRepair(mockOutputPath)).toBe(mockTmpDir);
  });

  test('getRepairOutputPath appends the repaired suffix before the extension', () => {
    expect(getRepairOutputPath(mockOutputPath)).toBe(path.join('/mock', 'dir', 'output_repaired.mkv'));
    expect(getRepairOutputPath(mockOutputPathNoExt)).toBe(path.join('/mock', 'dir', 'output_repaired'));
  });

  test('getRepairPreCmds prepends the directory creation command', () => {
    const streams = [{ preCmd: 'echo first' }, { preCmd: 'echo second' }];
    
    expect(getRepairPreCmds(streams, mockTmpDir)).toEqual([
      `mkdir -p "${mockTmpDir}"`,
      'echo first',
      'echo second'
    ]);
  });

  test('getRepairPostCmds returns the cleanup command for the temporary directory', () => {
    expect(getRepairPostCmds(mockTmpDir)).toEqual([`rm -rf "${mockTmpDir}"`]);
  });

  test('buildCheckRepairVideoArgs builds the video repair command parts', () => {
    const expectedCleanPath = path.join(mockTmpDir, 'temp_video_1.mp4');
    const parts = buildCheckRepairVideoArgs({
      sourcePath: mockSourcePath,
      streamIndex: 3,
      tmpDir: mockTmpDir,
      outputIndex: 1,
      inputIndex: 2
    });

    expect(parts).toEqual({
      preCmd: `ffmpeg -y -i "${mockSourcePath}" -map 0:3 -c:v copy -threads 0 "${expectedCleanPath}"`,
      extraInput: `-i "${expectedCleanPath}"`,
      mapArg: '-map 2:0'
    });
  });

  test('buildCheckRepairAudioArgs builds the audio repair command parts', () => {
    const expectedCleanPath = path.join(mockTmpDir, 'temp_audio_2.w64');
    const parts = buildCheckRepairAudioArgs({
      sourcePath: mockSourcePath,
      streamIndex: 5,
      tmpDir: mockTmpDir,
      outputIndex: 2,
      inputIndex: 4
    });

    expect(parts).toEqual({
      preCmd: `ffmpeg -y -i "${mockSourcePath}" -map 0:5 -c:a pcm_s16le -threads 0 "${expectedCleanPath}"`,
      extraInput: `-i "${expectedCleanPath}"`,
      mapArg: '-map 4:0'
    });
  });

  test('buildMergeRepairVideoArgs includes the source offset for the temporary input', () => {
    const expectedCleanPath = path.join(mockTmpDir, 'temp_video_0.mp4');
    const parts = buildMergeRepairVideoArgs({
      sourcePath: mockSourcePath,
      streamIndex: 1,
      tmpDir: mockTmpDir,
      outputIndex: 0,
      inputIndex: 2,
      sourceFileIndex: 0,
      delayMs: -1250
    });

    expect(parts).toEqual({
      preCmd: `ffmpeg -y -i "${mockSourcePath}" -map 0:1 -c:v copy -threads 0 "${expectedCleanPath}"`,
      extraInput: `-itsoffset 1.25 -i "${expectedCleanPath}"`,
      mapArg: '-map 2:0'
    });
  });

  test('buildMergeRepairAudioArgs combines source and native delays for the offset', () => {
    const expectedCleanPath = path.join(mockTmpDir, 'temp_audio_3.w64');
    const fullStream: MediaStream = {
      index: 11,
      codec_name: 'aac',
      codec_type: 'audio',
      start_time: '1.25'
    };

    const parts = buildMergeRepairAudioArgs({
      sourcePath: mockSourcePath,
      streamIndex: 7,
      tmpDir: mockTmpDir,
      outputIndex: 3,
      inputIndex: 5,
      sourceFileIndex: 1,
      delayMs: 500,
      fullStream
    });

    expect(parts).toEqual({
      preCmd: `ffmpeg -y -i "${mockSourcePath}" -map 0:7 -async 1 -c:a pcm_s16le -threads 0 "${expectedCleanPath}"`,
      extraInput: `-itsoffset 1.75 -i "${expectedCleanPath}"`,
      mapArg: '-map 5:0'
    });
  });

  test('buildMergeRepairSubtitleArgs uses the subtitle codec extension and offset for subrip', () => {
    const expectedCleanPath = path.join(mockTmpDir, 'temp_sub_4.srt');
    const parts = buildMergeRepairSubtitleArgs({
      sourcePath: mockSourcePath,
      streamIndex: 9,
      tmpDir: mockTmpDir,
      outputIndex: 4,
      inputIndex: 6,
      sourceFileIndex: 1,
      delayMs: 200,
      codec: 'subrip'
    });

    expect(parts).toEqual({
      preCmd: `ffmpeg -y -i "${mockSourcePath}" -map 0:9 -threads 0 "${expectedCleanPath}"`,
      extraInput: `-itsoffset 0.2 -i "${expectedCleanPath}"`,
      mapArg: '-map 6:0'
    });
  });

  test('buildMergeRepairSubtitleArgs skips offset for ass subtitles without delay', () => {
    const expectedCleanPath = path.join(mockTmpDir, 'temp_sub_0.ass');
    const parts = buildMergeRepairSubtitleArgs({
      sourcePath: mockSourcePath,
      streamIndex: 2,
      tmpDir: mockTmpDir,
      outputIndex: 0,
      inputIndex: 3,
      sourceFileIndex: 0,
      delayMs: 0,
      codec: 'ass'
    });

    expect(parts).toEqual({
      preCmd: `ffmpeg -y -i "${mockSourcePath}" -map 0:2 -threads 0 "${expectedCleanPath}"`,
      extraInput: `-i "${expectedCleanPath}"`,
      mapArg: '-map 3:0'
    });
  });
});