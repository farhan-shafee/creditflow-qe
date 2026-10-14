const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
fs.mkdirSync('.work', { recursive: true });
function run(label, args) {
  const file = path.join('.work', `${label}.log`);
  const fd = fs.openSync(file, 'w');
  const result = spawnSync('docker', args, { stdio: ['ignore', fd, fd], timeout: 1500000 });
  fs.closeSync(fd);
  console.log(`${label}: exit=${result.status}`);
  console.log(fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-32).join('\n'));
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
const compose = ['compose', '--env-file', '.env', '-f', 'infrastructure/compose.yml', '--profile', 'ui'];
if (process.argv.includes('--format')) run('ui-format', [...compose, 'run', '--rm', '--no-deps', 'ui-verify', 'sh', './mvnw', '-B', '-Pui', '-pl', 'automation/ui-e2e', 'spotless:apply']);
run('ui-start', [...compose, 'up', '-d', '--build', '--wait', '--no-deps', 'web', 'selenium', 'playwright']);
run('ui-tests', [...compose, 'run', '--rm', 'ui-verify']);
