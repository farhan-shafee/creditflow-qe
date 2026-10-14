"""Fail a nominally green build if required suites did not actually execute."""
import json
import pathlib
import xml.etree.ElementTree as ET

root = pathlib.Path(__file__).resolve().parent.parent

def junit_count(folder):
    count = 0
    for path in folder.glob('TEST-*.xml'):
        suite = ET.parse(path).getroot()
        for attr in ('failures', 'errors', 'skipped'):
            assert int(suite.get(attr, '0')) == 0, f'{path}: {attr}'
        count += int(suite.get('tests', '0'))
    return count

counts = {
    'unit': junit_count(root / 'services/banking-api/target/surefire-reports'),
    'postgres_integration': junit_count(root / 'services/banking-api/target/failsafe-reports'),
    'testng': junit_count(root / 'automation/api-testng/target/surefire-reports'),
}
features = json.loads((root / 'automation/api-bdd/target/cucumber/report.json').read_text())
scenarios = [s for f in features for s in f['elements'] if s.get('type') == 'scenario']
for scenario in scenarios:
    assert scenario['steps'], 'Empty scenario'
    for step in scenario['steps']:
        assert step['result']['status'] == 'passed', scenario['name']
counts['cucumber'] = len(scenarios)
for name, minimum in {'unit': 31, 'postgres_integration': 14, 'cucumber': 28, 'testng': 6}.items():
    assert counts[name] >= minimum, f'{name}: executed {counts[name]}, expected at least {minimum}'
output = root / '.work/evidence-summary.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(counts, indent=2) + '\n')
print(json.dumps(counts))
