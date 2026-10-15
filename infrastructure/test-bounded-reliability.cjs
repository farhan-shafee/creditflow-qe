const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// These fixtures are hand-reconciled: 250.00 + 300.00 - 100.00 = 450.00.
const accountId = '11111111-1111-4111-8111-111111111111';
const account = { id: accountId, currency: 'USD', creditLimit: '1000.00',
  outstandingBalance: '450.00', availableCredit: '550.00', expiresAt: '2026-10-16T00:00:00Z' };
const older = { id: '22222222-2222-4222-8222-222222222222', sequence: 8, accountId,
  kind: 'PURCHASE', amount: '300.00', balanceAfter: '550.00', availableAfter: '450.00',
  postedAt: '2026-10-15T01:00:00Z' };
const newer = { id: '33333333-3333-4333-8333-333333333333', sequence: 10, accountId,
  kind: 'PAYMENT', amount: '100.00', balanceAfter: '450.00', availableAfter: '550.00',
  postedAt: '2026-10-15T01:00:01Z' };
const load = () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'bounded-reliability.cjs')),
    'The bounded local harness must implement its safety and reconciliation contract');
  return require('./bounded-reliability.cjs');
};
const reply = (status, body, replayed = null) => ({ status, body,
  headers: { 'content-type': 'application/json', 'idempotency-replayed': replayed } });
const tmp = t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creditflow-bounded-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('a foreign or disguised target is rejected before any HTTP dispatch', async () => {
  const h = load();
  let dispatched = 0;
  for (const origin of ['https://example.com', 'http://localhost:18081',
    'http://127.0.0.1:18082', 'http://127.0.0.1:18081/', 'http://127.0.0.1:18081@evil.test',
    'http://127.0.0.1:18081/path', 'http://[::1]:18081']) {
    assert.throws(() => h.createClient({ origin, transport: async () => { dispatched++; } }),
      { code: 'LOCAL_TARGET_REQUIRED' });
  }
  assert.equal(dispatched, 0);
});

test('redirects stop without following the location or emitting its body', async () => {
  const h = load();
  let dispatched = 0;
  const client = h.createClient({ transport: async () => {
    dispatched++;
    return reply(302, { token: 'secret-response-body' });
  } });
  await assert.rejects(client.request('/actuator/health'), { code: 'REDIRECT_REJECTED' });
  assert.equal(dispatched, 1);
  assert.equal(client.metrics().statuses['302'], 1);
});

test('the thirteenth concurrent request never reaches transport', async () => {
  const h = load();
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const client = h.createClient({ transport: async () => { await barrier; return reply(200, {}); } });
  const inFlight = Array.from({ length: 12 }, () => client.request('/actuator/health'));
  await assert.rejects(client.request('/actuator/health'), { code: 'CONCURRENCY_LIMIT' });
  release();
  await Promise.all(inFlight);
  assert.equal(client.metrics().httpRequests, 12);
  assert.equal(client.metrics().maxInFlight, 12);
});

test('request count and elapsed budget prevent further dispatch', async () => {
  const h = load();
  let time = 0;
  const client = h.createClient({ clock: () => time, started: 0,
    transport: async () => reply(200, {}) });
  for (let i = 0; i < 300; i++) await client.request('/actuator/health');
  await assert.rejects(client.request('/actuator/health'), { code: 'REQUEST_LIMIT' });
  assert.equal(client.metrics().httpRequests, 300);
  const expired = h.createClient({ clock: () => time, started: 0,
    transport: async () => { assert.fail('expired request dispatched'); } });
  time = 180000;
  await assert.rejects(expired.request('/actuator/health'), { code: 'TIME_LIMIT' });
  assert.equal(expired.metrics().httpRequests, 0);
});

