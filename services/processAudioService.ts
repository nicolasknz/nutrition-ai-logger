import { float32ToPCM16, arrayBufferToBase64 } from './audioUtils';
import type { FoodItem } from '../types';

/** Browser SpeechRecognition (Chrome: webkitSpeechRecognition) for testing mode (no LLM). */
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(i: number): SpeechRecognitionResult;
  [i: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  length: number;
  item(i: number): SpeechRecognitionAlternative;
  [i: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/**
 * Recording logic was in services/geminiLiveService.ts (handleOpen + onaudioprocess: getUserMedia,
 * ScriptProcessor 4096, PCM 16kHz, amplitude for visualizer). Here we buffer chunks and POST once
 * to /api/process-audio instead of streaming to Gemini Live; same callbacks (onFoodLogged, etc.).
 * When testingMode is true, we use the Web Speech API only and do not call the LLM.
 */
export interface ApiDebugInfo {
  status: number;
  ok: boolean;
  foodsCount: number;
  errorMsg?: string;
  payloadBytes?: number;
}
export interface ProcessAudioServiceConfig {
  /** When true, transcribe with browser Web Speech API only; do not send to /api/process-audio (no LLM). */
  testingMode?: boolean;
  onFoodLogged: (food: Omit<FoodItem, 'id' | 'timestamp'>) => void;
  onAudioData: (amplitude: number) => void;
  onTranscription: (text: string) => void;
  /** In testing mode only: called with final transcript before onClose. */
  onTestingComplete?: (transcript: string) => void;
  onError: (error: Error) => void;
  onClose: () => void;
  /** Optional: called after each API request (status, foods count, error); for production debugging. */
  onDebug?: (info: ApiDebugInfo) => void;
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
  /** Used in testing mode: Web Speech API recognition (no LLM). */
  private recognition: SpeechRecognitionInstance | null = null;
  private testingTranscript = '';
  private _testingFallback = 0;

  constructor(config: ProcessAudioServiceConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    try {
      this.active = true;
      this.pcmChunks = [];
      this.testingTranscript = '';
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

      if (this.config.testingMode) {
        const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognitionCtor) {
          this.recognition = new SpeechRecognitionCtor();
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = navigator.language || 'en-US';
          this.recognition.onresult = (e: SpeechRecognitionEvent) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const r = e.results[i];
              const text = r[0]?.transcript ?? '';
              if (r.isFinal && text) {
                this.testingTranscript = (this.testingTranscript + ' ' + text).replace(/\s+/g, ' ').trim();
              }
            }
            // Show live transcript (final + any interim) for overlay
            let live = this.testingTranscript;
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const t = e.results[i]?.[0]?.transcript ?? '';
              if (t) live = (live + ' ' + t).replace(/\s+/g, ' ').trim();
            }
            if (live) this.config.onTranscription(live);
          };
          this.recognition.onerror = () => {};
          const finishTesting = () => {
            const rec = this.recognition;
            this.recognition = null;
            if (!rec) return;
            clearTimeout(this._testingFallback);
            const final = this.testingTranscript.trim();
            if (final) {
              this.config.onTranscription(final);
              this.config.onTestingComplete?.(final);
            }
            this.config.onClose();
          };
          this.recognition.onend = finishTesting;
          this.recognition.start();
        } else {
          this.config.onError(new Error('Testing mode requires SpeechRecognition (e.g. Chrome)'));
        }
      }
    } catch (err) {
      this.config.onError(err instanceof Error ? err : new Error('Failed to start microphone'));
      this.active = false;
    }
  }

  stopInput(): void {
    if (!this.active) return;

    if (this.config.testingMode && this.recognition) {
      // stop() is async; final transcript arrives in onresult before onend
      this.recognition.stop();
      // Fallback: if onend never fires, finish after 2.5s
      this._testingFallback = setTimeout(() => {
        this._testingFallback = 0;
        const final = this.testingTranscript.trim();
        if (final) {
          this.config.onTranscription(final);
          this.config.onTestingComplete?.(final);
        }
        this.config.onClose();
        this.recognition = null;
      }, 2500);
    }

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

    if (!this.config.testingMode) {
      this.sendToApi(audioBase64);
    }
  }

  private async sendToApi(audioBase64: string): Promise<void> {
    const payloadBytes = new TextEncoder().encode(JSON.stringify({ audioBase64 })).length;
    const report = (info: ApiDebugInfo) => {
      this.config.onDebug?.({ ...info, payloadBytes });
    };
    try {
      const res = await fetch('/api/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64 }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || data?.details || `Request failed (${res.status})`;
        report({ status: res.status, ok: false, foodsCount: 0, errorMsg: msg });
        this.config.onError(new Error(msg));
        this.config.onClose();
        return;
      }

      if (data.transcription) {
        this.config.onTranscription(data.transcription);
      }
      const foods = data.foods ?? (data.food ? [data.food] : []);
      const count = Array.isArray(foods) ? foods.length : 0;
      report({ status: res.status, ok: true, foodsCount: count });
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
      const msg = err instanceof Error ? err.message : 'Network error';
      report({ status: 0, ok: false, foodsCount: 0, errorMsg: msg });
      this.config.onError(err instanceof Error ? err : new Error('Network error'));
      this.config.onClose();
    }
  }

  stop(): void {
    this.active = false;
    if (this._testingFallback) {
      clearTimeout(this._testingFallback);
      this._testingFallback = 0;
    }
    if (this.recognition) {
      this.recognition.abort();
      this.recognition = null; // onend may still fire; handler checks rec and skips if nulled
    }
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
