import test from 'node:test';
import assert from 'node:assert/strict';
import { postingDecision } from '../lib/transaction-decision.ts';
import type { Exchange, Intent } from '../lib/banking.ts';
const account = '11111111-1111-4111-8111-111111111111';
const intent: Intent = { operation: 'payments', amount: '50', key: 'same-intent' };
const exchange = (status: number | null = 201, replayed: boolean | null = false): Exchange => ({ id: 'request', operation: 'payments', amount: '50', method: 'POST', path: '/api/banking', status, durationMs: 12, replayed, outcome: 'confirmed', observedAt: '2026-11-04T12:00:00Z', request: intent, response: { id: '22222222-2222-4222-8222-222222222222', accountId: account, sequence: 1, kind: 'PAYMENT', amount: '50.00', balanceAfter: '200.00', availableAfter: '800.00', postedAt: '2026-11-04T12:00:00Z' } });
test('confirmed original and full same-intent replay both require authoritative refresh', () => {
  assert.equal(postingDecision(intent, exchange(), account), 'refresh');
  assert.equal(postingDecision(intent, exchange(200, true), account), 'refresh');
});
test('lost, server-error and malformed success responses retain the original retry identity', () => {
  for (const value of [exchange(null, null), exchange(503, null), { ...exchange(), response: null }, exchange(200, null)]) assert.equal(postingDecision(intent, value, account), 'retry');
});
test('a foreign or altered receipt cannot unlock a new intent', () => {
  for (const changed of [{ accountId: '33333333-3333-4333-8333-333333333333' }, { kind: 'PURCHASE' }, { amount: '50.01' }]) assert.equal(postingDecision(intent, { ...exchange(), response: { ...exchange().response, ...changed } }, account), 'retry');
});
test('structured business rejection is distinguished from an uncertain response', () => {
  assert.equal(postingDecision(intent, { ...exchange(422, null), response: { code: 'OVERPAYMENT' } }, account), 'rejected');
  assert.equal(postingDecision(intent, { ...exchange(429, null), response: { code: 'RATE_LIMITED' } }, account), 'rejected');
  assert.equal(postingDecision(intent, { ...exchange(408, null), response: { code: 'REQUEST_FAILED' } }, account), 'retry');
});
test('decimal identity checks preserve cents beyond floating point and never round', () => {
  assert.equal(postingDecision({ ...intent, amount: '50.000' }, exchange(), account), 'retry');
  assert.equal(postingDecision({ ...intent, amount: '50.0' }, exchange(), account), 'refresh');
});
