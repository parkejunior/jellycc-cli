/**
 * Calculates the exact delay between two audio buffers using the Pearson Correlation Coefficient (PCC).
 * Extracted arrays must be sampled at 1000Hz for a 1:1 millisecond mapping.
 * Time Complexity: O(N * (M - N))
 */
export const calculateSpectrumDelay = (audioA: Float32Array, audioB: Float32Array): number => {
  const lenA = audioA.length;
  const lenB = audioB.length;
  const slideRange = lenB - lenA;

  if (slideRange < 0) {
    throw new Error('Search window in File B must be larger than File A snippet.');
  }

  let sumA = 0;
  for (let i = 0; i < lenA; i++) sumA += audioA[i]!;
  const meanA = sumA / lenA;

  let varA = 0;
  for (let i = 0; i < lenA; i++) {
    const diff = audioA[i]! - meanA;
    varA += diff * diff;
  }

  if (varA === 0) return 0;

  let maxPCC = -Infinity;
  let bestOffset = 0;

  let sumB = 0;
  for (let i = 0; i < lenA; i++) sumB += audioB[i]!;

  for (let i = 0; i <= slideRange; i++) {
    if (i > 0) {
      sumB = sumB - audioB[i - 1]! + audioB[i + lenA - 1]!;
    }
    const meanB = sumB / lenA;

    let covariance = 0;
    let varB = 0;

    for (let j = 0; j < lenA; j++) {
      const valB_diff = audioB[i + j]! - meanB;
      covariance += (audioA[j]! - meanA) * valB_diff;
      varB += valB_diff * valB_diff;
    }

    if (varB > 0) {
      const pcc = covariance / Math.sqrt(varA * varB);
      const absPCC = Math.abs(pcc);

      if (absPCC > maxPCC) {
        maxPCC = absPCC;
        bestOffset = i;
      }
    }
  }

  return bestOffset;
};