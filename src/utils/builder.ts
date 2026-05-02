import { getDynamicVideoEncoder, getDynamicAudioEncoder } from './ffmpeg.ts';

export function buildCheckCommand(selectedStreams: any[], probeData: any, fallbackRules: any, isVideoCompatible: boolean, videoPath: string, outputPath: string, useRepairMode: boolean = false) {
  let codecArgs: string[] = [];
  let mapArgs: string[] = [];
  let vOutIdx = 0, aOutIdx = 0, sOutIdx = 0;

  let preCmds: string[] = [];
  let postCmds: string[] = [];
  let extraInputs: string[] = [];
  let currentExtraInputIdx = 1; // O Input 0 sempre é o videoPath

  for (const stream of selectedStreams) {
    if (stream.type === 'video') {
      mapArgs.push(`-map 0:${stream.streamIndex}`);
      if (isVideoCompatible) {
        codecArgs.push(`-c:v:${vOutIdx} copy`);
      } else {
        codecArgs.push(getDynamicVideoEncoder().replace('-c:v', `-c:v:${vOutIdx}`));
      }
      vOutIdx++;
    } else if (stream.type === 'audio') {
      if (!useRepairMode && fallbackRules.audio.acceptable.includes(stream.codec)) {
        mapArgs.push(`-map 0:${stream.streamIndex}`);
        codecArgs.push(`-c:a:${aOutIdx} copy`);
      } else {
        const target = fallbackRules.audio.acceptable.includes(stream.codec) ? 'aac' : ((fallbackRules.audio.mappings as any)[stream.codec] || fallbackRules.audio.mappings.default).target;
        const fullStream = probeData.streams.find((st: any) => st.index === stream.streamIndex);
        const encoderStr = getDynamicAudioEncoder(fullStream, target, aOutIdx);

        if (useRepairMode) {
          // OPÇÃO NUCLEAR: Extrai para WAV, força a entrada pura e limpa no final
          const wavPath = `${outputPath}.temp_audio_${aOutIdx}.wav`;
          preCmds.push(`ffmpeg -y -i "${videoPath}" -map 0:${stream.streamIndex} -c:a pcm_s16le "${wavPath}"`);
          postCmds.push(`rm -f "${wavPath}"`);
          extraInputs.push(`-i "${wavPath}"`);

          mapArgs.push(`-map ${currentExtraInputIdx}:0`);
          currentExtraInputIdx++;

          codecArgs.push(encoderStr); // O WAV já está perfeito, não precisa de filtros extras
        } else {
          mapArgs.push(`-map 0:${stream.streamIndex}`);
          codecArgs.push(encoderStr);
        }
      }
      aOutIdx++;
    } else if (stream.type === 'subtitle') {
      mapArgs.push(`-map 0:${stream.streamIndex}`);
      codecArgs.push(`-c:s:${sOutIdx} copy`);
      sOutIdx++;
    }
  }

  const extraInputsStr = extraInputs.length > 0 ? extraInputs.join(' ') + ' ' : '';
  const mainCmd = `ffmpeg -y -fflags +genpts -i "${videoPath}" ${extraInputsStr}${mapArgs.join(' ')} ${codecArgs.join(' ')} -max_muxing_queue_size 1024 -metadata encoded_by="JellyCC" -threads 0 "${outputPath}"`;

  // Se ativou o reparo, cria a corrente de comandos &&
  if (useRepairMode && preCmds.length > 0) {
    return `${preCmds.join(' && ')} && ${mainCmd} && ${postCmds.join(' && ')}`;
  }

  return mainCmd;
}

