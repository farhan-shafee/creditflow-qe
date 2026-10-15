"""Reject stale, failed, incomplete or modified verification evidence."""
import argparse
import json
from pathlib import Path
import runpy
import sys

api = runpy.run_path(str(Path(__file__).with_name('evidence-run.py')))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scope', action='append', choices=api['REQUIRED'])
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args()
    scopes = api['REQUIRED'] if args.all else args.scope or ['core']
    print(json.dumps(api['validate_latest'](Path(__file__).resolve().parent.parent, scopes)))


if __name__ == '__main__':
    try:
        main()
    except (api['EvidenceError'], ValueError, OSError) as error:
        print('Evidence rejected: ' + api['redact'](error), file=sys.stderr)
        raise SystemExit(1)
