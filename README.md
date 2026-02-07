# NutriVoice

NutriVoice is a voice-first nutrition tracking application built with React and the Google Gemini Live API. It allows users to log their meals simply by speaking, using real-time audio streaming and multimodal AI to parse natural language into structured nutritional data.

## Features

- **Voice-Activated Logging**: distinct "Hold to Speak" interface that streams audio in real-time.
- **Real-time AI Processing**: Uses Gemini 2.5 Flash Native Audio model to listen, understand, and extract food data instantly.
- **Macro Tracking**: Automatically calculates and categorizes Calories, Protein, Carbs, Fat, and Fiber.
- **Audio Visualizer**: Real-time visual feedback of audio input amplitude.
- **Persistent Storage**: Saves daily logs to the browser's LocalStorage.
- **Mobile-First Design**: Optimized layout with bottom navigation and touch-friendly controls.

## Technology Stack

### Frontend
- **React 19**: Core UI framework.
- **Tailwind CSS**: Utility-first styling with a custom "Stone" color palette and "Inter" typography.
- **Lucide React**: Iconography.
- **Web Audio API**: Used for capturing microphone input, downsampling to 16kHz, and raw PCM processing.

### Artificial Intelligence
- **Google GenAI SDK**: `@google/genai` for interacting with Gemini models.
- **Gemini Live API**: Utilizes the WebSocket-based `connect` method for low-latency, bidirectional streaming.
- **Model**: `gemini-2.5-flash-native-audio-preview-12-2025`.
- **Tool Use (Function Calling)**: Defines a strict `log_food` tool that forces the model to output structured JSON data instead of conversational text.

## How It Works

1.  **Audio Capture**: When the microphone button is held, the app captures audio via the browser's `MediaStream`.
2.  **PCM Conversion**: The audio is downsampled to 16kHz and converted to 16-bit PCM (Pulse Code Modulation) format, which is required by the Gemini Live API.
3.  **Streaming**: Audio chunks are base64 encoded and sent immediately over an open WebSocket connection to Google's servers.
4.  **Tool Execution**: 
    - The System Instruction tells Gemini to act as a silent logger.
    - When Gemini detects food items in the audio stream, it triggers the `log_food` function call.
    - The app intercepts this function call, extracts the arguments (Name, Quantity, Calories, Macros), and updates the local state.
5.  **Feedback**: The app renders the new item in the list and updates the daily dashboard summary.

## Setup

This application uses ES Modules via `importmap` and requires no build step (like Webpack or Vite) for simple deployment, though it runs best in a development server environment.

1.  **API Key**: You need a valid Google Gemini API Key.
    *   The app expects `process.env.API_KEY` to be available.
    *   If running locally, ensure your environment provides this key.

2.  **Permissions**:
    *   Microphone access is required. The browser will prompt for permission upon the first interaction.

## Project Structure

- `App.tsx`: Main application controller, handles audio session state and UI layout.
- `services/geminiLiveService.ts`: Manages the WebSocket connection, audio encoding, and Gemini interaction protocols.
- `components/`:
    - `Dashboard.tsx`: Visualizes daily nutrition stats.
    - `FoodTable.tsx`: Lists individual meal logs.
    - `Visualizer.tsx`: Renders the audio waveform animation.
- `types.ts`: TypeScript interfaces for Food Items and Stats.