test('transport failure metrics retain latency samples without response data', async () => {
  const h = load();
  let time = 1;
  const client = h.createClient({ clock: () => time, started: 0, transport: async () => {
    time = 26;
    throw new Error('Bearer secret-token jdbc:postgresql://secret-host/private');
  } });
  await assert.rejects(client.request('/actuator/health'), { code: 'TRANSPORT_FAILURE' });
  assert.deepEqual(client.metrics().latencyMs, { samples: 1, p50: 25, p95: 25, max: 25 });
  assert.equal(client.metrics().transportFailures, 1);
  assert.doesNotMatch(JSON.stringify(client.metrics()), /secret|Bearer|jdbc/);
});

test('independent reconciliation accepts complete pages and exact cents', () => {
  const h = load();
  assert.deepEqual(h.reconcile(accountId, account, [newer, older]),
    { entries: 2, balance: '450.00', available: '550.00' });
  assert.equal(h.cents('9007199254740993.01'), 900719925474099301n);
});

test('one cent of account or chronological receipt corruption fails reconciliation', () => {
  const h = load();
  assert.throws(() => h.reconcile(accountId, { ...account, outstandingBalance: '450.01' }, [newer, older]),
    { code: 'BALANCE_MISMATCH' });
  assert.throws(() => h.reconcile(accountId, account, [newer, { ...older, balanceAfter: '550.01' }]),
    { code: 'RECEIPT_BALANCE_MISMATCH' });
  assert.throws(() => h.reconcile(accountId, account, [{ ...newer, availableAfter: '550.01' }, older]),
    { code: 'RECEIPT_AVAILABLE_MISMATCH' });
});

test('duplicate IDs, foreign ownership, bad kinds, and unordered sequences are rejected', () => {
  const h = load();
  for (const [entries, code] of [
    [[{ ...newer, id: older.id }, older], 'DUPLICATE_RECEIPT'],
    [[{ ...newer, accountId: older.id }, older], 'FOREIGN_RECEIPT'],
    [[{ ...newer, kind: 'REFUND' }, older], 'INVALID_RECEIPT'],
    [[older, newer], 'SEQUENCE_ORDER'],
    [[{ ...newer, sequence: Number.MAX_SAFE_INTEGER + 1 }, older], 'INVALID_RECEIPT'],
  ]) assert.throws(() => h.reconcile(accountId, account, entries), { code });
});

test('pagination follows each exclusive cursor and rejects overlapping or cyclic pages', async () => {
  const h = load();
  const paths = [];
  const pages = [{ entries: [newer], nextCursor: 10 }, { entries: [older], nextCursor: null }];
  const client = { request: async route => { paths.push(route); return reply(200, pages.shift()); } };
  assert.deepEqual(await h.history(client, { id: accountId, token: 'memory-only' }), [newer, older]);
  assert.deepEqual(paths, [`/api/v1/accounts/${accountId}/transactions?limit=3`,
    `/api/v1/accounts/${accountId}/transactions?limit=3&before=10`]);
  const overlap = { request: async () => reply(200, { entries: [newer], nextCursor: 10 }) };
  await assert.rejects(h.history(overlap, { id: accountId, token: 'memory-only' }),
    { code: 'PAGE_ORDER' });
});

test('receipts require full identity and a single new posting during same-key contention', () => {
  const h = load();
  h.checkReplayRace([reply(201, newer, 'false'), reply(200, { ...newer }, 'true'),
    reply(200, { ...newer }, 'true')]);
  assert.throws(() => h.checkReplayRace([reply(201, newer, 'false'), reply(201, newer, 'false'),
    reply(200, newer, 'true')]), { code: 'REPLAY_COUNTS' });
  assert.throws(() => h.checkReplayRace([reply(201, newer, 'false'),
    reply(200, { ...newer, postedAt: '2026-10-15T02:00:00Z' }, 'true'), reply(200, newer, 'true')]),
    { code: 'REPLAY_RECEIPT_CHANGED' });
});

