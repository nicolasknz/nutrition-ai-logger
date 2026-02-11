import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Same tool + instruction + response handling as in services/geminiLiveService.ts
 * (previously: logFoodTool, systemInstruction in live.connect, handleMessage for toolCall/inputTranscription).
 * Moved here so the API key stays server-side; client only sends audio and receives { transcription, food }.
 */
const LOG_FOOD_SCHEMA = {
  name: 'log_food',
  description:
    'Log a food item. Call this when the user mentions eating something. You MUST estimate the nutritional values based on the food and quantity provided.',
  parameters: {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', description: 'Name of the food item' },
      quantity: { type: 'STRING', description: 'Amount consumed (e.g. 1 cup, 2 slices)' },
      calories: { type: 'NUMBER', description: 'Estimated calories (kCal)' },
      protein: { type: 'NUMBER', description: 'Protein in grams' },
      carbs: { type: 'NUMBER', description: 'Carbohydrates in grams' },
      fat: { type: 'NUMBER', description: 'Fat in grams' },
      fiber: { type: 'NUMBER', description: 'Fiber in grams' },
      micronutrients: { type: 'STRING', description: 'Key micronutrients (comma separated)' },
    },
    required: ['name', 'quantity', 'calories', 'protein', 'carbs', 'fat', 'fiber'],
  },
};

/** Build a minimal WAV header for PCM 16-bit mono at 16kHz */
function pcmToWavBase64(pcmBase64: string): string {
  const pcmBuffer = Buffer.from(pcmBase64, 'base64');
  const numChannels = 1;
  const sampleRate = 16000;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);
  let offset = 0;

  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4; // chunk size
  buffer.writeUInt16LE(1, offset); offset += 2;  // PCM
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), offset); offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset);
  pcmBuffer.copy(buffer, headerSize);

  return buffer.toString('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
  }

  const body = req.body as { audioBase64?: string; preferredLanguage?: string };
  const audioBase64 = body?.audioBase64;
  const preferredLanguage = body?.preferredLanguage === 'pt-BR' ? 'pt-BR' : 'en-US';
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'Missing audioBase64 in body' });
  }
  if (Buffer.from(audioBase64, 'base64').length < 1000) {
    return res.status(400).json({ error: 'Audio too short. Hold the mic a bit longer.' });
  }

  const wavBase64 = pcmToWavBase64(audioBase64);
  // Must support generateContent; use GEMINI_MODEL to override (e.g. gemini-2.0-flash-lite for quota)
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const languageInstruction =
    preferredLanguage === 'pt-BR'
      ? 'The speaker may be using Portuguese (Brazil). Understand Portuguese naturally and extract each food/drink item correctly. Keep the transcription in Portuguese when possible.'
      : 'The speaker may be using English. Understand English naturally and extract each food/drink item correctly.';

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Listen to this audio. The user is stating what they ate or drank. ${languageInstruction} For EACH separate food or drink mentioned, call the log_food tool once (e.g. "2 bananas and 3 eggs" = two calls: one for bananas, one for eggs). Use your best estimate for each item. Do not ask questions; just log everything mentioned. If nothing food-related is said, do not call the tool.`,
          },
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: wavBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
    tools: [
      {
        functionDeclarations: [LOG_FOOD_SCHEMA],
      },
    ],
  };

  const maxRetries = 2;
  const retryDelayMs = 2000;

  try {
    let geminiRes: Response;
    let errText = '';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (geminiRes.ok) break;
      errText = await geminiRes.text();
      const isRetryable = geminiRes.status === 503 || geminiRes.status === 429;
      if (!isRetryable || attempt === maxRetries) break;
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }

    if (!geminiRes!.ok) {
      console.error('Gemini API error', geminiRes!.status, errText);
      if (geminiRes!.status === 429) {
        return res.status(429).json({
          error: 'Quota exceeded',
          details: 'Gemini rate limit reached. Wait a minute or check your plan at ai.google.dev.',
        });
      }
      if (geminiRes!.status === 503) {
        return res.status(503).json({
          error: 'Model overloaded',
          details: 'Gemini is busy. Try again in a moment.',
        });
      }
      return res.status(502).json({
        error: geminiRes!.status === 401 ? 'Invalid API key' : 'Upstream API error',
        details: errText.slice(0, 200),
      });
    }

    interface Part {
      text?: string;
      functionCall?: { name: string; args: Record<string, unknown> };
      function_call?: { name: string; args: Record<string, unknown> };
    }
    const data = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Part[] } }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    let transcription: string | undefined;
    const foods: Record<string, unknown>[] = [];

    for (const part of parts) {
      if (part.text) transcription = part.text;
      const fc = part.functionCall ?? part.function_call;
      if (fc?.name === 'log_food' && fc.args) {
        const args = fc.args as Record<string, unknown>;
        foods.push({
          name: args.name,
          quantity: args.quantity,
          calories: args.calories,
          protein: args.protein,
          carbs: args.carbs,
          fat: args.fat,
          fiber: args.fiber ?? 0,
          micronutrients: args.micronutrients ?? '',
        });
      }
    }

    return res.status(200).json({ transcription: transcription ?? null, foods });
  } catch (err) {
    console.error('process-audio error', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Processing failed',
    });
  }
}
