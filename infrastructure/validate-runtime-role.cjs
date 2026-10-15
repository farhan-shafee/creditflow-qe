const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
fs.mkdirSync('.work', { recursive: true });
const role = fs.readFileSync('infrastructure/runtime-role.sql', 'utf8');
const probe = fs.readFileSync('infrastructure/validate-runtime-role.sql', 'utf8');
if (/^\s*(?:COMMIT|ROLLBACK|START\s+TRANSACTION|BEGIN)\s*;/im.test(role + probe)) {
  throw Error('Probe inputs must not contain transaction-control statements');
}
// PostgreSQL17 terminates a stalled probe before the Docker client's outer timeout.
// These settings affect only this transaction, not other application sessions.
const input = `BEGIN;\nSET LOCAL statement_timeout = '10s';\nSET LOCAL lock_timeout = '5s';\nSET LOCAL transaction_timeout = '30s';\n${role}\n${probe}\nROLLBACK;\n`;
const args = ['compose', '--env-file', '.env', '-f', 'infrastructure/compose.yml', 'exec', '-T', 'postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'creditflow_app', '-d', 'creditflow'];
const startedAt = new Date().toISOString();
const result = spawnSync('docker', args, { cwd: root, input, encoding: 'utf8', timeout: 60000 });
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const passed = result.status === 0 && output.includes('CREDITFLOW_RUNTIME_ROLE_VALIDATED:') && /\bROLLBACK\b/.test(result.stdout ?? '');
const report = {
  startedAt, endedAt: new Date().toISOString(), command: ['docker', ...args],
  sourceSha256: crypto.createHash('sha256').update(role + probe).digest('hex'),
  exitCode: result.status, passed, transactionRolledBack: passed,
  databaseTimeoutsMs: { statement: 10000, lock: 5000, transaction: 30000 }, clientTimeoutMs: 60000,
  allowed: ['account insert', 'balance update', 'account and ledger read'],
  denied: ['ledger update', 'ledger delete', 'expiry update', 'schema creation'],
  error: result.error?.message ?? null
};
fs.writeFileSync('.work/runtime-role-validation.json', JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync('.work/runtime-role-validation.log', output.replace(/jdbc:\S+/g, '[redacted connection string]').replace(/Bearer\s+\S+/g, 'Bearer [redacted]'));
console.log(JSON.stringify({ runtimeRoleValidated: passed, transactionRolledBack: passed, exitCode: result.status }));
if (!passed) console.error('Runtime-role validation failed; inspect the retained project-local log.');
process.exit(passed ? 0 : 1);
