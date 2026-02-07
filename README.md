# NutriVoice

NutriVoice is a voice-first nutrition tracking app built with React and the Google Gemini API. Log meals by speaking; the app sends audio to a serverless API, and Gemini returns structured food entries with estimated nutrients.

## Features

- **Voice-activated logging**: Hold the mic, speak what you ate, release to process.
- **Multi-item support**: Say "2 bananas and 3 eggs" and both are logged.
- **Macro tracking**: Calories, protein, carbs, fat, and fiber with a daily summary.
- **Audio visualizer**: Real-time feedback while recording.
- **Persistent storage**: Logs saved in the browser’s LocalStorage.
- **Mobile-first**: Bottom nav and touch-friendly layout.

## Technology stack

- **Frontend**: React 19, Tailwind CSS, Lucide icons, Web Audio API (mic capture, 16 kHz PCM).
- **Backend**: Vercel serverless (`/api/process-audio`). API key stays on the server.
- **AI**: Gemini `generateContent` with audio input and `log_food` tool (function calling). Default model: `gemini-2.5-flash` (override with `GEMINI_MODEL`).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full flow (voice → PCM → base64 → API → Gemini → foods → UI).

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Set `GEMINI_API_KEY` in `.env.local` (used only by the serverless API, not the browser).
3. Run the full app (frontend + API):
   - `npx vercel dev` — Vite app and `/api` so the app can call `/api/process-audio`.
   - Or `npm run dev` for frontend only (API calls will 404 unless you deploy).

## Deploy (e.g. Vercel)

- Connect the repo to Vercel. Build runs `npm run build`; the `api/` folder is deployed as serverless functions.
- In the project’s **Environment Variables**, set `GEMINI_API_KEY`. Optionally set `GEMINI_MODEL` (e.g. `gemini-2.5-flash-lite`). The key is only used on the server; the client never sees it.

## Project structure

- `App.tsx` — Main UI, mic button, table, daily stats.
- `services/processAudioService.ts` — Records audio, buffers PCM, POSTs to `/api/process-audio`, handles `foods[]`.
- `services/audioUtils.ts` — PCM encoding helpers.
- `api/process-audio.ts` — Serverless handler: validates input, PCM→WAV, calls Gemini with `log_food` tool, returns `{ transcription, foods }`.
- `components/` — `Dashboard`, `FoodTable`, `Visualizer`.
- `types.ts` — Food item and stats types.
