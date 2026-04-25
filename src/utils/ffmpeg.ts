import { spawn, execSync } from 'child_process';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';

// Helper para converter "00:00:05.12" em segundos absolutos
export function parseFfmpegTime(timeStr: string) {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
}

export function getDynamicVideoEncoder() {
  return '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p';
}

export function getDynamicAudioEncoder(stream: any, targetCodec: string) {
  const channels = stream?.channels || 2;
  // Extrai o bitrate original em kbps (se existir)
  const sourceBitrate = stream?.bit_rate ? Math.round(parseInt(stream.bit_rate) / 1000) : Infinity;
  
  if (targetCodec === 'flac') {
    return '-c:a flac';
  }
  
  // Calcula o ideal (112 por canal), mas NUNCA ultrapassa o que já existe no arquivo original
  let idealBitrate = channels * 112;
  let targetBitrate = Math.min(idealBitrate, sourceBitrate);
  
  if (targetCodec === 'eac3') {
    // Mantém o teto de segurança de 768k do EAC3
    targetBitrate = Math.min(targetBitrate, 768);
    return `-c:a eac3 -b:a ${targetBitrate}k`;
  }
  
  // default aac
  return `-c:a aac -b:a ${targetBitrate}k`;
}

export async function runDeepScan(filePath: string, totalDurationSec: number) {
  console.log(''); 
  const dsSpinner = spinner();
  dsSpinner.start('🔍 Iniciando Deep Scan...');

  return new Promise<void>((resolve) => {
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

export function runConversion(ffmpegCmd: string) {
  console.log(pc.cyan('\nIniciando o FFmpeg... (Pressione Ctrl+C para cancelar)\n'));
  execSync(ffmpegCmd, { stdio: 'inherit' });
}
