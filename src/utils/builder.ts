import path from 'path';
import { getDynamicVideoEncoder, getDynamicAudioEncoder } from './ffmpeg.ts';

const getFinalPath = (p: string, isRepair: boolean) => {
  if (!isRepair) return p;
  const parsed = path.parse(p);
  return path.join(parsed.dir, `${parsed.name}_repaired${parsed.ext}`);
};

export function buildCheckCommand(selectedStreams: any[], probeData: any, fallbackRules: any, isVideoCompatible: boolean, videoPath: string, outputPath: string, useRepairMode: boolean = false) {
  let codecArgs: string[] = [];
  let mapArgs: string[] = [];
  let metaArgs: string[] = [];
  let vOutIdx = 0, aOutIdx = 0, sOutIdx = 0;

  let preCmds: string[] = [];
  let postCmds: string[] = [];
  let extraInputs: string[] = [];
  let currentExtraInputIdx = 1;

  let tmpDir = '';
  if (useRepairMode) {
    tmpDir = path.join(path.dirname(outputPath), '.jellycc_tmp');
    preCmds.push(`mkdir -p "${tmpDir}"`);
    postCmds.push(`rm -rf "${tmpDir}"`);
  }

  for (const stream of selectedStreams) {
    if (stream.type === 'video') {
      if (useRepairMode) {
        // Máquina de Lavar de Vídeo para o Check
        const cleanVideoPath = path.join(tmpDir, `temp_video_${vOutIdx}.mp4`);
        preCmds.push(`ffmpeg -y -i "${videoPath}" -map 0:${stream.streamIndex} -c:v copy -threads 0 "${cleanVideoPath}"`);
        extraInputs.push(`-i "${cleanVideoPath}"`);

        mapArgs.push(`-map ${currentExtraInputIdx}:0`);
        currentExtraInputIdx++;
      } else {
        mapArgs.push(`-map 0:${stream.streamIndex}`);
      }

      if (isVideoCompatible) {
        codecArgs.push(`-c:v:${vOutIdx} copy`);
      } else {
        codecArgs.push(getDynamicVideoEncoder(fallbackRules.video.target).replace('-c:v', `-c:v:${vOutIdx}`));
      }
      
      if (stream.language !== undefined) {
        metaArgs.push(`-metadata:s:v:${vOutIdx} language="${stream.language}"`);
        metaArgs.push(`-metadata:s:v:${vOutIdx} title="${stream.title}"`);
      }
      vOutIdx++;
    } else if (stream.type === 'audio') {
      if (!useRepairMode && fallbackRules.audio.acceptable.includes(stream.codec)) {
        mapArgs.push(`-map 0:${stream.streamIndex}`);
        codecArgs.push(`-c:a:${aOutIdx} copy`);
      } else {
        const target = fallbackRules.audio.acceptable.includes(stream.codec) ? stream.codec : ((fallbackRules.audio.mappings as any)[stream.codec] || fallbackRules.audio.mappings.default).target;
        const fullStream = probeData.streams.find((st: any) => st.index === stream.streamIndex);
        const encoderStr = getDynamicAudioEncoder(fullStream, target, aOutIdx);

        if (useRepairMode) {
          const wavPath = path.join(tmpDir, `temp_audio_${aOutIdx}.w64`);
          preCmds.push(`ffmpeg -y -i "${videoPath}" -map 0:${stream.streamIndex} -c:a pcm_s16le -threads 0 "${wavPath}"`);
          extraInputs.push(`-i "${wavPath}"`);

          mapArgs.push(`-map ${currentExtraInputIdx}:0`);
          currentExtraInputIdx++;

          codecArgs.push(encoderStr);
        } else {
          mapArgs.push(`-map 0:${stream.streamIndex}`);
          codecArgs.push(encoderStr);
        }
      }
      
      if (stream.language !== undefined) {
        metaArgs.push(`-metadata:s:a:${aOutIdx} language="${stream.language}"`);
        metaArgs.push(`-metadata:s:a:${aOutIdx} title="${stream.title}"`);
      }
      aOutIdx++;
    } else if (stream.type === 'subtitle') {
      mapArgs.push(`-map 0:${stream.streamIndex}`);
      codecArgs.push(`-c:s:${sOutIdx} copy`);
      
      if (stream.language !== undefined) {
        metaArgs.push(`-metadata:s:s:${sOutIdx} language="${stream.language}"`);
        metaArgs.push(`-metadata:s:s:${sOutIdx} title="${stream.title}"`);
      }
      sOutIdx++;
    }
  }

  const extraInputsStr = extraInputs.length > 0 ? extraInputs.join(' ') + ' ' : '';
  const metaStr = metaArgs.length > 0 ? metaArgs.join(' ') + ' ' : '';
  const finalPath = useRepairMode ? getFinalPath(outputPath, true) : outputPath;
  
  const mainCmd = `ffmpeg -y -fflags +genpts -i "${videoPath}" ${extraInputsStr}${mapArgs.join(' ')} ${codecArgs.join(' ')} ${metaStr}-max_muxing_queue_size 99999 -metadata encoded_by="JellyCC" -threads 0 "${finalPath}"`;

  if (useRepairMode && preCmds.length > 0) {
    return `${preCmds.join(' && ')} && ${mainCmd} && ${postCmds.join(' && ')}`;
  }

  return mainCmd;
}

