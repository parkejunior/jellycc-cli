import { text, select, multiselect, groupMultiselect, cancel, note, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';

import { onCancel, sanitizePath } from '../utils/ui.ts';
import { getMediaInfo } from '../utils/ffprobe.ts';
import { runConversion } from '../utils/ffmpeg.ts';

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
    // Regra simples: Maior resolução ou maior bitrate -> melhor
    const pixelsA = vA.width * vA.height;
    const pixelsB = vB.width * vB.height;
    if (pixelsB > pixelsA) {
      suggestedVideo = 'B';
    } else if (pixelsB === pixelsA && vB.bitrate > vA.bitrate) {
      suggestedVideo = 'B';
    }
  }

  // --- 4. Interface Multiselect ---
  const parseFps = (fpsStr: string) => {
    if (!fpsStr) return '??';
    const parts = fpsStr.split('/');
    if (parts.length === 2 && parseInt(parts[1]!) > 0) {
      return (parseInt(parts[0]!) / parseInt(parts[1]!)).toFixed(2);
    }
    return parseFloat(fpsStr).toFixed(2);
  };

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
        const fps = parseFps(s.r_frame_rate || s.avg_frame_rate);
        const bitrate = s.bit_rate ? Math.round(parseInt(s.bit_rate) / 1000) + ' kbps' : 'N/A';
        label = `[${s.codec_name}] ${s.width}x${s.height} @ ${fps}fps - ${bitrate}`;
      } else if (s.codec_type === 'audio') {
        const hz = s.sample_rate ? Math.round(parseInt(s.sample_rate) / 1000) + ' kHz' : 'N/A';
        const bitrate = s.bit_rate ? Math.round(parseInt(s.bit_rate) / 1000) + ' kbps' : 'N/A';
        const channels = s.channels === 6 ? '5.1' : s.channels === 2 ? 'Stereo' : s.channels;
        label = `[${s.codec_name}] (${lang}) ${channels} Ch | ${hz} | ${bitrate}`;
      } else if (s.codec_type === 'subtitle') {
        const title = s.tags && s.tags.title ? ` - "${s.tags.title}"` : '';
        label = `[${s.codec_name}] (${lang})${title}`;
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

    // Remove empty groups
    Object.keys(groups).forEach(k => {
      if (groups[k]!.length === 0) delete groups[k];
    });

    return groups;
  };

  const groupedOptions = buildGroupedOptions(infoA, infoB);

  // Pré-selecionar o vídeo sugerido (se a biblioteca suportar, passamos em initialValues)
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
    // Map video codec to simpler name just like check.ts, actually fallbackRules.video.target handles it.
    // Simplifying: we just check if it's not the target.
    // For now, if we don't have pix_fmt we just assume 8-bit. We can refine later.
    let codecName = vStream.codec;
    if (codecName === 'h264') codecName = 'h264_8bit'; // naive
    
    if (codecName !== fallbackRules.video.target) {
      vCodecArg = fallbackRules.video.encoder;
    }
  }

  if (hasAudio) {
    const aStreams = selectedStreams.filter(s => s.type === 'audio');
    // For multiple audios we might need complex mapping or just apply to all:
    // we'll check if ANY audio needs transcode, if so we might need per-stream or global
    // Fallback applies to ALL audio streams generally with -c:a
    let needsAudioTranscode = false;
    let targetEncoder = '';
    
    for (const aStream of aStreams) {
      if (!fallbackRules.audio.acceptable.includes(aStream.codec)) {
        needsAudioTranscode = true;
        const map = (fallbackRules.audio.mappings as any)[aStream.codec] || fallbackRules.audio.mappings.default;
        targetEncoder = map.encoder;
        break; // Assume all get the same encoder for now
      }
    }

    if (needsAudioTranscode) {
      aCodecArg = targetEncoder;
    }
  }

  // -c:s copy is always applied
  const sCodecArg = '-c:s copy';

  selectedStreams.forEach(s => {
    mapArgs.push(`-map ${s.fileIndex}:${s.streamIndex}`);
  });

  const dir = path.dirname(pathA as string);
  const name = path.basename(pathA as string, path.extname(pathA as string));
  const outputPath = path.join(dir, `${name}_merged.${fallbackRules.container}`);

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
      runConversion(ffmpegCmd);
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
