/**
 * Sound as a WAV file of the plainest kind: one channel, 16 bits, no compression. Every program opens it.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const out = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(out);
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return out;
}

/** Reads a WAV file with 16-bit samples; of several channels the first. */
export function decodeWav(bytes: Uint8Array): { sampleRate: number; samples: Float32Array } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
  if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let sampleRate = 0;
  let channels = 1;
  let bits = 16;
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const size = v.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') {
      if (v.getUint16(at + 8, true) !== 1) throw new Error('only plain (PCM) WAV files can be read');
      channels = v.getUint16(at + 10, true);
      sampleRate = v.getUint32(at + 12, true);
      bits = v.getUint16(at + 22, true);
    } else if (tag(at) === 'data') {
      if (bits !== 16 || !sampleRate) throw new Error('only 16-bit WAV files can be read');
      const n = Math.floor(Math.min(size, bytes.byteLength - at - 8) / (2 * channels));
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = v.getInt16(at + 8 + i * 2 * channels, true) / 32768;
      return { sampleRate, samples };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error('no sound in this WAV file');
}
