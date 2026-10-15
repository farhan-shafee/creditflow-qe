export function allowedOrigin(origin: string | null, host: string | null, configured: string | undefined, local: boolean): boolean {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.host !== host) return false;
    if (configured) return new URL(configured).origin === origin && parsed.protocol === 'https:';
    return local && ['http://localhost:3100', 'http://127.0.0.1:3100', 'http://web:3100'].includes(origin);
  } catch { return false; }
}

export class BodyError extends Error {
  readonly status: number;
  constructor(status: number) { super(status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_BODY'); this.status = status; }
}

export async function readJsonBody(body: ReadableStream<Uint8Array> | null, maximum = 1024): Promise<Record<string, unknown>> {
  if (!body) throw new BodyError(400);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new BodyError(413); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BodyError(400);
    return parsed as Record<string, unknown>;
  } catch { throw new BodyError(400); }
}
