"""Query OSV's official API using the resolved CycloneDX inventory. No API key."""
import datetime
import hashlib
import json
import pathlib
import urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
bom = json.loads((root / 'target/bom.json').read_text())
purls = sorted({c['purl'] for c in bom.get('components', []) if c.get('purl')})
assert purls, 'No resolved dependencies; cannot claim an advisory scan'
findings = []
for offset in range(0, len(purls), 100):
    batch = purls[offset:offset + 100]
    payload = json.dumps({'queries': [{'package': {'purl': p}} for p in batch]}).encode()
    request = urllib.request.Request('https://api.osv.dev/v1/querybatch', data=payload, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        results = json.load(response)['results']
    assert len(results) == len(batch), 'Incomplete advisory response'
    for package, result in zip(batch, results):
        if result.get('vulns'):
            findings.append({'package': package, 'advisories': [v['id'] for v in result['vulns']]})
output = {'queriedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'bomSha256': hashlib.sha256((root / 'target/bom.json').read_bytes()).hexdigest(), 'components': len(purls), 'findings': findings}
(root / '.work').mkdir(exist_ok=True)
(root / '.work/dependency-audit.json').write_text(json.dumps(output, indent=2) + '\n')
print(f'OSV: {len(purls)} resolved components; {len(findings)} affected components')
for finding in findings:
    print(finding['package'] + ': ' + ', '.join(finding['advisories']))
raise SystemExit(1 if findings else 0)
