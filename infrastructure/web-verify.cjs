const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cwd = path.join(root, 'apps/web');
fs.mkdirSync(path.join(root, '.work'), { recursive: true });
for (const [name, args] of [
  ['install', [fs.existsSync(path.join(cwd, 'package-lock.json')) ? 'ci' : 'install', '--ignore-scripts']],
  ['test', ['test']], ['build', ['run', 'build']], ['types', ['run', 'typecheck']],
  ['audit', ['audit', '--omit=dev', '--audit-level=high']]
]) {
  const file = path.join(root, '.work', `web-${name}.log`);
  const fd = fs.openSync(file, 'w');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, shell: process.platform === 'win32', stdio: ['ignore', fd, fd], timeout: 600000, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  fs.closeSync(fd);
  console.log(`web-${name}: exit=${result.status}`);
  console.log(fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-22).join('\n'));
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
