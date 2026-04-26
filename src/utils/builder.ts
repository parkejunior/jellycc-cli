import { getDynamicVideoEncoder, getDynamicAudioEncoder } from './ffmpeg.ts';

export function buildCheckCommand(selectedStreams: any[], probeData: any, fallbackRules: any, isVideoCompatible: boolean, videoPath: string, outputPath: string) {
  let codecArgs: string[] = [];
  let mapArgs: string[] = [];
  let vOutIdx = 0, aOutIdx = 0, sOutIdx = 0;

  for (const stream of selectedStreams) {
    mapArgs.push(`-map 0:${stream.streamIndex}`);

    if (stream.type === 'video') {
      if (isVideoCompatible) {
        codecArgs.push(`-c:v:${vOutIdx} copy`);
      } else {
        codecArgs.push(getDynamicVideoEncoder().replace('-c:v', `-c:v:${vOutIdx}`));
      }
      vOutIdx++;
    } else if (stream.type === 'audio') {
      if (fallbackRules.audio.acceptable.includes(stream.codec)) {
        codecArgs.push(`-c:a:${aOutIdx} copy`);
      } else {
        const map = (fallbackRules.audio.mappings as any)[stream.codec] || fallbackRules.audio.mappings.default;
        const fullStream = probeData.streams.find((st: any) => st.index === stream.streamIndex);
        codecArgs.push(getDynamicAudioEncoder(fullStream, map.target, aOutIdx));
      }
      aOutIdx++;
    } else if (stream.type === 'subtitle') {
      codecArgs.push(`-c:s:${sOutIdx} copy`);
      sOutIdx++;
    }
  }
  
  return `ffmpeg -i "${videoPath}" ${mapArgs.join(' ')} ${codecArgs.join(' ')} -metadata encoded_by="JellyCC" -threads 0 "${outputPath}"`;
}

export function buildMergeCommand(selectedStreams: any[], infoA: any, infoB: any, fallbackRules: any, pathA: string, pathB: string, outputPath: string, delayMs: number = 0, applyShortest: boolean = false) {
  let mapArgs: string[] = [];
  let vCodecArg = '-c:v copy';
  let aCodecArgs: string[] = [];
  const sCodecArg = '-c:s copy';

  let offsetA = '';
  let offsetB = '';
  if (delayMs > 0) offsetB = `-itsoffset ${delayMs / 1000} `;
  else if (delayMs < 0) offsetA = `-itsoffset ${Math.abs(delayMs) / 1000} `;

  const hasVideo = selectedStreams.some((s: any) => s.type === 'video');
  const hasAudio = selectedStreams.some((s: any) => s.type === 'audio');

  if (hasVideo) {
    const vStream = selectedStreams.find((s: any) => s.type === 'video');
    let codecName = vStream.codec;
    if (codecName === 'h264') codecName = 'h264_8bit'; 
    if (codecName !== fallbackRules.video.target) {
      vCodecArg = getDynamicVideoEncoder();
    }
  }

  if (hasAudio) {
    let audioOutputIndex = 0;
    for (const stream of selectedStreams) {
      if (stream.type === 'audio') {
        if (!fallbackRules.audio.acceptable.includes(stream.codec)) {
          const map = (fallbackRules.audio.mappings as any)[stream.codec] || fallbackRules.audio.mappings.default;
          const sourceInfo = stream.fileIndex === 0 ? infoA : infoB;
          const fullStream = sourceInfo.streams.find((st: any) => st.index === stream.streamIndex);
          aCodecArgs.push(getDynamicAudioEncoder(fullStream, map.target, audioOutputIndex));
        } else {
          aCodecArgs.push(`-c:a:${audioOutputIndex} copy`);
        }
        audioOutputIndex++;
      }
    }
  }

  selectedStreams.forEach((s: any) => {
    mapArgs.push(`-map ${s.fileIndex}:${s.streamIndex}`);
  });

  const aCodecArg = aCodecArgs.length > 0 ? aCodecArgs.join(' ') : '-c:a copy';
  const shortestArg = applyShortest ? '-shortest ' : '';

  return `ffmpeg ${offsetA}-i "${pathA}" ${offsetB}-i "${pathB}" ${mapArgs.join(' ')} ${vCodecArg} ${aCodecArg} ${sCodecArg} ${shortestArg}-metadata encoded_by="JellyCC" -threads 0 "${outputPath}"`;
}