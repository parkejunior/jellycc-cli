import { t } from '../utils/i18n.ts';
import { text, cancel, note, confirm, groupMultiselect } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';

import { onCancel, sanitizePath, handleExecutionMenu } from '../utils/ui.ts';
import { runQuickScan, getMediaInfo } from '../utils/ffprobe.ts';
import { buildCheckCommand } from '../utils/builder.ts';
import { formatFps, formatBitrate, getBitDepth, formatSampleRate, formatChannels, padLabel, isImageSubtitle, formatSubtitleCodec, isAttachedPic, calculateTotalFrames } from '../utils/formatters.ts';

import supportMatrix from '../../dist/matrix.json' with { type: 'json' };
import fallbackRules from '../../dist/rules.json' with { type: 'json' };

export async function checkCommand(args: string[]) {
  const deepScanFlag = args.includes('--deep-scan');
  let rawPathArg = args.find(a => a !== '--deep-scan');
  let videoPath = sanitizePath(rawPathArg);

  if (!videoPath) {
    let rawPath = onCancel(await text({
      message: t('checkAskVideo'),
      placeholder: './filme.mkv',
      validate(value) {
        const clean = sanitizePath(value);
        if (!clean) return t('pathRequired');
        if (!fs.existsSync(clean)) return t('fileNotFound');
      }
    }));
    videoPath = sanitizePath(rawPath);
  } else if (!fs.existsSync(videoPath)) {
    cancel(t('filePassedNotFound'));
    process.exit(1);
  }

  runQuickScan(videoPath as string);

  const clients = Object.keys(supportMatrix.clients);
  const probeData = getMediaInfo(videoPath as string);
  const totalDuration = probeData.format && probeData.format.duration ? parseFloat(probeData.format.duration) : 0;
  
  const videoStream = probeData.streams.find((st: any) => st.codec_type === 'video' && !isAttachedPic(st));
  const audioStreams = probeData.streams.filter((st: any) => st.codec_type === 'audio');
  const attachedPics = probeData.streams.filter((st: any) => st.codec_type === 'video' && isAttachedPic(st));
  const subStreams = probeData.streams.filter((st: any) => st.codec_type === 'subtitle');
  
  const totalFrames = calculateTotalFrames(videoStream, totalDuration);
  const ext = path.extname(videoPath as string).toLowerCase().replace('.', '');

  const mapContainer = (fmt: string) => {
    if (fmt.includes('matroska')) return 'mkv';
    if (fmt.includes('mp4') || fmt.includes('mov')) return 'mp4';
    if (fmt.includes('webm')) return 'webm';
    return ext; 
  };

  const mapVideoCodec = (stream: any) => {
    if (!stream) return null;
    let codec = stream.codec_name; 
    const is10bit = stream.pix_fmt && stream.pix_fmt.includes('10');
    if (codec === 'h264') return is10bit ? 'h264_10bit' : 'h264_8bit';
    if (codec === 'hevc') return is10bit ? 'hevc_10bit' : 'hevc_8bit';
    return codec;
  };

  const cKey = mapContainer(probeData.format.format_name);
  const vKey = mapVideoCodec(videoStream);
  const aKey = audioStreams.length > 0 ? audioStreams[0].codec_name : null;

  const formatResult = (status: any, key: any) => {
    if (!key) return pc.dim(t('checkUnknown'));
    if (status === true) return pc.green(t('checkDirectPlay'));
    if (status === false) return pc.red(t('checkTranscode'));
    if (typeof status === 'string') return `${pc.yellow(t('checkConditional'))} ${status}`;
    return pc.gray(`${t('checkUnknown')} (${key})`);
  };

  let resultText = `\n${pc.bold(t('checkFile'))} ${path.basename(videoPath as string)}\n${pc.bold(t('checkContainer'))} ${cKey}  |  ${pc.bold(t('checkVideo'))} ${vKey}  |  ${pc.bold(t('checkAudio'))} ${audioStreams.length} ${t('checkTrack')}\n\n${pc.bold(pc.cyan(t('checkMatrixTitle')))}\n`;

  for (const client of clients) {
    const matrix = (supportMatrix.clients as any)[client];
    const cStatus = matrix.containers[cKey];
    const vStatus = matrix.video[vKey];
    const aStatus = matrix.audio[aKey];

    let badge = (cStatus === true && vStatus === true && aStatus === true) ? pc.green('[Tudo Verde]') : 
                (cStatus === false || vStatus === false || aStatus === false) ? pc.red('[Requer Transcode]') : pc.yellow('[Atenção/Condicional]');

    resultText += `\n${pc.bold(client.toUpperCase())} ${badge}\n  Container: ${formatResult(cStatus, cKey)}\n  Vídeo:     ${formatResult(vStatus, vKey)}\n  Áudio:     ${formatResult(aStatus, aKey)}\n`;
  }
  note(resultText.trim(), t('checkMatrixResults'));

  const isContainerCompatible = cKey === fallbackRules.container;
  const isVideoCompatible = vKey === fallbackRules.video.target;
  
  const modLines: string[] = [];
  modLines.push(pc.bold(t('checkContainer').replace(':', '').toUpperCase()));
  modLines.push(cKey !== fallbackRules.container ? `  ${padLabel(t('checkFormat'))} ${pc.dim(cKey.toUpperCase())} ➔ ${pc.yellow(fallbackRules.container.toUpperCase())}` : `  ${padLabel(t('checkFormat'))} ${pc.green(cKey.toUpperCase() + ' ✔')}`);
  modLines.push('');

  if (videoStream) {
    modLines.push(pc.bold(t('checkVideo').replace(':', '').toUpperCase()));
    const vFps = formatFps(videoStream.r_frame_rate || videoStream.avg_frame_rate);
    const vBitrate = formatBitrate(videoStream.bit_rate);
    const vDepth = getBitDepth(videoStream);
    const vRes = `${videoStream.width || '?'}x${videoStream.height || '?'}`;
    const vCodecOriginal = vKey ? vKey.toUpperCase() : 'DESCONHECIDO';

    if (isVideoCompatible) {
      modLines.push(`  ${padLabel(t('checkCodec'))} ${pc.green(vCodecOriginal + ' ✔')}\n  ${padLabel(t('checkRes'))} ${pc.dim(vRes)}\n  ${padLabel(t('checkFps'))} ${pc.dim(vFps)}\n  ${padLabel(t('checkBitDepth'))} ${pc.dim(vDepth)}\n  ${padLabel(t('checkBitrate'))} ${pc.dim(vBitrate)}`);
    } else {
      modLines.push(`  ${padLabel(t('checkCodec'))} ${pc.dim(vCodecOriginal)} ➔ ${pc.yellow('H.264')}\n  ${padLabel(t('checkRes'))} ${pc.dim(vRes)}\n  ${padLabel(t('checkFps'))} ${pc.dim(vFps)}\n  ${padLabel(t('checkBitDepth'))} ${vDepth === '8-bit' ? pc.dim('8-bit') : `${pc.dim(vDepth)} ➔ ${pc.yellow('8-bit')}`}\n  ${padLabel(t('checkBitrate'))} ${pc.dim(vBitrate)} ➔ ${pc.yellow('Visually Lossless (CRF 18)')}`);
    }
    modLines.push('');
  }

  if (audioStreams.length > 0) {
    modLines.push(pc.bold(t('checkAudio').replace(':', '').toUpperCase()));
    audioStreams.forEach((aStream: any, index: number) => {
      const aSampleRate = formatSampleRate(aStream.sample_rate);
      const aBitrate = formatBitrate(aStream.bit_rate);
      const audioChannels = aStream.channels || 2;
      const aChannelsStr = formatChannels(audioChannels);
      const aCodecOriginal = aStream.codec_name ? aStream.codec_name.toUpperCase() : 'DESCONHECIDO';
      const trackLbl = audioStreams.length > 1 ? `Faixa ${index + 1}:` : t('checkCodec');

      if (fallbackRules.audio.acceptable.includes(aStream.codec_name)) {
        modLines.push(`  ${padLabel(trackLbl)} ${pc.green(aCodecOriginal + ' ✔')}\n  ${padLabel(t('checkChannels'))} ${pc.dim(aChannelsStr)}\n  ${padLabel(t('checkSample'))} ${pc.dim(aSampleRate)}\n  ${padLabel(t('checkBitrate'))} ${pc.dim(aBitrate)}\n`);
      } else {
        const map = (fallbackRules.audio.mappings as any)[aStream.codec_name] || fallbackRules.audio.mappings.default;
        let targetBitrateStr = 'Lossless';
        if (map.target !== 'flac') {
          const sourceKbps = aStream.bit_rate ? Math.round(parseInt(aStream.bit_rate) / 1000) : Infinity;
          let finalKbps = Math.min(audioChannels * 112, sourceKbps);
          if (map.target === 'eac3') finalKbps = Math.min(finalKbps, 768);
          targetBitrateStr = `${finalKbps} kbps`;
        }
        modLines.push(`  ${padLabel(trackLbl)} ${pc.dim(aCodecOriginal)} ➔ ${pc.yellow(map.target.toUpperCase())}\n  ${padLabel(t('checkChannels'))} ${pc.dim(aChannelsStr)}\n  ${padLabel(t('checkSample'))} ${pc.dim(aSampleRate)}\n  ${padLabel(t('checkBitrate'))} ${pc.dim(aBitrate)} ➔ ${pc.yellow(targetBitrateStr)}\n`);
      }
    });
  }

  if (subStreams.length > 0) {
    modLines.push(pc.bold(t('checkSubs')));
    subStreams.forEach((sStream: any, index: number) => {
      const lang = sStream.tags?.language ? sStream.tags.language.toUpperCase() : 'UND';
      const codec = formatSubtitleCodec(sStream.codec_name);
      if (!isImageSubtitle(sStream.codec_name)) {
        modLines.push(`  Faixa ${index + 1}: ${pc.green(codec + ' ✔')} | ${t('checkLang')} ${pc.dim(lang)} | ${t('checkStatus')} ${pc.green(t('checkSafe'))}`);
      } else {
        modLines.push(`  Faixa ${index + 1}: ${pc.yellow(codec + ' ⚠')} | ${t('checkLang')} ${pc.dim(lang)} | ${t('checkStatus')} ${pc.yellow(t('checkBurnIn'))}`);
      }
    });
    modLines.push('');
  }

  if (attachedPics.length > 0) {
    modLines.push(pc.bold(t('checkExtras')));
    attachedPics.forEach((st: any) => {
      modLines.push(`  Faixa ${st.index}: ${pc.yellow(st.codec_name.toUpperCase() + ' ⚠')} | ${t('checkType')} ${pc.dim(t('checkCover'))} | ${t('checkStatus')} ${pc.yellow(t('checkFpsRisk'))}`);
    });
    modLines.push('');
  }

  note(modLines.join('\n').trimEnd(), t('checkActionPlan'));

  const hasGarbage = attachedPics.length > 0 || subStreams.some((st: any) => isImageSubtitle(st.codec_name));
  let autoClean = false;
  
  if (hasGarbage) {
    autoClean = await confirm({
      message: pc.yellow(t('checkGarbageDetected')),
      initialValue: true
    }) as boolean;
    if (onCancel(autoClean) === false) autoClean = false;
  }

  let selectedStreams = probeData.streams.map((s: any) => ({
    streamIndex: s.index,
    type: s.codec_type,
    codec: s.codec_name
  }));

  if (autoClean) {
    selectedStreams = selectedStreams.filter((s: any) => {
      const fullStream = probeData.streams.find((st: any) => st.index === s.streamIndex);
      if (s.type === 'video' && fullStream?.disposition?.attached_pic === 1) return false;
      if (s.type === 'video' && ['mjpeg', 'png', 'bmp'].includes(s.codec)) return false;
      if (s.type === 'subtitle' && isImageSubtitle(s.codec)) return false;
      return true;
    });
  }

  const buildGroupedOptions = (info: any, currentSelected: any[]) => {
    const groups: Record<string, any[]> = { '🎬 Vídeo': [], '🔊 Áudio': [], '💬 Legendas e Outros': [] };
    const initialValues: any[] = [];

    info.streams.forEach((s: any) => {
      let label = '';
      const lang = s.tags && s.tags.language ? s.tags.language.toUpperCase() : 'UND';
      const title = s.tags && s.tags.title ? ` - "${s.tags.title}"` : '';

      if (s.codec_type === 'video') {
        if (isAttachedPic(s)) {
          label = `[${s.codec_name}] ${t('checkCover')}`;
        } else {
          const fps = formatFps(s.r_frame_rate || s.avg_frame_rate).replace(' fps', '');
          const bitrate = s.bit_rate ? Math.round(parseInt(s.bit_rate) / 1000) + ' kbps' : 'N/A';
          label = `[${s.codec_name}] ${s.width}x${s.height} @ ${fps}fps - ${bitrate}`;
        }
      } else if (s.codec_type === 'audio') {
        const hz = s.sample_rate ? Math.round(parseInt(s.sample_rate) / 1000) + ' kHz' : 'N/A';
        const bitrate = s.bit_rate ? Math.round(parseInt(s.bit_rate) / 1000) + ' kbps' : 'N/A';
        const channels = s.channels === 6 ? '5.1' : s.channels === 2 ? 'Stereo' : s.channels;
        label = `[${s.codec_name}] (${lang})${title} ${channels} Ch | ${hz} | ${bitrate}`;
      } else if (s.codec_type === 'subtitle') {
        const subStatus = isImageSubtitle(s.codec_name) ? pc.yellow(` ⚠ ${t('checkBurnIn')}`) : pc.green(` ✔ ${t('checkSafe')}`);
        label = `[${formatSubtitleCodec(s.codec_name)}] (${lang})${title}${subStatus}`;
      } else {
        label = `[${s.codec_type}] ${s.codec_name}`;
      }

      const valueObj = { streamIndex: s.index, type: s.codec_type, codec: s.codec_name };

      if (s.codec_type === 'video') groups['🎬 Vídeo']!.push({ value: valueObj, label });
      else if (s.codec_type === 'audio') groups['🔊 Áudio']!.push({ value: valueObj, label });
      else groups['💬 Legendas e Outros']!.push({ value: valueObj, label });

      if (currentSelected.some((cs: any) => cs.streamIndex === s.index)) {
        initialValues.push(valueObj);
      }
    });

    Object.keys(groups).forEach(k => { if (groups[k]!.length === 0) delete groups[k]; });
    return { groups, initialValues };
  };

  let menuLoop = true;
  let dsCompleted = deepScanFlag;
  let hasMediaErrors = false;

  while (menuLoop) {
    const selectedAudios = selectedStreams.filter((s: any) => s.type === 'audio');
    const isAudioCompatible = selectedAudios.length === 0 || selectedAudios.every((s: any) => fallbackRules.audio.acceptable.includes(s.codec));

    const needsTranscode = !isContainerCompatible || !isVideoCompatible || !isAudioCompatible;
    const streamsDropped = selectedStreams.length < probeData.streams.length;

    const needsAction = needsTranscode || streamsDropped;
    const isJustRemux = !needsTranscode && streamsDropped;

    const dir = path.dirname(videoPath as string);
    const name = path.basename(videoPath as string, path.extname(videoPath as string));
    const outputPath = path.join(dir, `${name}.jellycc.${fallbackRules.container}`);

    const ffmpegCmd = buildCheckCommand(selectedStreams, probeData, fallbackRules, isVideoCompatible, videoPath as string, outputPath, false);
    const ffmpegRepairCmd = buildCheckCommand(selectedStreams, probeData, fallbackRules, isVideoCompatible, videoPath as string, outputPath, true);

    if (!needsAction) {
      note(pc.green(t('checkPerfect')), t('readyToUse'));
    } else if (isJustRemux) {
      const droppedCount = probeData.streams.length - selectedStreams.length;
      note(pc.cyan(`${t('checkRemuxOnly', droppedCount)}\n\n${pc.yellow(ffmpegCmd)}`), t('checkRemuxCmd'));
    } else {
      note(pc.yellow(ffmpegCmd), t('checkTranscodeCmd'));
    }

    const result = await handleExecutionMenu({
      ffmpegCmd,
      ffmpegRepairCmd,
      originalPath: videoPath as string,
      outputPath,
      totalDuration,
      totalFrames,
      isPerfect: !needsAction,
      isJustRemux,
      deepScanCompleted: dsCompleted,
      hasErrors: hasMediaErrors,
      isMerge: false,
      allowStreamSelection: true
    });

    dsCompleted = result.deepScanCompleted;
    hasMediaErrors = result.hasErrors;

    if (result.action === 'select_streams') {
      const { groups, initialValues } = buildGroupedOptions(probeData, selectedStreams);
      selectedStreams = onCancel(await groupMultiselect({
        message: t('checkSelectKeep'),
        options: groups,
        required: true,
        initialValues: initialValues,
      })) as any[];
    } else {
      menuLoop = false;
    }
  }
}