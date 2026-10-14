const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
fs.mkdirSync('.work', { recursive: true });
if (!fs.existsSync('.env')) fs.writeFileSync('.env', `CREDITFLOW_DB_PASSWORD=${crypto.randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
function run(name, args) {
  const log = path.join('.work', name + '.log');
  const fd = fs.openSync(log, 'w');
  const result = spawnSync('docker', args, { stdio: ['ignore', fd, fd], timeout: 1200000 });
  fs.closeSync(fd);
  console.log(`${name}: exit=${result.status}`);
  console.log(fs.readFileSync(log, 'utf8').split(/\r?\n/).slice(-28).join('\n'));
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
const compose = ['compose', '--env-file', '.env', '-f', 'infrastructure/compose.yml'];
run('volume', ['volume', 'create', 'creditflow-qe-maven-cache']);
if (process.argv.includes('--format')) run('format', ['run', '--rm', '--mount', `type=bind,source=${root},target=/workspace`, '--mount', 'type=volume,source=creditflow-qe-maven-cache,target=/root/.m2', '-w', '/workspace', 'maven:3.9.11-eclipse-temurin-21', 'sh', './mvnw', '-B', 'spotless:apply']);
run('compose-start', [...compose, 'up', '-d', '--build', '--wait', ...(process.argv.includes('--recreate') ? ['--force-recreate'] : []), 'postgres', 'api']);
run('verify-core', [...compose, 'run', '--rm', 'verify', 'sh', './mvnw', '-B', 'verify', 'spotless:check']);
