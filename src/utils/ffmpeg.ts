import { spawn } from 'child_process';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { t } from './i18n.ts';
import type { MediaStream } from '../types/media';

export function parseFfmpegTime(timeStr: string) {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  return Number(parts[0] ?? 0) * 3600 + Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0);
}

export function getDynamicVideoEncoder(targetCodec: string = 'h264_8bit') {
  if (targetCodec === 'hevc_10bit') return '-c:v libx265 -preset slow -crf 20 -pix_fmt yuv420p10le';
  if (targetCodec === 'hevc_8bit') return '-c:v libx265 -preset slow -crf 20 -pix_fmt yuv420p';
  if (targetCodec === 'h264_10bit') return '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p10le';

  return '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p';
}

export function getDynamicAudioEncoder(
  stream: Pick<MediaStream, 'channels' | 'bit_rate'> | undefined,
  targetCodec: string,
  outputIndex: number = 0
) {
  const channels = stream?.channels || 2;
  const sourceBitrate = stream?.bit_rate ? Math.round(Number.parseInt(stream.bit_rate, 10) / 1000) : Infinity;
  
  if (targetCodec === 'flac') {
    return `-c:a:${outputIndex} flac`;
  }
  
  let idealBitrate = channels * 112;
  let targetBitrate = Math.min(idealBitrate, sourceBitrate);
  
  if (targetCodec === 'eac3') {
    targetBitrate = Math.min(targetBitrate, 768);
  } else if (targetCodec === 'ac3') {
    targetBitrate = Math.min(targetBitrate, 640);
  }
  
  return `-c:a:${outputIndex} ${targetCodec} -b:a:${outputIndex} ${targetBitrate}k`;
}

export async function runDeepScan(inputs: string[], maps: string[], totalDurationSec: number): Promise<boolean> {
  console.log(''); 
  const dsSpinner = spinner();
  dsSpinner.start(t('scanDeepStart'));

  let hasErrors = false;

  return new Promise<boolean>((resolve) => {
    // Montagem dinâmica dos argumentos para ler apenas o que importa
    const ffmpegArgs = ['-v', 'warning', '-stats'];
    inputs.forEach(inp => { ffmpegArgs.push('-i', inp); });
    maps.forEach(m => { ffmpegArgs.push('-map', m); });
    
    // O ESCUDO DEFINITIVO: Ignora qualquer legenda (-sn) e qualquer dado/fonte (-dn)
    ffmpegArgs.push('-sn', '-dn', '-f', 'null', '-');

    const ff = spawn('ffmpeg', ffmpegArgs);
    let errorOutput = '';
    let stderrBuffer = '';

    ff.stderr.on('data', (data) => {
      stderrBuffer += data.toString();

      const timeMatch = stderrBuffer.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      const matchTime = timeMatch?.[1];
      if (matchTime && totalDurationSec > 0) {
        const currentTime = parseFfmpegTime(matchTime);
        let percent = Math.round((currentTime / totalDurationSec) * 100);
        if (percent > 100) percent = 100;
        
        const barLength = 25;
        const filled = Math.round((percent / 100) * barLength);
        const empty = barLength - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        dsSpinner.message(`${t('scanDeepProgress', percent)} [${pc.cyan(bar)}]`);
      }

      const lines = stderrBuffer.split(/[\r\n]+/);
      stderrBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('frame=') && !trimmed.startsWith('size=')) {
          errorOutput += trimmed + '\n';
          hasErrors = true;
        }
      }
    });

    ff.on('close', (code) => {
      if (stderrBuffer.trim()) {
        const trimmed = stderrBuffer.trim();
        if (!trimmed.startsWith('frame=') && !trimmed.startsWith('size=')) {
          errorOutput += trimmed + '\n';
          hasErrors = true;
        }
      }

      if (errorOutput.trim()) {
        dsSpinner.stop(pc.yellow(t('scanDeepWarn')));
        console.log(pc.dim(errorOutput.trim()));
      } else if (code === 0) {
        dsSpinner.stop(pc.green(t('scanDeepPass')));
      } else {
        dsSpinner.stop(pc.red(t('scanDeepFail', code)));
        hasErrors = true;
      }
      console.log('');
      resolve(hasErrors);
    });
  });
}

export async function runConversion(ffmpegCmd: string, totalDurationSec: number, totalFrames: number = 0) {
  return new Promise<void>((resolve, reject) => {
    console.log('');
    const convSpinner = spinner();
    convSpinner.start(t('convPrep'));

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

        const timeMatch = trimmed.match(/time=\s*(\d{2}:\d{2}:\d{2}[\.\d]*)/);
        const frameMatch = trimmed.match(/frame=\s*(\d+)/);

        let percent = -1;

        const matchTime = timeMatch?.[1];
        const matchFrame = frameMatch?.[1];

        if (matchTime && totalDurationSec > 0) {
          const currentTime = parseFfmpegTime(matchTime);
          percent = Math.round((currentTime / totalDurationSec) * 100);
        } else if (matchFrame && totalFrames > 0) {
          const currentFrame = Number.parseInt(matchFrame, 10);
          percent = Math.round((currentFrame / totalFrames) * 100);
        }

        if (percent >= 0) {
          if (percent > 100) percent = 100;
          const barLength = 25;
          const filled = Math.round((percent / 100) * barLength);
          const empty = barLength - filled;
          lastBar = `[${pc.cyan('█'.repeat(filled) + '░'.repeat(empty))}] ${percent}%`;
        }

        convSpinner.message(`${t('convProgress')}\n${lastBar}\n\n${pc.dim(tailLog.join('\n'))}`);
      }
    });

    ff.on('close', (code) => {
      if (code === 0) {
        convSpinner.stop(pc.green(t('convPass')));
        resolve();
      } else {
        convSpinner.stop(pc.red(t('convFail', code)));
        reject(new Error('FFmpeg falhou'));
      }
    });

    ff.on('error', (err: Error) => {
      convSpinner.stop(pc.red(t('convStartFail', err.message)));
      reject(err);
    });
  });
}
