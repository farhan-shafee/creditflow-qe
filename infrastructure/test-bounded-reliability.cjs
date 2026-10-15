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
  const { api, postgres: db } = stackFixture(root);
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

function stackFixture(root, paths = path) {
  const make = (service, ports) => ({ name: `/creditflow-qe-${service}-1`, project: 'creditflow-qe',
    service, workingDirectory: paths.join(root, 'infrastructure'), status: 'running', health: 'healthy',
    configFiles: paths.join(root, 'infrastructure', 'compose.yml'),
    imageId: 'sha256:' + 'a'.repeat(64), ports });
  const api = make('api', { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18081' }] });
  const postgres = make('postgres', { '5432/tcp': null });
  api.id = 'a'.repeat(64); postgres.id = 'b'.repeat(64);
  const network = (ip, alias, endpoint) => ({ NetworkID: 'c'.repeat(64), EndpointID: endpoint.repeat(64),
    IPAddress: ip, Aliases: [alias], IPPrefixLen: 16 });
  api.networks = { 'creditflow-qe_default': network('172.17.0.3', 'api', 'd') };
  postgres.networks = { 'creditflow-qe_default': network('172.17.0.2', 'postgres', 'e') };
  const config = environment => ({ environment, command: ['java', '-jar', '/app/app.jar'],
    workingDir: '/app', mounts: [], networkMode: 'creditflow-qe_default', extraHosts: [], dns: [], links: [] });
  api.config = config(['CREDITFLOW_DB_URL=jdbc:postgresql://postgres:5432/creditflow',
    'CREDITFLOW_DB_USER=creditflow_app', 'CREDITFLOW_DB_PASSWORD=private-canary',
    'JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70.0']);
  postgres.config = config(['POSTGRES_DB=creditflow', 'POSTGRES_USER=creditflow_app', 'POSTGRES_PASSWORD=private-canary']);
  return { api, postgres };
}

test('POSIX stack ownership rejects differently cased checkout and configuration paths', () => {
  const h = load();
  const root = '/workspace/CreditFlow-QE';
  const { api, postgres } = stackFixture(root, path.posix);
  for (const platform of ['linux', 'darwin', 'win32']) {
    h.validateStack(root, api, postgres, platform);
    for (const [field, changed] of [
      ['workingDirectory', '/workspace/creditflow-qe/infrastructure'],
      ['workingDirectory', '/workspace/CreditFlow-QE/Infrastructure'],
      ['configFiles', '/workspace/creditflow-qe/infrastructure/compose.yml'],
      ['configFiles', '/workspace/CreditFlow-QE/infrastructure/Compose.yml'],
    ]) {
      assert.throws(() => h.validateStack(root, { ...api, [field]: changed }, postgres, platform),
        { code: 'STACK_IDENTITY_REJECTED' });
      assert.throws(() => h.validateStack(root, api, { ...postgres, [field]: changed }, platform),
        { code: 'STACK_IDENTITY_REJECTED' });
    }
  }
});

test('Windows stack ownership accepts drive and directory case variants of the same path', () => {
  const h = load();
  const root = 'D:\\Dev\\Repos\\CreditFlow-QE';
  const { api, postgres } = stackFixture(root, path.win32);
  api.workingDirectory = 'd:\\dev\\repos\\creditflow-qe\\infrastructure';
  postgres.configFiles = 'd:/DEV/REPOS/CREDITFLOW-QE/infrastructure/COMPOSE.YML';
  h.validateStack(root, api, postgres, 'win32');
});

test('native Linux rejects an existing case-variant checkout and Compose file',
  { skip: process.platform !== 'linux' }, t => {
    const h = load();
    const base = tmp(t);
    const root = path.join(base, 'CreditFlow-QE');
    const foreign = path.join(base, 'creditflow-qe');
    for (const directory of [root, foreign]) fs.mkdirSync(path.join(directory, 'infrastructure'), { recursive: true });
    for (const name of ['compose.yml', 'Compose.yml']) fs.writeFileSync(path.join(root, 'infrastructure', name), '');
    const { api, postgres } = stackFixture(root);
    h.validateStack(root, api, postgres);
    assert.throws(() => h.validateStack(root, { ...api, workingDirectory: path.join(foreign, 'infrastructure') }, postgres),
      { code: 'STACK_IDENTITY_REJECTED' });
    assert.throws(() => h.validateStack(root, api, { ...postgres, configFiles: path.join(root, 'infrastructure', 'Compose.yml') }),
      { code: 'STACK_IDENTITY_REJECTED' });
  });

test('valid Compose labels cannot authorize foreign, stale or overridden datasource settings', () => {
  const h = load();
  const root = path.resolve(__dirname, '..');
  const { api, postgres } = stackFixture(root);
  for (const environment of [
    api.config.environment.map(s => s.startsWith('CREDITFLOW_DB_URL=') ? 'CREDITFLOW_DB_URL=jdbc:postgresql://foreign.invalid:5432/private' : s),
    api.config.environment.map(s => s.startsWith('CREDITFLOW_DB_URL=') ? 'CREDITFLOW_DB_URL=jdbc:postgresql://postgres:5432/stale' : s),
    [...api.config.environment, 'SPRING_DATASOURCE_URL=private-canary'],
    [...api.config.environment, 'SPRING_DATASOURCE_HIKARI_JDBC_URL=private-canary'],
    [...api.config.environment, 'SPRING_APPLICATION_JSON=private-canary'],
    [...api.config.environment, 'CREDITFLOW_DB_URL=private-canary'],
    api.config.environment.map(s => s.startsWith('JAVA_TOOL_OPTIONS=') ? 'JAVA_TOOL_OPTIONS=-Dspring.datasource.url=private-canary' : s),
  ]) assert.throws(() => h.validateStack(root, { ...api, config: { ...api.config, environment } }, postgres),
    { code: 'DATASOURCE_CONFIGURATION_REJECTED' });
});

test('PostgreSQL probe rejects inherited routing or service overrides before any database query', () => {
  const h = load(); const root = path.resolve(__dirname, '..'); const { api, postgres } = stackFixture(root);
  for (const variable of ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGOPTIONS', 'PGSYSCONFDIR']) {
    assert.throws(() => h.validateStack(root, api, { ...postgres, config: { ...postgres.config,
      environment: [...postgres.config.environment, `${variable}=private-canary`] } }),
    { code: 'DATASOURCE_CONFIGURATION_REJECTED' });
  }
});

test('host, DNS and extra-network overrides cannot redirect an otherwise valid stack', () => {
  const h = load(); const root = path.resolve(__dirname, '..'); const f = stackFixture(root);
  for (const field of ['extraHosts', 'dns', 'dnsSearch', 'dnsOptions', 'links']) {
    for (const target of ['api', 'postgres']) {
      const changed = { ...f[target], config: { ...f[target].config, [field]: ['foreign'] } };
      assert.throws(() => h.validateStack(root, target === 'api' ? changed : f.api,
        target === 'postgres' ? changed : f.postgres), { code: 'DATABASE_NETWORK_REJECTED' });
    }
  }
  assert.throws(() => h.validateStack(root, { ...f.api, networks: { ...f.api.networks, foreign: {} } }, f.postgres),
    { code: 'DATABASE_NETWORK_REJECTED' });
  assert.throws(() => h.validateStack(root, { ...f.api, config: { ...f.api.config, networkMode: 'host' } }, f.postgres),
    { code: 'DATABASE_NETWORK_REJECTED' });
});

function relationshipFixture(root = path.resolve(__dirname, '..')) {
  const stack = stackFixture(root);
  const runtime = { environment: stack.api.config.environment.join('\0') + '\0',
    command: 'java\0-jar\0/app/app.jar\0', applicationMatches: true, externalConfigAbsent: true };
  const network = { id: 'c'.repeat(64), name: 'creditflow-qe_default', driver: 'bridge', project: 'creditflow-qe',
    endpoints: [{ id: stack.api.id, ip: '172.17.0.3', aliases: ['api'] },
      { id: stack.postgres.id, ip: '172.17.0.2', aliases: ['postgres'] }], resolved: ['172.17.0.2'] };
  // Linux proc tables store each 32-bit address word in little-endian byte order.
  const header = 'sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n';
  const connections = { fds: 'socket:[12345]\n', tcp: header + '0: 030011AC:A028 020011AC:1538 01 0:0 0:0 0 10001 0 12345\n',
    tcp6: header, sessions: [{ client_addr: '172.17.0.3', client_port: 41000, datname: 'creditflow', usename: 'creditflow_app' }] };
  return { stack, runtime, network, connections };
}

test('effective PID1 settings must match the configured datasource and canonical process', () => {
  const h = load(); const f = relationshipFixture();
  h.validateRuntime(f.stack.api, f.runtime);
  h.validateRuntime(f.stack.api, { ...f.runtime, environment: f.runtime.environment
    + 'LD_LIBRARY_PATH=/opt/java/openjdk/lib/server:/opt/java/openjdk/lib:/opt/java/openjdk/../lib\0' });
  for (const changed of [
    { environment: f.runtime.environment.replace('creditflow_app', 'stale-user') },
    { environment: f.runtime.environment + 'SPRING_CONFIG_LOCATION=private-canary\0' },
    { environment: f.runtime.environment + 'LD_PRELOAD=private-canary\0' },
    { environment: f.runtime.environment + 'LD_LIBRARY_PATH=/untrusted/private-canary\0' },
    { command: 'java\0-Dspring.datasource.url=private-canary\0-jar\0/app/app.jar\0' },
    { applicationMatches: false }, { externalConfigAbsent: false },
  ]) assert.throws(() => h.validateRuntime(f.stack.api, { ...f.runtime, ...changed }),
    { code: 'DATASOURCE_CONFIGURATION_REJECTED' });
});

test('database DNS must uniquely target the owned endpoint on the owned network', () => {
  const h = load(); const f = relationshipFixture();
  h.validateNetwork(f.stack.api, f.stack.postgres, f.network);
  for (const changed of [
    { resolved: ['172.17.0.4'] }, { resolved: ['172.17.0.2', '172.17.0.4'] },
    { id: 'f'.repeat(64) }, { endpoints: f.network.endpoints.slice(0, 1) },
    { endpoints: [...f.network.endpoints, { id: 'f'.repeat(64), ip: '172.17.0.4', aliases: ['postgres'] }] },
  ]) assert.throws(() => h.validateNetwork(f.stack.api, f.stack.postgres, { ...f.network, ...changed }),
    { code: 'DATABASE_NETWORK_REJECTED' });
});

test('PID-owned IPv4 and mapped IPv6 sockets must terminate in matching owned PostgreSQL sessions', () => {
  const h = load(); const f = relationshipFixture();
  h.validateConnections(f.stack.api, f.stack.postgres, f.connections);
  h.validateConnections(f.stack.api, f.stack.postgres, { ...f.connections, tcp: '',
    tcp6: 'sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n'
      + '0: 0000000000000000FFFF0000030011AC:A028 0000000000000000FFFF0000020011AC:1538 01 0:0 0:0 0 10001 0 12345\n' });
  for (const changed of [
    { tcp: f.connections.tcp.replace('020011AC:1538', '040011AC:1538') },
    { tcp: f.connections.tcp.replace(':1538', ':1539') },
    { tcp: f.connections.tcp.replace(' 01 ', ' 0A ') },
    { fds: 'socket:[99999]\n' }, { sessions: [] },
    { sessions: [{ ...f.connections.sessions[0], client_port: 41001 }] },
    { sessions: [{ ...f.connections.sessions[0], datname: 'stale' }] },
    { sessions: [{ ...f.connections.sessions[0], usename: 'foreign' }] },
    { tcp: f.connections.tcp + '1: 030011AC:A029 040011AC:01BB 01 0:0 0:0 0 10001 0 12346\n',
      fds: 'socket:[12345]\nsocket:[12346]\n' },
    { tcp: f.connections.tcp.replace('030011AC', 'malformed') },
  ]) assert.throws(() => h.validateConnections(f.stack.api, f.stack.postgres, { ...f.connections, ...changed }),
    { code: 'DATABASE_CONNECTION_REJECTED' });
});

test('an unverified datasource or connection dispatches no workload POST and writes no sensitive evidence', async t => {
  const h = load();
  for (const kind of ['daemon', 'configuration', 'runtime', 'network', 'connection']) {
    const run = h.createRun(tmp(t));
    const f = relationshipFixture(run.root);
    if (kind === 'configuration') f.stack.api.config.environment.push('SPRING_APPLICATION_JSON=private-canary');
    if (kind === 'runtime') f.runtime.command = 'java\0-Dforeign=private-canary\0';
    if (kind === 'network') f.network.resolved = ['172.17.0.4'];
    if (kind === 'connection') f.connections.sessions = [];
    let posts = 0;
    const client = { request: async (route, options) => {
      if (options?.body !== undefined) posts++;
      return reply(200, { status: 'UP' });
    } };
    const observations = { daemon: () => kind === 'daemon' ? 'ssh://foreign.invalid' : 'unix:///var/run/docker.sock',
      stack: () => f.stack, runtime: () => f.runtime,
      network: () => f.network, connections: () => f.connections, versions: () => ({}) };
    let error;
    try { await h.verifiedWorkload(run, client, observations); } catch (caught) { error = caught; }
    assert.match(error?.code || '', /^(DOCKER_DAEMON|DATASOURCE_CONFIGURATION|DATABASE_NETWORK|DATABASE_CONNECTION)_REJECTED$/);
    assert.equal(posts, 0);
    h.finishRun(run, { status: 'failed', error });
    for (const file of fs.readdirSync(run.directory)) {
      assert.doesNotMatch(fs.readFileSync(path.join(run.directory, file), 'utf8'),
        /private-canary|jdbc:|CREDITFLOW_DB_PASSWORD|SPRING_APPLICATION_JSON/);
    }
  }
});

test('loopback workload refuses remote Docker daemons even when their stack metadata is valid', () => {
  const h = load();
  for (const endpoint of ['unix:///var/run/docker.sock', 'unix:///run/user/1000/docker.sock',
    'npipe:////./pipe/docker_engine', 'npipe:////./pipe/dockerDesktopLinuxEngine']) h.validateDockerEndpoint(endpoint);
  for (const endpoint of ['ssh://foreign.invalid', 'tcp://foreign.invalid:2376', 'tcp://127.0.0.1:2375',
    'unix://foreign.invalid/var/run/docker.sock', 'unix:relative', 'unix:///var/run/docker.sock?foreign',
    'npipe:////foreign/pipe/docker_engine', '', null]) {
    assert.throws(() => h.validateDockerEndpoint(endpoint), { code: 'DOCKER_DAEMON_REJECTED' });
  }
});

test('successful relationship proof reaches the first POST with only sanitized context', async t => {
  const h = load(); const run = h.createRun(tmp(t)); const f = relationshipFixture(run.root);
  f.stack.api.untrusted = 'private-canary';
  const observations = { daemon: () => 'unix:///var/run/docker.sock', stack: () => f.stack,
    runtime: () => f.runtime, network: () => f.network, connections: () => f.connections, versions: () => ({}) };
  const dispatched = [];
  const client = { request: async (route, options) => {
    dispatched.push({ route, post: options?.body !== undefined });
    if (options?.body !== undefined) throw new Error('private-canary');
    return reply(200, { status: 'UP' });
  } };
  let error;
  try { await h.verifiedWorkload(run, client, observations); } catch (caught) { error = caught; }
  assert.deepEqual(dispatched, [{ route: '/actuator/health', post: false }, { route: '/api/v1/sandboxes', post: true }]);
  assert.equal(run.context.environment.databaseRelationship.matchedConnections, 1);
  h.finishRun(run, { status: 'failed', error });
  for (const file of fs.readdirSync(run.directory)) {
    assert.doesNotMatch(fs.readFileSync(path.join(run.directory, file), 'utf8'),
      /private-canary|jdbc:|CREDITFLOW_DB_PASSWORD|SPRING_APPLICATION_JSON/);
  }
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