test('four account rejection phases remain within twelve concurrent calls and enforce every status', async () => {
  const h = load();
  assert.equal(typeof h.checkRejectedWrites, 'function', 'Bounded rejection phases must enforce expected statuses');
  let inFlight = 0;
  let maximum = 0;
  const post = async (route, amount) => {
    inFlight++; maximum = Math.max(maximum, inFlight);
    await new Promise(resolve => setImmediate(resolve));
    inFlight--;
    return reply(amount === '0.00' ? 400 : amount === '250.01' ? 422 : 409, {});
  };
  await Promise.all(Array.from({ length: 4 }, () => h.checkRejectedWrites(post, 'same-key')));
  assert.ok(maximum <= 12, `Rejection phase exceeded global cap: ${maximum}`);
  await assert.rejects(h.checkRejectedWrites(async () => reply(201, {}), 'same-key'),
    { code: 'EXPECTED_REJECTION_STATUS' });
});

test('stack identity rejects foreign projects, directories, unhealthy services and public bindings', () => {
  const h = load();
  const root = path.resolve(__dirname, '..');
  const make = (service, ports) => ({ name: `/creditflow-qe-${service}-1`, project: 'creditflow-qe',
    service, workingDirectory: path.join(root, 'infrastructure'), status: 'running', health: 'healthy',
    configFiles: path.join(root, 'infrastructure', 'compose.yml'),
    imageId: 'sha256:' + 'a'.repeat(64), ports });
  const api = make('api', { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18081' }] });
  const db = make('postgres', { '5432/tcp': null });
  h.validateStack(root, api, db);
  for (const changed of [
    { ...api, project: 'other' }, { ...api, service: 'api-public' },
    { ...api, workingDirectory: path.join(root, 'foreign') }, { ...api, health: 'starting' },
    { ...api, configFiles: path.join(root, 'infrastructure', 'foreign.yml') },
    { ...api, configFiles: api.configFiles + ',' + path.join(root, 'infrastructure', 'override.yml') },
    { ...api, ports: { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '18081' }] } },
    { ...api, ports: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }] } },
    { ...api, ports: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18081' }],
      '9999/tcp': [{ HostIp: '0.0.0.0', HostPort: '9999' }] } },
  ]) assert.throws(() => h.validateStack(root, changed, db), { code: 'STACK_IDENTITY_REJECTED' });
});

test('an existing evidence lock prevents ownership and only the owner can release', t => {
  const h = load();
  const root = tmp(t);
  const first = h.acquireLock(root, 'first');
  assert.throws(() => h.acquireLock(root, 'second'), { code: 'ACTIVE_EVIDENCE_SCOPE' });
  const file = path.join(root, '.work', 'evidence', 'active.json');
  fs.writeFileSync(file, JSON.stringify({ runId: 'foreign', pid: process.pid }));
  assert.equal(h.releaseLock(first), false);
  assert.equal(JSON.parse(fs.readFileSync(file)).runId, 'foreign');
});

test('failed reports are immutable, preserve partial metrics, and discard arbitrary error secrets', t => {
  const h = load();
  const root = tmp(t);
  const run = h.createRun(root);
  h.finishRun(run, { status: 'failed', metrics: { httpRequests: 7 },
    error: new Error('Bearer secret-token jdbc:postgresql://secret-host/private'),
    token: 'raw-token', headers: { Authorization: 'secret-header' }, rawBody: 'secret-sandbox' });
  const text = fs.readFileSync(path.join(run.directory, 'report.json'), 'utf8');
  assert.equal(JSON.parse(text).metrics.httpRequests, 7);
  assert.equal(JSON.parse(text).failure, 'UNEXPECTED_FAILURE');
  assert.doesNotMatch(text, /secret|Bearer|jdbc|raw-token|Authorization/);
  assert.throws(() => h.finishRun(run, { status: 'passed' }), { code: 'EEXIST' });
  assert.notEqual(h.createRun(root).directory, run.directory);
});
