import path from 'path';
import { calculateTotalFrames, isAttachedPic, isImageSubtitle } from '../utils/formatters.ts';
import type { FallbackRules, JellyfinSupportMatrix, SupportDecision } from '../types/config';
import type { FFprobeData, MediaStream, SelectedStream } from '../types/media';

export type CompatibilityBadge = 'green' | 'yellow' | 'red';

export interface MediaMetadata {
  fileName: string;
  containerKey: string;
  videoKey: string | null;
  audioKey: string | null;
  durationSec: number;
  totalFrames: number;
  primaryVideoStream?: MediaStream;
  videoStreams: MediaStream[];
  audioStreams: MediaStream[];
  subtitleStreams: MediaStream[];
  attachedPictures: MediaStream[];
}

export interface CompatibilityEntry {
  client: string;
  container: SupportDecision | undefined;
  video: SupportDecision | undefined;
  audio: SupportDecision | undefined;
  badge: CompatibilityBadge;
}

export interface CompatibilityAnalysis {
  entries: CompatibilityEntry[];
}

export interface ContainerDecision {
  current: string;
  target: string;
  compatible: boolean;
}

export interface VideoDecision {
  stream: MediaStream;
  compatible: boolean;
  targetCodec: string;
  targetDepth: string;
}

export interface AudioDecision {
  stream: MediaStream;
  trackNumber: number;
  compatible: boolean;
  targetCodec: string;
  targetBitrateKbps: number | null;
  isLossless: boolean;
}

export interface SubtitleDecision {
  stream: MediaStream;
  trackNumber: number;
  isImage: boolean;
}

export interface ExtraDecision {
  stream: MediaStream;
}

export interface ActionPlan {
  container: ContainerDecision;
  video: VideoDecision | null;
  audio: AudioDecision[];
  subtitles: SubtitleDecision[];
  extras: ExtraDecision[];
}

export interface SelectionAnalysis {
  selectedCount: number;
  originalCount: number;
  selectedAudioCount: number;
  isContainerCompatible: boolean;
  isVideoCompatible: boolean;
  isAudioCompatible: boolean;
  needsTranscode: boolean;
  streamsDropped: boolean;
  tagsModified: boolean;
  needsAction: boolean;
  isJustRemux: boolean;
}

export interface CheckDiagnostic {
  metadata: MediaMetadata;
  compatibility: CompatibilityAnalysis;
  selection: SelectionAnalysis;
  actionPlan: ActionPlan;
  hasGarbage: boolean;
}

export const getPrimaryVideoStream = (probeData: FFprobeData) =>
  probeData.streams.find((stream) => stream.codec_type === 'video' && !isAttachedPic(stream));

const mapContainer = (formatName: string, videoPath?: string) => {
  const normalized = formatName.toLowerCase();
  if (normalized.includes('matroska')) return 'mkv';
  if (normalized.includes('mp4') || normalized.includes('mov')) return 'mp4';
  if (normalized.includes('webm')) return 'webm';

  const fallbackExt = path.extname(videoPath ?? '').toLowerCase().replace('.', '');
  return fallbackExt || normalized.split(',')[0] || normalized;
};

const mapVideoCodec = (stream: MediaStream | undefined): string | null => {
  if (!stream) return null;

  const codec = stream.codec_name;
  const is10bit = Boolean(stream.pix_fmt && stream.pix_fmt.includes('10'));
  if (codec === 'h264') return is10bit ? 'h264_10bit' : 'h264_8bit';
  if (codec === 'hevc') return is10bit ? 'hevc_10bit' : 'hevc_8bit';

  return codec;
};

const getAudioTargetCodec = (stream: MediaStream, fallbackRules: FallbackRules) => {
  if (fallbackRules.audio.acceptable.includes(stream.codec_name)) return stream.codec_name;
  return (fallbackRules.audio.mappings[stream.codec_name] ?? fallbackRules.audio.mappings.default).target;
};

