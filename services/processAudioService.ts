import { float32ToPCM16, arrayBufferToBase64 } from './audioUtils';
import type { FoodItem } from '../types';

/**
 * Recording logic was in services/geminiLiveService.ts (handleOpen + onaudioprocess: getUserMedia,
 * ScriptProcessor 4096, PCM 16kHz, amplitude for visualizer). Here we buffer chunks and POST once
 * to /api/process-audio instead of streaming to Gemini Live; same callbacks (onFoodLogged, etc.).
 */
export interface ProcessAudioServiceConfig {
  onFoodLogged: (food: Omit<FoodItem, 'id' | 'timestamp'>) => void;
  onAudioData: (amplitude: number) => void;
  onTranscription: (text: string) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

/** Records mic audio and sends it to the serverless API for processing. No API key on client. */
export class ProcessAudioService {
  private config: ProcessAudioServiceConfig;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private active = false;
  private pcmChunks: Int16Array[] = [];

  constructor(config: ProcessAudioServiceConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    try {
      this.active = true;
      this.pcmChunks = [];
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      });

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      this.audioContext = ctx;
      const source = ctx.createMediaStreamSource(this.stream);
      this.source = source;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      this.processor = processor;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.active) return;
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.config.onAudioData(rms);

        const pcm16 = float32ToPCM16(inputData);
        this.pcmChunks.push(new Int16Array(pcm16));
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err) {
      this.config.onError(err instanceof Error ? err : new Error('Failed to start microphone'));
      this.active = false;
    }
  }

  stopInput(): void {
    if (!this.active) return;

    // Stop capturing
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    this.config.onAudioData(0);

    const totalLength = this.pcmChunks.reduce((acc, arr) => acc + arr.length, 0);
    const combined = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of this.pcmChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    this.pcmChunks = [];

    const audioBase64 = arrayBufferToBase64(combined.buffer);
    this.active = false;

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.sendToApi(audioBase64);
  }

  private async sendToApi(audioBase64: string): Promise<void> {
    try {
      const res = await fetch('/api/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64 }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || data?.details || `Request failed (${res.status})`;
        this.config.onError(new Error(msg));
        this.config.onClose();
        return;
      }

      if (data.transcription) {
        this.config.onTranscription(data.transcription);
      }
      const foods = data.foods ?? (data.food ? [data.food] : []);
      if (Array.isArray(foods)) {
        for (const f of foods) {
          if (f && typeof f === 'object') {
            const item = f as Record<string, unknown>;
            this.config.onFoodLogged({
              name: String(item.name ?? ''),
              quantity: String(item.quantity ?? ''),
              calories: Number(item.calories ?? 0),
              protein: Number(item.protein ?? 0),
              carbs: Number(item.carbs ?? 0),
              fat: Number(item.fat ?? 0),
              fiber: Number(item.fiber ?? 0),
              micronutrients: String(item.micronutrients ?? ''),
            });
          }
        }
      }

      this.config.onClose();
    } catch (err) {
      this.config.onError(err instanceof Error ? err : new Error('Network error'));
      this.config.onClose();
    }
  }

  stop(): void {
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.config.onAudioData(0);
    this.config.onClose();
  }
}
