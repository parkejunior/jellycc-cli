import path from 'path';
import type { MediaStream } from '../types/media';

export interface RepairCommandParts {
  preCmd: string;
  extraInput: string;
  mapArg: string;
}

export interface RepairVideoArgsParams {
  sourcePath: string;
  streamIndex: number;
  tmpDir: string;
  outputIndex: number;
  inputIndex: number;
}

export interface MergeRepairVideoArgsParams extends RepairVideoArgsParams {
  sourceFileIndex: number;
  delayMs: number;
}

export interface RepairAudioArgsParams extends RepairVideoArgsParams {
  sourceFileIndex: number;
  delayMs: number;
  fullStream?: MediaStream;
}

export interface MergeRepairSubtitleArgsParams extends RepairVideoArgsParams {
  sourceFileIndex: number;
  delayMs: number;
  codec: 'subrip' | 'ass';
}

export const initRepair = (outputPath: string) => path.join(path.dirname(outputPath), '.jellycc_tmp');

export const getRepairOutputPath = (outputPath: string) => {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}_repaired${parsed.ext}`);
};

export const getRepairPreCmds = (streams: Array<Pick<RepairCommandParts, 'preCmd'>>, tmpDir: string) => {
  const preCmds = [`mkdir -p "${tmpDir}"`];
  preCmds.push(...streams.map((stream) => stream.preCmd));
  return preCmds;
};

export const getRepairPostCmds = (tmpDir: string) => [`rm -rf "${tmpDir}"`];

const buildCommandParts = (preCmd: string, extraInput: string, mapArg: string): RepairCommandParts => ({
  preCmd,
  extraInput,
  mapArg
});

const buildInputArg = (prefix: string, inputPath: string) => `${prefix}-i "${inputPath}"`;

const getSourceOffsetPrefix = (sourceFileIndex: number, delayMs: number) => {
  if (sourceFileIndex === 0 && delayMs < 0) return `-itsoffset ${Math.abs(delayMs) / 1000} `;
  if (sourceFileIndex === 1 && delayMs > 0) return `-itsoffset ${delayMs / 1000} `;
  return '';
};

export function buildCheckRepairVideoArgs(params: RepairVideoArgsParams): RepairCommandParts {
  const cleanVideoPath = path.join(params.tmpDir, `temp_video_${params.outputIndex}.mp4`);

  return buildCommandParts(
    `ffmpeg -y -i "${params.sourcePath}" -map 0:${params.streamIndex} -c:v copy -threads 0 "${cleanVideoPath}"`,
    buildInputArg('', cleanVideoPath),
    `-map ${params.inputIndex}:0`
  );
}

export function buildCheckRepairAudioArgs(params: RepairVideoArgsParams): RepairCommandParts {
  const wavPath = path.join(params.tmpDir, `temp_audio_${params.outputIndex}.w64`);

  return buildCommandParts(
    `ffmpeg -y -i "${params.sourcePath}" -map 0:${params.streamIndex} -c:a pcm_s16le -threads 0 "${wavPath}"`,
    buildInputArg('', wavPath),
    `-map ${params.inputIndex}:0`
  );
}

export function buildMergeRepairVideoArgs(params: MergeRepairVideoArgsParams): RepairCommandParts {
  const cleanVideoPath = path.join(params.tmpDir, `temp_video_${params.outputIndex}.mp4`);
  const offsetPrefix = getSourceOffsetPrefix(params.sourceFileIndex, params.delayMs);

  return buildCommandParts(
    `ffmpeg -y -i "${params.sourcePath}" -map 0:${params.streamIndex} -c:v copy -threads 0 "${cleanVideoPath}"`,
    buildInputArg(offsetPrefix, cleanVideoPath),
    `-map ${params.inputIndex}:0`
  );
}

export function buildMergeRepairAudioArgs(params: RepairAudioArgsParams): RepairCommandParts {
  const wavPath = path.join(params.tmpDir, `temp_audio_${params.outputIndex}.w64`);

  const userDelayMs =
    params.sourceFileIndex === 0 && params.delayMs < 0
      ? Math.abs(params.delayMs)
      : params.sourceFileIndex === 1 && params.delayMs > 0
        ? params.delayMs
        : 0;
  const ptsDelayMs = params.fullStream?.start_time ? Math.round(Number.parseFloat(params.fullStream.start_time) * 1000) : 0;
  const totalWavDelayMs = userDelayMs + ptsDelayMs;
  const offsetPrefix = totalWavDelayMs > 0 ? `-itsoffset ${totalWavDelayMs / 1000} ` : '';

  return buildCommandParts(
    `ffmpeg -y -i "${params.sourcePath}" -map 0:${params.streamIndex} -async 1 -c:a pcm_s16le -threads 0 "${wavPath}"`,
    buildInputArg(offsetPrefix, wavPath),
    `-map ${params.inputIndex}:0`
  );
}

export function buildMergeRepairSubtitleArgs(params: MergeRepairSubtitleArgsParams): RepairCommandParts {
  const ext = params.codec === 'subrip' ? 'srt' : 'ass';
  const cleanSubPath = path.join(params.tmpDir, `temp_sub_${params.outputIndex}.${ext}`);
  const offsetPrefix = getSourceOffsetPrefix(params.sourceFileIndex, params.delayMs);

  return buildCommandParts(
    `ffmpeg -y -i "${params.sourcePath}" -map 0:${params.streamIndex} -threads 0 "${cleanSubPath}"`,
    buildInputArg(offsetPrefix, cleanSubPath),
    `-map ${params.inputIndex}:0`
  );
}
