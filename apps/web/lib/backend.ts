import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { decodeSession, type SandboxSession } from './session';
import { allowedOrigin } from './request-policy';

const globalState = globalThis as typeof globalThis & { creditflowLocalKey?: string };
export function signingKey(): string {
  const configured = process.env.CREDITFLOW_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production' && process.env.CREDITFLOW_LOCAL_DEMO !== 'true') throw new Error('Session signing key is not configured');
  globalState.creditflowLocalKey ??= randomBytes(32).toString('hex');
  return globalState.creditflowLocalKey;
}
export function session(request: NextRequest): SandboxSession | null {
  return decodeSession(request.cookies.get('creditflow_session')?.value ?? '', signingKey(), Math.floor(Date.now() / 1000));
}
export function sameOrigin(request: NextRequest): boolean {
  return allowedOrigin(request.headers.get('origin'), request.headers.get('host'), process.env.CREDITFLOW_WEB_ORIGIN, process.env.CREDITFLOW_LOCAL_DEMO === 'true' || process.env.NODE_ENV !== 'production');
}
export function safeError(code: string, status: number): NextResponse {
  return NextResponse.json({ code, message: code === 'SESSION_REQUIRED' ? 'Start a new synthetic account to continue.' : 'The request could not be completed. Try again.' }, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function backend(path: string, options: RequestInit = {}): Promise<Response> {
  const base = process.env.CREDITFLOW_API_URL ?? 'http://127.0.0.1:18081';
  const target = new URL(base);
  if (process.env.NODE_ENV === 'production' && process.env.CREDITFLOW_LOCAL_DEMO !== 'true' && target.protocol !== 'https:') throw new Error('HTTPS API required');
  const key = process.env.CREDITFLOW_PROVISION_KEY;
  if (process.env.NODE_ENV === 'production' && process.env.CREDITFLOW_LOCAL_DEMO !== 'true' && (!key || key.length < 32)) throw new Error('API server key required');
  const headers = new Headers(options.headers);
  if (key) headers.set('X-Sandbox-Provision-Key', key);
  return fetch(new URL(path, target), { ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
}
