# NutriVoice — Project overview

Voice-based nutrition logger: you say what you ate, the app turns it into structured food entries with estimated nutrients.

---

## High-level flow

```
User holds mic → Voice (browser) → PCM 16kHz → Base64 → POST /api/process-audio
                                                              ↓
                                              Server adds WAV header, keeps API key server-side
                                                              ↓
                                              Gemini (generateContent) — audio + tool (log_food)
                                                              ↓
                                              Response: transcription + one or more log_food calls
                                                              ↓
Client ← JSON { transcription, foods[] } ← Parse tool calls → Update UI (table + daily stats)
```

---

## Step-by-step

| Step | Where | What happens |
|------|--------|--------------|
| 1. **Voice input** | Browser | User holds the mic button; `getUserMedia` captures microphone. |
| 2. **Record** | Client (`ProcessAudioService`) | Audio is processed in chunks (ScriptProcessor 4096 samples), converted to **PCM 16-bit mono 16 kHz**, and buffered in memory. Amplitude is sent to the UI for the visualizer. |
| 3. **Encode** | Client | When the user releases the button, the full PCM buffer is encoded as **Base64**. |
| 4. **Send** | Client | `POST /api/process-audio` with body `{ audioBase64 }`. No API key is sent; the client never sees it. |
| 5. **Validate** | Server (`api/process-audio.ts`) | Check `GEMINI_API_KEY`, body, and minimum audio length. |
| 6. **PCM → WAV** | Server | Base64 PCM is decoded; a 44-byte WAV header is prepended and the result is re-encoded as Base64 (Gemini expects a normal audio format). |
| 7. **LLM request** | Server | Request to Gemini `generateContent`: audio (inlineData) + text instruction + tool definition (`log_food` with name, quantity, calories, protein, carbs, fat, fiber, etc.). API key is used only here. |
| 8. **LLM response** | Server | Gemini returns text (transcription) and one or more **tool calls** (`log_food` with estimated nutrients). Server parses and collects them into a `foods` array. |
| 9. **Response** | Server → Client | JSON: `{ transcription?, foods[] }`. On 503/429, server retries a few times, then returns a clear error. |
| 10. **UI update** | Client | For each item in `foods`, `onFoodLogged` is called → new rows in the table and updated daily stats (calories, protein, etc.). Data is persisted in `localStorage`. |

---

## Security

- **API key** lives only in server env (`GEMINI_API_KEY`). The browser only talks to `/api/process-audio`; it never receives or sends the key.
- **Deploy**: set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in your host’s environment (e.g. Vercel project settings).

---

## Main files

- **Client**
  - `App.tsx` — UI, mic button, table, stats; uses `ProcessAudioService`.
  - `services/processAudioService.ts` — Recording, PCM buffer, Base64, `fetch('/api/process-audio')`, handles `foods[]`.
  - `services/audioUtils.ts` — `float32ToPCM16`, `arrayBufferToBase64`.
- **Server**
  - `api/process-audio.ts` — Vercel serverless handler: validate, PCM→WAV, call Gemini with `log_food` tool, parse response, return `{ transcription, foods }`.

---

## Optional env (server)

| Variable | Purpose |
|----------|--------|
| `GEMINI_API_KEY` | Required. Used only in `api/process-audio`. |
| `GEMINI_MODEL` | Optional. Default `gemini-2.5-flash`. Use e.g. `gemini-2.5-flash-lite` for different quota. |
