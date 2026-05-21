import { t } from '../utils/i18n.ts';
import pc from 'picocolors';
import {
  formatBitrate,
  formatChannels,
  formatFps,
  formatSampleRate,
  formatSubtitleCodec,
  getBitDepth,
  padLabel
} from '../utils/formatters.ts';
import type { CheckDiagnostic } from '../services/analyzer.ts';

const renderCompatibilityStatus = (status: boolean | string | undefined, key: string | null) => {
  if (!key) return pc.dim(t('checkUnknown'));
  if (status === true) return pc.green(t('checkDirectPlay'));
  if (status === false) return pc.red(t('checkTranscode'));
  if (typeof status === 'string') return `${pc.yellow(t('checkConditional'))} ${t(status)}`;
  return pc.gray(`${t('checkUnknown')} (${key})`);
};

const renderClientBadge = (badge: 'green' | 'yellow' | 'red') => {
  if (badge === 'green') return pc.green(t('badgeGreen'));
  if (badge === 'red') return pc.red(t('badgeTranscode'));
  return pc.yellow(t('badgeWarning'));
};

export function renderMatrix(diagnostic: CheckDiagnostic) {
  const { metadata, compatibility } = diagnostic;
  const containerKey = metadata.containerKey;
  const videoKey = metadata.videoKey;
  const audioKey = metadata.audioKey;

  let resultText = `\n${pc.bold(t('checkFile'))} ${metadata.fileName}\n${pc.bold(t('checkContainer'))} ${containerKey}  |  ${pc.bold(t('checkVideo'))} ${videoKey ?? t('checkUnknown')}  |  ${pc.bold(t('checkAudio'))} ${metadata.audioStreams.length} ${t('checkTrack')}\n\n${pc.bold(pc.cyan(t('checkMatrixTitle')))}\n`;

  compatibility.entries.forEach((entry) => {
    resultText += `\n${pc.bold(entry.client.toUpperCase())} ${renderClientBadge(entry.badge)}\n  Container: ${renderCompatibilityStatus(entry.container, containerKey)}\n  Vídeo:     ${renderCompatibilityStatus(entry.video, videoKey)}\n  Áudio:     ${renderCompatibilityStatus(entry.audio, audioKey)}\n`;
  });

  return resultText.trim();
}

