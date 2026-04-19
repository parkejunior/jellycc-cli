import { intro, outro, text, select, spinner, isCancel, cancel, note } from '@clack/prompts';
import pc from 'picocolors';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import clipboardy from 'clipboardy';
import { fileURLToPath } from 'url';
import supportMatrix from './dist/matrix.json' with { type: 'json' };
import fallbackRules from './dist/rules.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function onCancel(value) {
  if (isCancel(value)) {
    cancel('Operação cancelada.');
    process.exit(0);
  }
  return value;
}

const sanitizePath = (p) => p ? p.trim().replace(/^['"]|['"]$/g, '') : p;

// Helper para converter "00:00:05.12" em segundos absolutos
function parseFfmpegTime(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
}

// --- FUNÇÃO DO DEEP SCAN (AGORA ASSÍNCRONA COM PROGRESSO) ---
async function runDeepScan(filePath, totalDurationSec) {
  console.log(''); 
  const dsSpinner = spinner();
  dsSpinner.start('🔍 Iniciando Deep Scan...');

  return new Promise((resolve) => {
    // -v warning captura os erros; -stats força o ffmpeg a emitir o progresso
    const ff = spawn('ffmpeg', ['-v', 'warning', '-stats', '-i', filePath, '-f', 'null', '-']);
    let errorOutput = '';

    ff.stderr.on('data', (data) => {
      const str = data.toString();
      
      // Captura a tag "time=HH:MM:SS.ms" que o ffmpeg cospe no terminal
      const timeMatch = str.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch && totalDurationSec > 0) {
        const currentTime = parseFfmpegTime(timeMatch[1]);
        let percent = Math.round((currentTime / totalDurationSec) * 100);
        if (percent > 100) percent = 100; // Trava em 100% no finalzinho
        
        // Monta a barra de progresso visual [██████░░░░░░]
        const barLength = 25;
        const filled = Math.round((percent / 100) * barLength);
        const empty = barLength - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        // Atualiza a mensagem do Clack em tempo real
        dsSpinner.message(`🔍 Deep Scan em andamento: ${percent}% [${pc.cyan(bar)}]`);
      }

      // Filtra as linhas de atualização de stats para guardar apenas os erros reais
      const lines = str.split(/[\r\n]+/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('frame=') && !trimmed.startsWith('size=')) {
          errorOutput += trimmed + '\n';
        }
      }
    });

    ff.on('close', (code) => {
      if (errorOutput.trim()) {
        dsSpinner.stop(pc.yellow('⚠ Deep Scan finalizado: Foram encontrados artefatos/erros na decodificação.'));
        console.log(pc.dim(errorOutput.trim()));
      } else if (code === 0) {
        dsSpinner.stop(pc.green('✔ Deep Scan perfeito: Nenhum erro ou glitch encontrado no arquivo!'));
      } else {
        dsSpinner.stop(pc.red(`✖ Deep Scan falhou de forma crítica (Código ${code}).`));
      }
      console.log('');
      resolve();
    });
  });
}

