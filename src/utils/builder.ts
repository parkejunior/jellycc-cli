import { getDynamicVideoEncoder, getDynamicAudioEncoder } from './ffmpeg.ts';
import { isAttachedPic } from './formatters.ts';

export function buildCheckCommand(probeData: any, fallbackRules: any, isVideoCompatible: boolean, videoPath: string, outputPath: string) {
  let codecArgs: string[] = [];
  let excludeArgs: string[] = [];
  let vInIdx = 0, vOutIdx = 0;
  let aInIdx = 0, aOutIdx = 0;
  let sInIdx = 0, sOutIdx = 0;

  for (const stream of probeData.streams) {
    if (stream.codec_type === 'video') {
      if (isAttachedPic(stream)) {
        excludeArgs.push(`-map -0:v:${vInIdx}`);
      } else {
        if (isVideoCompatible) {
          codecArgs.push(`-c:v:${vOutIdx} copy`);
        } else {
          codecArgs.push(getDynamicVideoEncoder().replace('-c:v', `-c:v:${vOutIdx}`));
        }
        vOutIdx++;
      }
      vInIdx++;
    } else if (stream.codec_type === 'audio') {
      if (fallbackRules.audio.acceptable.includes(stream.codec_name)) {
        codecArgs.push(`-c:a:${aOutIdx} copy`);
      } else {
        const map = (fallbackRules.audio.mappings as any)[stream.codec_name] || fallbackRules.audio.mappings.default;
        codecArgs.push(getDynamicAudioEncoder(stream, map.target, aOutIdx));
      }
      aOutIdx++;
      aInIdx++;
    } else if (stream.codec_type === 'subtitle') {
      codecArgs.push(`-c:s:${sOutIdx} copy`);
      sOutIdx++;
      sInIdx++;
    }
  }
  return `ffmpeg -i "${videoPath}" -map 0 ${excludeArgs.join(' ')} ${codecArgs.join(' ')} -threads 0 "${outputPath}"`;
}

export function buildMergeCommand(selectedStreams: any[], infoA: any, infoB: any, fallbackRules: any, pathA: string, pathB: string, outputPath: string) {
  let mapArgs: string[] = [];
  let vCodecArg = '-c:v copy';
  let aCodecArgs: string[] = [];
  const sCodecArg = '-c:s copy';

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

  return `ffmpeg -i "${pathA}" -i "${pathB}" ${mapArgs.join(' ')} ${vCodecArg} ${aCodecArg} ${sCodecArg} -threads 0 "${outputPath}"`;
}