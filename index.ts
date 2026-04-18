import { intro, outro, text, select, spinner, isCancel, cancel, note } from '@clack/prompts';
import pc from 'picocolors';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

// Helper para tratar o encerramento manual (Ctrl+C) de forma limpa
function onCancel(value) {
  if (isCancel(value)) {
    cancel('Operação cancelada.');
    process.exit(0);
  }
  return value;
}

async function main() {
  intro(pc.inverse(' 🎬 Jellyfin Codec Compatibility Checker '));

  // 1. Obter o caminho do vídeo
  const videoPath = onCancel(await text({
    message: 'Qual é o caminho do arquivo de vídeo?',
    placeholder: './filme.mkv',
    validate(value) {
      if (!value) return 'O caminho é obrigatório!';
      if (!fs.existsSync(value)) return 'Arquivo não encontrado no disco!';
    }
  }));

  // 2. Carregar o YAML da matriz
  let supportMatrix;
  try {
    const yamlFile = fs.readFileSync('./Jellyfin Codec Support.yaml', 'utf8');
    supportMatrix = YAML.parse(yamlFile);
  } catch (e) {
    cancel('Erro ao ler o arquivo "Jellyfin Codec Support.yaml". Certifique-se de que ele está na mesma pasta.');
    process.exit(1);
  }

  const clients = Object.keys(supportMatrix.clients);

  // 3. Escolher o client para testar
  const clientChoice = onCancel(await select({
    message: 'Qual cliente Jellyfin você deseja verificar?',
    options: clients.map(c => ({ label: c, value: c }))
  }));

  // 4. Rodar o ffprobe para investigar o vídeo
  const s = spinner();
  s.start('Analisando as entranhas do vídeo com ffprobe...');

  let probeData;
  try {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    probeData = JSON.parse(result);
  } catch (err) {
    s.stop('Erro ao executar ffprobe.');
    console.error(pc.red(err.message));
    process.exit(1);
  }
  s.stop('Análise concluída!');

  // 5. Extrair e Normalizar Dados do ffprobe
  const formatName = probeData.format.format_name;
  const videoStream = probeData.streams.find(st => st.codec_type === 'video');
  const audioStream = probeData.streams.find(st => st.codec_type === 'audio');
  
  const ext = path.extname(videoPath).toLowerCase().replace('.', '');

  // Ajusta os nomes do ffprobe para os nomes exatos do seu YAML
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
    
    // Verifica o pixel format para detectar se é 8bit ou 10bit
    const is10bit = stream.pix_fmt && stream.pix_fmt.includes('10');
    
    if (codec === 'h264') return is10bit ? 'h264_10bit' : 'h264_8bit';
    if (codec === 'hevc') return is10bit ? 'hevc_10bit' : 'hevc_8bit';
    if (codec === 'mpeg4') return stream.profile === 'Advanced Simple Profile' ? 'mpeg4_part2_asp' : 'mpeg4_part2_sp';
    return codec;
  };

  const cKey = mapContainer(formatName);
  const vKey = mapVideoCodec(videoStream);
  const aKey = audioStream ? audioStream.codec_name : null;

  // 6. Realizar a Checagem de Compatibilidade
  const matrix = supportMatrix.clients[clientChoice];

  const formatResult = (category, key) => {
    if (!key) return pc.dim('N/A (Faixa não encontrada)');
    const status = matrix[category][key];
    
    if (status === true) return pc.green('✔ Suportado (Direct Play)');
    if (status === false) return pc.red('✖ Não Suportado (Transcode)');
    if (typeof status === 'string') return `${pc.yellow('⚠ Condicional:')} ${status}`;
    return pc.gray(`? Desconhecido na matriz (${key})`);
  };

  // 7. Exibir o Resultado Formatado
  const resultText = `
${pc.bold('📁 Arquivo:')} ${path.basename(videoPath)}
${pc.bold('🖥️ Cliente:')} ${clientChoice}

${pc.bold('📦 Container:')} ${cKey} -> ${formatResult('containers', cKey)}
${pc.bold('🎥 Vídeo:')}     ${vKey} -> ${formatResult('video', vKey)}
${pc.bold('🔊 Áudio:')}     ${aKey} -> ${formatResult('audio', aKey)}
  `.trim();

  note(resultText, 'Resultado da Análise');

  outro('Tudo pronto! Se a resposta for Transcode, você já sabe de quem é a culpa. 🚀');
}

main().catch(console.error);