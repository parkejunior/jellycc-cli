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

export function getDynamicAudioEncoder(stream: any, targetCodec: string, outputIndex: number = 0) {
  const channels = stream?.channels || 2;
  const sourceBitrate = stream?.bit_rate ? Math.round(parseInt(stream.bit_rate) / 1000) : Infinity;
  
  if (targetCodec === 'flac') {
    return `-c:a:${outputIndex} flac`;
  }
  
  let idealBitrate = channels * 112;
  let targetBitrate = Math.min(idealBitrate, sourceBitrate);
  
  if (targetCodec === 'eac3') {
    targetBitrate = Math.min(targetBitrate, 768);
    return `-c:a:${outputIndex} eac3 -b:a:${outputIndex} ${targetBitrate}k`;
  }
  
  return `-c:a:${outputIndex} aac -b:a:${outputIndex} ${targetBitrate}k`;
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

export async function runConversion(ffmpegCmd: string, totalDurationSec: number, totalFrames: number = 0) {
  return new Promise<void>((resolve, reject) => {
    console.log('');
    const convSpinner = spinner();
    convSpinner.start('Preparando conversão...');

    const safeCmd = ffmpegCmd.includes(' -y ') ? ffmpegCmd : ffmpegCmd.replace('ffmpeg ', 'ffmpeg -y ');
    const ff = spawn(safeCmd, { shell: true });
    
    let tailLog: string[] = [];
    let lastBar = '[░░░░░░░░░░░░░░░░░░░░░░░░░] 0%';
    let stderrBuffer = '';

    ff.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      const lines = stderrBuffer.split(/[\r\n]+/);
      stderrBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        tailLog.push(trimmed);
        if (tailLog.length > 10) {
          tailLog.shift();
        }

        // Tenta achar o tempo (Plano A) ou os frames processados (Plano B)
        const timeMatch = trimmed.match(/time=\s*(\d{2}:\d{2}:\d{2}[\.\d]*)/);
        const frameMatch = trimmed.match(/frame=\s*(\d+)/);

        let percent = -1;

        if (timeMatch && totalDurationSec > 0) {
          const currentTime = parseFfmpegTime(timeMatch[1]);
          percent = Math.round((currentTime / totalDurationSec) * 100);
        } else if (frameMatch && totalFrames > 0) {
          const currentFrame = parseInt(frameMatch[1], 10);
          percent = Math.round((currentFrame / totalFrames) * 100);
        }

        // Desenha a barra se tivermos uma porcentagem válida
        if (percent >= 0) {
          if (percent > 100) percent = 100;
          const barLength = 25;
          const filled = Math.round((percent / 100) * barLength);
          const empty = barLength - filled;
          lastBar = `[${pc.cyan('█'.repeat(filled) + '░'.repeat(empty))}] ${percent}%`;
        }

        convSpinner.message(`Conversão em andamento:\n${lastBar}\n\n${pc.dim(tailLog.join('\n'))}`);
      }
    });

    ff.on('close', (code) => {
      if (code === 0) {
        convSpinner.stop(pc.green('✔ Conversão finalizada com sucesso!'));
        resolve();
      } else {
        convSpinner.stop(pc.red(`✖ Erro durante a conversão (Código ${code}).`));
        reject(new Error('FFmpeg falhou'));
      }
    });

    ff.on('error', (err) => {
      convSpinner.stop(pc.red(`✖ Falha ao tentar iniciar o processo do FFmpeg: ${err.message}`));
      reject(err);
    });
  });
}