export function renderActionPlan(diagnostic: CheckDiagnostic) {
  const { metadata, selection, actionPlan } = diagnostic;
  const lines: string[] = [];

  lines.push(pc.bold(t('checkContainer').replace(':', '').toUpperCase()));
  if (selection.isContainerCompatible) {
    lines.push(`  ${padLabel(t('checkFormat'))} ${pc.green(`${actionPlan.container.current.toUpperCase()} ✔`)}`);
  } else {
    lines.push(`  ${padLabel(t('checkFormat'))} ${pc.dim(actionPlan.container.current.toUpperCase())} ➔ ${pc.yellow(actionPlan.container.target.toUpperCase())}`);
  }
  lines.push('');

  if (actionPlan.video && metadata.primaryVideoStream) {
    const videoStream = metadata.primaryVideoStream;
    const vFps = formatFps(videoStream.r_frame_rate || videoStream.avg_frame_rate);
    const vBitrate = formatBitrate(videoStream.bit_rate);
    const vDepth = getBitDepth(videoStream);
    const vRes = `${videoStream.width || '?'}x${videoStream.height || '?'}`;
    const vCodecOriginal = metadata.videoKey ? metadata.videoKey.toUpperCase() : t('unknown');
    const [targetNameBase] = actionPlan.video.targetCodec.split('_');
    const targetName = (targetNameBase ?? actionPlan.video.targetCodec).toUpperCase();

    lines.push(pc.bold(t('checkVideo').replace(':', '').toUpperCase()));

    if (selection.isVideoCompatible) {
      lines.push(`  ${padLabel(t('checkCodec'))} ${pc.green(`${vCodecOriginal} ✔`)}\n  ${padLabel(t('checkRes'))} ${pc.dim(vRes)}\n  ${padLabel(t('checkFps'))} ${pc.dim(vFps)}\n  ${padLabel(t('checkBitDepth'))} ${pc.dim(vDepth)}\n  ${padLabel(t('checkBitrate'))} ${pc.dim(vBitrate)}`);
    } else {
      lines.push(`  ${padLabel(t('checkCodec'))} ${pc.dim(vCodecOriginal)} ➔ ${pc.yellow(targetName)}\n  ${padLabel(t('checkRes'))} ${pc.dim(vRes)}\n  ${padLabel(t('checkFps'))} ${pc.dim(vFps)}\n  ${padLabel(t('checkBitDepth'))} ${vDepth === actionPlan.video.targetDepth ? pc.dim(actionPlan.video.targetDepth) : `${pc.dim(vDepth)} ➔ ${pc.yellow(actionPlan.video.targetDepth)}`}\n  ${padLabel(t('checkBitrate'))} ${pc.dim(vBitrate)} ➔ ${pc.yellow(t('visuallyLossless'))}`);
    }

    lines.push('');
  }

  if (actionPlan.audio.length > 0) {
    lines.push(pc.bold(t('checkAudio').replace(':', '').toUpperCase()));

    actionPlan.audio.forEach((decision) => {
      const stream = decision.stream;
      const aSampleRate = formatSampleRate(stream.sample_rate);
      const aBitrate = formatBitrate(stream.bit_rate);
      const audioChannels = stream.channels || 2;
      const aChannelsStr = formatChannels(audioChannels);
      const aCodecOriginal = stream.codec_name ? stream.codec_name.toUpperCase() : t('unknown');
      const trackLbl = actionPlan.audio.length > 1 ? t('trackNum', decision.trackNumber) : t('checkCodec');
      const targetBitrateStr = decision.isLossless
        ? t('lossless')
        : decision.targetBitrateKbps !== null
          ? `${decision.targetBitrateKbps} kbps`
          : t('unknown');

      if (decision.compatible) {
        lines.push(`  ${padLabel(trackLbl)} ${pc.green(`${aCodecOriginal} ✔`)}\n  ${padLabel(t('checkChannels'))} ${pc.dim(aChannelsStr)}\n  ${padLabel(t('checkSample'))} ${pc.dim(aSampleRate)}\n  ${padLabel(t('checkBitrate'))} ${pc.dim(aBitrate)}\n`);
      } else {
        lines.push(`  ${padLabel(trackLbl)} ${pc.dim(aCodecOriginal)} ➔ ${pc.yellow(decision.targetCodec.toUpperCase())}\n  ${padLabel(t('checkChannels'))} ${pc.dim(aChannelsStr)}\n  ${padLabel(t('checkSample'))} ${pc.dim(aSampleRate)}\n  ${padLabel(t('checkBitrate'))} ${pc.dim(aBitrate)} ➔ ${pc.yellow(targetBitrateStr)}\n`);
      }
    });
  }

  if (actionPlan.subtitles.length > 0) {
    lines.push(pc.bold(t('checkSubs')));

    actionPlan.subtitles.forEach((decision) => {
      const stream = decision.stream;
      const lang = stream.tags?.language ? stream.tags.language.toUpperCase() : 'UND';
      const codec = formatSubtitleCodec(stream.codec_name);

      if (!decision.isImage) {
        lines.push(`  ${t('trackNum', decision.trackNumber)} ${pc.green(`${codec} ✔`)} | ${t('checkLang')} ${pc.dim(lang)} | ${t('checkStatus')} ${pc.green(t('checkSafe'))}`);
      } else {
        lines.push(`  ${t('trackNum', decision.trackNumber)} ${pc.yellow(`${codec} ⚠`)} | ${t('checkLang')} ${pc.dim(lang)} | ${t('checkStatus')} ${pc.yellow(t('checkBurnIn'))}`);
      }
    });

    lines.push('');
  }

  if (actionPlan.extras.length > 0) {
    lines.push(pc.bold(t('checkExtras')));

    actionPlan.extras.forEach((decision) => {
      const stream = decision.stream;
      lines.push(`  ${t('trackNum', stream.index)} ${pc.yellow(`${stream.codec_name.toUpperCase()} ⚠`)} | ${t('checkType')} ${pc.dim(t('checkCover'))} | ${t('checkStatus')} ${pc.yellow(t('checkFpsRisk'))}`);
    });

    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
