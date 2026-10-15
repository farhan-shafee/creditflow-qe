"""Behavioral evidence gates use isolated files; no application or Docker tests."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import copy
import runpy
import hashlib
from unittest.mock import patch
import contextlib
import io


HERE = Path(__file__).resolve().parent


def passing_reports(root):
    reports = {
        "services/banking-api/target/surefire-reports/TEST-com.creditflow.banking.domain.AccountStateTest.xml": 9,
        "services/banking-api/target/surefire-reports/TEST-com.creditflow.banking.domain.MoneyTest.xml": 18,
        "services/banking-api/target/surefire-reports/TEST-com.creditflow.banking.HistoryTest.xml": 1,
        "services/banking-api/target/surefire-reports/TEST-com.creditflow.banking.RequestBudgetTest.xml": 3,
        "services/banking-api/target/failsafe-reports/TEST-com.creditflow.banking.LedgerIT.xml": 11,
        "services/banking-api/target/failsafe-reports/TEST-com.creditflow.banking.PublicBoundaryIT.xml": 4,
        "services/banking-api/target/failsafe-reports/TEST-com.creditflow.banking.HealthAvailabilityIT.xml": 3,
        "automation/api-testng/target/surefire-reports/TEST-TestSuite.xml": 6,
    }
    for name, count in reports.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f'<testsuite tests="{count}" failures="0" errors="0" skipped="0">'
                        + '<testcase name="example"/>' * count + '</testsuite>')
    cucumber = root / "automation/api-bdd/target/cucumber/report.json"
    cucumber.parent.mkdir(parents=True, exist_ok=True)
    cucumber.write_text(json.dumps([{"elements": [
        {"type": "scenario", "name": str(i), "steps": [
            {"result": {"status": "passed"}} for _ in range(4 if i == 30 else 5)
        ]} for i in range(31)
    ]}]))
    return list(reports) + [str(cucumber.relative_to(root))]


class LegacyFreshnessRegression(unittest.TestCase):
    def test_stale_passing_reports_are_rejected_without_current_run(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "infrastructure").mkdir()
            for name in ("verify-evidence.py", "evidence-run.py"):
                if (HERE / name).exists():
                    shutil.copyfile(HERE / name, root / "infrastructure" / name)
            for name in passing_reports(root):
                os.utime(root / name, (time.time() - 86400, time.time() - 86400))
            result = subprocess.run(
                [sys.executable, str(root / "infrastructure/verify-evidence.py"), "--scope", "core"],
                cwd=root, capture_output=True, text=True, check=False,
            )
            self.assertNotEqual(result.returncode, 0,
                                "stale passing XML/JSON was accepted without a current execution manifest")


class EvidenceBehavior(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.api = runpy.run_path(str(HERE / 'evidence-run.py'))
        self.current = dict(head='a' * 40, fingerprint='source-a')
        self.manifest = dict(version=1, scope='core', runId='fixture', status='passed', source=dict(self.current), finishedAt='done', options={}, reports=[], commands=[])
        self.folder = self.api['run_folder'](self.root, self.manifest)
        (self.folder / 'logs').mkdir(parents=True)
        start = time.time_ns() - 1_000_000_000
        for name in ('core-start', 'core-verify'):
            command, cwd = self.api['command_for'](self.root, self.manifest, name)
            log = self.folder / 'logs' / (name + '.log')
            log.write_text('Build completed')
            self.manifest['commands'].append(dict(name=name, command=self.api['safe_args'](command, self.root), cwd=cwd, startedAt='start', finishedAt='done', startedNs=start, finishedNs=time.time_ns() + 1_000_000_000, exitCode=0, timedOut=False, log=log.relative_to(self.folder).as_posix(), logSha256=self.api['digest'](log)))
        passing_reports(self.root)
        coverage = self.root / 'services/banking-api/target/site/jacoco/jacoco.xml'
        coverage.parent.mkdir(parents=True)
        coverage.write_text('<report><counter type="LINE" covered="222" missed="17"/></report>')
        self.api['snapshot'](self.root, self.manifest)

    def validate(self):
        return self.api['validate_manifest'](self.root, self.manifest, self.current)

    def rejects(self, message):
        with self.assertRaisesRegex(self.api['EvidenceError'], message):
            self.validate()

    def report(self, suffix):
        return next(item for item in self.manifest['reports'] if item['sourcePath'].endswith(suffix))

    def test_complete_fresh_evidence_has_independent_counts(self):
        counts = self.validate()
        self.assertEqual((counts['unit'], counts['postgres_integration'], counts['cucumber'], counts['cucumber_steps'], counts['testng']), (31, 18, 31, 154, 6))

    def test_secondary_testng_junit_export_does_not_double_count_tests(self):
        original = self.report('TEST-TestSuite.xml')
        second = copy.deepcopy(original)
        second['sourcePath'] = 'automation/api-testng/target/surefire-reports/junitreports/TEST-secondary.xml'
        self.manifest['reports'].append(second)
        self.assertEqual(self.validate()['testng'], 6)

    def test_old_xml_is_rejected_even_when_the_manifest_says_success(self):
        self.report('HistoryTest.xml')['generatedNs'] = time.time_ns() - 86_400_000_000_000
        self.rejects('stale report')

    def test_source_drift_rejects_passing_reports(self):
        source = self.root / 'application.py'
        source.write_text('version = 1')
        self.manifest['source']['fingerprint'] = self.api['fingerprint_files'](self.root, ['application.py'])
        source.write_text('version = 2')
        self.current['fingerprint'] = self.api['fingerprint_files'](self.root, ['application.py'])
        self.rejects('source changed')

    def test_checkout_change_rejects_passing_reports(self):
        self.current['head'] = 'b' * 40
        self.rejects('stale checkout')

    def test_failed_command_cannot_be_hidden_by_green_xml(self):
        self.manifest['commands'][-1]['exitCode'] = 1
        self.rejects('failed/incomplete command')

    def test_missing_required_suite_rejects_aggregate_green_counts(self):
        self.manifest['reports'].remove(self.report('HistoryTest.xml'))
        self.rejects('missing required suite HistoryTest')

    def test_running_manifest_is_not_previous_success(self):
        self.manifest['status'] = 'running'
        self.rejects('not complete')

    def test_changed_report_is_rejected(self):
        (self.folder / self.report('HistoryTest.xml')['path']).write_text('<testsuite/>')
        self.rejects('tampered report')

    def test_required_name_cannot_be_satisfied_by_true(self):
        self.manifest['commands'][-1]['command'] = ['true']
        self.rejects('does not match')

    def test_missing_command_is_rejected(self):
        self.manifest['commands'].pop()
        self.rejects('missing required command')

    def test_failed_cucumber_hook_is_not_a_passing_scenario(self):
        report = self.report('cucumber/report.json')
        path = self.folder / report['path']
        data = json.loads(path.read_text())
        data[0]['elements'][0]['after'] = [dict(result=dict(status='failed'))]
        path.write_text(json.dumps(data))
        report['sha256'] = self.api['digest'](path)
        self.rejects('nonpassing Cucumber step or hook')

    def test_timeout_rejects_green_reports(self):
        self.manifest['commands'][-1]['timedOut'] = True
        self.rejects('failed/incomplete command')

    def test_pr_head_is_retained_separately_from_executed_merge_head(self):
        self.manifest['ci'] = dict(CREDITFLOW_PR_HEAD_SHA='b' * 40, GITHUB_SHA=self.current['head'])
        self.assertEqual(self.validate()['unit'], 31)
        self.assertNotEqual(self.manifest['source']['head'], self.manifest['ci']['CREDITFLOW_PR_HEAD_SHA'])

    def test_xml_snapshot_removes_properties_and_secrets(self):
        source = self.root / 'private.xml'
        source.write_text('<testsuite><properties><property name="private" value="do-not-publish"/></properties><system-out>Authorization: Bearer sample-sensitive-value</system-out></testsuite>')
        target = self.root / 'public.xml'
        self.api['sanitize_file'](source, target)
        self.assertNotIn('properties', target.read_text())
        self.assertNotIn('sample-sensitive-value', target.read_text())
        self.assertNotIn('do-not-publish', target.read_text())

    def test_redaction_preserves_xml_and_json_structure(self):
        xml = '<testsuite><system-out>token=sample-sensitive-value</system-out></testsuite>'
        result = self.api['redact'](xml)
        import xml.etree.ElementTree as ET
        self.assertEqual(ET.fromstring(result).find('system-out').text, 'token=REDACTED')
        document = self.api['redact']('{"message":"token=sample-sensitive-value","token":"another-sensitive-value"}')
        self.assertEqual(json.loads(document), dict(message='token=REDACTED', token='REDACTED'))

    def test_paths_cannot_escape_workspace(self):
        with self.assertRaises(self.api['EvidenceError']):
            self.api['contained'](self.root, '../outside')

    def test_cli_flags_after_scope_are_parsed(self):
        args, command = self.api['parse_cli'](['execute', 'web', '--container-web'])
        self.assertTrue(args.container_web)
        self.assertEqual(command, [])
        args, command = self.api['parse_cli'](['run', 'core', '--step', 'core-verify', '--run-id', 'example'])
        self.assertEqual((args.step, args.run_id), ('core-verify', 'example'))
        args, command = self.api['parse_cli'](['execute', 'focused', '--', '-pl', 'services/banking-api', 'verify'])
        self.assertEqual(command, ['-pl', 'services/banking-api', 'verify'])
        args, command = self.api['parse_cli'](['execute', 'core', '--format', '--recreate'])
        self.assertTrue(args.format and args.recreate)

    def web_fixture(self, summary=None):
        self.manifest = dict(version=1, scope='web', runId='web-fixture-' + str(time.time_ns()), status='passed', source=dict(self.current), finishedAt='done', options={}, reports=[], commands=[])
        self.folder = self.api['run_folder'](self.root, self.manifest)
        (self.folder / 'logs').mkdir(parents=True)
        (self.folder / 'snapshot').mkdir()
        summary = summary or '\u2139 tests 5\n\u2139 pass 5\n\u2139 fail 0\n\u2139 cancelled 0\n\u2139 skipped 0\n\u2139 todo 0\n'
        start = time.time_ns() - 1_000_000_000
        for name in self.api['SCOPES']['web']['steps']:
            command, cwd = self.api['command_for'](self.root, self.manifest, name)
            log = self.folder / 'logs' / (name + '.log')
            log.write_bytes((summary if name == 'web-test' else 'command completed').encode('utf-8'))
            self.manifest['commands'].append(dict(name=name, command=self.api['safe_args'](command, self.root), cwd=cwd, startedAt='start', finishedAt='done', startedNs=start, finishedNs=time.time_ns() + 1_000_000_000, exitCode=0, timedOut=False, log=log.relative_to(self.folder).as_posix(), logSha256=self.api['digest'](log)))
        (self.folder / 'snapshot/npm-audit.json').write_bytes(b'{"metadata":{"vulnerabilities":{"total":0}}}')
        self.api['snapshot'](self.root, self.manifest)

    def windows_locale(self):
        original = Path.read_text
        def read_text(path, *args, **kwargs):
            # Model the Windows ANSI locale even when this test runs on UTF-8 Linux CI.
            if not args and kwargs.get('encoding') is None:
                kwargs['encoding'] = 'cp1252'
            return original(path, *args, **kwargs)
        return patch.object(Path, 'read_text', read_text)

    def test_utf8_node26_summary_passes_under_windows_default_encoding(self):
        self.web_fixture()
        with self.windows_locale():
            try:
                counts = self.validate()
            except self.api['EvidenceError'] as error:
                self.fail('Valid UTF-8 Node26 five-test summary was rejected: ' + str(error))
            self.assertEqual(counts['frontend'], 5)

    def test_frontend_summary_keeps_all_five_and_zero_assertions(self):
        summary = '\u2139 tests 5\n\u2139 pass 5\n\u2139 fail 0\n\u2139 cancelled 0\n\u2139 skipped 0\n\u2139 todo 0\n'
        for original, invalid in [('tests 5', 'tests 6'), ('pass 5', 'pass 4'), ('fail 0', 'fail 1'), ('cancelled 0', 'cancelled 1'), ('skipped 0', 'skipped 1'), ('todo 0', 'todo 1')]:
            with self.subTest(summary=invalid):
                self.web_fixture(summary.replace(original, invalid))
                with self.windows_locale():
                    self.rejects('incomplete frontend tests')

    def test_utf8_child_tail_can_be_published_to_cp1252_stdout(self):
        captured = io.BytesIO()
        console = io.TextIOWrapper(captured, encoding='cp1252', errors='strict')
        with contextlib.redirect_stdout(console):
            try:
                code = self.api['execute_command'](self.root, self.manifest, 'unicode-child', [sys.executable, '-c', "import sys; sys.stdout.buffer.write(bytes.fromhex('e284b920746573747320350a'))"])
            except UnicodeEncodeError as error:
                self.fail('UTF-8 command tail could not be published to the Windows console: ' + str(error))
        console.flush()
        self.assertEqual(code, 0)
        self.assertIn(b'\\u2139 tests 5', captured.getvalue())
        self.assertIn(bytes.fromhex('e284b92074657374732035'), (self.folder / 'logs/unicode-child.log').read_bytes())
        console.detach()

    def quality_fixture(self):
        self.manifest = dict(version=1, scope='quality', runId='quality-fixture', status='passed', source=dict(self.current), finishedAt='done', options={}, reports=[], commands=[])
        self.folder = self.api['run_folder'](self.root, self.manifest)
        (self.folder / 'logs').mkdir(parents=True)
        (self.folder / 'snapshot').mkdir()
        start = time.time_ns() - 1_000_000_000
        for name in self.api['SCOPES']['quality']['steps']:
            command, cwd = self.api['command_for'](self.root, self.manifest, name)
            log = self.folder / 'logs' / (name + '.log')
            log.write_text('Jenkinsfile Groovy syntax parsed; Jenkins server execution remains unverified.')
            self.manifest['commands'].append(dict(name=name, command=self.api['safe_args'](command, self.root), cwd=cwd, startedAt='start', finishedAt='done', startedNs=start, finishedNs=time.time_ns() + 1_000_000_000, exitCode=0, timedOut=False, log=log.relative_to(self.folder).as_posix(), logSha256=self.api['digest'](log)))
        (self.root / 'infrastructure').mkdir(exist_ok=True)
        (self.root / 'infrastructure/runtime-role.sql').write_bytes(b'-- role\r\n')
        (self.root / 'infrastructure/validate-runtime-role.sql').write_bytes(b'-- probe\r\n')
        bom = self.root / 'target/bom.json'
        bom.parent.mkdir(exist_ok=True)
        bom.write_bytes((json.dumps(dict(components=[dict(purl='pkg:maven/example/component' + str(i)) for i in range(207)] + [dict(purl='pkg:maven/org.seleniumhq.selenium/selenium-java'), dict(purl='pkg:maven/com.microsoft.playwright/playwright')])) + '\n').encode())
        (self.root / '.work').mkdir(exist_ok=True)
        (self.root / '.work/dependency-audit.json').write_text(json.dumps(dict(queriedAt=self.api['utc'](), bomSha256=self.api['digest'](bom), components=209, findings=[])))
        (self.root / '.work/runtime-role-validation.json').write_text(json.dumps(dict(passed=True, transactionRolledBack=True, sourceSha256=hashlib.sha256(b'-- role\r\n-- probe\r\n').hexdigest())))
        (self.root / '.work/runtime-role-validation.log').write_text('BEGIN\nROLLBACK\n')
        (self.folder / 'snapshot/gitleaks.json').write_text('[]')
        self.api['snapshot'](self.root, self.manifest)

    def test_osv_binds_original_bom_bytes_even_when_snapshot_newlines_differ(self):
        self.quality_fixture()
        report = self.report('target/bom.json')
        path = self.folder / report['path']
        path.write_bytes(path.read_bytes() + b'\r\n')
        report['sha256'] = self.api['digest'](path)
        self.assertNotEqual(report['sourceSha256'], report['sha256'])
        self.assertEqual(self.validate()['affected_components'], 0)

    def test_osv_result_for_another_bom_is_rejected(self):
        self.quality_fixture()
        report = self.report('.work/dependency-audit.json')
        path = self.folder / report['path']
        data = json.loads(path.read_text())
        data['bomSha256'] = 'old-bom'
        path.write_text(json.dumps(data))
        report['sha256'] = self.api['digest'](path)
        self.rejects('stale/incomplete/affected OSV')

    def test_old_osv_query_is_rejected_even_with_fresh_file_timestamp(self):
        self.quality_fixture()
        report = self.report('.work/dependency-audit.json')
        path = self.folder / report['path']
        data = json.loads(path.read_text())
        data['queriedAt'] = '2020-01-01T00:00:00+00:00'
        path.write_text(json.dumps(data))
        report['sha256'] = self.api['digest'](path)
        self.rejects('stale OSV query')

    def test_role_probe_requires_rollback_and_exact_sql_bytes(self):
        self.quality_fixture()
        self.assertEqual(self.validate()['jenkins_runtime'], 'NOT RUN')
        (self.root / 'infrastructure/runtime-role.sql').write_bytes(b'changed\r\n')
        self.rejects('stale SQL')

    def test_repository_lock_blocks_another_scope(self):
        active = self.root / '.work/evidence/active.json'
        active.parent.mkdir(parents=True, exist_ok=True)
        active.write_text('{"scope":"core","runId":"already-running"}')
        with self.assertRaisesRegex(self.api['EvidenceError'], 'Another evidence scope'):
            self.api['begin'](self.root, 'public')

    def test_new_running_pointer_cannot_fall_back_to_old_success(self):
        self.api['save'](self.root, self.manifest)
        new = copy.deepcopy(self.manifest)
        new.update(runId='interrupted-run', status='running', finishedAt=None)
        self.api['save'](self.root, new)
        self.assertEqual(self.api['latest'](self.root, 'core')[1]['status'], 'running')

    def test_actual_child_timeout_retains_failure_outcome(self):
        code = self.api['execute_command'](self.root, self.manifest, 'temporary-child', [sys.executable, '-c', 'import time; time.sleep(1)'], timeout=0.01)
        self.assertEqual(code, 124)
        self.assertTrue(self.manifest['commands'][-1]['timedOut'])
        self.assertFalse(self.manifest['commands'][-1]['unresolvedProducer'])

    def test_premature_end_retains_global_lock_while_command_runs(self):
        self.manifest['status'] = 'running'
        self.manifest['commands'][-1]['finishedAt'] = None
        self.api['save'](self.root, self.manifest)
        active = self.root / '.work/evidence/active.json'
        active.write_text(json.dumps(dict(scope='core', runId=self.manifest['runId'])))
        with self.assertRaisesRegex(self.api['EvidenceError'], 'still running'):
            self.api['end'](self.root, 'core')
        self.assertTrue(active.exists())

    def test_command_mutex_prevents_second_producer(self):
        (self.folder / 'command.lock').write_text('already-running')
        with self.assertRaisesRegex(self.api['EvidenceError'], 'already active'):
            self.api['execute_command'](self.root, self.manifest, 'second', [sys.executable, '-c', 'raise RuntimeError("must not run")'])

    def test_role_probe_requires_transaction_rollback(self):
        self.quality_fixture()
        report = self.report('.work/runtime-role-validation.json')
        path = self.folder / report['path']
        data = json.loads(path.read_text())
        data['transactionRolledBack'] = False
        path.write_text(json.dumps(data))
        report['sha256'] = self.api['digest'](path)
        self.rejects('runtime role validation')


if __name__ == "__main__":
    unittest.main()