const getAudioTargetBitrateKbps = (stream: MediaStream, targetCodec: string) => {
  if (targetCodec === 'flac') return null;

  const channels = stream.channels || 2;
  const sourceKbps = stream.bit_rate ? Math.round(Number.parseInt(stream.bit_rate, 10) / 1000) : Infinity;
  let finalKbps = Math.min(channels * 112, sourceKbps);

  if (targetCodec === 'eac3') finalKbps = Math.min(finalKbps, 768);
  if (targetCodec === 'ac3') finalKbps = Math.min(finalKbps, 640);

  return finalKbps;
};

const buildCompatibilityAnalysis = (
  metadata: MediaMetadata,
  supportMatrix: JellyfinSupportMatrix
): CompatibilityAnalysis => {
  const entries = Object.keys(supportMatrix.clients).map((client) => {
    const matrix = supportMatrix.clients[client]!;
    const container = matrix.containers[metadata.containerKey];
    const video = metadata.videoKey ? matrix.video[metadata.videoKey] : undefined;
    const audio = metadata.audioKey ? matrix.audio[metadata.audioKey] : undefined;

    const badge: CompatibilityBadge =
      (container === true && video === true && audio === true)
        ? 'green'
        : (container === false || video === false || audio === false)
          ? 'red'
          : 'yellow';

    return { client, container, video, audio, badge };
  });

  return { entries };
};

const buildActionPlan = (
  metadata: MediaMetadata,
  fallbackRules: FallbackRules
): ActionPlan => {
  const video = metadata.primaryVideoStream
    ? {
        stream: metadata.primaryVideoStream,
        compatible: metadata.videoKey === fallbackRules.video.target,
        targetCodec: fallbackRules.video.target,
        targetDepth: fallbackRules.video.target.includes('10bit') ? '10-bit' : '8-bit'
      }
    : null;

  const audio = metadata.audioStreams.map((stream, index) => {
    const compatible = fallbackRules.audio.acceptable.includes(stream.codec_name);
    const targetCodec = getAudioTargetCodec(stream, fallbackRules);

    return {
      stream,
      trackNumber: index + 1,
      compatible,
      targetCodec,
      targetBitrateKbps: getAudioTargetBitrateKbps(stream, targetCodec),
      isLossless: targetCodec === 'flac'
    };
  });

  const subtitles = metadata.subtitleStreams.map((stream, index) => ({
    stream,
    trackNumber: index + 1,
    isImage: isImageSubtitle(stream.codec_name)
  }));

  const extras = metadata.attachedPictures.map((stream) => ({ stream }));

  return {
    container: {
      current: metadata.containerKey,
      target: fallbackRules.container,
      compatible: metadata.containerKey === fallbackRules.container
    },
    video,
    audio,
    subtitles,
    extras
  };
};

const buildSelectedStreams = (probeData: FFprobeData): SelectedStream[] =>
  probeData.streams.map((stream) => ({
    streamIndex: stream.index,
    type: stream.codec_type,
    codec: stream.codec_name,
    language: stream.tags?.language || 'und',
    title: stream.tags?.title || ''
  }));

const analyzeSelection = (
  probeData: FFprobeData,
  fallbackRules: FallbackRules,
  metadata: MediaMetadata,
  selectedStreams?: SelectedStream[]
): SelectionAnalysis => {
  const currentSelection = selectedStreams ?? buildSelectedStreams(probeData);
  const originalStreamByIndex = new Map(probeData.streams.map((stream) => [stream.index, stream]));

  const selectedAudioStreams = currentSelection.filter((stream) => stream.type === 'audio');
  const isAudioCompatible =
    selectedAudioStreams.length === 0 ||
    selectedAudioStreams.every((stream) => fallbackRules.audio.acceptable.includes(stream.codec));

  const isContainerCompatible = metadata.containerKey === fallbackRules.container;
  const isVideoCompatible = metadata.videoKey === fallbackRules.video.target;
  const streamsDropped = currentSelection.length < probeData.streams.length;
  const tagsModified = currentSelection.some((stream) => {
    const original = originalStreamByIndex.get(stream.streamIndex);
    const originalLang = original?.tags?.language || 'und';
    const originalTitle = original?.tags?.title || '';
    const selectedLang = stream.language ?? 'und';
    const selectedTitle = stream.title ?? '';

    return selectedLang !== originalLang || selectedTitle !== originalTitle;
  });

  const needsTranscode = !isContainerCompatible || !isVideoCompatible || !isAudioCompatible;
  const needsAction = needsTranscode || streamsDropped || tagsModified;
  const isJustRemux = !needsTranscode && (streamsDropped || tagsModified);

  return {
    selectedCount: currentSelection.length,
    originalCount: probeData.streams.length,
    selectedAudioCount: selectedAudioStreams.length,
    isContainerCompatible,
    isVideoCompatible,
    isAudioCompatible,
    needsTranscode,
    streamsDropped,
    tagsModified,
    needsAction,
    isJustRemux
  };
};

