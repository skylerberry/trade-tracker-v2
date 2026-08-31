#!/usr/bin/env python3
"""Assign daily-scan.csv names to theme parents and write a Discord-shaped md."""
import csv, re, sys
from collections import defaultdict, OrderedDict
from pathlib import Path

SCAN = Path('/Users/skylerberry/Projects/magic-scan/out/daily-scan.csv')
PREV = Path('/Users/skylerberry/Projects/magic-scan/out/daily-scan-2026-08-28-3.md')
IDENT = Path('/Users/skylerberry/Projects/RS Tape/rs/data/identity.csv')
OUT = Path('/Users/skylerberry/Projects/magic-scan/out/daily-scan-2026-08-31.md')

TICKER_PARENT = {
    'NFLX': 'Media & Entertainment', 'FOXA': 'Media & Entertainment',
    'MRK': 'Healthcare & Biotech', 'GILD': 'Healthcare & Biotech', 'BIIB': 'Healthcare & Biotech',
    'DHR': 'Healthcare & Biotech', 'A': 'Healthcare & Biotech', 'WAT': 'Healthcare & Biotech',
    'IQV': 'Healthcare & Biotech', 'ARGX': 'Healthcare & Biotech', 'INCY': 'Healthcare & Biotech',
    'ZBH': 'Healthcare & Biotech', 'QGEN': 'Healthcare & Biotech', 'MEDP': 'Healthcare & Biotech',
    'SOLV': 'Healthcare & Biotech', 'CAH': 'Healthcare & Biotech', 'COR': 'Healthcare & Biotech',
    'NEM': 'Precious Metal Miners', 'FNV': 'Precious Metal Miners', 'TECK': 'Commodity Mining',
    'TGT': 'Retail', 'DG': 'Retail', 'KHC': 'Retail', 'KDP': 'Retail', 'GIS': 'Retail',
    'SJM': 'Retail', 'CPB': 'Retail', 'USFD': 'Retail', 'SW': 'Retail',
    'BX': 'Financials', 'AJG': 'Financials', 'LPLA': 'Financials', 'BR': 'Financials',
    'CPAY': 'Financials', 'CRBG': 'Financials', 'EQH': 'Financials', 'AMG': 'Financials',
    'CBRE': 'Financials', 'JLL': 'Financials', 'SBAC': 'Financials',
    'TEL': 'Electronic Components', 'APH': 'Electronic Components', 'QRVO': 'Semiconductors',
    'WMB': 'Oil & Gas', 'EQT': 'Oil & Gas', 'TRGP': 'Oil & Gas', 'OKE': 'Oil & Gas',
    'EMR': 'Industrial Equipment', 'FLS': 'Industrial Equipment', 'LECO': 'Industrial Equipment',
    'SWK': 'Industrial Equipment', 'CTVA': 'Agribusiness',
    'INFY': 'Software & Related', 'VRSN': 'Software & Related', 'BOX': 'Software & Related',
    'MTCH': 'Software & Related', 'TTEK': 'Engineering & Construction',
    'JHX': 'Building Products', 'AVY': 'Chemicals', 'NEU': 'Chemicals',
    'MHK': 'Building Products', 'TSLA': 'EV', 'CAT': 'Industrial Equipment', 'DE': 'Industrial Equipment',
}

