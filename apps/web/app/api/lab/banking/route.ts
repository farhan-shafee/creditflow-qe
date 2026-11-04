import { NextRequest, NextResponse } from 'next/server';
import { backend, safeError, sameOrigin, session } from '../../../../lib/backend';
import { BodyError, readJsonBody } from '../../../../lib/request-policy';
import { readSnapshot, sanitizePayload } from '../../../../lib/banking';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const current = session(request, 'creditflow_lab_session');
    if (!current) return safeError('SESSION_REQUIRED', 401);
    const options = { headers: { Authorization: `Bearer ${current.token}` } };
    const [account, history] = await Promise.all([
      backend(`/api/v1/accounts/${encodeURIComponent(current.accountId)}`, options),
      backend(`/api/v1/accounts/${encodeURIComponent(current.accountId)}/transactions`, options)
    ]);
    if (account.status === 401 || history.status === 401) return safeError('SESSION_REQUIRED', 401);
    if (!account.ok || !history.ok) return safeError('BACKEND_UNAVAILABLE', 503);
    const payload = readSnapshot({ account: await account.json(), history: await history.json() });
    if (!payload || payload.account.id !== current.accountId) return safeError('INVALID_UPSTREAM', 502);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return safeError('BACKEND_UNAVAILABLE', 503); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return safeError('ORIGIN_REJECTED', 403);
  if (Number(request.headers.get('content-length') ?? 0) > 1024) return safeError('REQUEST_TOO_LARGE', 413);
  try {
    const current = session(request, 'creditflow_lab_session');
    if (!current) return safeError('SESSION_REQUIRED', 401);
    if (request.headers.get('X-Lab-Account') !== current.accountId) return safeError('LAB_SESSION_CHANGED', 409);
    const body = await readJsonBody(request.body);
    if (Object.keys(body).length !== 3 || !['payments', 'purchases'].includes(String(body.operation)) || typeof body.amount !== 'string' || typeof body.key !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(body.key)) return safeError('INVALID_BODY', 400);
    const result = await backend(`/api/v1/accounts/${encodeURIComponent(current.accountId)}/${body.operation}`, { method: 'POST', headers: { Authorization: `Bearer ${current.token}`, 'Idempotency-Key': body.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: body.amount }) });
    const payload = sanitizePayload(await result.json());
    if (!payload) return safeError('INVALID_UPSTREAM', 502);
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    const replayed = result.headers.get('Idempotency-Replayed');
    if (replayed === 'true' || replayed === 'false') headers['Idempotency-Replayed'] = replayed;
    return NextResponse.json(payload, { status: result.status, headers });
  } catch (error) { return error instanceof BodyError ? safeError(error.message, error.status) : safeError('BACKEND_UNAVAILABLE', 503); }
}
