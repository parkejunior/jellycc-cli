import type { MediaStream, SelectedStream } from '../types/media';

const IMAGE_SUBTITLE_CODECS = new Set(['hdmv_pgs_subtitle', 'pgs', 'dvd_subtitle', 'vobsub']);
const ATTACHED_PIC_CODECS = new Set(['mjpeg', 'png', 'bmp']);

export const isImageSubtitle = (codecName: string | undefined): boolean => {
  if (!codecName) return false;
  return IMAGE_SUBTITLE_CODECS.has(codecName.toLowerCase());
};

export const isAttachedPic = (stream: Pick<MediaStream, 'disposition' | 'codec_name'>): boolean => {
  return (
    stream.disposition?.attached_pic === 1 || 
    (!!stream.codec_name && ATTACHED_PIC_CODECS.has(stream.codec_name.toLowerCase()))
  );
};

export const isGarbageStream = (stream: MediaStream): boolean => {
  return isAttachedPic(stream) || (stream.codec_type === 'subtitle' && isImageSubtitle(stream.codec_name));
};

export const hasEmbeddedGarbage = (streams: MediaStream[]): boolean => streams.some(isGarbageStream);

export const filterGarbageStreams = (streams: MediaStream[]): MediaStream[] =>
  streams.filter((stream) => !isGarbageStream(stream));

export const buildAudioMaps = (streams: MediaStream[], fileIndex: number = 0) =>
  streams.filter(s => s.codec_type === 'audio').map(s => `${fileIndex}:${s.index}`);

export const buildAudioLabels = (streams: MediaStream[]) =>
  streams.filter(s => s.codec_type === 'audio').map(s => (s.tags?.language || 'und').toUpperCase());

export const buildSelectedAudioMaps = (streams: SelectedStream[]) =>
  streams.filter(s => s.type === 'audio').map(s => `${s.fileIndex ?? 0}:${s.streamIndex}`);

export const buildSelectedAudioLabels = (streams: SelectedStream[]) =>
  streams.filter(s => s.type === 'audio').map(s => (s.language || 'und').toUpperCase());