const path = require('node:path');
const { spawnSync } = require('node:child_process');

module.exports = function runEvidence(scope, args = []) {
  const root = path.resolve(__dirname, '..');
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, ['infrastructure/evidence-run.py', 'execute', scope, ...args], {
    cwd: root, stdio: 'inherit', env: process.env,
  });
  if (result.error) console.error('Could not start the project evidence runner:', result.error.code);
  process.exit(result.status ?? 1);
};
