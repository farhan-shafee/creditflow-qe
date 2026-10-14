import { createHmac, timingSafeEqual } from 'node:crypto';

export type SandboxSession = { accountId: string; token: string; expiresAt: number };
export function encodeSession(session: SandboxSession, secret: string): string {
  const body = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function decodeSession(value: string, secret: string, now: number): SandboxSession | null {
  if (value.length > 2048) return null;
  const [body, signature, extra] = value.split('.');
  if (!body || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!data || typeof data !== 'object') return null;
    const s = data as Partial<SandboxSession>;
    if (typeof s.accountId !== 'string' || typeof s.token !== 'string' || typeof s.expiresAt !== 'number' || !Number.isFinite(s.expiresAt) || s.expiresAt <= now) return null;
    return s as SandboxSession;
  } catch { return null; }
}
