import {
  buildCheckRepairAudioArgs,
  buildCheckRepairVideoArgs,
  buildMergeRepairAudioArgs,
  buildMergeRepairSubtitleArgs,
  buildMergeRepairVideoArgs,
  getRepairOutputPath,
  getRepairPostCmds,
  getRepairPreCmds,
  initRepair
} from '../services/repair.ts';
import { getDynamicVideoEncoder } from './ffmpeg.ts';
import { getAudioArgs, getMetadataArgs, getSubtitleArgs, getVideoArgs } from './ffmpeg-args.ts';
import type { FallbackRules } from '../types/config';
import type { FFprobeData, SelectedStream } from '../types/media';
import type { RepairCommandParts } from '../services/repair.ts';

const getMergeSource = (
  stream: SelectedStream,
  pathA: string,
  pathB: string,
  infoA: FFprobeData,
  infoB: FFprobeData
) => {
  const sourceFileIndex = stream.fileIndex ?? 0;

  return {
    fileIndex: sourceFileIndex,
    path: sourceFileIndex === 1 ? pathB : pathA,
    info: sourceFileIndex === 1 ? infoB : infoA
  };
};

const normalizeMergeVideoCodec = (codec: string) => (codec === 'h264' ? 'h264_8bit' : codec);

const getMergeVideoCodecArg = (selectedStreams: SelectedStream[], fallbackRules: FallbackRules) => {
  const vStream = selectedStreams.find((stream) => stream.type === 'video');
  if (!vStream) return '-c:v copy';

  const isVideoCompatible = normalizeMergeVideoCodec(vStream.codec) === fallbackRules.video.target;
  return isVideoCompatible ? '-c:v copy' : getDynamicVideoEncoder(fallbackRules.video.target);
};

export function buildCheckCommand(
  selectedStreams: SelectedStream[],
  probeData: FFprobeData,
  fallbackRules: FallbackRules,
  isVideoCompatible: boolean,
  videoPath: string,
  outputPath: string,
  useRepairMode: boolean = false
) {
  const mapArgs: string[] = [];
  const codecArgs: string[] = [];
  const metaArgs: string[] = [];
  const repairParts: RepairCommandParts[] = [];
  const extraInputs: string[] = [];

  const tmpDir = useRepairMode ? initRepair(outputPath) : '';
  let currentExtraInputIdx = 1;
  let videoOutputIndex = 0;
  let audioOutputIndex = 0;
  let subtitleOutputIndex = 0;

  for (const stream of selectedStreams) {
    if (stream.type === 'video') {
      if (useRepairMode) {
        const repairArgs = buildCheckRepairVideoArgs({
          sourcePath: videoPath,
          streamIndex: stream.streamIndex,
          tmpDir,
          outputIndex: videoOutputIndex,
          inputIndex: currentExtraInputIdx
        });

        repairParts.push(repairArgs);
        extraInputs.push(repairArgs.extraInput);
        mapArgs.push(repairArgs.mapArg);
        currentExtraInputIdx++;
      } else {
        mapArgs.push(`-map 0:${stream.streamIndex}`);
      }

      codecArgs.push(...getVideoArgs(stream, isVideoCompatible, fallbackRules, videoOutputIndex));
      metaArgs.push(...getMetadataArgs(stream, 'v', videoOutputIndex));
      videoOutputIndex++;
      continue;
    }

    if (stream.type === 'audio') {
      if (useRepairMode) {
        const repairArgs = buildCheckRepairAudioArgs({
          sourcePath: videoPath,
          streamIndex: stream.streamIndex,
          tmpDir,
          outputIndex: audioOutputIndex,
          inputIndex: currentExtraInputIdx
        });

        repairParts.push(repairArgs);
        extraInputs.push(repairArgs.extraInput);
        mapArgs.push(repairArgs.mapArg);
        currentExtraInputIdx++;
      } else {
        mapArgs.push(`-map 0:${stream.streamIndex}`);
      }

      codecArgs.push(
        ...getAudioArgs(stream, probeData, fallbackRules, audioOutputIndex, {
          forceTranscode: useRepairMode
        })
      );
      metaArgs.push(...getMetadataArgs(stream, 'a', audioOutputIndex));
      audioOutputIndex++;
      continue;
    }

    if (stream.type === 'subtitle') {
      mapArgs.push(`-map 0:${stream.streamIndex}`);
      codecArgs.push(...getSubtitleArgs(stream, subtitleOutputIndex));
      metaArgs.push(...getMetadataArgs(stream, 's', subtitleOutputIndex));
      subtitleOutputIndex++;
    }
  }

  const preCmds = useRepairMode ? getRepairPreCmds(repairParts, tmpDir) : [];
  const postCmds = useRepairMode ? getRepairPostCmds(tmpDir) : [];
  const extraInputsStr = extraInputs.length > 0 ? `${extraInputs.join(' ')} ` : '';
  const metaStr = metaArgs.length > 0 ? `${metaArgs.join(' ')} ` : '';
  const finalPath = useRepairMode ? getRepairOutputPath(outputPath) : outputPath;

  const mainCmd = `ffmpeg -y -fflags +genpts -i "${videoPath}" ${extraInputsStr}${mapArgs.join(' ')} ${codecArgs.join(' ')} ${metaStr}-max_muxing_queue_size 99999 -metadata encoded_by="JellyCC" -threads 0 "${finalPath}"`;

  if (useRepairMode && preCmds.length > 0) {
    return `${preCmds.join(' && ')} && ${mainCmd} && ${postCmds.join(' && ')}`;
  }

  return mainCmd;
}

