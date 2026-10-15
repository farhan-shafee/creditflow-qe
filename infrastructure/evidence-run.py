"""Source-bound verification runs; raw diagnostics stay private, snapshots are redacted."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
BASE = Path('.work/evidence')
MAVEN = ['target', 'services/banking-api/target', 'automation/api-bdd/target', 'automation/api-testng/target']
BDD = ['automation/api-bdd/target/surefire-reports', 'automation/api-bdd/target/cucumber', 'automation/api-testng/target/surefire-reports']
SCOPES = {
    'core': dict(targets=MAVEN, roots=['services/banking-api/target/surefire-reports', 'services/banking-api/target/failsafe-reports', 'services/banking-api/target/site/jacoco', 'services/banking-api/target/spotbugsXml.xml'] + BDD, steps=['core-start', 'core-verify'], legacy=['.work/verify-core.log', '.work/evidence-summary.json']),
    'public': dict(targets=MAVEN[2:], roots=BDD, steps=['public-start', 'public-bdd', 'public-testng'], legacy=[]),
    'browser': dict(targets=['automation/ui-e2e/target'], roots=['automation/ui-e2e/target/surefire-reports', 'automation/ui-e2e/target/ui-artifacts'], steps=['browser-start', 'browser-tests', 'browser-bruno'], legacy=['.work/ui-tests.log', '.work/bruno.log']),
    'web': dict(targets=[], roots=[], steps=['web-install', 'web-test', 'web-build', 'web-types', 'web-audit'], legacy=['apps/web/.next', '.work/web-install.log', '.work/web-test.log', '.work/web-build.log', '.work/web-types.log', '.work/web-audit.log']),
    'quality': dict(targets=['target'], roots=['target/bom.json', '.work/dependency-audit.json', '.work/runtime-role-validation.json', '.work/runtime-role-validation.log'], steps=['quality-compose', 'quality-compose-public', 'quality-bom', 'quality-osv', 'quality-gitleaks', 'quality-jenkins', 'quality-runtime-role'], legacy=['.work/dependency-audit.json', '.work/runtime-role-validation.json', '.work/runtime-role-validation.log']),
    'focused': dict(targets=MAVEN + ['automation/ui-e2e/target'], roots=['services/banking-api/target/surefire-reports', 'services/banking-api/target/failsafe-reports', 'automation/ui-e2e/target/surefire-reports'] + BDD, steps=['focused-maven'], legacy=['.work/maven-focused.log']),
}
REQUIRED = ('core', 'public', 'browser', 'web', 'quality')


class EvidenceError(RuntimeError):
    pass


def check(condition, message):
    if not condition:
        raise EvidenceError(message)


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def redact(text):
    text = str(text)
    for name, value in os.environ.items():
        if re.search(r'TOKEN|PASSWORD|SECRET|(?:^|_)KEY$', name, re.I) and len(value) >= 8:
            text = text.replace(value, 'REDACTED')
    text = re.sub(r'(?i)\bBearer\s+[^\s"\'<>;,]+', 'Bearer REDACTED', text)
    text = re.sub(r'(?i)jdbc:[^\s"\'<>]+|postgres(?:ql)?://[^\s"\'<>]+', '[REDACTED CONNECTION]', text)
    def mask(match):
        value = match.group(2)
        replacement = value[0] + 'REDACTED' + value[0] if value[:1] in ('"', "'") else 'REDACTED'
        return match.group(1) + replacement
    return re.sub(r'(?i)(["\']?(?:authorization|cookie|set-cookie|token|sandboxToken|password|secret|creditflow_session|x-sandbox-provision-key)["\']?\s*[:=]\s*)("[^"\n]*"|\'[^\'\n]*\'|[^\s,}\]"\'<>\n]+)', mask, text)


def safe_args(args, root):
    result, hide = [], False
    for value in args:
        value = str(value)
        if hide:
            result.append(value.split('=', 1)[0] + '=REDACTED' if '=' in value else 'REDACTED')
            hide = False
            continue
        hide = value in ('-e', '--env', '--env-var', '--header', '-H')
        if re.search(r'(?i)(password|secret|token|provision.?key|access.?key)=', value):
            value = value.split('=', 1)[0] + '=REDACTED'
        value = value.replace(str(root), '<repo>').replace(root.as_posix(), '<repo>')
        result.append('<python>' if value == sys.executable else redact(value))
    return result


def contained(root, relative):
    root = root.resolve()
    path = root / relative
    check(path.resolve().is_relative_to(root) and path.resolve() != root, f'Path outside workspace: {relative}')
    current = path
    while current != root and current.is_relative_to(root):
        check(not current.is_symlink(), f'Symlink is not evidence: {relative}')
        current = current.parent
    return path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def source_state(root):
    def git(*args):
        result = subprocess.run(['git', *args], cwd=root, capture_output=True, check=False)
        check(result.returncode == 0, 'Cannot establish Git provenance: ' + redact(result.stderr.decode(errors='replace')))
        return result.stdout.decode()
    head = git('rev-parse', 'HEAD').strip()
    files = sorted(set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0')) - {''})
    return dict(head=head, fingerprint=fingerprint_files(root, files), sourceFiles=len(files))


def fingerprint_files(root, files):
    value = hashlib.sha256()
    for name in files:
        path = contained(root, name)
        value.update(name.encode() + b'\0' + (path.read_bytes() if path.is_file() else b'<missing>') + b'\0')
    return value.hexdigest()


def ensure_environment(root):
    (root / '.work').mkdir(exist_ok=True)
    database = root / '.env'
    if not database.exists():
        with database.open('x', encoding='utf-8') as stream:
            stream.write('CREDITFLOW_DB_PASSWORD=' + secrets.token_hex(32) + '\n')
        database.chmod(0o600)
    key_file = root / '.work/public-test.env'
    key = os.environ.get('CREDITFLOW_PUBLIC_TEST_KEY', '')
    if not key and key_file.exists():
        key = next((line.partition('=')[2] for line in key_file.read_text(encoding='utf-8').splitlines() if line.startswith('CREDITFLOW_PUBLIC_TEST_KEY=')), '')
    if not key:
        key = secrets.token_hex(32)
        with key_file.open('x', encoding='utf-8') as stream:
            stream.write('CREDITFLOW_PUBLIC_TEST_KEY=' + key + '\n')
        key_file.chmod(0o600)
    check(len(key) >= 32, 'Public verification requires a strong private provision key')
    os.environ['CREDITFLOW_PUBLIC_TEST_KEY'] = key
    os.environ['NEXT_TELEMETRY_DISABLED'] = '1'


def run_folder(root, manifest):
    return contained(root, str(BASE / 'runs' / manifest['scope'] / manifest['runId']))


def latest(root, scope):
    pointer = contained(root, str(BASE / 'latest' / (scope + '.json')))
    check(pointer.is_file(), f'No current {scope} execution manifest')
    path = contained(root, json.loads(pointer.read_text(encoding='utf-8'))['manifest'])
    return path, json.loads(path.read_text(encoding='utf-8'))


def save(root, manifest):
    path = run_folder(root, manifest) / 'manifest.json'
    atomic_json(path, manifest)
    atomic_json(root / BASE / 'latest' / (manifest['scope'] + '.json'), dict(manifest=path.relative_to(root).as_posix()))


def compose():
    return ['docker', 'compose', '--env-file', '.env', '-f', 'infrastructure/compose.yml']


def command_for(root, manifest, step):
    scope, run_id = manifest['scope'], manifest['runId']
    folder, c = run_folder(root, manifest), compose()
    name = f'creditflow-qe-evidence-{run_id[-12:]}-{step}'
    def maven(service, *args):
        return c + ['run', '--rm', '--no-deps', '--name', name, service, 'sh', './mvnw', '-B', '-e', *args]
    commands = {
        'core-start': c + ['up', '-d', '--build', '--wait', 'postgres', 'api'],
        'core-verify': maven('verify', 'clean', 'verify', 'spotless:check'),
        'public-start': c + ['--profile', 'public-test', 'up', '-d', '--build', '--wait', 'postgres-public', 'api-public'],
        'public-bdd': maven('verify-public', '-pl', 'automation/api-bdd', 'clean', 'verify', 'spotless:check'),
        'public-testng': maven('verify-public', '-pl', 'automation/api-testng', 'clean', 'verify', 'spotless:check'),
        'browser-start': c + ['--profile', 'ui', 'up', '-d', '--build', '--wait', 'postgres', 'api', 'web', 'selenium', 'playwright'],
        'browser-tests': maven('ui-verify', '-Pui', '-pl', 'automation/ui-e2e', 'clean', 'verify', 'spotless:check'),
        'browser-bruno': ['docker', 'run', '--rm', '--name', name, '--network', os.environ.get('COMPOSE_PROJECT_NAME', 'creditflow-qe') + '_default', '--mount', f'type=bind,source={root / "bruno"},target=/collection,readonly', '-w', '/collection', 'node:24-bookworm-slim', 'npx', '-y', '@usebruno/cli@4.2.1', 'run', '--env', 'Local', '--env-var', 'baseUrl=http://api:8080'],
        'quality-compose': c + ['config', '--quiet'],
        'quality-compose-public': c + ['--profile', 'public-test', 'config', '--quiet'],
        'quality-bom': c + ['run', '--rm', '--no-deps', '--name', name, 'verify', 'sh', '-c', 'set -eu; id; stat -c "%A %a %U:%G %u:%g %n" .; if [ -e target ]; then stat -c "%A %a %U:%G %u:%g %n" target; fi; exec sh ./mvnw -B -e -Pui org.cyclonedx:cyclonedx-maven-plugin:2.9.1:makeAggregateBom -DincludeTestScope=true -DoutputFormat=json'],
        'quality-osv': [sys.executable, 'infrastructure/audit-dependencies.py'],
        'quality-gitleaks': ['docker', 'run', '--rm', '--name', name, '--mount', f'type=bind,source={root},target=/repo,readonly', '--mount', f'type=bind,source={folder / "snapshot"},target=/reports', 'zricethezav/gitleaks:v8.30.1', 'dir', '/repo', '--config', '/repo/infrastructure/gitleaks.toml', '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', '/reports/gitleaks.json'],
        'quality-jenkins': c + ['run', '--rm', '--no-deps', '--name', name, 'verify', 'sh', '-c', 'set -eu; groovy=$(find /root/.m2/repository/org/apache/groovy/groovy -name "groovy-*.jar" -type f | sort | tail -1); test -n "$groovy"; java -cp "$groovy" infrastructure/ValidateJenkins.java'],
        'quality-runtime-role': ['node', 'infrastructure/validate-runtime-role.cjs'],
        'focused-maven': maven('verify', *manifest.get('options', {}).get('mavenArgs', [])),
    }
    if scope == 'web':
        args = {'web-install': ['ci', '--ignore-scripts'], 'web-test': ['test'], 'web-build': ['run', 'build'], 'web-types': ['run', 'typecheck'], 'web-audit': ['audit', '--json', '--audit-level=high']}[step]
        if manifest.get('options', {}).get('containerWeb'):
            return ['docker', 'run', '--rm', '--name', name, '--mount', f'type=bind,source={root / "apps/web"},target=/app', '-w', '/app', '-e', 'NEXT_TELEMETRY_DISABLED=1', 'node:24-bookworm-slim', 'npm', *args], '.'
        return ['npm.cmd' if os.name == 'nt' else 'npm', *args], 'apps/web'
    check(step in commands, f'Unknown command: {step}')
    if step.endswith('-start') and manifest.get('options', {}).get('recreate'):
        commands[step].insert(commands[step].index('--wait') + 1, '--force-recreate')
    return commands[step], '.'


def execute_command(root, manifest, step, args, cwd='.', timeout=1500):
    folder = run_folder(root, manifest)
    command_lock = folder / 'command.lock'
    try:
        with command_lock.open('x') as stream:
            stream.write(str(os.getpid()))
    except FileExistsError:
        raise EvidenceError('A command is already active in this evidence run') from None
    private = root / BASE / 'private' / manifest['scope'] / manifest['runId']
    private.mkdir(parents=True, exist_ok=True)
    log = folder / 'logs' / (step + '.log')
    log.parent.mkdir(exist_ok=True)
    clock = time.monotonic()
    entry = dict(name=step, command=safe_args(args, root), cwd=cwd, startedAt=utc(), startedNs=time.time_ns(), finishedAt=None, exitCode=None, timedOut=False, log=log.relative_to(folder).as_posix())
    manifest['commands'].append(entry)
    save(root, manifest)
    print(f'{manifest["scope"]}/{step}: started; {log.relative_to(root)}', flush=True)
    actual = ['cmd.exe', '/d', '/s', '/c', subprocess.list2cmdline(args)] if os.name == 'nt' and str(args[0]).lower().endswith('.cmd') else args
    output, errors = b'', b''
    try:
        result = subprocess.run(actual, cwd=root / cwd, capture_output=True, timeout=timeout, check=False)
        output, errors, entry['exitCode'] = result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired as error:
        output, errors = error.stdout or b'', error.stderr or b''
        entry['timedOut'], entry['exitCode'] = True, 124
    except (OSError, KeyboardInterrupt) as error:
        errors, entry['exitCode'] = str(error).encode(), 130
    if entry['timedOut'] or entry['exitCode'] == 130:
        entry['unresolvedProducer'] = True
        if args[0] == 'docker' and '--name' in args:
            try:
                stopped = subprocess.run(['docker', 'stop', args[args.index('--name') + 1]], capture_output=True, timeout=30, check=False)
                entry['containerStopExit'] = stopped.returncode
                entry['unresolvedProducer'] = stopped.returncode != 0
            except (OSError, subprocess.TimeoutExpired) as error:
                entry['containerStopError'] = redact(error)
        elif args[0] == sys.executable:
            # subprocess.run kills and waits for this direct child on timeout/interruption.
            entry['unresolvedProducer'] = False
    entry.update(finishedAt=utc(), finishedNs=time.time_ns(), durationSeconds=round(time.monotonic() - clock, 3))
    combined = output + b'\n' + errors
    (private / (step + '-raw.log')).write_bytes(combined)
    log.write_text(redact(combined.decode('utf-8', errors='replace')), encoding='utf-8')
    entry['logSha256'] = digest(log)
    if step == 'web-audit':
        (folder / 'snapshot/npm-audit.json').write_text(redact(output.decode('utf-8', errors='replace')), encoding='utf-8')
    save(root, manifest)
    command_lock.unlink()
    print(f'{manifest["scope"]}/{step}: exit={entry["exitCode"]}; {entry["durationSeconds"]}s', flush=True)
    tail = '\n'.join(log.read_text(encoding='utf-8').splitlines()[-15:])
    console_encoding = getattr(sys.stdout, 'encoding', None) or 'utf-8'
    print(tail.encode(console_encoding, errors='backslashreplace').decode(console_encoding), flush=True)
    return entry['exitCode']


def archive_prior(root, manifest):
    spec = SCOPES[manifest['scope']]
    prior = root / BASE / 'private' / manifest['scope'] / manifest['runId'] / 'prior'
    prior.mkdir(parents=True, exist_ok=True)
    targets = [name for name in spec['targets'] if contained(root, name).exists()]
    if targets:
        destination = '/workspace/' + prior.relative_to(root).as_posix()
        script = 'set -eu; dest=$1; shift; for path do mkdir -p "$dest/$(dirname "$path")"; mv -- "$path" "$dest/$path"; done'
        args = compose() + ['run', '--rm', '--no-deps', '--name', 'creditflow-qe-evidence-' + manifest['runId'][-12:] + '-archive', 'verify', 'sh', '-c', script, 'sh', destination, *targets]
        check(execute_command(root, manifest, 'prepare-archive', args, timeout=120) == 0, 'Could not archive prior Maven targets')
    for name in spec['legacy']:
        path = contained(root, name)
        if path.exists():
            destination = prior / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), str(destination))


def begin(root, scope, options=None):
    check(scope in SCOPES, f'Unknown scope: {scope}')
    ensure_environment(root)
    active = root / BASE / 'active.json'
    active.parent.mkdir(parents=True, exist_ok=True)
    check(not active.exists(), 'Another evidence scope is active; finish it before starting another')
    state = source_state(root)
    run_id = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex
    manifest = dict(version=1, scope=scope, runId=run_id, status='running', startedAt=utc(), startedNs=time.time_ns(), finishedAt=None, source=state,
                    ci={key: os.environ[key] for key in ('GITHUB_SHA', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_RUN_ID', 'CREDITFLOW_PR_HEAD_SHA', 'CREDITFLOW_PR_BASE_SHA') if os.environ.get(key)},
                    options=options or {}, commands=[], reports=[], issues=[])
    with active.open('x', encoding='utf-8') as stream:
        json.dump(dict(scope=scope, runId=run_id), stream)
    (run_folder(root, manifest) / 'snapshot').mkdir(parents=True)
    save(root, manifest)
    try:
        current_export = root / BASE / 'current' / scope
        if current_export.exists():
            destination = root / BASE / 'private' / scope / run_id / 'prior/current'
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(current_export), str(destination))
        archive_prior(root, manifest)
    except Exception as error:
        manifest.update(status='failed', finishedAt=utc(), issues=[redact(error)])
        save(root, manifest)
        if not any(item.get('unresolvedProducer') for item in manifest['commands']):
            active.unlink()
        raise
    return manifest


def load_active(root, scope, run_id=None):
    path, manifest = latest(root, scope)
    active = root / BASE / 'active.json'
    check(active.is_file(), 'No active evidence run')
    lock = json.loads(active.read_text(encoding='utf-8'))
    check(lock['scope'] == scope and lock['runId'] == manifest['runId'], 'Evidence run does not own the workspace lock')
    check(run_id is None or run_id == manifest['runId'], 'Run identity changed')
    check(manifest['status'] == 'running', 'Evidence run is already finished')
    return manifest


def sanitize_file(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix == '.xml':
        tree = ET.parse(source)
        for parent in tree.iter():
            for child in list(parent):
                if child.tag.rsplit('}', 1)[-1] == 'properties':
                    parent.remove(child)
        destination.write_text(redact(ET.tostring(tree.getroot(), encoding='unicode')), encoding='utf-8')
    elif source.suffix.lower() in ('.png', '.zip', '.gif', '.exec'):
        check('-raw.' not in source.name, 'Raw browser traces cannot be published')
        shutil.copyfile(source, destination)
    else:
        destination.write_text(redact(source.read_text(encoding='utf-8', errors='replace')), encoding='utf-8')


def snapshot(root, manifest):
    folder, files = run_folder(root, manifest), []
    for name in SCOPES[manifest['scope']]['roots']:
        path = contained(root, name)
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(item for item in path.rglob('*') if item.is_file())
    for source in sorted(set(files)):
        relative = source.relative_to(root)
        contained(root, str(relative))
        original_ns = source.stat().st_mtime_ns
        destination = folder / 'snapshot' / relative
        sanitize_file(source, destination)
        manifest['reports'].append(dict(sourcePath=relative.as_posix(), path=destination.relative_to(folder).as_posix(), generatedNs=original_ns, sourceSha256=digest(source), sha256=digest(destination), bytes=destination.stat().st_size))
    for name in ('npm-audit.json', 'gitleaks.json'):
        path = folder / 'snapshot' / name
        if path.is_file():
            original_ns = path.stat().st_mtime_ns
            temporary = path.with_name(name + '.tmp')
            temporary.write_text(redact(path.read_text(encoding='utf-8')), encoding='utf-8')
            os.replace(temporary, path)
            manifest['reports'].append(dict(sourcePath=name, path=path.relative_to(folder).as_posix(), generatedNs=original_ns, sourceSha256=digest(path), sha256=digest(path), bytes=path.stat().st_size))


def validate_manifest(root, manifest, current, verify_commands=True):
    scope = manifest['scope']
    check(scope in SCOPES, 'Unknown manifest scope')
    check(manifest['status'] == 'passed' and manifest.get('finishedAt'), f'{scope}: execution is not complete and successful')
    check(manifest['source']['head'] == current['head'], f'{scope}: stale checkout HEAD')
    check(manifest['source']['fingerprint'] == current['fingerprint'], f'{scope}: source changed since execution')
    folder = run_folder(root, manifest)
    commands = {entry['name']: entry for entry in manifest['commands']}
    check(len(commands) == len(manifest['commands']), f'{scope}: duplicate commands')
    for name in SCOPES[scope]['steps']:
        check(name in commands, f'{scope}: missing required command {name}')
        if verify_commands:
            args, cwd = command_for(root, manifest, name)
            check(commands[name]['command'] == safe_args(args, root) and commands[name]['cwd'] == cwd, f'{scope}: command does not match required {name}')
    for command in manifest['commands']:
        check(command.get('finishedAt') and command.get('exitCode') == 0 and not command.get('timedOut'), f'{scope}: failed/incomplete command {command["name"]}')
        log = contained(folder, command['log'])
        check(log.is_file() and digest(log) == command['logSha256'], f'{scope}: changed command log')
    reports = {}
    producers = {'core': ['core-verify'], 'public': ['public-bdd', 'public-testng'], 'browser': ['browser-tests'], 'web': ['web-audit'], 'quality': ['quality-bom', 'quality-osv', 'quality-gitleaks', 'quality-runtime-role'], 'focused': ['focused-maven']}[scope]
    for report in manifest['reports']:
        path = contained(folder, report['path'])
        check(path.is_file() and digest(path) == report['sha256'], f'{scope}: missing or tampered report {report["sourcePath"]}')
        names = producers
        if scope == 'public':
            names = ['public-bdd' if report['sourcePath'].startswith('automation/api-bdd/') else 'public-testng']
        elif scope == 'quality':
            names = [{'target/bom.json': 'quality-bom', '.work/dependency-audit.json': 'quality-osv', 'gitleaks.json': 'quality-gitleaks', '.work/runtime-role-validation.json': 'quality-runtime-role', '.work/runtime-role-validation.log': 'quality-runtime-role'}[report['sourcePath']]]
        if path.suffix.lower() in ('.xml', '.json', '.png', '.zip', '.log'):
            check(any(commands[name]['startedNs'] - 2_000_000_000 <= report['generatedNs'] <= commands[name]['finishedNs'] + 2_000_000_000 for name in names if name in commands), f'{scope}: stale report {report["sourcePath"]}')
        reports[report['sourcePath']] = path
    def junit(prefix, classes, minimum):
        paths = {name: path for name, path in reports.items() if name.rsplit('/', 1)[0] == prefix and re.search(r'/TEST-[^/]+\.xml$', name)}
        for name in classes:
            check(any(path.endswith(name + '.xml') for path in paths), f'{scope}: missing required suite {name}')
        count = 0
        for path in paths.values():
            suite = ET.parse(path).getroot()
            check(all(int(suite.get(attr, '0')) == 0 for attr in ('failures', 'errors', 'skipped')), f'{scope}: nonpassing JUnit suite')
            cases = list(suite.iter('testcase'))
            check(not any(case.find(tag) is not None for case in cases for tag in ('failure', 'error', 'skipped', 'flakyFailure', 'rerunFailure')), f'{scope}: nonpassing JUnit case')
            check(cases, f'{scope}: empty JUnit suite')
            count += len(cases)
        check(count >= minimum, f'{scope}: expected at least {minimum} tests, executed {count}')
        return count
    counts = {}
    if scope == 'core':
        counts['unit'] = junit('services/banking-api/target/surefire-reports', ('domain.AccountStateTest', 'domain.MoneyTest', 'HistoryTest', 'RequestBudgetTest'), 31)
        counts['postgres_integration'] = junit('services/banking-api/target/failsafe-reports', ('LedgerIT', 'PublicBoundaryIT', 'HealthAvailabilityIT'), 18)
        coverage = reports.get('services/banking-api/target/site/jacoco/jacoco.xml')
        check(coverage is not None, 'core: missing generated coverage')
        counts['coverage'] = {c.get('type'): dict(covered=int(c.get('covered')), missed=int(c.get('missed'))) for c in ET.parse(coverage).getroot().findall('counter')}
        check(counts['coverage'].get('LINE', {}).get('covered', 0) > 0, 'core: empty coverage')
    if scope in ('core', 'public'):
        counts['testng'] = junit('automation/api-testng/target/surefire-reports', ('TEST-TestSuite',), 6)
        path = reports.get('automation/api-bdd/target/cucumber/report.json')
        check(path is not None, f'{scope}: missing Cucumber JSON')
        scenarios = [s for feature in json.loads(path.read_text(encoding='utf-8')) for s in feature['elements'] if s.get('type') == 'scenario']
        steps = 0
        for scenario in scenarios:
            check(scenario.get('steps'), f'{scope}: empty Cucumber scenario')
            for item in scenario['steps'] + scenario.get('before', []) + scenario.get('after', []):
                check(item.get('result', {}).get('status') == 'passed', f'{scope}: nonpassing Cucumber step or hook')
            steps += len(scenario['steps'])
        check(len(scenarios) >= 31 and steps >= 154, f'{scope}: incomplete Cucumber execution')
        counts.update(cucumber=len(scenarios), cucumber_steps=steps)
    if scope == 'browser':
        counts['ui'] = junit('automation/ui-e2e/target/surefire-reports', ('BffContractTest', 'PlaywrightJourneyTest', 'SeleniumJourneyTest', 'TraceRedactorTest'), 11)
        check(sum(name.endswith('.png') for name in reports) >= 6 and sum(name.endswith('.zip') for name in reports) >= 4, 'browser: missing screenshots or final traces')
        bruno = (folder / commands['browser-bruno']['log']).read_text(encoding='utf-8')
        check(re.search(r'Requests\W+7\s*\(7 Passed\)', bruno) and re.search(r'Tests\W+11/11', bruno), 'browser: missing passing Bruno request/check counts')
        counts.update(bruno_requests=7, bruno_checks=11)
    if scope == 'web':
        log = (folder / commands['web-test']['log']).read_text(encoding='utf-8')
        for name, expected in {'tests': 5, 'pass': 5, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}.items():
            values = re.findall(r'(?m)^\s*(?:ℹ|#)\s+' + name + r'\s+(\d+)\s*$', log)
            check(values == [str(expected)], 'web: incomplete frontend tests (' + name + ')')
        audit = reports.get('npm-audit.json')
        check(audit is not None, 'web: missing npm JSON audit')
        check(json.loads(audit.read_text(encoding='utf-8')).get('metadata', {}).get('vulnerabilities', {}).get('total') == 0, 'web: npm vulnerabilities or incomplete audit')
        counts.update(frontend=5, npm_vulnerabilities=0)
    if scope == 'quality':
        bom, osv, leaks, role = (reports.get(name) for name in ('target/bom.json', '.work/dependency-audit.json', 'gitleaks.json', '.work/runtime-role-validation.json'))
        check(all(item is not None for item in (bom, osv, leaks, role)), 'quality: missing generated scan/config result')
        data, audit = json.loads(bom.read_text(encoding='utf-8')), json.loads(osv.read_text(encoding='utf-8'))
        purls = {c['purl'] for c in data.get('components', []) if c.get('purl')}
        check(len(purls) >= 209 and any('selenium-java' in p for p in purls) and any('playwright' in p for p in purls), 'quality: incomplete UI/test-scope inventory')
        original_bom_hash = next(item['sourceSha256'] for item in manifest['reports'] if item['sourcePath'] == 'target/bom.json')
        check(audit.get('bomSha256') == original_bom_hash and audit.get('components') == len(purls) and audit.get('findings') == [], 'quality: stale/incomplete/affected OSV result')
        queried_ns = int(dt.datetime.fromisoformat(audit['queriedAt'].replace('Z', '+00:00')).timestamp() * 1_000_000_000)
        check(commands['quality-osv']['startedNs'] - 2_000_000_000 <= queried_ns <= commands['quality-osv']['finishedNs'] + 2_000_000_000, 'quality: stale OSV query timestamp')
        check(json.loads(leaks.read_text(encoding='utf-8')) == [], 'quality: Gitleaks findings')
        role_result = json.loads(role.read_text(encoding='utf-8'))
        role_source = (root / 'infrastructure/runtime-role.sql').read_bytes() + (root / 'infrastructure/validate-runtime-role.sql').read_bytes()
        check(role_result.get('passed') is True and role_result.get('transactionRolledBack') is True and role_result.get('sourceSha256') == hashlib.sha256(role_source).hexdigest(), 'quality: runtime role validation did not pass or has stale SQL')
        check('Jenkinsfile Groovy syntax parsed; Jenkins server execution remains unverified.' in (folder / commands['quality-jenkins']['log']).read_text(encoding='utf-8'), 'quality: missing Jenkins AST execution evidence')
        counts.update(components=len(purls), affected_components=0, gitleaks_findings=0, jenkins_runtime='NOT RUN')
    return counts


def end(root, scope, run_id=None):
    manifest = load_active(root, scope, run_id)
    check(not any(not command.get('finishedAt') for command in manifest['commands']), 'A command is still running; workspace lock retained')
    manifest.update(finishedAt=utc(), finishedNs=time.time_ns(), status='passed')
    if any(command.get('unresolvedProducer') for command in manifest['commands']):
        manifest.update(status='failed', issues=['Producer stop is unconfirmed; no snapshot taken and workspace lock retained for process review'])
        save(root, manifest)
        print(json.dumps(dict(scope=scope, status='failed', issues=manifest['issues'])), flush=True)
        return 1
    try:
        snapshot(root, manifest)
        manifest['sourceAtEnd'] = source_state(root)
        manifest['counts'] = validate_manifest(root, manifest, manifest['sourceAtEnd'])
    except Exception as error:
        manifest.update(status='failed', issues=[redact(error)])
    save(root, manifest)
    if manifest['status'] == 'passed':
        export = root / BASE / 'current' / scope
        export.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(run_folder(root, manifest) / 'snapshot', export / 'snapshot')
        shutil.copytree(run_folder(root, manifest) / 'logs', export / 'logs')
        shutil.copyfile(run_folder(root, manifest) / 'manifest.json', export / 'manifest.json')
    (root / BASE / 'active.json').unlink()
    print(json.dumps(dict(scope=scope, runId=manifest['runId'], status=manifest['status'], counts=manifest.get('counts'), issues=manifest['issues'])), flush=True)
    return 0 if manifest['status'] == 'passed' else 1


def validate_latest(root, scopes):
    manifests = {scope: latest(root, scope)[1] for scope in scopes}
    current = source_state(root)
    return {scope: validate_manifest(root, manifest, current) for scope, manifest in manifests.items()}


def execute(root, scope, options):
    ensure_environment(root)
    if scope != 'web':
        result = subprocess.run(['docker', 'volume', 'create', 'creditflow-qe-maven-cache'], capture_output=True, check=False)
        check(result.returncode == 0, redact(result.stderr.decode(errors='replace')))
    if options.get('format'):
        check(scope in ('core', 'browser'), 'Formatting is supported for core and browser preparation')
        arguments = ['-Pui', '-pl', 'automation/ui-e2e', 'spotless:apply'] if scope == 'browser' else ['spotless:apply']
        preparation = begin(root, 'focused', dict(mavenArgs=arguments, purpose='format preparation; no test execution claim'))
        command, cwd = command_for(root, preparation, 'focused-maven')
        code = execute_command(root, preparation, 'focused-maven', command, cwd)
        if any(item.get('unresolvedProducer') for item in preparation['commands']):
            return end(root, 'focused', preparation['runId'])
        preparation.update(finishedAt=utc(), status='prepared' if code == 0 else 'failed', sourceAtEnd=source_state(root))
        save(root, preparation)
        (root / BASE / 'active.json').unlink()
        if code != 0:
            return code
    manifest = begin(root, scope, options)
    for name in SCOPES[scope]['steps']:
        args, cwd = command_for(root, manifest, name)
        if execute_command(root, manifest, name, args, cwd) != 0:
            break
    return end(root, scope, manifest['runId'])


def parse_cli(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('begin', 'run', 'end', 'execute', 'cleanup'))
    parser.add_argument('scope', choices=tuple(SCOPES), nargs='?', default='core')
    parser.add_argument('--step')
    parser.add_argument('--run-id')
    parser.add_argument('--timeout', type=int, default=1500)
    parser.add_argument('--container-web', action='store_true')
    parser.add_argument('--format', action='store_true')
    parser.add_argument('--recreate', action='store_true')
    args, command = parser.parse_known_args(argv)
    command = command[1:] if command[:1] == ['--'] else command
    check(args.scope == 'focused' or args.action == 'run' or not command, 'Unexpected evidence CLI arguments')
    return args, command


def main():
    args, command = parse_cli()
    if args.action == 'cleanup':
        ensure_environment(ROOT)
        result = subprocess.run(compose() + ['--profile', 'ui', '--profile', 'public-test', 'down'], cwd=ROOT, capture_output=True, check=False)
        print(redact((result.stdout + result.stderr).decode(errors='replace')))
        return result.returncode
    options = dict(containerWeb=args.container_web, format=args.format, recreate=args.recreate)
    if args.scope == 'focused':
        check(command == safe_args(command, ROOT), 'Sensitive Maven arguments must be supplied through the environment')
        options['mavenArgs'] = command
    if args.action == 'begin':
        print(begin(ROOT, args.scope, options)['runId'])
        return 0
    if args.action == 'end':
        return end(ROOT, args.scope, args.run_id)
    if args.action == 'execute':
        return execute(ROOT, args.scope, options)
    manifest = load_active(ROOT, args.scope, args.run_id)
    check(args.step in SCOPES[args.scope]['steps'], 'A required registered step is needed')
    expected, cwd = command_for(ROOT, manifest, args.step)
    check(not command or safe_args(command, ROOT) == safe_args(expected, ROOT), 'Command override differs from registered command')
    return execute_command(ROOT, manifest, args.step, expected, cwd, args.timeout)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (EvidenceError, ValueError, ET.ParseError, OSError) as error:
        print('Evidence rejected: ' + redact(error), file=sys.stderr)
        raise SystemExit(1)