async function main() {
  intro(pc.inverse(' 🎬 JellyCC CLI - Jellyfin Codec & Integrity Checker '));

  const args = process.argv.slice(2);
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

  const qsSpinner = spinner();
  qsSpinner.start('Executando Quick Scan de integridade...');
  try {
    execSync(`ffprobe -v error -show_entries format -of default=noprint_wrappers=1 "${videoPath}"`, { stdio: 'pipe' });
    qsSpinner.stop(pc.green('✔ Quick Scan aprovado: Estrutura do container intacta.'));
  } catch (err) {
    qsSpinner.stop(pc.red('✖ Quick Scan reprovado: O arquivo está danificado ou ilegível.'));
    cancel('Mídia corrompida. Abortando análise para evitar falhas no servidor.');
    process.exit(1);
  }

  const clients = Object.keys(supportMatrix.clients);

  const s = spinner();
  s.start('Analisando as entranhas do vídeo com ffprobe...');

  let probeData;
  try {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    probeData = JSON.parse(result);
  } catch (err) {
    s.stop('Erro ao executar ffprobe JSON.');
    process.exit(1);
  }
  s.stop('Análise de codec concluída!');

  // Extrai a duração total para passar para o Deep Scan
  const totalDuration = probeData.format && probeData.format.duration ? parseFloat(probeData.format.duration) : 0;

  const formatName = probeData.format.format_name;
  const videoStream = probeData.streams.find(st => st.codec_type === 'video');
  const audioStream = probeData.streams.find(st => st.codec_type === 'audio');
  
  const ext = path.extname(videoPath).toLowerCase().replace('.', '');

  const mapContainer = (fmt) => {
    if (fmt.includes('matroska')) return 'mkv';
    if (fmt.includes('mp4') || fmt.includes('mov')) return 'mp4';
    if (fmt.includes('webm')) return 'webm';
    if (fmt.includes('mpegts')) return 'ts';
    if (fmt.includes('ogg')) return 'ogg';
    return ext; 
  };

  const mapVideoCodec = (stream) => {
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
  const aKey = audioStream ? audioStream.codec_name : null;

  const formatResult = (status, key) => {
    if (!key) return pc.dim('N/A');
    if (status === true) return pc.green('✔ Direct Play');
    if (status === false) return pc.red('✖ Transcode');
    if (typeof status === 'string') return `${pc.yellow('⚠ Condicional:')} ${status}`;
    return pc.gray(`? Desconhecido (${key})`);
  };

  let resultText = `
${pc.bold('📁 Arquivo:')} ${path.basename(videoPath)}
${pc.bold('📦 Container:')} ${cKey}  |  ${pc.bold('🎥 Vídeo:')} ${vKey}  |  ${pc.bold('🔊 Áudio:')} ${aKey}

${pc.bold(pc.cyan('--- Compatibilidade por Cliente ---'))}
`;

  for (const client of clients) {
    const matrix = supportMatrix.clients[client];
    const cStatus = matrix.containers[cKey];
    const vStatus = matrix.video[vKey];
    const aStatus = matrix.audio[aKey];

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
    // Note o await aqui para respeitar a execução
    await runDeepScan(videoPath, totalDuration);
    deepScanCompleted = true;
  }

  const isContainerCompatible = cKey === fallbackRules.container;
  const isVideoCompatible = vKey === fallbackRules.video.target;
  const isAudioCompatible = fallbackRules.audio.acceptable.includes(aKey);

  const isPerfect = isContainerCompatible && isVideoCompatible && isAudioCompatible;

  let ffmpegCmd = '';
  if (isPerfect) {
    note(pc.green(`O arquivo já atende às suas regras ideais (${fallbackRules.container.toUpperCase()} / H.264 / Áudio Aceito). Nenhuma conversão é necessária!`), 'Sugestão de Conversão');
  } else {
    const vCodecArg = isVideoCompatible ? '-c:v copy' : fallbackRules.video.encoder;
    
    let aCodecArg = '-c:a copy';
    if (!isAudioCompatible) {
      const map = fallbackRules.audio.mappings[aKey] || fallbackRules.audio.mappings.default;
      aCodecArg = map.encoder;
    }
    
    const dir = path.dirname(videoPath);
    const name = path.basename(videoPath, path.extname(videoPath));
    const outputPath = path.join(dir, `${name}_convertido.${fallbackRules.container}`);

    // IMPLEMENTAÇÃO DOS NOVOS ARGUMENTOS DE COPY E THREADS
    ffmpegCmd = `ffmpeg -i "${videoPath}" -map 0 ${vCodecArg} ${aCodecArg} -c:s copy -threads 0 "${outputPath}"`;
    note(pc.yellow(ffmpegCmd), 'Comando FFmpeg Sugerido (Baseado nas suas Regras)');
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
      await runDeepScan(videoPath, totalDuration);
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
    console.log(pc.cyan('\nIniciando o FFmpeg... (Pressione Ctrl+C para cancelar)\n'));
    try {
      execSync(ffmpegCmd, { stdio: 'inherit' });
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

main().catch(console.error);