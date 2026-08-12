import { t } from '../utils/i18n.ts';
import pc from 'picocolors';
import { formatFps, formatSubtitleCodec, formatChannels } from '../utils/formatters.ts';
import { isAttachedPic, isImageSubtitle } from '../utils/mediaUtils.ts';
import { matchesLanguage } from '../utils/language.ts';
import type { FFprobeData, GroupedStreamOptions, SelectedStream } from '../types/media';

export interface StreamOptionSource {
  info: FFprobeData;
  fileIndex?: number;
  label?: string;
}

export interface BuildStreamOptionsParams {
  sources: StreamOptionSource[];
  currentSelected?: SelectedStream[];
  preferredSourceLabel?: string;
  includeAttachedPictures?: boolean;
  includeAudioTitle?: boolean;
  preferredAudio?: string[];
  preferredSubtitles?: string[];
}

export interface BuildStreamOptionsResult {
  groups: GroupedStreamOptions;
  initialValues: SelectedStream[];
  hasAudioFallback?: boolean;
}

const matchesSelectedStream = (left: SelectedStream, right: SelectedStream) => {
  if (left.streamIndex !== right.streamIndex) return false;
  if (left.fileIndex === undefined || right.fileIndex === undefined) return true;
  return left.fileIndex === right.fileIndex;
};

const formatVideoLabel = (stream: FFprobeData['streams'][number]) => {
  const fps = formatFps(stream.r_frame_rate || stream.avg_frame_rate).replace(' fps', '');
  const bitrate = stream.bit_rate ? `${Math.round(Number.parseInt(stream.bit_rate, 10) / 1000)} kbps` : 'N/A';
  return `[${stream.codec_name}] ${(stream.width || '?')}x${(stream.height || '?')} @ ${fps}fps - ${bitrate}`;
};

const formatAudioLabel = (stream: FFprobeData['streams'][number], includeTitle: boolean) => {
  const lang = stream.tags?.language ? stream.tags.language.toUpperCase() : 'UND';
  const title = stream.tags?.title ? ` - "${stream.tags.title}"` : '';
  const hz = stream.sample_rate ? `${Math.round(Number.parseInt(stream.sample_rate, 10) / 1000)} kHz` : 'N/A';
  const bitrate = stream.bit_rate ? `${Math.round(Number.parseInt(stream.bit_rate, 10) / 1000)} kbps` : 'N/A';
  const channels = formatChannels(stream.channels);

  if (includeTitle) {
    return `[${stream.codec_name}] (${lang})${title} ${channels} Ch | ${hz} | ${bitrate}`;
  }

  return `[${stream.codec_name}] (${lang}) ${channels} Ch | ${hz} | ${bitrate}`;
};

const formatSubtitleLabel = (stream: FFprobeData['streams'][number]) => {
  const lang = stream.tags?.language ? stream.tags.language.toUpperCase() : 'UND';
  const title = stream.tags?.title ? ` - "${stream.tags.title}"` : '';
  const status = isImageSubtitle(stream.codec_name)
    ? pc.yellow(` ⚠ ${t('checkBurnIn')}`)
    : pc.green(` ✔ ${t('checkSafe')}`);

  return `[${formatSubtitleCodec(stream.codec_name)}] (${lang})${title}${status}`;
};

export function buildGroupedOptions(params: BuildStreamOptionsParams): BuildStreamOptionsResult {
  const groupVideo = t('groupVideo');
  const groupAudio = t('groupAudio');
  const groupSubs = t('groupSubs');

  const groups: GroupedStreamOptions = {
    [groupVideo]: [],
    [groupAudio]: [],
    [groupSubs]: []
  };
  const initialValues: SelectedStream[] = [];
  const allAudioStreams: SelectedStream[] = [];

  params.sources.forEach((source) => {
    source.info.streams.forEach((stream) => {
      if (!params.includeAttachedPictures && isAttachedPic(stream)) return;

      const value: SelectedStream = {
        streamIndex: stream.index,
        type: stream.codec_type,
        codec: stream.codec_name
      };

      if (source.fileIndex !== undefined) {
        value.fileIndex = source.fileIndex;
      }

      const suffix = source.label ? t('fileSuffix', source.label) : '';
      let label = '';

      if (stream.codec_type === 'video') {
        if (isAttachedPic(stream)) {
          label = `[${stream.codec_name}] ${t('checkCover')}`;
        } else {
          label = formatVideoLabel(stream);
        }
      } else if (stream.codec_type === 'audio') {
        label = formatAudioLabel(stream, params.includeAudioTitle ?? true);
        allAudioStreams.push(value);
      } else if (stream.codec_type === 'subtitle') {
        label = formatSubtitleLabel(stream);
      } else {
        label = `[${stream.codec_type}] ${stream.codec_name}`;
      }

      const option = { value, label: `${label}${suffix}` };

      if (stream.codec_type === 'video') groups[groupVideo]!.push(option);
      else if (stream.codec_type === 'audio') groups[groupAudio]!.push(option);
      else groups[groupSubs]!.push(option);

      if (params.currentSelected) {
        if (params.currentSelected.some((selected) => matchesSelectedStream(selected, value))) {
          initialValues.push(value);
        }
      } else {
        // Initial Selection without prior currentSelected
        if (stream.codec_type === 'video') {
          if (params.preferredSourceLabel && source.label === params.preferredSourceLabel) {
            initialValues.push(value);
          }
        } else if (stream.codec_type === 'audio') {
          if (params.preferredAudio && params.preferredAudio.length > 0) {
            if (matchesLanguage(stream.tags?.language, params.preferredAudio)) {
              initialValues.push(value);
            }
          }
        } else if (stream.codec_type === 'subtitle') {
          if (params.preferredSubtitles && params.preferredSubtitles.length > 0) {
            if (matchesLanguage(stream.tags?.language, params.preferredSubtitles)) {
              initialValues.push(value);
            }
          }
        }
      }
    });
  });

  let hasAudioFallback = false;
  // Audio fallback check: if preferredAudio was configured, audio streams exist, but none matched
  if (!params.currentSelected && params.preferredAudio && params.preferredAudio.length > 0 && allAudioStreams.length > 0) {
    const selectedAudioCount = initialValues.filter((s) => s.type === 'audio').length;
    if (selectedAudioCount === 0) {
      initialValues.push(...allAudioStreams);
      hasAudioFallback = true;
    }
  }

  (Object.keys(groups) as Array<keyof GroupedStreamOptions>).forEach((key) => {
    if (groups[key]!.length === 0) delete groups[key];
  });

  return { groups, initialValues, hasAudioFallback };
}

