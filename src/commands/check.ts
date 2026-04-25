import { text, select, cancel, note, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';

import { onCancel, sanitizePath } from '../utils/ui.ts';
import { runQuickScan, getMediaInfo } from '../utils/ffprobe.ts';
import { runDeepScan, runConversion, getDynamicVideoEncoder, getDynamicAudioEncoder } from '../utils/ffmpeg.ts';
import { formatFps, formatBitrate, getBitDepth, formatSampleRate, formatChannels, padLabel } from '../utils/formatters.ts';

import supportMatrix from '../../dist/matrix.json' with { type: 'json' };
import fallbackRules from '../../dist/rules.json' with { type: 'json' };

export async function checkCommand(args: string[]) {
  const deepScanFlag = args.includes('--deep-scan');
  let rawPathArg = args.find(a => a !== '--deep-scan');
  
  let videoPath = sanitizePath(rawPathArg);
  let deepScanCompleted = false;

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

  // Filtros inteligentes para ignorar capas de filme (mjpeg, png) como vídeo principal
  const isAttachedPic = (st: any) => st.disposition?.attached_pic === 1 || ['mjpeg', 'png', 'bmp'].includes(st.codec_name);
  
  const formatName = probeData.format.format_name;
  const videoStream = probeData.streams.find((st: any) => st.codec_type === 'video' && !isAttachedPic(st));
  const audioStreams = probeData.streams.filter((st: any) => st.codec_type === 'audio');
  
  const ext = path.extname(videoPath as string).toLowerCase().replace('.', '');

  const mapContainer = (fmt: string) => {
    if (fmt.includes('matroska')) return 'mkv';
    if (fmt.includes('mp4') || fmt.includes('mov')) return 'mp4';
    if (fmt.includes('webm')) return 'webm';
    if (fmt.includes('mpegts')) return 'ts';
    if (fmt.includes('ogg')) return 'ogg';
    return ext; 
  };

  const mapVideoCodec = (stream: any) => {
    if (!stream) return null;
    let codec = stream.codec_name; 
    const is10bit = stream.pix_fmt && stream.pix_fmt.includes('10');
    
    if (codec === 'h264') return is10bit ? 'h264_10bit' : 'h264_8bit';
    if (codec === 'hevc') return is10bit ? 'hevc_10bit' : 'hevc_8bit';
    if (codec === 'mpeg4') return stream.profile === 'Advanced Simple Profile' ? 'mpeg4_part2_asp' : 'mpeg4_part2_sp';
    return codec;
  };

  const cKey = mapContainer(formatName);
  const vKey = mapVideoCodec(videoStream);
  const aKey = audioStreams.length > 0 ? audioStreams[0].codec_name : null; // Apenas para o badge principal

  const formatResult = (status: any, key: any) => {
    if (!key) return pc.dim('N/A');
    if (status === true) return pc.green('✔ Direct Play');
    if (status === false) return pc.red('✖ Transcode');
    if (typeof status === 'string') return `${pc.yellow('⚠ Condicional:')} ${status}`;
    return pc.gray(`? Desconhecido (${key})`);
  };

  let resultText = `
${pc.bold('📁 Arquivo:')} ${path.basename(videoPath as string)}
${pc.bold('📦 Container:')} ${cKey}  |  ${pc.bold('🎥 Vídeo:')} ${vKey}  |  ${pc.bold('🔊 Áudio(s):')} ${audioStreams.length} faixa(s)

${pc.bold(pc.cyan('--- Compatibilidade por Cliente ---'))}
`;

  for (const client of clients) {
    const matrix = (supportMatrix.clients as any)[client];
    const cStatus = matrix.containers[cKey];
    const vStatus = matrix.video[vKey];
    const aStatus = matrix.audio[aKey]; // Baseado na faixa 1 para resumo

    let badge = '';
    if (cStatus === true && vStatus === true && aStatus === true) {
        badge = pc.green('[Tudo Verde]');
    } else if (cStatus === false || vStatus === false || aStatus === false) {
        badge = pc.red('[Requer Transcode]');
    } else {
        badge = pc.yellow('[Atenção/Condicional]');
    }

    resultText += `\n${pc.bold(client.toUpperCase())} ${badge}
  Container: ${formatResult(cStatus, cKey)}
  Vídeo:     ${formatResult(vStatus, vKey)}
  Áudio:     ${formatResult(aStatus, aKey)}
`;
  }

  note(resultText.trim(), 'Resultados da Matriz Jellyfin');

  if (deepScanFlag) {
    await runDeepScan(videoPath as string, totalDuration);
    deepScanCompleted = true;
  }

  const isContainerCompatible = cKey === fallbackRules.container;
  const isVideoCompatible = vKey === fallbackRules.video.target;
  // O áudio só é compatível se TODAS as faixas forem aceitáveis
  const isAudioCompatible = audioStreams.every((st: any) => fallbackRules.audio.acceptable.includes(st.codec_name));

  const isPerfect = isContainerCompatible && isVideoCompatible && isAudioCompatible;
  const modLines: string[] = [];

  // 1. Resumo do Container
  modLines.push(pc.bold('📦 CONTAINER'));
  if (cKey !== fallbackRules.container) {
    modLines.push(`  ${padLabel('Formato:')} ${pc.dim(cKey.toUpperCase())} ➔ ${pc.yellow(fallbackRules.container.toUpperCase())}`);
  } else {
    modLines.push(`  ${padLabel('Formato:')} ${pc.green(cKey.toUpperCase() + ' ✔')}`);
  }
  modLines.push('');

  // 2. Resumo Detalhado de Vídeo
  if (videoStream) {
    modLines.push(pc.bold('🎥 VÍDEO'));
    const vFps = formatFps(videoStream.r_frame_rate || videoStream.avg_frame_rate);
    const vBitrate = formatBitrate(videoStream.bit_rate);
    const vDepth = getBitDepth(videoStream);
    const vRes = `${videoStream.width || '?'}x${videoStream.height || '?'}`;
    const vCodecOriginal = vKey ? vKey.toUpperCase() : 'DESCONHECIDO';

    if (isVideoCompatible) {
      modLines.push(`  ${padLabel('Codec:')} ${pc.green(vCodecOriginal + ' ✔')}`);
      modLines.push(`  ${padLabel('Resolução:')} ${pc.dim(vRes)}`);
      modLines.push(`  ${padLabel('FPS:')} ${pc.dim(vFps)}`);
      modLines.push(`  ${padLabel('Bit Depth:')} ${pc.dim(vDepth)}`);
      modLines.push(`  ${padLabel('Bitrate:')} ${pc.dim(vBitrate)}`);
    } else {
      modLines.push(`  ${padLabel('Codec:')} ${pc.dim(vCodecOriginal)} ➔ ${pc.yellow('H.264')}`);
      modLines.push(`  ${padLabel('Resolução:')} ${pc.dim(vRes)}`);
      modLines.push(`  ${padLabel('FPS:')} ${pc.dim(vFps)}`);
      modLines.push(`  ${padLabel('Bit Depth:')} ${vDepth === '8-bit' ? pc.dim('8-bit') : `${pc.dim(vDepth)} ➔ ${pc.yellow('8-bit')}`}`);
      modLines.push(`  ${padLabel('Bitrate:')} ${pc.dim(vBitrate)} ➔ ${pc.yellow('Visually Lossless (CRF 18)')}`);
    }
    modLines.push('');
  }

  // 3. Resumo Detalhado de Múltiplos Áudios
  if (audioStreams.length > 0) {
    modLines.push(pc.bold('🔊 ÁUDIO'));
    audioStreams.forEach((aStream: any, index: number) => {
      const aSampleRate = formatSampleRate(aStream.sample_rate);
      const aBitrate = formatBitrate(aStream.bit_rate);
      const audioChannels = aStream.channels || 2;
      const aChannelsStr = formatChannels(audioChannels);
      const aCodecOriginal = aStream.codec_name ? aStream.codec_name.toUpperCase() : 'DESCONHECIDO';
      
      const trackLbl = audioStreams.length > 1 ? `Faixa ${index + 1}:` : 'Codec:';
      const isThisAudioCompatible = fallbackRules.audio.acceptable.includes(aStream.codec_name);

      if (isThisAudioCompatible) {
        modLines.push(`  ${padLabel(trackLbl)} ${pc.green(aCodecOriginal + ' ✔')}`);
        modLines.push(`  ${padLabel('Canais:')} ${pc.dim(aChannelsStr)}`);
        modLines.push(`  ${padLabel('Sample:')} ${pc.dim(aSampleRate)}`);
        modLines.push(`  ${padLabel('Bitrate:')} ${pc.dim(aBitrate)}`);
      } else {
        const map = (fallbackRules.audio.mappings as any)[aStream.codec_name] || fallbackRules.audio.mappings.default;
        
        let targetBitrateStr = 'Lossless';
        if (map.target !== 'flac') {
          const sourceKbps = aStream.bit_rate ? Math.round(parseInt(aStream.bit_rate) / 1000) : Infinity;
          let finalKbps = Math.min(audioChannels * 112, sourceKbps);
          if (map.target === 'eac3') finalKbps = Math.min(finalKbps, 768);
          targetBitrateStr = `${finalKbps} kbps`;
        }

        modLines.push(`  ${padLabel(trackLbl)} ${pc.dim(aCodecOriginal)} ➔ ${pc.yellow(map.target.toUpperCase())}`);
        modLines.push(`  ${padLabel('Canais:')} ${pc.dim(aChannelsStr)}`);
        modLines.push(`  ${padLabel('Sample:')} ${pc.dim(aSampleRate)}`);
        modLines.push(`  ${padLabel('Bitrate:')} ${pc.dim(aBitrate)} ➔ ${pc.yellow(targetBitrateStr)}`);
      }
      modLines.push(''); 
    });
  }

  note(modLines.join('\n').trimEnd(), 'Ação Planejada (Detalhada)');

  // 4. Construtor Cirúrgico do Comando FFmpeg
  let codecArgs: string[] = [];
  let vIdx = 0, aIdx = 0, sIdx = 0;

  for (const stream of probeData.streams) {
    if (stream.codec_type === 'video') {
      if (isAttachedPic(stream)) {
        // Se for uma foto/pôster, apenas faça a cópia! Não converta em H.264
        codecArgs.push(`-c:v:${vIdx} copy`);
      } else {
        if (isVideoCompatible) {
          codecArgs.push(`-c:v:${vIdx} copy`);
        } else {
          // Substitui o argumento global pelo index exato (ex: -c:v:0)
          codecArgs.push(getDynamicVideoEncoder().replace('-c:v', `-c:v:${vIdx}`));
        }
      }
      vIdx++;
    } else if (stream.codec_type === 'audio') {
      if (fallbackRules.audio.acceptable.includes(stream.codec_name)) {
        codecArgs.push(`-c:a:${aIdx} copy`);
      } else {
        const map = (fallbackRules.audio.mappings as any)[stream.codec_name] || fallbackRules.audio.mappings.default;
        const dynamicEncoder = getDynamicAudioEncoder(stream, map.target);
        
        // Injeta o index da faixa no comando (ex: -c:a:1 eac3 -b:a:1 640k)
        const parts = dynamicEncoder.split(' ');
        let mappedEncoder = '';
        for (let i = 0; i < parts.length; i++) {
          if (parts[i] === '-c:a') {
            mappedEncoder += `-c:a:${aIdx} ${parts[++i]} `;
          } else if (parts[i] === '-b:a') {
            mappedEncoder += `-b:a:${aIdx} ${parts[++i]} `;
          } else {
            mappedEncoder += parts[i] + ' ';
          }
        }
        codecArgs.push(mappedEncoder.trim());
      }
      aIdx++;
    } else if (stream.codec_type === 'subtitle') {
      codecArgs.push(`-c:s:${sIdx} copy`);
      sIdx++;
    }
  }

  const dir = path.dirname(videoPath as string);
  const name = path.basename(videoPath as string, path.extname(videoPath as string));
  const outputPath = path.join(dir, `${name}_convertido.${fallbackRules.container}`);

  let ffmpegCmd = `ffmpeg -i "${videoPath}" -map 0 ${codecArgs.join(' ')} -threads 0 "${outputPath}"`;

  if (isPerfect) {
    note(pc.green('✔ O arquivo já atende perfeitamente às regras. A conversão fará apenas uma cópia limpa das faixas (Remux).'), 'Pronto para uso');
  } else {
    note(pc.yellow(ffmpegCmd), 'Comando FFmpeg Sugerido');
  }

  let action;
  let keepMenuOpen = true;

  while (keepMenuOpen) {
    const menuOptions = [];
    
    if (!isPerfect) {
      menuOptions.push({ label: '📋 Copiar comando de conversão', value: 'copy' });
      menuOptions.push({ label: '🚀 Executar a conversão agora', value: 'run' });
    }
    
    if (!deepScanCompleted) {
      menuOptions.push({ label: '🔍 Rodar Deep Scan (Verificar falhas no bitstream)', value: 'deep_scan' });
    }
    
    menuOptions.push({ label: '❌ Sair', value: 'exit' });

    action = onCancel(await select({
      message: 'O que deseja fazer?',
      options: menuOptions
    }));

    if (action === 'deep_scan') {
      await runDeepScan(videoPath as string, totalDuration);
      deepScanCompleted = true; 
    } else {
      keepMenuOpen = false; 
    }
  }

  if (action === 'copy') {
    try {
      clipboardy.writeSync(ffmpegCmd);
      outro(pc.green('✔ Comando copiado com sucesso!'));
    } catch (err) {
      outro(`Erro no clipboard. Comando:\n${pc.yellow(ffmpegCmd)}`);
    }
  } else if (action === 'run') {
    try {
      runConversion(ffmpegCmd);
      outro(pc.green('✔ Arquivo convertido com sucesso! 🚀'));
    } catch (err) {
      console.error(pc.red('\nErro ou cancelamento durante a conversão.'));
      process.exit(1);
    }
  } else if (action === 'exit') {
    if (!isPerfect) {
      console.log(`\n${pc.dim('Comando limpo:')}\n${pc.yellow(ffmpegCmd)}\n`);
    }
    outro('Verificação finalizada. 🚀');
  }
}