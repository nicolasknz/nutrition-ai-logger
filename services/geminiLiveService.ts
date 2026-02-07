import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { base64ToUint8Array, float32ToPCM16, arrayBufferToBase64 } from "./audioUtils";
import { FoodItem } from "../types";

// Tool Definition
const logFoodTool: FunctionDeclaration = {
  name: "log_food",
  description: "Log a food item. Call this when the user mentions eating something. You MUST estimate the nutritional values based on the food and quantity provided.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The name of the food item (e.g., 'Oatmeal', 'Banana')" },
      quantity: { type: Type.STRING, description: "The amount consumed (e.g., '1 cup', '2 slices')" },
      calories: { type: Type.NUMBER, description: "Estimated calories (kCal)" },
      protein: { type: Type.NUMBER, description: "Estimated protein in grams" },
      carbs: { type: Type.NUMBER, description: "Estimated carbohydrates in grams" },
      fat: { type: Type.NUMBER, description: "Estimated fat in grams" },
      fiber: { type: Type.NUMBER, description: "Estimated fiber in grams" },
      micronutrients: { type: Type.STRING, description: "Key micronutrients present (comma separated string)" }
    },
    required: ["name", "quantity", "calories", "protein", "carbs", "fat", "fiber"]
  }
};

interface LiveServiceConfig {
  onFoodLogged: (food: Omit<FoodItem, 'id' | 'timestamp'>) => void;
  onAudioData: (amplitude: number) => void; // For visualizer
  onTranscription: (text: string) => void; // Receive input transcription chunks
  onError: (error: Error) => void;
  onClose: () => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private config: LiveServiceConfig;
  private audioCtx: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sessionPromise: Promise<any> | null = null;
  private stream: MediaStream | null = null;
  private active = false;
  private responseTimeout: any = null;

  constructor(config: LiveServiceConfig) {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.config = config;
  }

  async start() {
    try {
      this.active = true;
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        sampleRate: 16000, // Gemini Native Audio prefers 16kHz input
      }});
      
      // Initialize Session
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {}, // Enable transcription for user input audio
          tools: [{ functionDeclarations: [logFoodTool] }],
          systemInstruction: `You are NutriVoice, a nutrition logger. 
          Your ONLY task is to listen to the user's food intake and immediately call the 'log_food' tool.
          Do NOT speak. Do NOT ask for confirmation. Do NOT ask clarifying questions. 
          Just estimate the values best you can and log it silently.
          If the user input is unclear, make your best guess for the log.`,
        },
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onclose: () => {
            if (this.active) {
              this.config.onClose();
            }
            this.active = false;
          },
          onerror: (e) => {
            console.error("Gemini Live Error", e);
            if (this.active) {
              this.config.onError(new Error("Connection error"));
            }
          }
        }
      });

    } catch (err) {
      this.config.onError(err instanceof Error ? err : new Error("Failed to start audio"));
      this.active = false;
    }
  }

  private handleOpen() {
    console.log("Gemini Live Session Opened");
    if (!this.audioCtx || !this.stream) return;

    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const source = inputCtx.createMediaStreamSource(this.stream);
    
    // Buffer size 4096, 1 input channel, 1 output channel
    this.processor = inputCtx.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (e) => {
      if (!this.active) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate amplitude for visualizer
      let sum = 0;
      for(let i=0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.config.onAudioData(rms); // Send to UI

      // Convert to PCM 16-bit
      const pcm16 = float32ToPCM16(inputData);
      const pcmBlob = {
        mimeType: 'audio/pcm;rate=16000',
        data: arrayBufferToBase64(pcm16.buffer)
      };

      this.sessionPromise?.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    source.connect(this.processor);
    this.processor.connect(inputCtx.destination);
    this.inputSource = source; // Keep reference
  }

  private async handleMessage(message: LiveServerMessage) {
    if (!this.active && !this.responseTimeout) return; // Allow processing if we are in "waiting for response" state

    // Handle Input Transcription
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      if (text) {
        this.config.onTranscription(text);
      }
    }

    // Handle Tool Calls (The core logic)
    if (message.toolCall) {
      let foodLogged = false;
      for (const fc of message.toolCall.functionCalls) {
        if (fc.name === 'log_food') {
          const args = fc.args as any;
          console.log("Tool Call received:", args);
          
          this.config.onFoodLogged({
            name: args.name,
            quantity: args.quantity,
            calories: args.calories,
            protein: args.protein,
            carbs: args.carbs,
            fat: args.fat,
            fiber: args.fiber || 0,
            micronutrients: args.micronutrients || ''
          });
          foodLogged = true;

          // Send response back to model to satisfy protocol
          this.sessionPromise?.then(session => {
            session.sendToolResponse({
              functionResponses: {
                id: fc.id,
                name: fc.name,
                response: { result: "Logged" }
              }
            });
          });
        }
      }

      if (foodLogged) {
        console.log("Food logged, stopping session...");
        this.stop();
      }
    }
  }

  // Soft stop: Stops recording audio, but keeps session open briefly to receive the response
  stopInput() {
    console.log("Stopping input, waiting for response...");
    
    // Stop capturing audio
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    
    this.config.onAudioData(0);

    // Set a fallback timeout to close the session if the model doesn't respond quickly
    if (this.active) {
       this.responseTimeout = setTimeout(() => {
          console.log("Response timeout, closing session");
          this.stop();
       }, 4000); // Wait 4 seconds for response
    }
  }

  stop() {
    // Clear any pending timeout
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout);
      this.responseTimeout = null;
    }

    const wasActive = this.active;
    this.active = false;
    
    // Stop tracks if not already stopped
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }

    // Explicitly close the session
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        try {
          session.close();
        } catch (e) {
          console.warn("Error closing session:", e);
        }
      });
      this.sessionPromise = null;
    }
    
    if (wasActive) {
      this.config.onClose();
    }
    
    console.log("Stopped Gemini Live Service");
  }
}