const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const publicCommit = '20c91f5e10658ab4ce3ec7f2727c8a4934f5b314';
const image = 'zricethezav/gitleaks:v8.30.1';
const root = path.resolve(__dirname, '..');
const config = path.join(root, 'infrastructure', 'gitleaks.toml');
const runId = `${new Date().toISOString().replace(/[^0-9TZ]/g, '')}-${randomBytes(6).toString('hex')}`;
const receipts = path.join(root, '.work', 'gitleaks-config', 'runs', runId);
// Generated credential-shaped inputs are deliberately outside the uploadable receipt folder.
const inputs = path.join(root, '.work', 'gitleaks-config', 'inputs', runId);
fs.mkdirSync(receipts, { recursive: true });
const cases = [];
const allowedPaths = ['apps/web/data/evidence.json', 'apps/web/test/evidence.test.ts'];

function generatedValue() {
  for (let attempt = 0; attempt < 16; attempt++) {
    const value = randomBytes(20).toString('hex');
    const counts = new Map();
    for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
    const entropy = [...counts.values()].reduce((sum, count) => { const p = count / value.length; return sum - p * Math.log2(p); }, 0);
    if (entropy > 3.65 && value !== publicCommit) return value;
  }
  throw new Error('Could not generate the bounded entropy fixture.');
}
function document(file, value) {
  return file.endsWith('.json') ? `${JSON.stringify({ apiRevision: value }, null, 2)}\n`
    : `assert.equal(view.production.apiRevision, '${value}');\n`;
}
function scan(name, files) {
  const source = path.join(inputs, name);
  const reportFolder = path.join(receipts, name);
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(reportFolder, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = path.resolve(source, relative);
    assert.ok(target.startsWith(`${source}${path.sep}`), 'Fixture path must remain inside its isolated input directory.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const result = spawnSync('docker', ['run', '--rm', '--pull=never',
    '--mount', `type=bind,source=${source},target=/fixture,readonly`,
    '--mount', `type=bind,source=${config},target=/config/gitleaks.toml,readonly`,
    '--mount', `type=bind,source=${reportFolder},target=/reports`,
    image, 'dir', '/fixture', '--config', '/config/gitleaks.toml', '--redact=100', '--no-banner',
    '--report-format', 'json', '--report-path', '/reports/raw.json'],
  { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true });
  // Never echo scanner stdout/stderr: even a scanner/config failure must not print matches.
  const rawPath = path.join(reportFolder, 'raw.json');
  let findings = null;
  try {
    if (fs.existsSync(rawPath)) {
      const report = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
      assert.ok(Array.isArray(report), 'Scanner report must be an array.');
      findings = report.map(item => ({ rule: item.RuleID, file: String(item.File).replace(/^\/fixture\//, ''),
        line: item.StartLine, column: item.StartColumn, endLine: item.EndLine, endColumn: item.EndColumn }));
    }
  } finally {
    // Retain an allowlisted metadata-only report, never Match/Secret/context or raw scanner output.
    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
  }
  const receipt = { name, image, configSha256: createHash('sha256').update(fs.readFileSync(config)).digest('hex'),
    exitCode: result.status, executionError: result.error ? 'SCANNER_EXECUTION_FAILED' : null,
    files: Object.keys(files), findings };
  cases.push(receipt);
  fs.writeFileSync(path.join(reportFolder, 'report.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  assert.ok(result.status === 0 || result.status === 1, 'Pinned local scanner must execute successfully; see sanitized receipt status.');
  assert.ok(findings !== null, 'Pinned local scanner must produce its JSON report.');
  return { exitCode: result.status, findings };
}

test('only the exact public revision in its two approved paths is excluded', () => {
  const result = scan('approved-public-revision', Object.fromEntries(allowedPaths.map(file => [file, document(file, publicCommit)])));
  assert.equal(result.exitCode, 0, 'The public revision in both approved locations must be excluded.');
  assert.deepEqual(result.findings, []);
});

test('different high-entropy values remain detected in both approved paths', () => {
  const result = scan('other-values-approved-paths', Object.fromEntries(allowedPaths.map(file => [file, document(file, generatedValue())])));
  assert.equal(result.exitCode, 1);
  for (const file of allowedPaths) assert.ok(result.findings.some(finding => finding.rule === 'generic-api-key' && finding.file === file), `The scanner must retain generic detection in ${file}.`);
});

test('the public revision remains detected outside the exact approved paths', () => {
  const file = 'apps/web/data/other-evidence.json';
  const result = scan('public-revision-other-path', { [file]: document(file, publicCommit) });
  assert.equal(result.exitCode, 1);
  assert.ok(result.findings.some(finding => finding.rule === 'generic-api-key' && finding.file === file));
});

test('a different credential on the same allowed line remains detected', () => {
  const file = allowedPaths[0];
  const line = JSON.stringify({ apiRevision: publicCommit, api_key: generatedValue() });
  const afterPublicValue = line.indexOf(publicCommit) + publicCommit.length;
  const result = scan('same-line-other-value', { [file]: `${line}\n` });
  assert.equal(result.exitCode, 1);
  assert.ok(result.findings.some(finding => finding.rule === 'generic-api-key' && finding.file === file && finding.line === 1 && finding.column > afterPublicValue), 'The distinct later credential on the same line must remain detected.');
});

after(() => {
  fs.writeFileSync(path.join(receipts, 'summary.json'), `${JSON.stringify({ runId, image, cases }, null, 2)}\n`);
  process.stdout.write(`Sanitized scanner receipts: .work/gitleaks-config/runs/${runId}/\n`);
});
