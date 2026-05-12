import { describe, expect, test } from 'bun:test';
import { getPrimaryVideoStream, getPreferredVideoSource, getDiagnostic } from './analyzer.ts';
import type { FFprobeData } from '../types/media.d.ts';
import type { FallbackRules, JellyfinSupportMatrix } from '../types/config.d.ts';

describe('services/analyzer.ts', () => {
  const mockStreamVideo: any = { index: 0, codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le', width: 1920, height: 1080, bit_rate: '5000000', r_frame_rate: '24/1' };
  const mockStreamAudio: any = { index: 1, codec_type: 'audio', codec_name: 'ac3', channels: 6, bit_rate: '384000' };
  const mockStreamSub: any = { index: 2, codec_type: 'subtitle', codec_name: 'pgs' };
  const mockStreamCover: any = { index: 3, codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } };

  const mockProbeData: FFprobeData = {
    format: { filename: 'movie.mkv', format_name: 'matroska,webm', duration: '100' },
    streams: [mockStreamVideo, mockStreamAudio, mockStreamSub, mockStreamCover]
  };

  const mockFallbackRules: FallbackRules = {
    container: 'mkv',
    video: { target: 'h264_8bit' },
    audio: {
      acceptable: ['aac', 'eac3', 'flac'],
      mappings: {
        ac3: { target: 'eac3' },
        default: { target: 'aac' }
      }
    }
  };

  const mockMatrix: JellyfinSupportMatrix = {
    metadata: { version: '1.0', description: '' },
    clients: {
      chrome: {
        video: { hevc_10bit: false },
        audio: { ac3: true },
        containers: { mkv: true }
      }
    }
  };

  test('getPrimaryVideoStream should return the first video stream that is not an attached picture', () => {
    const result = getPrimaryVideoStream(mockProbeData);
    
    expect(result).toBe(mockStreamVideo);
    expect(result).not.toBe(mockStreamCover);
  });

  test('getPreferredVideoSource should return the source with highest resolution or bitrate', () => {
    const infoA = { streams: [{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, bit_rate: '2000' }] } as any;
    const infoB = { streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, bit_rate: '1500' }] } as any;
    const infoC = { streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, bit_rate: '5000' }] } as any;
    
    expect(getPreferredVideoSource(infoA, infoB)).toBe('B');
    expect(getPreferredVideoSource(infoB, infoA)).toBe('A');
    expect(getPreferredVideoSource(infoB, infoC)).toBe('B');
    expect(getPreferredVideoSource(infoC, infoB)).toBe('A');
  });

  test('getDiagnostic should return a full diagnostic object with metadata, compatibility, selection and action plan', () => {
    const diagnostic = getDiagnostic(mockProbeData, mockFallbackRules, mockMatrix, undefined, 'movie.mkv');
    
    expect(diagnostic.hasGarbage).toBe(true);
    
    expect(diagnostic.metadata).toMatchObject({
      fileName: 'movie.mkv',
      containerKey: 'mkv',
      videoKey: 'hevc_10bit',
      audioKey: 'ac3',
      durationSec: 100,
      totalFrames: 2400
    });
    
    expect(diagnostic.compatibility.entries[0]).toMatchObject({
      client: 'chrome',
      badge: 'red',
      container: true,
      video: false,
      audio: true
    });
    
    expect(diagnostic.actionPlan.video).toMatchObject({
      compatible: false,
      targetCodec: 'h264_8bit',
      targetDepth: '8-bit'
    });
    
    expect(diagnostic.actionPlan.audio[0]).toMatchObject({
      trackNumber: 1,
      compatible: false,
      targetCodec: 'eac3',
      isLossless: false,
      targetBitrateKbps: 384
    });
    
    expect(diagnostic.selection).toMatchObject({
      selectedCount: 4,
      originalCount: 4,
      needsTranscode: true,
      streamsDropped: false,
      tagsModified: false,
      needsAction: true
    });
  });
});