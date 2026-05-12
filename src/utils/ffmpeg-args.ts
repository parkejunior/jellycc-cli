import { getDynamicAudioEncoder, getDynamicVideoEncoder } from './ffmpeg.ts';
import type { FallbackRules } from '../types/config';
import type { FFprobeData, SelectedStream } from '../types/media';

export type MetadataTrackType = 'v' | 'a' | 's';

export interface AudioArgsOptions {
  forceTranscode?: boolean;
}

const withOutputIndex = (codecArg: string, type: MetadataTrackType, outputIndex: number) =>
  codecArg.replace(`-c:${type}`, `-c:${type}:${outputIndex}`);

export function getVideoArgs(
  stream: SelectedStream,
  isCompatible: boolean,
  rules: FallbackRules,
  outputIndex: number = 0
): string[] {
  if (isCompatible) {
    return [`-c:v:${outputIndex} copy`];
  }

  return [withOutputIndex(getDynamicVideoEncoder(rules.video.target), 'v', outputIndex)];
}

export function getAudioArgs(
  stream: SelectedStream,
  info: FFprobeData,
  rules: FallbackRules,
  outputIndex: number = 0,
  options: AudioArgsOptions = {}
): string[] {
  const isCompatible = rules.audio.acceptable.includes(stream.codec);
  if (!options.forceTranscode && isCompatible) {
    return [`-c:a:${outputIndex} copy`];
  }

  const target = isCompatible
    ? stream.codec
    : (rules.audio.mappings[stream.codec] ?? rules.audio.mappings.default).target;
  const fullStream = info.streams.find((st) => st.index === stream.streamIndex);

  return [getDynamicAudioEncoder(fullStream, target, outputIndex)];
}

export function getSubtitleArgs(
  stream: SelectedStream,
  outputIndex: number = 0
): string[] {
  if (stream.codec === 'subrip') return [`-c:s:${outputIndex} srt`];
  if (stream.codec === 'ass') return [`-c:s:${outputIndex} ass`];
  return [`-c:s:${outputIndex} copy`];
}

export function getMetadataArgs(
  stream: Pick<SelectedStream, 'language' | 'title'>,
  type: MetadataTrackType,
  index: number
): string[] {
  if (stream.language === undefined) return [];

  return [
    `-metadata:s:${type}:${index} language="${stream.language}"`,
    `-metadata:s:${type}:${index} title="${stream.title ?? ''}"`
  ];
}