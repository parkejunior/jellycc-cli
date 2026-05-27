import { spawn } from 'child_process';
import { spinner, note } from '@clack/prompts';
import pc from 'picocolors';
import { t } from './i18n.ts';
import { JellyError } from './errors.ts';
import type { MediaStream } from '../types/media';
import { formatSecondsToTimestamp } from './formatters.ts';

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

  return new Promise<boolean>((resolve, reject) => {
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

    ff.on('error', () => {
      dsSpinner.stop(pc.red(t('scanDeepFail', '-1')));
      reject(new JellyError(t('scanDeepFail', '-1'), 'FFMPEG_START_FAILED'));
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
        reject(new JellyError(t('convFail', code ?? -1), 'FFMPEG_FAILED'));
      }
    });

    ff.on('error', (err: Error) => {
      convSpinner.stop(pc.red(t('convStartFail', err.message)));
      reject(new JellyError(t('convStartFail', err.message), 'FFMPEG_START_FAILED'));
    });
  });
}

/**
 * Executes a Silence Scan to detect accidentally muted tracks or dropped audio.
 * Uses a default threshold of -50dB and 2 seconds of minimum duration.
 */
export async function runSilenceScan(inputs: string[], maps: string[], totalDurationSec: number): Promise<boolean> {
  console.log('');
  const scanSpinner = spinner();
  scanSpinner.start(t('scanSilenceStart'));

  return new Promise<boolean>((resolve) => {
    const ffmpegArgs = ['-v', 'info', '-stats']; 
    inputs.forEach(inp => { ffmpegArgs.push('-i', inp); });
    maps.forEach(m => { ffmpegArgs.push('-map', m); });
    
    ffmpegArgs.push('-vn', '-af', 'silencedetect=noise=-50dB:d=2', '-f', 'null', '-');

    const ff = spawn('ffmpeg', ffmpegArgs);
    let stderrBuffer = '';
    
    const results: Array<{ trackIdx: number, start: number, duration: number }> = [];
    const currentStarts = new Map<number, number>(); 

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

        scanSpinner.message(`${t('scanSilenceProgress', percent)} [${pc.cyan(bar)}]`);
      }

      const lines = stderrBuffer.split(/[\r\n]+/);
      stderrBuffer = lines.pop() || '';

      for (const line of lines) {
        const startMatch = line.match(/Parsed_silencedetect_(\d+).*silence_start:\s*([\d.]+)/);
        if (startMatch) {
          const trackIdx = parseInt(startMatch[1]!, 10);
          currentStarts.set(trackIdx, Number.parseFloat(startMatch[2]!));
        }

        const durationMatch = line.match(/Parsed_silencedetect_(\d+).*silence_duration:\s*([\d.]+)/);
        if (durationMatch) {
          const trackIdx = parseInt(durationMatch[1]!, 10);
          const cStart = currentStarts.get(trackIdx);
          if (cStart !== undefined) {
            results.push({ trackIdx, start: cStart, duration: Number.parseFloat(durationMatch[2]!) });
            currentStarts.delete(trackIdx);
          }
        }
      }
    });

    ff.on('close', (code) => {
      if (code !== 0) {
        scanSpinner.stop(pc.red(t('scanSilenceFail')));
        return resolve(true);
      }

      if (results.length > 0) {
        scanSpinner.stop(pc.yellow(t('scanSilenceWarn')));

        const grouped = new Map<number, Array<{start: number, duration: number}>>();
        for (const r of results) {
           if (!grouped.has(r.trackIdx)) grouped.set(r.trackIdx, []);
           grouped.get(r.trackIdx)!.push(r);
        }

        let msg = '';
        for (const [tIdx, items] of grouped.entries()) {
           const mapName = maps[tIdx] || `Audio ${tIdx + 1}`; 
           
           msg += `${msg ? '\n\n' : ''}${pc.bold(`🎧 ${t('trackNum', tIdx + 1)} (Map ${mapName})`)}`;
           items.forEach(item => {
              const durText = t('scanSilenceItem', item.duration.toFixed(2));
              msg += `\n  • ${formatSecondsToTimestamp(item.start)} ${pc.dim(durText)}`;
           });
        }

        note(msg);
        resolve(true);
      } else {
        scanSpinner.stop(pc.green(t('scanSilencePass')));
        resolve(false);
      }
    });

    ff.on('error', () => {
      scanSpinner.stop(pc.red(t('scanSilenceFail')));
      resolve(true);
    });
  });
}

export async function extractRawAudio(filePath: string, startTs: string, durationSec: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-v', 'error',
      '-ss', startTs,
      '-t', durationSec.toString(),
      '-i', filePath,
      '-ac', '1',
      '-ar', '1000',
      '-f', 'f32le',
      'pipe:1'
    ]);

    const chunks: Buffer[] = [];
    let errorLog = '';

    ff.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ff.stderr.on('data', (data: Buffer) => errorLog += data.toString());

    ff.on('close', (code) => {
      if (code !== 0) {
        reject(new JellyError(`${t('mergeSpectrumFailed')} ${errorLog.trim()}`, 'FFMPEG_EXTRACTION_FAILED'));
        return;
      }
      const fullBuffer = Buffer.concat(chunks);
      resolve(new Float32Array(fullBuffer.buffer, fullBuffer.byteOffset, fullBuffer.byteLength / 4));
    });

    ff.on('error', (err) => {
      reject(new JellyError(`${t('mergeSpectrumFailed')} ${err.message}`, 'FFMPEG_START_FAILED'));
    });
  });
}