RULES = [
    (r'semiconductor|gpu|foundry|fpga|memory ip|nand|mram|asic', 'Semiconductors'),
    (r'cybersecurity|zero trust|endpoint|vulnerability|siem', 'Cybersecurity'),
    (r'neocloud|gpu cloud|coreweave|rented ai compute', 'Neoclouds'),
    (r'data center|hpc data|powered.shell|bitcoin mine', 'AI Data Centers'),
    (r'optical|photonics|ai storage|flash array|hdd|server hardware|ai server', 'AI Storage & Infra'),
    (r'cdn|edge cloud|akamai|cloudflare', 'Edge Computing & CDN'),
    (r'quantum', 'Quantum Computing'),
    (r'space|launch|satcom|satellite|lunar', 'Space & Satellite'),
    (r'drone|evtol|urban air|public safety tech', 'Drones & Related'),
    (r'aerospace|defense|missile|shipbuild|honeywell aero', 'Aerospace & Defense'),
    (r'nuclear|uranium|smr|enrichment', 'Nuclear'),
    (r'solar|inverter|tracker', 'Solar'),
    (r'fuel cell|turbine|generator|power equipment|hvac|thermal management|data center cooling', 'Power Equipment'),
    (r'utility|electricity|pg&e|edison|vistra|nrg', 'Utilities'),
    (r'copper', 'Copper'),
    (r'gold|silver|precious', 'Precious Metal Miners'),
    (r'lithium|rare earth|tungsten|aluminum|steel|coal|mining', 'Commodity Mining'),
    (r'oil|gas e&p|refin|oilfield|lng|permian|drilling', 'Oil & Gas'),
    (r'biotech|pharma|therapeut|oncology|gene |mrna|cro |diagnostic|genomic|healthcare|hospital|managed care|medical device|cgm', 'Healthcare & Biotech'),
    (r'software|saas|crm|devops|observability|workflow|design saas|adtech|social media|streaming music|it service|consulting', 'Software & Related'),
    (r'fintech|broker|bank|payment|bnpl|lending|crypto|stablecoin|bitcoin treasury|asset management|private equity', 'Financials'),
    (r'retail|restaurant|apparel|footwear|beauty|ecommerce|grocery|sporting|theater|casino|betting', 'Retail'),
    (r'airline', 'Airlines'),
    (r'travel|cruise|booking', 'Travel'),
    (r'rideshare|delivery|instacart|doordash', 'Rides & Delivery'),
    (r'ev\b|electric vehicle|tesla|rivian', 'EV'),
    (r'auto part|drivetrain|wiring', 'Auto Parts'),
    (r'automaker|auto ', 'Autos'),
    (r'ems|electronics manufacturing|pcb|jabil|flex|sanmina', 'Electronics Manufacturing'),
    (r'connector|passive|circuit protection|electronic component', 'Electronic Components'),
    (r'distribut', 'Electronics Distribution'),
    (r'freight|trucking|logistics|fedex|robinson', 'Freight & Logistics'),
    (r'building product|lumber|insulation|owens|builders first', 'Building Products'),
    (r'engineering|construction|infrastructure/construction|fluor|aecom|sterling', 'Engineering & Construction'),
    (r'telecom|cable|fiber', 'Telecom'),
    (r'media|entertainment|roblox|take-two|gaming', 'Gaming' if False else 'Media & Entertainment'),
    (r'pc|printer|hp inc', 'PCs & Printers'),
    (r'farm|tractor|agco|deere|fertilizer|agri|bunge|adm', 'Agribusiness'),
    (r'industrial equipment|construction equipment|specialty vehicle|oshkosh', 'Industrial Equipment'),
    (r'scanner|gps|fleet|cognex|zebra|trimble', 'Industrial Tech'),
    (r'chemical|plastics|dow ', 'Chemicals'),
    (r'robot|autonomous', 'Robotics'),
    (r'bitcoin miner|marathon digital', 'Bitcoin Miners'),
]

# fix gaming vs media - handle explicitly below
PARENTS_ORDER = []  # filled after counts


def load_prev(path):
    assign = {}
    if not path.exists():
        return assign
    text = path.read_text()
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r'\*\*(.+?) \(\d+/\d+, \d+%\):\*\*(?:\s*`([^`]*)`)?', line)
        if not m:
            continue
        name = m.group(1)
        for tk in re.findall(r'[A-Z][A-Z0-9.]{0,7}', m.group(2) or ''):
            assign[tk] = name
        nxt = lines[i + 1] if i + 1 < len(lines) else ''
        bm = re.match(r'below:\s*`([^`]*)`', nxt)
        if bm:
            for tk in re.findall(r'[A-Z][A-Z0-9.]{0,7}', bm.group(1)):
                assign[tk] = name
    return assign


