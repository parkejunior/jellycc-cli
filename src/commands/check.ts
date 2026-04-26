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
      message: 'Qual é o caminho do arquivo de vídeo?',
      placeholder: './filme.mkv',
      validate(value) {
        const clean = sanitizePath(value);
        if (!clean) return 'O caminho é obrigatório!';
        if (!fs.existsSync(clean)) return 'Arquivo não encontrado no disco!';
      }
    }));
    videoPath = sanitizePath(rawPath);
  } else if (!fs.existsSync(videoPath)) {
    cancel('O arquivo passado como argumento não foi encontrado no disco!');
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
    if (!key) return pc.dim('N/A');
    if (status === true) return pc.green('✔ Direct Play');
    if (status === false) return pc.red('✖ Transcode');
    if (typeof status === 'string') return `${pc.yellow('⚠ Condicional:')} ${status}`;
    return pc.gray(`? Desconhecido (${key})`);
  };

  let resultText = `\n${pc.bold('📁 Arquivo:')} ${path.basename(videoPath as string)}\n${pc.bold('📦 Container:')} ${cKey}  |  ${pc.bold('🎥 Vídeo:')} ${vKey}  |  ${pc.bold('🔊 Áudio(s):')} ${audioStreams.length} faixa(s)\n\n${pc.bold(pc.cyan('--- Compatibilidade por Cliente ---'))}\n`;

  for (const client of clients) {
    const matrix = (supportMatrix.clients as any)[client];
    const cStatus = matrix.containers[cKey];
    const vStatus = matrix.video[vKey];
    const aStatus = matrix.audio[aKey];

    let badge = (cStatus === true && vStatus === true && aStatus === true) ? pc.green('[Tudo Verde]') : 
                (cStatus === false || vStatus === false || aStatus === false) ? pc.red('[Requer Transcode]') : pc.yellow('[Atenção/Condicional]');

    resultText += `\n${pc.bold(client.toUpperCase())} ${badge}\n  Container: ${formatResult(cStatus, cKey)}\n  Vídeo:     ${formatResult(vStatus, vKey)}\n  Áudio:     ${formatResult(aStatus, aKey)}\n`;
  }
  note(resultText.trim(), 'Resultados da Matriz Jellyfin');

  const isContainerCompatible = cKey === fallbackRules.container;
  const isVideoCompatible = vKey === fallbackRules.video.target;
  
  const modLines: string[] = [];
  modLines.push(pc.bold('📦 CONTAINER'));
  modLines.push(cKey !== fallbackRules.container ? `  ${padLabel('Formato:')} ${pc.dim(cKey.toUpperCase())} ➔ ${pc.yellow(fallbackRules.container.toUpperCase())}` : `  ${padLabel('Formato:')} ${pc.green(cKey.toUpperCase() + ' ✔')}`);
  modLines.push('');

  if (videoStream) {
    modLines.push(pc.bold('🎥 VÍDEO'));
    const vFps = formatFps(videoStream.r_frame_rate || videoStream.avg_frame_rate);
    const vBitrate = formatBitrate(videoStream.bit_rate);
    const vDepth = getBitDepth(videoStream);
    const vRes = `${videoStream.width || '?'}x${videoStream.height || '?'}`;
    const vCodecOriginal = vKey ? vKey.toUpperCase() : 'DESCONHECIDO';

    if (isVideoCompatible) {
      modLines.push(`  ${padLabel('Codec:')} ${pc.green(vCodecOriginal + ' ✔')}\n  ${padLabel('Resolução:')} ${pc.dim(vRes)}\n  ${padLabel('FPS:')} ${pc.dim(vFps)}\n  ${padLabel('Bit Depth:')} ${pc.dim(vDepth)}\n  ${padLabel('Bitrate:')} ${pc.dim(vBitrate)}`);
    } else {
      modLines.push(`  ${padLabel('Codec:')} ${pc.dim(vCodecOriginal)} ➔ ${pc.yellow('H.264')}\n  ${padLabel('Resolução:')} ${pc.dim(vRes)}\n  ${padLabel('FPS:')} ${pc.dim(vFps)}\n  ${padLabel('Bit Depth:')} ${vDepth === '8-bit' ? pc.dim('8-bit') : `${pc.dim(vDepth)} ➔ ${pc.yellow('8-bit')}`}\n  ${padLabel('Bitrate:')} ${pc.dim(vBitrate)} ➔ ${pc.yellow('Visually Lossless (CRF 18)')}`);
    }
    modLines.push('');
  }

  if (audioStreams.length > 0) {
    modLines.push(pc.bold('🔊 ÁUDIO'));
    audioStreams.forEach((aStream: any, index: number) => {
      const aSampleRate = formatSampleRate(aStream.sample_rate);
      const aBitrate = formatBitrate(aStream.bit_rate);
      const audioChannels = aStream.channels || 2;
      const aChannelsStr = formatChannels(audioChannels);
      const aCodecOriginal = aStream.codec_name ? aStream.codec_name.toUpperCase() : 'DESCONHECIDO';
      const trackLbl = audioStreams.length > 1 ? `Faixa ${index + 1}:` : 'Codec:';

      if (fallbackRules.audio.acceptable.includes(aStream.codec_name)) {
        modLines.push(`  ${padLabel(trackLbl)} ${pc.green(aCodecOriginal + ' ✔')}\n  ${padLabel('Canais:')} ${pc.dim(aChannelsStr)}\n  ${padLabel('Sample:')} ${pc.dim(aSampleRate)}\n  ${padLabel('Bitrate:')} ${pc.dim(aBitrate)}\n`);
      } else {
        const map = (fallbackRules.audio.mappings as any)[aStream.codec_name] || fallbackRules.audio.mappings.default;
        let targetBitrateStr = 'Lossless';
        if (map.target !== 'flac') {
          const sourceKbps = aStream.bit_rate ? Math.round(parseInt(aStream.bit_rate) / 1000) : Infinity;
          let finalKbps = Math.min(audioChannels * 112, sourceKbps);
          if (map.target === 'eac3') finalKbps = Math.min(finalKbps, 768);
          targetBitrateStr = `${finalKbps} kbps`;
        }
        modLines.push(`  ${padLabel(trackLbl)} ${pc.dim(aCodecOriginal)} ➔ ${pc.yellow(map.target.toUpperCase())}\n  ${padLabel('Canais:')} ${pc.dim(aChannelsStr)}\n  ${padLabel('Sample:')} ${pc.dim(aSampleRate)}\n  ${padLabel('Bitrate:')} ${pc.dim(aBitrate)} ➔ ${pc.yellow(targetBitrateStr)}\n`);
      }
    });
  }

  if (subStreams.length > 0) {
    modLines.push(pc.bold('💬 LEGENDAS'));
    subStreams.forEach((sStream: any, index: number) => {
      const lang = sStream.tags?.language ? sStream.tags.language.toUpperCase() : 'UND';
      const codec = formatSubtitleCodec(sStream.codec_name);
      if (!isImageSubtitle(sStream.codec_name)) {
        modLines.push(`  Faixa ${index + 1}: ${pc.green(codec + ' ✔')} | Idioma: ${pc.dim(lang)} | Status: ${pc.green('Direct Play Seguro')}`);
      } else {
        modLines.push(`  Faixa ${index + 1}: ${pc.yellow(codec + ' ⚠')} | Idioma: ${pc.dim(lang)} | Status: ${pc.yellow('Risco de Burn-in (Transcoding)')}`);
      }
    });
    modLines.push('');
  }

  if (attachedPics.length > 0) {
    modLines.push(pc.bold('🖼️ ANEXOS E EXTRAS'));
    attachedPics.forEach((st: any) => {
      modLines.push(`  Faixa ${st.index}: ${pc.yellow(st.codec_name.toUpperCase() + ' ⚠')} | Tipo: ${pc.dim('Capa / Thumbnail')} | Status: ${pc.yellow('Risco de corromper FPS')}`);
    });
    modLines.push('');
  }

  note(modLines.join('\n').trimEnd(), 'Ação Planejada (Detalhada)');

  // --- Pergunta Automática de Limpeza ---
  const hasGarbage = attachedPics.length > 0 || subStreams.some((st: any) => isImageSubtitle(st.codec_name));
  let autoClean = false;
  
  if (hasGarbage) {
    autoClean = await confirm({
      message: pc.yellow('⚠ Lixos embutidos detectados (Capas ou Legendas PGS). Deseja removê-los automaticamente da versão final?'),
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
          label = `[${s.codec_name}] Capa / Imagem Anexada`;
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
        const subStatus = isImageSubtitle(s.codec_name) ? pc.yellow(" ⚠ Risco de Burn-in") : pc.green(" ✔ Seguro");
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

    const ffmpegCmd = buildCheckCommand(selectedStreams, probeData, fallbackRules, isVideoCompatible, videoPath as string, outputPath);

    if (!needsAction) {
      note(pc.green('✔ O arquivo atende perfeitamente às regras e contém todas as faixas originais. Nenhuma ação extra é necessária.'), 'Pronto para uso');
    } else if (isJustRemux) {
      const droppedCount = probeData.streams.length - selectedStreams.length;
      note(pc.cyan(`ℹ O arquivo requer apenas uma limpeza (Remux). Você descartou ${droppedCount} faixa(s).\n\n${pc.yellow(ffmpegCmd)}`), 'Comando de Limpeza Sugerido');
    } else {
      note(pc.yellow(ffmpegCmd), 'Comando FFmpeg Sugerido (Transcode + Limpeza)');
    }

    const result = await handleExecutionMenu({
      ffmpegCmd,
      originalPath: videoPath as string,
      outputPath,
      totalDuration,
      totalFrames,
      isPerfect: !needsAction,
      isJustRemux,
      deepScanCompleted: dsCompleted,
      isMerge: false,
      allowStreamSelection: true
    });

    dsCompleted = result.deepScanCompleted;

    if (result.action === 'select_streams') {
      const { groups, initialValues } = buildGroupedOptions(probeData, selectedStreams);
      selectedStreams = onCancel(await groupMultiselect({
        message: 'Selecione as faixas que deseja manter no arquivo final:',
        options: groups,
        required: true,
        initialValues: initialValues,
      })) as any[];
    } else {
      menuLoop = false;
    }
  }
}