export function mapMetadata(probeData: FFprobeData, videoPath?: string): MediaMetadata {
  const durationSec = probeData.format?.duration ? Number.parseFloat(probeData.format.duration) : 0;
  const videoStreams = probeData.streams.filter((stream) => stream.codec_type === 'video' && !isAttachedPic(stream));
  const attachedPictures = probeData.streams.filter((stream) => stream.codec_type === 'video' && isAttachedPic(stream));
  const audioStreams = probeData.streams.filter((stream) => stream.codec_type === 'audio');
  const subtitleStreams = probeData.streams.filter((stream) => stream.codec_type === 'subtitle');
  const primaryVideoStream = videoStreams[0];

  return {
    fileName: path.basename(videoPath ?? probeData.format.filename),
    containerKey: mapContainer(probeData.format.format_name, videoPath),
    videoKey: mapVideoCodec(primaryVideoStream),
    audioKey: audioStreams[0]?.codec_name ?? null,
    durationSec,
    totalFrames: calculateTotalFrames(primaryVideoStream, durationSec),
    primaryVideoStream,
    videoStreams,
    audioStreams,
    subtitleStreams,
    attachedPictures
  };
}

export function analyzeCompatibility(
  probeData: FFprobeData,
  supportMatrix: JellyfinSupportMatrix,
  videoPath?: string
): CompatibilityAnalysis {
  return buildCompatibilityAnalysis(mapMetadata(probeData, videoPath), supportMatrix);
}

export function getDiagnostic(
  probeData: FFprobeData,
  fallbackRules: FallbackRules,
  supportMatrix: JellyfinSupportMatrix,
  selectedStreams?: SelectedStream[],
  videoPath?: string
): CheckDiagnostic {
  const metadata = mapMetadata(probeData, videoPath);
  const compatibility = buildCompatibilityAnalysis(metadata, supportMatrix);
  const actionPlan = buildActionPlan(metadata, fallbackRules);
  const selection = analyzeSelection(probeData, fallbackRules, metadata, selectedStreams);
  const hasGarbage = actionPlan.subtitles.some((stream) => stream.isImage) || actionPlan.extras.length > 0;

  return {
    metadata,
    compatibility,
    selection,
    actionPlan,
    hasGarbage
  };
}

export function getPreferredVideoSource(infoA: FFprobeData, infoB: FFprobeData): 'A' | 'B' {
  const videoA = getPrimaryVideoStream(infoA);
  const videoB = getPrimaryVideoStream(infoB);

  if (!videoA) return 'B';
  if (!videoB) return 'A';

  const pixelsA = (videoA.width || 0) * (videoA.height || 0);
  const pixelsB = (videoB.width || 0) * (videoB.height || 0);
  if (pixelsB > pixelsA) return 'B';

  const bitrateA = videoA.bit_rate ? Number.parseInt(videoA.bit_rate, 10) : 0;
  const bitrateB = videoB.bit_rate ? Number.parseInt(videoB.bit_rate, 10) : 0;
  if (pixelsB === pixelsA && bitrateB > bitrateA) return 'B';

  return 'A';
}

export function isGarbageStream(stream: MediaStream): boolean {
  return isAttachedPic(stream) || (stream.codec_type === 'subtitle' && isImageSubtitle(stream.codec_name));
}