export function buildMergeCommand(
  selectedStreams: SelectedStream[],
  infoA: FFprobeData,
  infoB: FFprobeData,
  fallbackRules: FallbackRules,
  pathA: string,
  pathB: string,
  outputPath: string,
  delayMs: number = 0,
  applyShortest: boolean = false,
  useRepairMode: boolean = false
) {
  const mapArgs: string[] = [];
  const aCodecArgs: string[] = [];
  const metaArgs: string[] = [];
  const sCodecArgs: string[] = [];
  const repairParts: RepairCommandParts[] = [];
  const extraInputs: string[] = [];

  const tmpDir = useRepairMode ? initRepair(outputPath) : '';
  const vCodecArg = getMergeVideoCodecArg(selectedStreams, fallbackRules);
  const offsetA = delayMs < 0 ? `-itsoffset ${Math.abs(delayMs) / 1000} ` : '';
  const offsetB = delayMs > 0 ? `-itsoffset ${delayMs / 1000} ` : '';

  let currentExtraInputIdx = 2;
  let audioOutputIndex = 0;
  let videoOutputIndex = 0;
  let subtitleOutputIndex = 0;

  for (const stream of selectedStreams) {
    const source = getMergeSource(stream, pathA, pathB, infoA, infoB);

    if (stream.type === 'audio') {
      if (useRepairMode) {
        const repairArgs = buildMergeRepairAudioArgs({
          sourcePath: source.path,
          streamIndex: stream.streamIndex,
          tmpDir,
          outputIndex: audioOutputIndex,
          inputIndex: currentExtraInputIdx,
          sourceFileIndex: source.fileIndex,
          delayMs,
          fullStream: source.info.streams.find((st) => st.index === stream.streamIndex)
        });

        repairParts.push(repairArgs);
        extraInputs.push(repairArgs.extraInput);
        mapArgs.push(repairArgs.mapArg);
        currentExtraInputIdx++;
      } else {
        mapArgs.push(`-map ${source.fileIndex}:${stream.streamIndex}`);
      }

      aCodecArgs.push(
        ...getAudioArgs(stream, source.info, fallbackRules, audioOutputIndex, {
          forceTranscode: useRepairMode
        })
      );
      metaArgs.push(...getMetadataArgs(stream, 'a', audioOutputIndex));
      audioOutputIndex++;
      continue;
    }

    if (stream.type === 'video') {
      if (useRepairMode) {
        const repairArgs = buildMergeRepairVideoArgs({
          sourcePath: source.path,
          streamIndex: stream.streamIndex,
          tmpDir,
          outputIndex: videoOutputIndex,
          inputIndex: currentExtraInputIdx,
          sourceFileIndex: source.fileIndex,
          delayMs
        });

        repairParts.push(repairArgs);
        extraInputs.push(repairArgs.extraInput);
        mapArgs.push(repairArgs.mapArg);
        currentExtraInputIdx++;
      } else {
        mapArgs.push(`-map ${source.fileIndex}:${stream.streamIndex}`);
      }

      metaArgs.push(...getMetadataArgs(stream, 'v', videoOutputIndex));
      videoOutputIndex++;
      continue;
    }

    if (stream.type === 'subtitle') {
      if (useRepairMode && (stream.codec === 'subrip' || stream.codec === 'ass')) {
        const repairArgs = buildMergeRepairSubtitleArgs({
          sourcePath: source.path,
          streamIndex: stream.streamIndex,
          tmpDir,
          outputIndex: subtitleOutputIndex,
          inputIndex: currentExtraInputIdx,
          sourceFileIndex: source.fileIndex,
          delayMs,
          codec: stream.codec
        });

        repairParts.push(repairArgs);
        extraInputs.push(repairArgs.extraInput);
        mapArgs.push(repairArgs.mapArg);
        currentExtraInputIdx++;
      } else {
        mapArgs.push(`-map ${source.fileIndex}:${stream.streamIndex}`);
      }

      sCodecArgs.push(...getSubtitleArgs(stream, subtitleOutputIndex));
      metaArgs.push(...getMetadataArgs(stream, 's', subtitleOutputIndex));
      subtitleOutputIndex++;
    }
  }

  const preCmds = useRepairMode ? getRepairPreCmds(repairParts, tmpDir) : [];
  const postCmds = useRepairMode ? getRepairPostCmds(tmpDir) : [];
  const aCodecArgStr = aCodecArgs.length > 0 ? aCodecArgs.join(' ') : '-c:a copy';
  const sCodecArgStr = sCodecArgs.length > 0 ? sCodecArgs.join(' ') : '-c:s copy';
  const shortestArg = applyShortest && !useRepairMode ? '-shortest ' : '';
  const extraInputsStr = extraInputs.length > 0 ? `${extraInputs.join(' ')} ` : '';
  const metaStr = metaArgs.length > 0 ? `${metaArgs.join(' ')} ` : '';
  const finalPath = useRepairMode ? getRepairOutputPath(outputPath) : outputPath;

  const mainCmd = `ffmpeg -y -fflags +genpts ${offsetA}-i "${pathA}" -fflags +genpts ${offsetB}-i "${pathB}" ${extraInputsStr}${mapArgs.join(' ')} ${vCodecArg} ${aCodecArgStr} ${sCodecArgStr} ${shortestArg}${metaStr}-max_muxing_queue_size 99999 -metadata encoded_by="JellyCC" -threads 0 "${finalPath}"`;

  if (useRepairMode && preCmds.length > 0) {
    return `${preCmds.join(' && ')} && ${mainCmd} && ${postCmds.join(' && ')}`;
  }

  return mainCmd;
}
