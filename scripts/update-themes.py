#!/usr/bin/env python3
"""Refresh the public derived Themes catalog. Never exports bars or credentials.

Default: fresh SIP daily bars via the local Magic Scan engine, after 16:15 ET.
For reproducible rebuilds: --bars-cache PATH --as-of YYYY-MM-DD.
Publishing is a separate, explicit git commit/push step.
"""
import argparse
import csv
import gzip
import importlib.util
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MAG7 = ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA']


def derive(entry, session):
    series = [b for b in entry['b'] if b[0] <= session]
    if not series or series[-1][0] != session:
        return None
    close = series[-1][3]
    prior_year = int(session[:4]) - 1
    # Last available exchange session of the prior year, allowing Dec 31 holidays.
    anchors = [b for b in series if b[0][:4] == str(prior_year) and b[0] >= f'{prior_year}-12-24']
    anchor = anchors[-1][3] if anchors else None
    high = max(b[1] for b in series[-252:]) if len(series) >= 252 else None
    return {
        'ytd': round((close / anchor - 1) * 100, 2) if anchor and close else None,
        'dist52h': round(max(0, (1 - close / high) * 100), 2) if high and close else None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scanner-dir', type=Path, default=Path(os.environ.get('MAGIC_SCAN_DIR', str(Path.home() / 'Projects/magic-scan'))))
    parser.add_argument('--bars-cache', type=Path)
    parser.add_argument('--as-of', help='Required with --bars-cache; expected completed session')
    args = parser.parse_args()
    if args.bars_cache and not args.as_of:
        parser.error('--bars-cache requires --as-of')
    if args.as_of:
        date.fromisoformat(args.as_of)
    now = datetime.now(ZoneInfo('America/New_York'))
    if not args.bars_cache and (now.hour, now.minute) < (16, 15):
        sys.exit('Run after 16:15 ET so the current session is complete.')
    spec = importlib.util.spec_from_file_location('themes_scan_engine', args.scanner_dir / 'scan.py')
    scan = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scan)
    roster = json.loads((ROOT / 'data/theme-roster.json').read_text())
    themes = [t for t in roster['themes'] if t['id'] != 'mag-7'] + [{'id': 'mag-7', 'name': 'Mag 7', 'tickers': MAG7}]
    descriptions = json.loads((ROOT / 'data/company-descriptions.json').read_text())
    if args.bars_cache:
        payload = json.load(gzip.open(args.bars_cache, 'rt'))
        bars = payload['bars']
        universe = {s: descriptions.get(s, {}).get('name', s) for s in payload['universe']}
        session = args.as_of
    else:
        headers = scan.load_credentials()
        universe = scan.fetch_universe(headers, False, False, False, True)
        days = max(420, (now.date() - date(now.year - 1, 12, 20)).days)
        bars = scan.fetch_bars(sorted(set(universe) | set(MAG7)), days, 'sip', 'all', headers, None, 16, False)
        # SPY is requested separately only if absent; its bar date identifies the session.
        if 'SPY' not in bars:
            bars.update(scan.fetch_bars(['SPY'], days, 'sip', 'all', headers, None, 1, False))
        session = bars.get('SPY', {}).get('d')
        if not session or session != now.date().isoformat():
            sys.exit(f'No completed current-day session ({session or "unavailable"}); catalog left unchanged.')
    previous = json.loads((ROOT / 'data/daily-scan.json').read_text())
    if session < previous['asOf']:
        sys.exit('Refusing to replace the catalog with an older session.')
    companies = {}
    for symbol, entry in bars.items():
        if symbol not in universe and symbol not in MAG7:
            continue
        derived = derive(entry, session)
        if derived is None:
            continue
        r = scan.compute_row(symbol, universe.get(symbol, symbol), {'b': [b for b in entry['b'] if b[0] <= session], 'd': session}, 20, 30)
        if not r or (symbol not in MAG7 and (r['adr'] < 2.5 or r['dv'] < 20e6 or r['last'] < 1)):
            continue
        desc = descriptions.get(symbol, {})
        companies[symbol] = {
            'ticker': symbol, 'name': desc.get('name') or universe.get(symbol) or symbol,
            'does': desc.get('does', ''), 'adr': round(r['adr'], 3), 'dv': round(r['dv']),
            'ext': r.get('ext'), 'dist52h': derived['dist52h'],
            'ret': {'d': r['chg'], 'w': r.get('ret1w'), 'm': r.get('ret1m'), 'q': r.get('ret3m'), 'y': derived['ytd']},
        }
    assigned = {s for t in themes for s in t['tickers'] if s in companies}
    # Refuse a partial/failed response rather than publishing an empty or truncated site.
    if len(assigned) < max(100, int(len(previous['companies']) * 0.75)) or not set(MAG7) <= assigned:
        sys.exit(f'Incomplete coverage: {len(assigned)} names. Catalog left unchanged.')
    missing = sorted(s for s in assigned if not companies[s]['does'])
    unassigned = sorted(set(companies) - assigned)
    catalog = {
        'source': 'daily-scan', 'asOf': session, 'rosterAsOf': roster.get('asOf'),
        'browse': {'minAdr': 3, 'minDv': 100000000}, 'rank': {'minAdr': 3, 'minDv': 100000000},
        'themes': [{**t, 'tickers': [s for s in t['tickers'] if s in assigned]} for t in themes],
        'companies': {s: companies[s] for s in sorted(assigned)}, 'unassigned': unassigned,
    }
    target = ROOT / 'data/daily-scan.json'
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(catalog, indent=2, allow_nan=False) + '\n')
    temporary.replace(target)
    report = {'asOf': session, 'names': len(assigned), 'themes': len(themes), 'doesCoverage': len(assigned)-len(missing), 'missingDoes': missing, 'unassigned': unassigned}
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