export function buildMergeCommand(selectedStreams: any[], infoA: any, infoB: any, fallbackRules: any, pathA: string, pathB: string, outputPath: string, delayMs: number = 0, applyShortest: boolean = false, useRepairMode: boolean = false) {
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

let preCmds: string[] = [];
  let postCmds: string[] = [];
  let extraInputs: string[] = [];
  let currentExtraInputIdx = 2; // O Input 0 é pathA, o Input 1 é pathB

  let audioOutputIndex = 0;

  // DESCOBRINDO O HOSPEDEIRO: De qual arquivo vem o Vídeo?
  const vStreamRef = selectedStreams.find((s: any) => s.type === 'video');
  const anchorVideoFileIndex = vStreamRef ? vStreamRef.fileIndex : 0; 

  for (const stream of selectedStreams) {
    if (stream.type === 'audio') {
      
      // A MÁGICA CORRIGIDA: O Modo de Reparo só ataca o áudio que for "Estrangeiro" ao vídeo!
      // Se o Vídeo é do Arquivo A e o Áudio é do Arquivo B -> Ativa o WAV
      // Se o Vídeo é do Arquivo B e o Áudio é do Arquivo A -> Ativa o WAV
      // Se vierem do mesmo arquivo -> Faz a cópia/conversão normal
      const applyRepairToThisStream = useRepairMode && stream.fileIndex !== anchorVideoFileIndex;

      if (!applyRepairToThisStream && fallbackRules.audio.acceptable.includes(stream.codec)) {
        aCodecArgs.push(`-c:a:${audioOutputIndex} copy`);
        mapArgs.push(`-map ${stream.fileIndex}:${stream.streamIndex}`);
      } else {
        const target = fallbackRules.audio.acceptable.includes(stream.codec) ? 'aac' : ((fallbackRules.audio.mappings as any)[stream.codec] || fallbackRules.audio.mappings.default).target;
        const sourceInfo = stream.fileIndex === 0 ? infoA : infoB;
        const fullStream = sourceInfo.streams.find((st: any) => st.index === stream.streamIndex);
        const encoderStr = getDynamicAudioEncoder(fullStream, target, audioOutputIndex);

        if (applyRepairToThisStream) {
          // OPÇÃO NUCLEAR: Extrai para WAV apenas o áudio estrangeiro
          const wavPath = `${outputPath}.temp_audio_${audioOutputIndex}.wav`;
          const sourcePath = stream.fileIndex === 0 ? pathA : pathB;
          
          preCmds.push(`ffmpeg -y -i "${sourcePath}" -map 0:${stream.streamIndex} -c:a pcm_s16le "${wavPath}"`);
          postCmds.push(`rm -f "${wavPath}"`);
          
          // Se houver ajuste de sincronia manual, aplica no WAV também!
          let currentOffset = '';
          if (stream.fileIndex === 0) currentOffset = offsetA;
          if (stream.fileIndex === 1) currentOffset = offsetB;
          extraInputs.push(`${currentOffset}-i "${wavPath}"`);

          mapArgs.push(`-map ${currentExtraInputIdx}:0`);
          currentExtraInputIdx++;

          aCodecArgs.push(encoderStr);
        } else {
          // Áudio que pertence ao mesmo arquivo do vídeo passa por aqui (sem WAV gigante)
          mapArgs.push(`-map ${stream.fileIndex}:${stream.streamIndex}`);
          aCodecArgs.push(encoderStr);
        }
      }
      audioOutputIndex++;
    } else {
      // Vídeos e Legendas
      mapArgs.push(`-map ${stream.fileIndex}:${stream.streamIndex}`);
    }
  }

  const aCodecArg = aCodecArgs.length > 0 ? aCodecArgs.join(' ') : '-c:a copy';
  const shortestArg = applyShortest ? '-shortest ' : '';
  const extraInputsStr = extraInputs.length > 0 ? extraInputs.join(' ') + ' ' : '';

  const mainCmd = `ffmpeg -y -fflags +genpts ${offsetA}-i "${pathA}" -fflags +genpts ${offsetB}-i "${pathB}" ${extraInputsStr}${mapArgs.join(' ')} ${vCodecArg} ${aCodecArg} ${sCodecArg} ${shortestArg}-max_muxing_queue_size 1024 -metadata encoded_by="JellyCC" -threads 0 "${outputPath}"`;

  // Se ativou o reparo, cria a corrente de comandos &&
  if (useRepairMode && preCmds.length > 0) {
    return `${preCmds.join(' && ')} && ${mainCmd} && ${postCmds.join(' && ')}`;
  }

  return mainCmd;
}