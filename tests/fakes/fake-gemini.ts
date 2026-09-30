/*
 * A fake Gemini REST endpoint for handler tests: it records every request and
 * answers from a script. No test ever reaches the network.
 */

export type GeminiCall = { url: string; headers: Record<string, string>; body: GeminiRequestBody };
export type GeminiRequestBody = {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ parts: Array<{ text: string }> }>;
  generationConfig: Record<string, unknown>;
};

export const TEST_KEY = "AIzaSy-SENTINEL-test-key-000000000000";

export function geminiText(text: string, finishReason = "STOP"): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason, content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 200, totalTokenCount: 800 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

export const geminiJson = (value: unknown): Response => geminiText(JSON.stringify(value));

export const geminiStatus = (status: number): Response =>
  new Response(JSON.stringify({ error: { code: status, message: "raw provider text that must not leak" } }), { status });

/** The JSON the application put into the user turn. */
export function userContent(call: GeminiCall): { letter: string; items?: Array<{ category: string; label: string; answer: string | null }>; category?: string } {
  return JSON.parse(call.body.contents[0]!.parts[0]!.text);
}

export function fakeGemini(respond: (call: GeminiCall, index: number) => Response | Promise<Response>) {
  const calls: GeminiCall[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: GeminiCall = {
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)) as GeminiRequestBody,
    };
    calls.push(call);
    return respond(call, calls.length - 1);
  }) as typeof fetch;
  return { impl, calls };
}

export const allowAll = { take: () => true };
