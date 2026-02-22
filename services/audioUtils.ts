export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  // Convert Uint8Array back to Int16Array (raw PCM)
  // The data from Gemini Live is 16-bit PCM (little-endian)
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length; 
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    // Convert 16-bit integer to float [-1.0, 1.0]
    channelData[i] = dataInt16[i] / 32768.0;
  }
  
  return buffer;
}

/** Build a WAV Blob directly from accumulated PCM chunks (16-bit mono 16kHz). No base64, no extra copy. */
export function buildWavBlob(pcmChunks: Int16Array[]): Blob {
  const totalSamples = pcmChunks.reduce((s, c) => s + c.length, 0);
  const dataSize = totalSamples * 2; // 16-bit = 2 bytes/sample
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);

  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };

  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, byteRate, true);
  v.setUint16(32, numChannels * (bitsPerSample / 8), true); v.setUint16(34, bitsPerSample, true);
  str(36, 'data'); v.setUint32(40, dataSize, true);

  const parts: BlobPart[] = [header, ...pcmChunks.map((c) => c.buffer)];
  return new Blob(parts, { type: 'audio/wav' });
}

export function float32ToPCM16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}