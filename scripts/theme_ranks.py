"""Theme rank history for the Relative Strength companion.

Ranks match live Themes means: names with ADR ≥ 3% and $100M ADV, finite
return in that window. Mag 7 uses the same liquid cut as the published page.
Themes with no ranking population are omitted (not ranked last).
"""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

WINDOWS = ('d', 'w', 'm', 'q', 'h', 'y')
RANK_MIN_ADR = 3.0
RANK_MIN_DV = 100_000_000
SCHEMA_VERSION = 1
SKIP_THEME_IDS = frozenset({'unclustered'})


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def theme_mean(theme, companies, window):
    liquid = []
    for ticker in theme.get('tickers') or []:
        company = companies.get(ticker)
        if not company:
            continue
        symbol = str(company.get('ticker') or ticker).upper()
        if symbol.endswith('.A'):
            continue
        if not _finite(company.get('adr')) or company['adr'] < RANK_MIN_ADR:
            continue
        if not _finite(company.get('dv')) or company['dv'] < RANK_MIN_DV:
            continue
        ret = (company.get('ret') or {}).get(window)
        if not _finite(ret):
            continue
        liquid.append(float(ret))
    if not liquid:
        return None, 0
    return sum(liquid) / len(liquid), len(liquid)


def rank_window(catalog, window):
    companies = catalog.get('companies') or {}
    scored = []
    means = {}
    ranked = {}
    for theme in catalog.get('themes') or []:
        theme_id = theme.get('id')
        if not theme_id or theme_id in SKIP_THEME_IDS:
            continue
        mean, count = theme_mean(theme, companies, window)
        if mean is None:
            continue
        means[theme_id] = mean
        ranked[theme_id] = count
        scored.append((mean, theme.get('name') or '', theme_id))
    scored.sort(key=lambda item: (-item[0], item[1], item[2]))
    ranks = {theme_id: index + 1 for index, (_, _, theme_id) in enumerate(scored)}
    return ranks, means, ranked


def rank_vs_benchmark(means, benchmark_return):
    """Order themes by excess return vs an index. Higher excess is rank 1."""
    if not _finite(benchmark_return) or not means:
        return {}
    scored = [(value - benchmark_return, theme_id) for theme_id, value in means.items() if _finite(value)]
    scored.sort(key=lambda item: (-item[0], item[1]))
    return {theme_id: index + 1 for index, (_, theme_id) in enumerate(scored)}


def session_record(catalog, benchmarks=None):
    as_of = catalog.get('asOf')
    if not isinstance(as_of, str):
        raise ValueError('catalog asOf is required')
    record = {'asOf': as_of, 'ranks': {}, 'means': {}, 'ranked': {}}
    for window in WINDOWS:
        ranks, means, ranked = rank_window(catalog, window)
        if not ranks:
            continue
        record['ranks'][window] = ranks
        record['means'][window] = {key: round(value, 6) for key, value in means.items()}
        record['ranked'][window] = ranked
    clean = {}
    for symbol, windows in (benchmarks or {}).items():
        if not isinstance(windows, dict):
            continue
        vals = {key: value for key, value in windows.items() if key in WINDOWS and _finite(value)}
        if vals:
            clean[str(symbol).upper()] = vals
    if clean:
        record['benchmarks'] = clean
    return record


def empty_history():
    return {
        'schemaVersion': SCHEMA_VERSION,
        'windows': list(WINDOWS),
        'rankMinAdr': RANK_MIN_ADR,
        'rankMinDv': RANK_MIN_DV,
        'sessions': [],
    }


def upsert_session(history, record):
    history = dict(history or empty_history())
    sessions = [item for item in history.get('sessions') or [] if item.get('asOf') != record['asOf']]
    sessions.append(record)
    sessions.sort(key=lambda item: item.get('asOf') or '')
    history['schemaVersion'] = SCHEMA_VERSION
    history['windows'] = list(WINDOWS)
    history['rankMinAdr'] = RANK_MIN_ADR
    history['rankMinDv'] = RANK_MIN_DV
    history['sessions'] = sessions
    return history


def load_history(path):
    path = Path(path)
    if not path.exists():
        return empty_history()
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or not isinstance(data.get('sessions'), list):
        return empty_history()
    return data


def save_history(path, history):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(history, indent=2, allow_nan=False) + '\n'
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    temporary.replace(path)
    return path


def append_catalog(path, catalog, benchmarks=None):
    history = upsert_session(load_history(path), session_record(catalog, benchmarks))
    save_history(path, history)
    return history


def catalogs_from_git(repo, relpath='data/daily-scan.json'):
    log = subprocess.run(
        ['git', '-C', str(repo), 'log', '--format=%H', '--', relpath],
        capture_output=True, text=True, check=True,
    )
    seen = set()
    catalogs = []
    for sha in log.stdout.split():
        shown = subprocess.run(
            ['git', '-C', str(repo), 'show', f'{sha}:{relpath}'],
            capture_output=True, text=True,
        )
        if shown.returncode != 0 or not shown.stdout.strip():
            continue
        try:
            catalog = json.loads(shown.stdout)
        except json.JSONDecodeError:
            continue
        as_of = catalog.get('asOf')
        if not as_of or as_of in seen:
            continue
        if not isinstance(catalog.get('themes'), list) or not isinstance(catalog.get('companies'), dict):
            continue
        seen.add(as_of)
        catalogs.append(catalog)
    catalogs.sort(key=lambda item: item.get('asOf') or '')
    return catalogs


def backfill_from_git(repo, dest):
    history = empty_history()
    for catalog in catalogs_from_git(repo):
        history = upsert_session(history, session_record(catalog))
    save_history(dest, history)
    return history


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backfill', action='store_true', help='Rebuild data/theme-ranks.json from git catalogs')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    dest = root / 'data' / 'theme-ranks.json'
    if args.backfill:
        history = backfill_from_git(root, dest)
        print(json.dumps({'sessions': len(history['sessions']), 'asOf': [s['asOf'] for s in history['sessions']]}, indent=2))
    else:
        parser.error('pass --backfill')
