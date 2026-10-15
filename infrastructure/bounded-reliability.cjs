#!/usr/bin/env node
'use strict';

// Independent HTTP observer: no application imports, database writes, or container lifecycle actions.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

const ORIGIN = 'http://127.0.0.1:18081';
const LIMITS = Object.freeze({ accounts: 4, rounds: 3, contenders: 3, requests: 300,
  inFlight: 12, totalMs: 180000, requestMs: 10000, pageSize: 3 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTRY_KEYS = ['accountId', 'amount', 'availableAfter', 'balanceAfter', 'id', 'kind',
  'postedAt', 'sequence'];
const ACCOUNT_KEYS = ['availableCredit', 'creditLimit', 'currency', 'expiresAt', 'id',
  'outstandingBalance'];
const SAFE_CODES = new Set();
class CheckFailure extends Error {
  constructor(code) { super(code); this.code = code; SAFE_CODES.add(code); }
}
function check(condition, code) { if (!condition) throw new CheckFailure(code); }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sameKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && isDeepStrictEqual(Object.keys(value).sort(), keys);
}
function validateTarget(origin) { check(origin === ORIGIN, 'LOCAL_TARGET_REQUIRED'); return origin; }
function cents(value) {
  check(typeof value === 'string' && /^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(value), 'INVALID_MONEY');
  const [whole, fraction] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
}
function decimal(value) { return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`; }
function validateEntry(entry, accountId) {
  check(sameKeys(entry, ENTRY_KEYS) && UUID.test(entry.id)
    && Number.isSafeInteger(entry.sequence) && entry.sequence > 0
    && ['PURCHASE', 'PAYMENT'].includes(entry.kind)
    && typeof entry.postedAt === 'string' && Number.isFinite(Date.parse(entry.postedAt)),
  'INVALID_RECEIPT');
  check(entry.accountId === accountId, 'FOREIGN_RECEIPT');
  check(cents(entry.amount) > 0n, 'INVALID_RECEIPT');
  cents(entry.balanceAfter); cents(entry.availableAfter);
}
function reconcile(accountId, account, entries) {
  check(sameKeys(account, ACCOUNT_KEYS) && account.id === accountId && account.currency === 'USD'
    && account.creditLimit === '1000.00' && Number.isFinite(Date.parse(account.expiresAt)),
  'INVALID_ACCOUNT');
  check(Array.isArray(entries), 'INVALID_HISTORY');
  const seen = new Set();
  let previous = Infinity;
  for (const entry of entries) {
    validateEntry(entry, accountId);
    check(!seen.has(entry.id), 'DUPLICATE_RECEIPT'); seen.add(entry.id);
    check(entry.sequence < previous, 'SEQUENCE_ORDER'); previous = entry.sequence;
  }
  // Literal sandbox opening balance and limit; never derive either from a service calculation.
  let balance = 25000n;
  for (const entry of [...entries].reverse()) {
    balance += entry.kind === 'PURCHASE' ? cents(entry.amount) : -cents(entry.amount);
    check(balance >= 0n && balance <= 100000n, 'LEDGER_RANGE');
    check(cents(entry.balanceAfter) === balance, 'RECEIPT_BALANCE_MISMATCH');
    check(cents(entry.availableAfter) === 100000n - balance, 'RECEIPT_AVAILABLE_MISMATCH');
  }
  check(cents(account.outstandingBalance) === balance, 'BALANCE_MISMATCH');
  check(cents(account.availableCredit) === 100000n - balance, 'AVAILABLE_MISMATCH');
  return { entries: entries.length, balance: decimal(balance), available: decimal(100000n - balance) };
}

function localTransport(url, options) {
  // Native HTTP with a literal loopback host bypasses proxy environment variables and DNS.
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: 18081,
      path: url.pathname + url.search, method: options.method, agent: false,
      headers: options.headers, signal: options.signal }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 65536) response.destroy(new CheckFailure('RESPONSE_TOO_LARGE'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        bodyText: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.end(options.body);
  });
}
function createClient({ origin = ORIGIN, transport = localTransport,
  clock = () => performance.now(), started = clock(), signal } = {}) {
  validateTarget(origin);
  const counts = { httpRequests: 0, statuses: {}, postings: 0, replays: 0, conflicts: 0,
    rejections: 0, sandboxCreates: 0, transportFailures: 0, maxInFlight: 0 };
  const durations = [];
  let inFlight = 0;
  async function request(route, { token, body, key } = {}) {
    check(clock() - started < LIMITS.totalMs && !signal?.aborted, 'TIME_LIMIT');
    check(counts.httpRequests < LIMITS.requests, 'REQUEST_LIMIT');
    check(inFlight < LIMITS.inFlight, 'CONCURRENCY_LIMIT');
    const url = new URL(route, origin);
    check(url.origin === ORIGIN && route.startsWith('/') && !route.startsWith('//')
      && /^\/(actuator\/health|api\/v1\/sandboxes|api\/v1\/accounts\/[0-9a-f-]{36}(\/(payments|purchases|transactions))?)(\?limit=3(&before=[0-9]+)?)?$/.test(route),
    'LOCAL_ROUTE_REQUIRED');
    const began = clock();
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(LIMITS.requestMs,
      LIMITS.totalMs - (began - started))));
    const requestSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
    const headers = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}) };
    inFlight++; counts.httpRequests++;
    counts.maxInFlight = Math.max(counts.maxInFlight, inFlight);
    let response;
    try {
      try {
        response = await transport(url, { method: body === undefined ? 'GET' : 'POST', headers,
          body: body === undefined ? undefined : JSON.stringify(body), signal: requestSignal });
      } catch (error) {
        counts.transportFailures++;
        if (error instanceof CheckFailure) throw error;
        throw new CheckFailure(clock() - started >= LIMITS.totalMs ? 'TIME_LIMIT'
          : requestSignal.aborted ? 'REQUEST_TIMEOUT' : 'TRANSPORT_FAILURE');
      }
      check(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599,
        'INVALID_RESPONSE');
      counts.statuses[response.status] = (counts.statuses[response.status] || 0) + 1;
      if (/\/(payments|purchases)$/.test(url.pathname)) {
        if (response.status === 201) counts.postings++;
        else if (response.status === 200) counts.replays++;
        else if (response.status === 409) counts.conflicts++;
        else if (response.status >= 400 && response.status < 500) counts.rejections++;
      } else if (url.pathname === '/api/v1/sandboxes' && response.status === 201) counts.sandboxCreates++;
      check(response.status < 300 || response.status >= 400, 'REDIRECT_REJECTED');
      check(/^application\/json(?:;|$)/i.test(response.headers?.['content-type'] || ''), 'INVALID_RESPONSE');
      if (response.bodyText !== undefined) {
        try { response.body = JSON.parse(response.bodyText); }
        catch { throw new CheckFailure('INVALID_JSON_RESPONSE'); }
        delete response.bodyText;
      }
      return response;
    } finally {
      durations.push(Math.max(0, clock() - began));
      inFlight--;
    }
  }
  function metrics() {
    const sorted = [...durations].sort((a, b) => a - b);
    const percentile = q => sorted.length ? Number(sorted[Math.ceil(q * sorted.length) - 1].toFixed(3)) : null;
    return { ...counts, statuses: { ...counts.statuses }, inFlight,
      latencyMs: { samples: sorted.length, p50: percentile(0.5), p95: percentile(0.95), max: percentile(1) } };
  }
  return { request, metrics };
}

async function history(client, account) {
  const entries = [];
  const ids = new Set();
  let before = Infinity;
  while (true) {
    const route = `/api/v1/accounts/${account.id}/transactions?limit=3`
      + (before === Infinity ? '' : `&before=${before}`);
    const response = await client.request(route, { token: account.token });
    check(response.status === 200, 'HISTORY_STATUS');
    const page = response.body;
    check(sameKeys(page, ['entries', 'nextCursor']) && Array.isArray(page.entries)
      && page.entries.length <= LIMITS.pageSize, 'INVALID_PAGE');
    let previous = before;
    for (const entry of page.entries) {
      validateEntry(entry, account.id);
      check(entry.sequence < previous && !ids.has(entry.id), 'PAGE_ORDER');
      previous = entry.sequence; ids.add(entry.id); entries.push(entry);
    }
    if (page.nextCursor === null) return entries;
    check(page.entries.length > 0 && Number.isSafeInteger(page.nextCursor)
      && page.nextCursor > 0 && page.nextCursor === previous && page.nextCursor < before,
    'INVALID_CURSOR');
    before = page.nextCursor;
  }
}
function checkReplayRace(responses) {
  check(responses.length === 3 && responses.filter(r => r.status === 201).length === 1
    && responses.filter(r => r.status === 200).length === 2, 'REPLAY_COUNTS');
  const original = responses.find(r => r.status === 201);
  check(original.headers['idempotency-replayed'] === 'false', 'REPLAY_HEADER');
  for (const response of responses.filter(r => r.status === 200)) {
    check(response.headers['idempotency-replayed'] === 'true', 'REPLAY_HEADER');
    check(isDeepStrictEqual(response.body, original.body), 'REPLAY_RECEIPT_CHANGED');
  }
  return original.body;
}
async function parallel(jobs) {
  // Drain every active request before releasing the workspace lock on failure.
  const results = await Promise.allSettled(jobs);
  const failed = results.find(r => r.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map(r => r.value);
}
async function checkRejectedWrites(post, key) {
  // Four account clients each run at most two requests in this phase.
  const conflicts = await parallel([post('payments', '100.01', key), post('purchases', '100.00', key)]);
  const rejected = await parallel([post('payments', '0.00', crypto.randomUUID()),
    post('payments', '250.01', crypto.randomUUID())]);
  const failures = [...conflicts, ...rejected];
  check(isDeepStrictEqual(failures.map(r => r.status), [409, 409, 400, 422]), 'EXPECTED_REJECTION_STATUS');
}
async function snapshot(client, account) {
  const response = await client.request(`/api/v1/accounts/${account.id}`, { token: account.token });
  check(response.status === 200, 'ACCOUNT_STATUS');
  const entries = await history(client, account);
  const summary = reconcile(account.id, response.body, entries);
  check(entries.length === account.posted.size
    && entries.every(entry => isDeepStrictEqual(entry, account.posted.get(entry.id))), 'POSTING_SET_MISMATCH');
  return { account: response.body, entries, summary };
}
function remember(account, receipt, kind, amount) {
  validateEntry(receipt, account.id);
  check(receipt.kind === kind && receipt.amount === amount && !account.posted.has(receipt.id),
    'POSTING_RECEIPT_MISMATCH');
  account.posted.set(receipt.id, receipt);
}

function validateStack(root, api, postgres) {
  const expectedDirectory = path.resolve(root, 'infrastructure').toLowerCase();
  const expectedConfig = path.resolve(root, 'infrastructure', 'compose.yml').toLowerCase();
  for (const [metadata, service] of [[api, 'api'], [postgres, 'postgres']]) {
    check(metadata?.name === `/creditflow-qe-${service}-1` && metadata.project === 'creditflow-qe'
      && metadata.service === service && metadata.status === 'running' && metadata.health === 'healthy'
      && typeof metadata.workingDirectory === 'string'
      && path.resolve(metadata.workingDirectory).toLowerCase() === expectedDirectory
      && typeof metadata.configFiles === 'string' && metadata.configFiles.split(',').length === 1
      && path.resolve(metadata.configFiles).toLowerCase() === expectedConfig
      && /^sha256:[a-f0-9]{64}$/.test(metadata.imageId), 'STACK_IDENTITY_REJECTED');
  }
  const bindings = Object.entries(api.ports || {}).flatMap(([port, values]) =>
    (values || []).map(binding => ({ port, ...binding })));
  check(bindings.length === 1 && bindings[0].port === '8080/tcp'
    && bindings[0].HostIp === '127.0.0.1' && bindings[0].HostPort === '18081', 'STACK_IDENTITY_REJECTED');
  check(Object.values(postgres.ports || {}).every(values => !values || values.length === 0),
    'STACK_IDENTITY_REJECTED');
}
function acquireLock(root, runId) {
  const directory = path.join(root, '.work', 'evidence');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'active.json');
  const owner = { scope: 'bounded-reliability', runId, pid: process.pid, startedAt: new Date().toISOString() };
  try { fs.writeFileSync(file, JSON.stringify(owner), { flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new CheckFailure('ACTIVE_EVIDENCE_SCOPE');
    throw new CheckFailure('LOCK_ACQUISITION_FAILED');
  }
  return { file, owner };
}
function releaseLock(lock) {
  if (!lock) return false;
  try {
    const owner = JSON.parse(fs.readFileSync(lock.file, 'utf8'));
    if (!isDeepStrictEqual(owner, lock.owner)) return false;
    fs.unlinkSync(lock.file);
    return true;
  } catch { return false; }
}
function createRun(root) {
  const runId = new Date().toISOString().replace(/[-:.]/g, '') + '-' + crypto.randomUUID();
  const base = path.join(root, '.work', 'maintenance-20261015', 'reliability');
  fs.mkdirSync(base, { recursive: true });
  const directory = path.join(base, runId);
  fs.mkdirSync(directory);
  const run = { root, runId, directory, startedAt: new Date().toISOString(), started: performance.now(),
    pid: process.pid, command: 'node infrastructure/bounded-reliability.cjs', events: 0, context: {} };
  fs.writeFileSync(path.join(directory, 'started.json'), JSON.stringify({ runId, pid: run.pid,
    startedAt: run.startedAt, command: run.command }, null, 2), { flag: 'wx' });
  return run;
}
function event(run, phase, outcome, exitCode = null) {
  // Only locally chosen labels and numeric exits enter the log; no subprocess/HTTP output.
  fs.appendFileSync(path.join(run.directory, 'command.log'), JSON.stringify({
    at: new Date().toISOString(), phase, outcome, exitCode }) + '\n');
  run.events++;
}
function finishRun(run, result) {
  const failure = result.error instanceof CheckFailure && SAFE_CODES.has(result.error.code)
    ? result.error.code : result.error ? 'UNEXPECTED_FAILURE' : null;
  const report = { version: 1, runId: run.runId, startedAt: run.startedAt,
    endedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - run.started),
    pid: run.pid, command: run.command, origin: ORIGIN, status: result.status,
    exitCode: result.status === 'passed' ? 0 : 1, failure, limits: LIMITS,
    scope: 'Bounded local functional reliability observation; not a capacity or SLA measurement.',
    credentialsWritten: false, publicRequests: 0, ...run.context,
    metrics: result.metrics || null };
  fs.writeFileSync(path.join(run.directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}
function command(run, executable, args, label) {
  const remaining = LIMITS.totalMs - (performance.now() - run.started);
  check(remaining > 0, 'TIME_LIMIT');
  const result = spawnSync(executable, args, { cwd: run.root, encoding: 'utf8', windowsHide: true,
    timeout: Math.max(1, Math.min(10000, Math.floor(remaining))), maxBuffer: 16 * 1024 * 1024 });
  event(run, label, result.status === 0 ? 'passed' : 'failed', result.status ?? 1);
  check(!result.error && result.status === 0, 'LOCAL_COMMAND_FAILED');
  // Never log stdout/stderr: these calls select safe metadata but failures can be arbitrary.
  return result.stdout.trim() || result.stderr.trim();
}
function sourceState(run) {
  const git = (args, label) => command(run, 'git', args, label);
  const head = git(['rev-parse', 'HEAD'], 'git-head');
  check(/^[a-f0-9]{40}$/.test(head), 'SOURCE_IDENTITY_FAILED');
  const status = git(['status', '--porcelain=v1', '--untracked-files=normal'], 'git-status');
  const diff = git(['diff', '--binary', 'HEAD'], 'git-diff');
  const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], 'git-files')
    .split('\0').filter(Boolean).sort();
  const manifest = files.map(file => {
    const absolute = path.resolve(run.root, file);
    check(absolute.startsWith(run.root + path.sep), 'SOURCE_PATH_REJECTED');
    return `${file}\0${fs.existsSync(absolute) ? sha(fs.readFileSync(absolute)) : 'deleted'}`;
  });
  return { head, dirty: status.length > 0, statusSha256: sha(status), trackedDiffSha256: sha(diff),
    worktreeSha256: sha(manifest.join('\n')), files: files.length,
    harnessSha256: sha(fs.readFileSync(__filename)) };
}
function inspectStack(run) {
  const format = '{"name":{{json .Name}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
    + '"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
    + '"workingDirectory":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},'
    + '"configFiles":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},'
    + '"status":{{json .State.Status}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},'
    + '"imageId":{{json .Image}},"startedAt":{{json .State.StartedAt}},"ports":{{json .NetworkSettings.Ports}}}';
  const inspect = name => {
    try { return JSON.parse(command(run, 'docker', ['inspect', '--format', format, name], `inspect-${name}`)); }
    catch (error) { if (error instanceof CheckFailure) throw error; throw new CheckFailure('STACK_IDENTITY_REJECTED'); }
  };
  const api = inspect('creditflow-qe-api-1');
  const postgres = inspect('creditflow-qe-postgres-1');
  validateStack(run.root, api, postgres);
  return { api, postgres };
}
function preflight(run) {
  const { api, postgres } = inspectStack(run);
  const workers = command(run, 'docker', ['ps', '--filter', 'label=com.docker.compose.project=creditflow-qe',
    '--format', '{{.Label "com.docker.compose.service"}}'], 'active-services').split(/\r?\n/);
  check(!workers.some(service => /^(verify|ui-verify|verify-public)$/.test(service)), 'ACTIVE_VERIFICATION_WORKER');
  const docker = command(run, 'docker', ['version', '--format', '{{.Client.Version}}|{{.Server.Version}}'], 'docker-version');
  const java = command(run, 'docker', ['exec', 'creditflow-qe-api-1', 'java', '-version'], 'java-version');
  const pg = command(run, 'docker', ['exec', 'creditflow-qe-postgres-1', 'postgres', '--version'], 'postgres-version');
  check(/^[0-9][0-9a-z.+-]*\|[0-9][0-9a-z.+-]*$/i.test(docker), 'VERSION_METADATA_REJECTED');
  const javaVersion = java.match(/(?:openjdk|java) version "([0-9][0-9a-z.+_-]*)"/i)?.[1];
  const pgVersion = pg.match(/^postgres \(PostgreSQL\) ([0-9][0-9a-z.+_-]*)\s*$/i)?.[1];
  check(javaVersion && pgVersion, 'VERSION_METADATA_REJECTED');
  return { api, postgres, versions: { node: process.version, dockerClient: docker.split('|')[0],
    dockerServer: docker.split('|')[1], java: javaVersion, postgres: pgVersion },
  imageProvenance: 'Observed fixed API image ID; this image has no verified embedded Git revision. Current HEAD/worktree hashes identify the harness source, not the image build source.' };
}

async function workload(run, client) {
  const accounts = [];
  run.context.progress = { accountsCreated: 0, roundsCompleted: 0, checkpoints: [] };
  const health = await client.request('/actuator/health');
  check(health.status === 200 && health.body?.status === 'UP', 'HEALTH_CHECK_FAILED');
  for (let i = 0; i < LIMITS.accounts; i++) {
    const response = await client.request('/api/v1/sandboxes', { body: {} });
    check(response.status === 201 && UUID.test(response.body?.accountId)
      && typeof response.body?.token === 'string' && response.body.token.length >= 32,
    'SANDBOX_CREATION_FAILED');
    check(!accounts.some(a => a.id === response.body.accountId), 'DUPLICATE_SANDBOX');
    accounts.push({ id: response.body.accountId, token: response.body.token, posted: new Map() });
    run.context.progress.accountsCreated = accounts.length;
  }
  await parallel(accounts.map(async account => {
    const state = await snapshot(client, account);
    check(state.summary.balance === '250.00' && state.summary.available === '750.00', 'OPENING_STATE_MISMATCH');
  }));
  for (let round = 1; round <= LIMITS.rounds; round++) {
    await parallel(accounts.map(async (account, index) => {
      const root = `/api/v1/accounts/${account.id}`;
      const post = (route, amount, key) => client.request(`${root}/${route}`,
        { token: account.token, body: { amount }, key });
      const purchases = await parallel(Array.from({ length: 3 }, () => post('purchases', '300.00', crypto.randomUUID())));
      check(purchases.filter(r => r.status === 201).length === 2
        && purchases.filter(r => r.status === 422).length === 1, 'OVERSPEND_RACE_COUNTS');
      for (const response of purchases.filter(r => r.status === 201)) remember(account, response.body, 'PURCHASE', '300.00');
      const key = crypto.randomUUID();
      const original = checkReplayRace(await parallel(Array.from({ length: 3 }, () => post('payments', '100.00', key))));
      remember(account, original, 'PAYMENT', '100.00');
      const restore = await post('payments', '500.00', crypto.randomUUID());
      check(restore.status === 201, 'RESTORE_STATUS'); remember(account, restore.body, 'PAYMENT', '500.00');
      const before = await snapshot(client, account);
      check(before.summary.balance === '250.00' && before.summary.entries === round * 4, 'ROUND_STATE_MISMATCH');
      const replay = await post('payments', '100.00', key);
      check(replay.status === 200 && replay.headers['idempotency-replayed'] === 'true'
        && isDeepStrictEqual(replay.body, original), 'REPLAY_RECEIPT_CHANGED');
      await checkRejectedWrites(post, key);
      const after = await snapshot(client, account);
      check(isDeepStrictEqual(after, before), 'FAILED_WRITE_CHANGED_STATE');
      run.context.progress.checkpoints.push({ round, account: index + 1, ...after.summary });
      event(run, `round-${round}-account-${index + 1}`, 'passed', 0);
    }));
    run.context.progress.roundsCompleted = round;
  }
  const metrics = client.metrics();
  const allReceiptIds = accounts.flatMap(account => [...account.posted.keys()]);
  check(new Set(allReceiptIds).size === 48 && allReceiptIds.length === 48, 'GLOBAL_RECEIPT_DUPLICATE');
  check(metrics.httpRequests === 253 && metrics.latencyMs.samples === metrics.httpRequests
    && metrics.postings === 48 && metrics.replays === 36 && metrics.conflicts === 24
    && metrics.rejections === 36 && metrics.sandboxCreates === 4
    && metrics.maxInFlight <= LIMITS.inFlight && metrics.inFlight === 0, 'WORKLOAD_METRICS_MISMATCH');
}

async function main(args = process.argv.slice(2)) {
  const root = path.resolve(__dirname, '..');
  const run = createRun(root);
  let lock, client, error;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), LIMITS.totalMs);
  try {
    check(args.length === 0 || (args.length === 2 && args[0] === '--target'), 'UNSUPPORTED_ARGUMENTS');
    validateTarget(args.length ? args[1] : ORIGIN);
    lock = acquireLock(root, run.runId);
    run.context.sourceBefore = sourceState(run);
    run.context.environment = preflight(run);
    event(run, 'preflight', 'passed', 0);
    client = createClient({ started: run.started, signal: deadline.signal });
    await workload(run, client);
    run.context.environmentAfter = inspectStack(run);
    check(isDeepStrictEqual(run.context.environmentAfter.api, run.context.environment.api)
      && isDeepStrictEqual(run.context.environmentAfter.postgres, run.context.environment.postgres),
    'STACK_CHANGED_DURING_RUN');
    run.context.sourceAfter = sourceState(run);
    check(isDeepStrictEqual(run.context.sourceAfter, run.context.sourceBefore), 'SOURCE_CHANGED_DURING_RUN');
    check(performance.now() - run.started < LIMITS.totalMs, 'TIME_LIMIT');
  } catch (caught) { error = caught; }
  finally {
    clearTimeout(timer);
    if (lock) {
      const released = releaseLock(lock);
      run.context.lockReleased = released;
      if (!released && !error) error = new CheckFailure('LOCK_OWNERSHIP_CHANGED');
    }
    const status = error ? 'failed' : 'passed';
    event(run, 'bounded-reliability', status, error ? 1 : 0);
    const report = finishRun(run, { status, error, metrics: client?.metrics() });
    console.log(JSON.stringify({ status, exitCode: report.exitCode, failure: report.failure,
      report: path.relative(root, path.join(run.directory, 'report.json')), metrics: report.metrics }));
    return report.exitCode;
  }
}

module.exports = { validateTarget, cents, reconcile, createClient, history, checkReplayRace,
  checkRejectedWrites, validateStack, acquireLock, releaseLock, createRun, finishRun };
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(() => {
  console.error('Bounded reliability could not write its local receipt.'); process.exitCode = 1;
});
