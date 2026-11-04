import { NextRequest, NextResponse } from 'next/server';
import { backend, safeError, sameOrigin, signingKey } from '../../../../lib/backend';
import { encodeSession } from '../../../../lib/session';
import { BodyError, readJsonBody } from '../../../../lib/request-policy';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return safeError('ORIGIN_REJECTED', 403);
  if (Number(request.headers.get('content-length') ?? 0) > 1024) return safeError('REQUEST_TOO_LARGE', 413);
  try {
    if (Object.keys(await readJsonBody(request.body, 1024, true)).length) return safeError('INVALID_BODY', 400);
    const response = await backend('/api/v1/sandboxes', { method: 'POST' });
    if (!response.ok) return safeError('SANDBOX_UNAVAILABLE', response.status === 429 ? 429 : 503);
    const created: unknown = await response.json();
    if (!created || typeof created !== 'object') return safeError('INVALID_UPSTREAM', 502);
    const value = created as Record<string, unknown>;
    const expiresAt = typeof value.expiresAt === 'string' ? Math.floor(Date.parse(value.expiresAt) / 1000) : NaN;
    if (typeof value.accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.accountId) || typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return safeError('INVALID_UPSTREAM', 502);
    const result = NextResponse.json({ accountId: value.accountId, expiresAt: value.expiresAt }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    result.cookies.set('creditflow_lab_session', encodeSession({ accountId: value.accountId, token: value.token, expiresAt }, signingKey()), { httpOnly: true, secure: request.headers.get('origin')?.startsWith('https:') === true, sameSite: 'strict', path: '/api/lab', maxAge: expiresAt - Math.floor(Date.now() / 1000) });
    return result;
  } catch (error) { return error instanceof BodyError ? safeError(error.message, error.status) : safeError('BACKEND_UNAVAILABLE', 503); }
}
