import { describe, expect, test } from 'bun:test';
import { calculateSpectrumDelay } from './spectrumAnalyzer.ts';

describe('services/spectrumAnalyzer.ts', () => {
  test('Should return 0 for perfect alignment (identical arrays)', () => {
    const audioA = new Float32Array([0.1, -0.2, 0.5, 0.3]);
    const audioB = new Float32Array([0.1, -0.2, 0.5, 0.3]);
    
    expect(calculateSpectrumDelay(audioA, audioB)).toBe(0);
  });

  test('Should accurately find positive displacement', () => {
    const audioA = new Float32Array([0.5, 0.8, -0.2]);
    const audioB = new Float32Array([0, 0, 0.5, 0.8, -0.2, 0.1]);
    
    expect(calculateSpectrumDelay(audioA, audioB)).toBe(2);
  });

  test('Should align correctly even with inverted phase (phase shift)', () => {
    const audioA = new Float32Array([0.5, 0.8, -0.2]);
    const audioB = new Float32Array([0, 0, -0.5, -0.8, 0.2, 0]);
    
    expect(calculateSpectrumDelay(audioA, audioB)).toBe(2);
  });

  test('Should return 0 if snippet has absolute silence (zero variance)', () => {
    const audioA = new Float32Array([0, 0, 0]);
    const audioB = new Float32Array([0, 0, 0, 0, 0]);
    
    expect(calculateSpectrumDelay(audioA, audioB)).toBe(0);
  });

  test('Should throw error if search window is smaller than snippet', () => {
    const audioA = new Float32Array([1, 2, 3]);
    const audioB = new Float32Array([1, 2]);
    
    expect(() => calculateSpectrumDelay(audioA, audioB))
      .toThrow('Search window in File B must be larger than File A snippet.');
  });
});