export function buildMergeCommand(selectedStreams: any[], infoA: any, infoB: any, fallbackRules: any, pathA: string, pathB: string, outputPath: string, delayMs: number = 0, applyShortest: boolean = false, useRepairMode: boolean = false) {
  let mapArgs: string[] = [];
  let vCodecArg = '-c:v copy';
  let aCodecArgs: string[] = [];
  let metaArgs: string[] = [];
  const sCodecArgs: string[] = [];

  let offsetA = '';
  let offsetB = '';
  if (delayMs > 0) offsetB = `-itsoffset ${delayMs / 1000} `;
  else if (delayMs < 0) offsetA = `-itsoffset ${Math.abs(delayMs) / 1000} `;

  const hasVideo = selectedStreams.some((s: any) => s.type === 'video');

  if (hasVideo) {
    const vStream = selectedStreams.find((s: any) => s.type === 'video');
    let codecName = vStream.codec;
    if (codecName === 'h264') codecName = 'h264_8bit'; 
    if (codecName !== fallbackRules.video.target) {
      vCodecArg = getDynamicVideoEncoder(fallbackRules.video.target);
    }
  }

  let preCmds: string[] = [];
  let postCmds: string[] = [];
  let extraInputs: string[] = [];
  let currentExtraInputIdx = 2;

  let tmpDir = '';
  if (useRepairMode) {
    tmpDir = path.join(path.dirname(outputPath), '.jellycc_tmp');
    preCmds.push(`mkdir -p "${tmpDir}"`);
    postCmds.push(`rm -rf "${tmpDir}"`);
  }

  let audioOutputIndex = 0;
  let videoOutputIndex = 0;
  let subtitleOutputIndex = 0;

  const vStreamRef = selectedStreams.find((s: any) => s.type === 'video');
  const anchorVideoFileIndex = vStreamRef ? vStreamRef.fileIndex : 0; 

  for (const stream of selectedStreams) {
    if (stream.type === 'audio') {
      const applyRepairToThisStream = useRepairMode;

      if (!applyRepairToThisStream && fallbackRules.audio.acceptable.includes(stream.codec)) {
        aCodecArgs.push(`-c:a:${audioOutputIndex} copy`);
        mapArgs.push(`-map ${stream.fileIndex}:${stream.streamIndex}`);
      } else {
        const target = fallbackRules.audio.acceptable.includes(stream.codec) ? stream.codec : ((fallbackRules.audio.mappings as any)[stream.codec] || fallbackRules.audio.mappings.default).target;
        const sourceInfo = stream.fileIndex === 0 ? infoA : infoB;
        const fullStream = sourceInfo.streams.find((st: any) => st.index === stream.streamIndex);
        const encoderStr = getDynamicAudioEncoder(fullStream, target, audioOutputIndex);

        if (applyRepairToThisStream) {
          const wavPath = path.join(tmpDir, `temp_audio_${audioOutputIndex}.w64`);
          const sourcePath = stream.fileIndex === 0 ? pathA : pathB;

          preCmds.push(`ffmpeg -y -i "${sourcePath}" -map 0:${stream.streamIndex} -async 1 -c:a pcm_s16le -threads 0 "${wavPath}"`);
          
          // 1. Delay Global (caso o utilizador tenha feito um shift estrutural no menu)
          let userDelayMs = 0;
          if (stream.fileIndex === 0 && delayMs < 0) userDelayMs = Math.abs(delayMs);
          if (stream.fileIndex === 1 && delayMs > 0) userDelayMs = delayMs;

          // 2. O VERDADEIRO SMART: Lê o atraso nativo (PTS) que se perdeu no .w64
          let ptsDelayMs = 0;
          if (fullStream && fullStream.start_time) {
            ptsDelayMs = Math.round(parseFloat(fullStream.start_time) * 1000);
          }

          // 3. Soma os dois e aplica o offset APENAS para esta faixa de áudio
          const totalWavDelayMs = userDelayMs + ptsDelayMs;
          
          let wavOffsetStr = '';
          if (totalWavDelayMs > 0) {
            wavOffsetStr = `-itsoffset ${totalWavDelayMs / 1000} `;
          }

          extraInputs.push(`${wavOffsetStr}-i "${wavPath}"`);

          mapArgs.push(`-map ${currentExtraInputIdx}:0`);
          currentExtraInputIdx++;

          aCodecArgs.push(encoderStr);
        } else {
          mapArgs.push(`-map ${stream.fileIndex}:${stream.streamIndex}`);
          aCodecArgs.push(encoderStr);
        }
      }
      
      if (stream.language !== undefined) {
        metaArgs.push(`-metadata:s:a:${audioOutputIndex} language="${stream.language}"`);
        metaArgs.push(`-metadata:s:a:${audioOutputIndex} title="${stream.title}"`);
      }
      audioOutputIndex++;
      
    } else if (stream.type === 'video') {
      if (useRepairMode) {
        // A Máquina de Lavar de Vídeo para o Merge (Conserta o Relógio Quebrado)
        const cleanVideoPath = path.join(tmpDir, `temp_video_${videoOutputIndex}.mp4`);
        const sourcePath = stream.fileIndex === 0 ? pathA : pathB;
        
        preCmds.push(`ffmpeg -y -i "${sourcePath}" -map 0:${stream.streamIndex} -c:v copy -threads 0 "${cleanVideoPath}"`);
        
        let currentOffset = '';
        if (stream.fileIndex === 0) currentOffset = offsetA;
        if (stream.fileIndex === 1) currentOffset = offsetB;
        
        extraInputs.push(`${currentOffset}-i "${cleanVideoPath}"`);
        mapArgs.push(`-map ${currentExtraInputIdx}:0`);
        currentExtraInputIdx++;
      } else {
        mapArgs.push(`-map ${stream.fileIndex}:${stream.streamIndex}`);
      }

      if (stream.language !== undefined) {
        metaArgs.push(`-metadata:s:v:${videoOutputIndex} language="${stream.language}"`);
        metaArgs.push(`-metadata:s:v:${videoOutputIndex} title="${stream.title}"`);
      }
      videoOutputIndex++;
      
    } else if (stream.type === 'subtitle') {
      if (useRepairMode && (stream.codec === 'subrip' || stream.codec === 'ass')) {
        // A Máquina de Lavar de Legendas (Desvincula do MKV para o offset funcionar)
        const ext = stream.codec === 'subrip' ? 'srt' : 'ass';
        const cleanSubPath = path.join(tmpDir, `temp_sub_${subtitleOutputIndex}.${ext}`);
        const sourcePath = stream.fileIndex === 0 ? pathA : pathB;
        
        preCmds.push(`ffmpeg -y -i "${sourcePath}" -map 0:${stream.streamIndex} -threads 0 "${cleanSubPath}"`);
        
        let currentOffset = '';
        if (stream.fileIndex === 0) currentOffset = offsetA;
        if (stream.fileIndex === 1) currentOffset = offsetB;
        
        extraInputs.push(`${currentOffset}-i "${cleanSubPath}"`);
        mapArgs.push(`-map ${currentExtraInputIdx}:0`);
        currentExtraInputIdx++;
        
        sCodecArgs.push(`-c:s:${subtitleOutputIndex} ${ext}`);
      } else {
        mapArgs.push(`-map ${stream.fileIndex}:${stream.streamIndex}`);
        
        // Re-encode apenas para texto, copy para imagem
        if (stream.codec === 'subrip') {
          sCodecArgs.push(`-c:s:${subtitleOutputIndex} srt`);
        } else if (stream.codec === 'ass') {
          sCodecArgs.push(`-c:s:${subtitleOutputIndex} ass`);
        } else {
          sCodecArgs.push(`-c:s:${subtitleOutputIndex} copy`);
        }
      }

      if (stream.language !== undefined) {
        metaArgs.push(`-metadata:s:s:${subtitleOutputIndex} language="${stream.language}"`);
        metaArgs.push(`-metadata:s:s:${subtitleOutputIndex} title="${stream.title}"`);
      }
      subtitleOutputIndex++;
    }
  }

  const aCodecArg = aCodecArgs.length > 0 ? aCodecArgs.join(' ') : '-c:a copy';
  const sCodecArgStr = sCodecArgs.length > 0 ? sCodecArgs.join(' ') : '-c:s copy';
  const shortestArg = (applyShortest && !useRepairMode) ? '-shortest ' : '';
  const extraInputsStr = extraInputs.length > 0 ? extraInputs.join(' ') + ' ' : '';
  const metaStr = metaArgs.length > 0 ? metaArgs.join(' ') + ' ' : '';
  const finalPath = useRepairMode ? getFinalPath(outputPath, true) : outputPath;

  const mainCmd = `ffmpeg -y -fflags +genpts ${offsetA}-i "${pathA}" -fflags +genpts ${offsetB}-i "${pathB}" ${extraInputsStr}${mapArgs.join(' ')} ${vCodecArg} ${aCodecArg} ${sCodecArgStr} ${shortestArg}${metaStr}-max_muxing_queue_size 99999 -metadata encoded_by="JellyCC" -threads 0 "${finalPath}"`;

  if (useRepairMode && preCmds.length > 0) {
    return `${preCmds.join(' && ')} && ${mainCmd} && ${postCmds.join(' && ')}`;
  }

  return mainCmd;
}