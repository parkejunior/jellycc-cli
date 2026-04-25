import { text, select, groupMultiselect, note, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';

import { onCancel, sanitizePath } from '../utils/ui.ts';
import { getMediaInfo } from '../utils/ffprobe.ts';
import { runConversion, getDynamicVideoEncoder, getDynamicAudioEncoder } from '../utils/ffmpeg.ts';
import { formatFps, formatDuration, formatSize, padLabel, isImageSubtitle, formatSubtitleCodec } from '../utils/formatters.ts';

import fallbackRules from '../../dist/rules.json' with { type: 'json' };

export async function mergeCommand(args: string[]) {
  // --- 1. Coleta de Caminhos ---
  let pathA = onCancel(await text({
    message: 'Caminho do Arquivo A (Base/Referência):',
    placeholder: './filme_video_bom.mkv',
    validate(value) {
      const clean = sanitizePath(value);
      if (!clean) return 'Obrigatório!';
      if (!fs.existsSync(clean)) return 'Arquivo não encontrado!';
    }
  }));

  let pathB = onCancel(await text({
    message: 'Caminho do Arquivo B (Alvo da mesclagem):',
    placeholder: './filme_audio_ptbr.mkv',
    validate(value) {
      const clean = sanitizePath(value);
      if (!clean) return 'Obrigatório!';
      if (!fs.existsSync(clean)) return 'Arquivo não encontrado!';
    }
  }));

  pathA = sanitizePath(pathA as string);
  pathB = sanitizePath(pathB as string);

  // --- 2. Análise Dupla ---
  const infoA = getMediaInfo(pathA as string);
  const infoB = getMediaInfo(pathB as string);
  const totalDuration = infoA.format && infoA.format.duration ? parseFloat(infoA.format.duration) : 0;

  // Cálculo do Total de Frames para a Barra de Progresso
  let totalFrames = 0;
  const vStreamRef = infoA.streams.find((s: any) => s.codec_type === 'video' && s.codec_name !== 'mjpeg');
  if (vStreamRef && totalDuration > 0) {
    const fpsStr = vStreamRef.r_frame_rate || vStreamRef.avg_frame_rate;
    if (fpsStr) {
      const parts = fpsStr.split('/');
      const fps = parts.length === 2 && parseInt(parts[1]!) > 0 ? parseInt(parts[0]!) / parseInt(parts[1]!) : parseFloat(fpsStr);
      if (!isNaN(fps)) totalFrames = Math.round(totalDuration * fps);
    }
  }

  // --- 3. O "Juiz" de Qualidade Visual ---
  const getVideoStreamInfo = (info: any) => {
    const stream = info.streams.find((s: any) => s.codec_type === 'video');
    if (!stream) return null;
    return {
      codec: stream.codec_name,
      width: stream.width || 0,
      height: stream.height || 0,
      bitrate: stream.bit_rate ? parseInt(stream.bit_rate) : 0,
      index: stream.index,
    };
  };

  const vA = getVideoStreamInfo(infoA);
  const vB = getVideoStreamInfo(infoB);

  let suggestedVideo = 'A';
  if (vA && vB) {
    const pixelsA = vA.width * vA.height;
    const pixelsB = vB.width * vB.height;
    if (pixelsB > pixelsA) {
      suggestedVideo = 'B';
    } else if (pixelsB === pixelsA && vB.bitrate > vA.bitrate) {
      suggestedVideo = 'B';
    }
  }

  // --- 4. Interface Multiselect ---
  const buildGroupedOptions = (infoA: any, infoB: any) => {
    const groups: Record<string, any[]> = {
      '🎬 Vídeo': [],
      '🔊 Áudio': [],
      '💬 Legendas e Outros': []
    };

    const processStream = (s: any, fileLabel: string, fileIndex: number) => {
      let label = '';
      const lang = s.tags && s.tags.language ? s.tags.language.toUpperCase() : 'UND';
      
      if (s.codec_type === 'video') {
        const fps = formatFps(s.r_frame_rate || s.avg_frame_rate).replace(' fps', '');
        const bitrate = s.bit_rate ? Math.round(parseInt(s.bit_rate) / 1000) + ' kbps' : 'N/A';
        label = `[${s.codec_name}] ${s.width}x${s.height} @ ${fps}fps - ${bitrate}`;
      } else if (s.codec_type === 'audio') {
        const hz = s.sample_rate ? Math.round(parseInt(s.sample_rate) / 1000) + ' kHz' : 'N/A';
        const bitrate = s.bit_rate ? Math.round(parseInt(s.bit_rate) / 1000) + ' kbps' : 'N/A';
        const channels = s.channels === 6 ? '5.1' : s.channels === 2 ? 'Stereo' : s.channels;
        label = `[${s.codec_name}] (${lang}) ${channels} Ch | ${hz} | ${bitrate}`;
      } else if (s.codec_type === 'subtitle') {
        const title = s.tags && s.tags.title ? ` - "${s.tags.title}"` : '';
        let subStatus = "";
        if (isImageSubtitle(s.codec_name)) {
          subStatus = pc.yellow(
            " ⚠ Risco de Burn-in (Prefira buscar um SRT externo)"
          );
        } else {
          subStatus = pc.green(" ✔ Seguro");
        }
        const cleanCodec = formatSubtitleCodec(s.codec_name);
        label = `[${cleanCodec}] (${lang})${title}${subStatus}`;
      } else {
        label = `[${s.codec_type}] ${s.codec_name}`;
      }
      
      label += ` - Arquivo ${fileLabel}`;

      const option = {
        value: { fileIndex, streamIndex: s.index, type: s.codec_type, codec: s.codec_name },
        label: label,
      };

      if (s.codec_type === 'video') groups['🎬 Vídeo']!.push(option);
      else if (s.codec_type === 'audio') groups['🔊 Áudio']!.push(option);
      else groups['💬 Legendas e Outros']!.push(option);
    };

    infoA.streams.forEach((s: any) => processStream(s, 'A', 0));
    infoB.streams.forEach((s: any) => processStream(s, 'B', 1));

    Object.keys(groups).forEach(k => {
      if (groups[k]!.length === 0) delete groups[k];
    });

    return groups;
  };

  const groupedOptions = buildGroupedOptions(infoA, infoB);

  // --- Resumo Lado a Lado ---
  const buildFileSummary = (info: any) => {
    const duration = info.format?.duration ? formatDuration(parseFloat(info.format.duration)) : 'N/A';
    const size = info.format?.size ? formatSize(parseInt(info.format.size)) : 'N/A';
    
    const videos = info.streams.filter((s: any) => s.codec_type === 'video');
    const audios = info.streams.filter((s: any) => s.codec_type === 'audio');
    const subs = info.streams.filter((s: any) => s.codec_type === 'subtitle');

    const vSummary = videos.length > 0 ? `${videos[0].codec_name} (${videos[0].width}x${videos[0].height})` : 'Nenhum';
    const aSummary = audios.length > 0 ? `${audios.length} faixa${audios.length > 1 ? 's' : ''} (${audios.map((a: any) => a.codec_name).join(', ')})` : 'Nenhuma';
    const sSummary = subs.length > 0 ? `${subs.length} faixa${subs.length > 1 ? 's' : ''}` : 'Nenhuma';

    return { duration, size, vSummary, aSummary, sSummary };
  };

  const sumA = buildFileSummary(infoA);
  const sumB = buildFileSummary(infoB);

  const compTable = [
    `${pc.bold(padLabel('Info', 10))} | ${pc.bold(padLabel('Arquivo A (Base)', 30))} | ${pc.bold('Arquivo B (Alvo)')}`,
    `${padLabel('----------', 10)}-|-${padLabel('------------------------------', 30)}-|------------------------------`,
    `${pc.dim(padLabel('Duração', 10))} | ${padLabel(sumA.duration, 30)} | ${sumB.duration}`,
    `${pc.dim(padLabel('Tamanho', 10))} | ${padLabel(sumA.size, 30)} | ${sumB.size}`,
    `${pc.dim(padLabel('Vídeo', 10))} | ${padLabel(sumA.vSummary, 30)} | ${sumB.vSummary}`,
    `${pc.dim(padLabel('Áudios', 10))} | ${padLabel(sumA.aSummary, 30)} | ${sumB.aSummary}`,
    `${pc.dim(padLabel('Legendas', 10))} | ${padLabel(sumA.sSummary, 30)} | ${sumB.sSummary}`,
  ].join('\n');

  note(compTable, 'Comparação Lado a Lado');

  const initialValues: any[] = [];
  if (suggestedVideo === 'A' && vA) {
    const val = groupedOptions['🎬 Vídeo']?.find((o: any) => o.value.fileIndex === 0)?.value;
    if (val) initialValues.push(val);
  } else if (suggestedVideo === 'B' && vB) {
    const val = groupedOptions['🎬 Vídeo']?.find((o: any) => o.value.fileIndex === 1)?.value;
    if (val) initialValues.push(val);
  }

  const selectedStreams = onCancel(await groupMultiselect({
    message: `Selecione as faixas que deseja manter (Sugestão de vídeo: Arquivo ${suggestedVideo})`,
    options: groupedOptions,
    required: true,
    initialValues: initialValues.length > 0 ? initialValues : undefined,
  })) as any[];

  // --- 5. Mapeamento Cirúrgico e Injeção de Regras ---
  let mapArgs: string[] = [];
  let codecArgs: string[] = [];

  const hasVideo = selectedStreams.some(s => s.type === 'video');
  const hasAudio = selectedStreams.some(s => s.type === 'audio');

  let vCodecArg = '-c:v copy';
  let aCodecArg = '-c:a copy';

  if (hasVideo) {
    const vStream = selectedStreams.find(s => s.type === 'video');
    let codecName = vStream.codec;
    if (codecName === 'h264') codecName = 'h264_8bit'; 
    
    if (codecName !== fallbackRules.video.target) {
      vCodecArg = getDynamicVideoEncoder();
    }
  }

  if (hasAudio) {
    let needsAudioTranscode = false;
    let aCodecArgs: string[] = [];
    let audioOutputIndex = 0;
    
    for (const stream of selectedStreams) {
      if (stream.type === 'audio') {
        if (!fallbackRules.audio.acceptable.includes(stream.codec)) {
          needsAudioTranscode = true;
          const map = (fallbackRules.audio.mappings as any)[stream.codec] || fallbackRules.audio.mappings.default;
          
          const sourceInfo = stream.fileIndex === 0 ? infoA : infoB;
          const fullStream = sourceInfo.streams.find((st: any) => st.index === stream.streamIndex);
          
          const dynamicEncoder = getDynamicAudioEncoder(fullStream, map.target);
          
          const parts = dynamicEncoder.split(' ');
          let mappedEncoder = '';
          for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '-c:a') {
              mappedEncoder += `-c:a:${audioOutputIndex} ${parts[++i]} `;
            } else if (parts[i] === '-b:a') {
              mappedEncoder += `-b:a:${audioOutputIndex} ${parts[++i]} `;
            } else {
              mappedEncoder += parts[i] + ' ';
            }
          }
          aCodecArgs.push(mappedEncoder.trim());
        } else {
          aCodecArgs.push(`-c:a:${audioOutputIndex} copy`);
        }
        audioOutputIndex++;
      }
    }
    
    if (needsAudioTranscode) {
      aCodecArg = aCodecArgs.join(' ');
    }
  }

  const sCodecArg = '-c:s copy';

  selectedStreams.forEach(s => {
    mapArgs.push(`-map ${s.fileIndex}:${s.streamIndex}`);
  });

  const dir = path.dirname(pathA as string);
  const name = path.basename(pathA as string, path.extname(pathA as string));
  const outputPath = path.join(dir, `${name}.jellycc_merged.${fallbackRules.container}`);

  const ffmpegCmd = `ffmpeg -i "${pathA}" -i "${pathB}" ${mapArgs.join(' ')} ${vCodecArg} ${aCodecArg} ${sCodecArg} -threads 0 "${outputPath}"`;

  note(pc.yellow(ffmpegCmd), 'Comando FFmpeg Sugerido (Merge)');

  // --- 6. Execução ---
  const action = onCancel(await select({
    message: 'O que deseja fazer?',
    options: [
      { label: '🚀 Executar a conversão agora', value: 'run' },
      { label: '📋 Copiar comando', value: 'copy' },
      { label: '❌ Sair', value: 'exit' },
    ]
  }));

  if (action === 'run') {
    try {
      await runConversion(ffmpegCmd, totalDuration, totalFrames);
      outro(pc.green('✔ Arquivo mesclado com sucesso! 🚀'));
    } catch (err) {
      console.error(pc.red('\nErro ou cancelamento durante o merge.'));
      process.exit(1);
    }
  } else if (action === 'copy') {
    try {
      clipboardy.writeSync(ffmpegCmd);
      outro(pc.green('✔ Comando copiado com sucesso!'));
    } catch (err) {
      outro(`Erro no clipboard. Comando:\n${pc.yellow(ffmpegCmd)}`);
    }
  } else {
    console.log(`\n${pc.dim('Comando limpo:')}\n${pc.yellow(ffmpegCmd)}\n`);
    outro('Operação finalizada.');
  }
}