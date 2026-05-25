import { describe, expect, test } from 'bun:test';
import {
  isImageSubtitle,
  isAttachedPic,
  isGarbageStream,
  hasEmbeddedGarbage,
  filterGarbageStreams
} from './mediaUtils.ts';
import type { MediaStream } from '../types/media.d.ts';

describe('utils/mediaUtils.ts', () => {
  const validVideo: MediaStream = { index: 0, codec_type: 'video', codec_name: 'hevc' };
  const validAudio: MediaStream = { index: 1, codec_type: 'audio', codec_name: 'aac' };
  const textSub: MediaStream = { index: 2, codec_type: 'subtitle', codec_name: 'subrip' };
  
  const imageSubPGS: MediaStream = { index: 3, codec_type: 'subtitle', codec_name: 'pgs' };
  const coverArtAttached: MediaStream = { 
    index: 4, 
    codec_type: 'video', 
    codec_name: 'h264', 
    disposition: { attached_pic: 1 } 
  };
  const coverArtMjpeg: MediaStream = { index: 5, codec_type: 'video', codec_name: 'mjpeg' };

  test('isImageSubtitle should correctly identify image subtitles', () => {
    expect(isImageSubtitle('pgs')).toBe(true);
    expect(isImageSubtitle('hdmv_pgs_subtitle')).toBe(true);
    expect(isImageSubtitle('vobsub')).toBe(true);
    expect(isImageSubtitle('dvd_subtitle')).toBe(true);
    
    expect(isImageSubtitle('PGS')).toBe(true); 

    expect(isImageSubtitle('subrip')).toBe(false);
    expect(isImageSubtitle('ass')).toBe(false);
    expect(isImageSubtitle(undefined)).toBe(false);
  });

  test('isAttachedPic should correctly identify cover art or attachments', () => {
    expect(isAttachedPic(coverArtAttached)).toBe(true);
    expect(isAttachedPic(coverArtMjpeg)).toBe(true);
    
    expect(isAttachedPic({ codec_name: 'png' })).toBe(true);

    expect(isAttachedPic(validVideo)).toBe(false);
  });

  test('isAttachedPic should handle undefined or malformed codec_name safely', () => {
    const malformedStream = { 
      index: 6, 
      codec_type: 'video', 
      codec_name: undefined 
    } as any;

    expect(() => isAttachedPic(malformedStream)).not.toThrow();
    expect(isAttachedPic(malformedStream)).toBe(false);
  });

  test('isGarbageStream should group image subtitles and cover art as garbage', () => {
    expect(isGarbageStream(imageSubPGS)).toBe(true);
    expect(isGarbageStream(coverArtAttached)).toBe(true);
    expect(isGarbageStream(coverArtMjpeg)).toBe(true);

    expect(isGarbageStream(validVideo)).toBe(false);
    expect(isGarbageStream(validAudio)).toBe(false);
    expect(isGarbageStream(textSub)).toBe(false);
  });

  test('hasEmbeddedGarbage should return true if there is any garbage in the array', () => {
    const cleanStreams = [validVideo, validAudio, textSub];
    const dirtyStreams = [validVideo, validAudio, imageSubPGS];

    expect(hasEmbeddedGarbage(cleanStreams)).toBe(false);
    expect(hasEmbeddedGarbage(dirtyStreams)).toBe(true);
  });

  test('filterGarbageStreams should remove all tracks considered garbage', () => {
    const mixedStreams = [validVideo, validAudio, textSub, imageSubPGS, coverArtAttached];
    
    const filtered = filterGarbageStreams(mixedStreams);

    expect(filtered).toHaveLength(3);
    expect(filtered).toContain(validVideo);
    expect(filtered).toContain(validAudio);
    expect(filtered).toContain(textSub);
    
    expect(filtered).not.toContain(imageSubPGS);
    expect(filtered).not.toContain(coverArtAttached);
  });
});