def map_text(text):
    t = (text or '').lower()
    if re.search(r'\bgaming\b|roblox|take-two|activision|unity software', t):
        return 'Gaming'
    if re.search(r'media|entertainment|streaming show|movie', t) and 'social' not in t:
        return 'Media & Entertainment'
    for pat, parent in RULES:
        if pat.startswith('media'):
            continue
        if re.search(pat, t):
            return parent
    return None


def main():
    ident = {r['Symbol'].upper(): r for r in csv.DictReader(IDENT.open())} if IDENT.exists() else {}
    prev = load_prev(PREV)
    rows = list(csv.DictReader(SCAN.open()))
    groups = defaultdict(lambda: {'above': [], 'below': []})
    unassigned = []
    for r in rows:
        tk = r['symbol'].upper()
        ext = r.get('ext_pct_from_ma')
        try:
            side = 'above' if float(ext) >= 0 else 'below'
        except (TypeError, ValueError):
            unassigned.append(tk)
            continue
        parent = prev.get(tk) or TICKER_PARENT.get(tk)
        if not parent:
            rec = ident.get(tk, {})
            blob = ' '.join([rec.get('Sector') or '', rec.get('CompanyName') or '', r.get('name') or '', tk])
            parent = map_text(blob)
        if not parent:
            nm = (r.get('name') or '').lower()
            if re.search(r'therapeutic|pharma|bio|medica|health|laborator', nm):
                parent = 'Healthcare & Biotech'
            elif re.search(r'bank|capital|financial|insurance|asset manag', nm):
                parent = 'Financials'
            elif re.search(r'foods|beverage|restaurant|stores|retail', nm):
                parent = 'Retail'
            elif re.search(r'semiconductor|microchip|materials, inc', nm):
                parent = 'Semiconductors'
            elif re.search(r'software|systems, inc|cloud', nm):
                parent = 'Software & Related'
            elif re.search(r'mining|gold|silver|copper', nm):
                parent = 'Commodity Mining'
            elif re.search(r'energy|petroleum|pipeline', nm):
                parent = 'Oil & Gas'
        if not parent:
            parent = 'Unclustered'
        groups[parent][side].append(tk)

    # drop empty Unclustered into chat via print
    items = []
    for name, sides in groups.items():
        above, below = sides['above'], sides['below']
        total = len(above) + len(below)
        if not total:
            continue
        items.append((len(above), total, name, above, below))
    items.sort(key=lambda x: (-x[0], -x[1], x[2]))

    last = rows[0].get('last_bar_date', '')
    lines = [
        '# Daily Scan - Liquid, Fast Trending Stocks',
        '',
        'A simple starting-point scan that surfaces candidates worth a closer look. It filters for liquidity, volatility (speed), and trend.',
        '- Liquidity: $20M+ average daily dollar volume (30-day)',
        '- Volatility: 2.5%+ Average Daily Range (ADR, 20-day)',
        '- Trend: Price above the 50-day simple moving average. Count is names above the 50 / names that cleared liquidity and speed. `below:` are the rest.',
        '',
        '## Theme Groups',
        '',
    ]
    unclustered = 0
    for above_n, total, name, above, below in items:
        pct = round(100 * above_n / total) if total else 0
        if name == 'Unclustered':
            unclustered = total
        if above:
            lines.append(f'**{name} ({above_n}/{total}, {pct}%):** `{", ".join(above)}`')
        else:
            lines.append(f'**{name} ({above_n}/{total}, {pct}%):**')
        if below:
            lines.append(f'below: `{", ".join(below)}`')
        lines.append('')
    OUT.write_text('\n'.join(lines).rstrip() + '\n')
    print(f'wrote {OUT} · {len(items)} themes · {len(rows)} names · unclustered {unclustered} · asOf {last}')


if __name__ == '__main__':
    main()
