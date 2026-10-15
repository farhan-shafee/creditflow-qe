import { NextRequest, NextResponse } from 'next/server';
import { backend, safeError, sameOrigin, signingKey } from '../../../lib/backend';
import { encodeSession } from '../../../lib/session';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return safeError('ORIGIN_REJECTED', 403);
  try {
    const headers: Record<string, string> = {};
    if (process.env.CREDITFLOW_PROVISION_KEY) headers['X-Sandbox-Provision-Key'] = process.env.CREDITFLOW_PROVISION_KEY;
    const response = await backend('/api/v1/sandboxes', { method: 'POST', headers });
    if (!response.ok) return safeError('SANDBOX_UNAVAILABLE', response.status === 429 ? 429 : 503);
    const created = await response.json() as { accountId: string; token: string; expiresAt: string };
    const expiresAt = Math.floor(new Date(created.expiresAt).getTime() / 1000);
    if (!created.accountId || !created.token || !Number.isFinite(expiresAt)) return safeError('INVALID_UPSTREAM', 502);
    const result = NextResponse.json({ accountId: created.accountId, expiresAt: created.expiresAt }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    result.cookies.set('creditflow_session', encodeSession({ accountId: created.accountId, token: created.token, expiresAt }, signingKey()), { httpOnly: true, secure: request.headers.get('origin')?.startsWith('https:') === true, sameSite: 'strict', path: '/', maxAge: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)) });
    return result;
  } catch { return safeError('BACKEND_UNAVAILABLE', 503); }
}
