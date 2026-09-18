import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('theme_ranks', ROOT / 'scripts' / 'theme_ranks.py')
ranks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ranks)
FIXTURE = json.loads((ROOT / 'tests/fixtures/theme-ranks-catalog.json').read_text())


class ThemeRankTests(unittest.TestCase):
    def test_liquid_mean_matches_themes_cut(self):
        semis = next(theme for theme in FIXTURE['themes'] if theme['id'] == 'semiconductors')
        mean, count = ranks.theme_mean(semis, FIXTURE['companies'], 'd')
        self.assertEqual(count, 2)
        self.assertEqual(mean, 1.5)

    def test_below_adr_is_not_in_the_mean(self):
        mag7 = next(theme for theme in FIXTURE['themes'] if theme['id'] == 'mag-7')
        mean, count = ranks.theme_mean(mag7, FIXTURE['companies'], 'd')
        self.assertEqual(count, 1)
        self.assertEqual(mean, 2.0)

    def test_missing_window_is_omitted_not_zero(self):
        oil = next(theme for theme in FIXTURE['themes'] if theme['id'] == 'oil-gas')
        mean, count = ranks.theme_mean(oil, FIXTURE['companies'], 'y')
        self.assertIsNone(mean)
        self.assertEqual(count, 0)

    def test_daily_rank_order(self):
        order, _, _ = ranks.rank_window(FIXTURE, 'd')
        self.assertEqual(order['oil-gas'], 1)
        self.assertEqual(order['mag-7'], 2)
        self.assertEqual(order['semiconductors'], 3)
        self.assertNotIn('unclustered', order)

    def test_excess_vs_spy_reorders(self):
        means = {'oil-gas': 3.0, 'semiconductors': 1.5, 'mag-7': 2.0}
        order = ranks.rank_vs_benchmark(means, 2.5)
        self.assertEqual(order['oil-gas'], 1)
        self.assertEqual(order['mag-7'], 2)
        self.assertEqual(order['semiconductors'], 3)
        self.assertEqual(ranks.rank_vs_benchmark(means, None), {})

    def test_session_stores_benchmarks(self):
        record = ranks.session_record(FIXTURE, {'SPY': {'d': 0.4, 'm': 1.2}, 'QQQ': {'d': 0.8}})
        self.assertEqual(record['benchmarks']['SPY']['d'], 0.4)
        self.assertEqual(record['benchmarks']['QQQ']['d'], 0.8)

    def test_one_month_rank_order(self):
        order, _, _ = ranks.rank_window(FIXTURE, 'm')
        self.assertEqual(order['mag-7'], 1)
        self.assertEqual(order['semiconductors'], 2)
        self.assertEqual(order['oil-gas'], 3)

    def test_upsert_replaces_same_session_and_keeps_history(self):
        first = ranks.session_record(FIXTURE)
        history = ranks.upsert_session(ranks.empty_history(), first)
        older = json.loads(json.dumps(FIXTURE))
        older['asOf'] = '2026-09-15'
        history = ranks.upsert_session(history, ranks.session_record(older))
        again = json.loads(json.dumps(FIXTURE))
        again['companies']['XOM']['ret']['d'] = -4
        history = ranks.upsert_session(history, ranks.session_record(again))
        dates = [session['asOf'] for session in history['sessions']]
        self.assertEqual(dates, ['2026-09-15', '2026-09-16'])
        self.assertEqual(history['sessions'][-1]['ranks']['d']['oil-gas'], 3)

    def test_append_is_atomic_and_durable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'theme-ranks.json'
            ranks.append_catalog(path, FIXTURE)
            ranks.append_catalog(path, {**FIXTURE, 'asOf': '2026-09-17'})
            loaded = json.loads(path.read_text())
            self.assertEqual([session['asOf'] for session in loaded['sessions']], ['2026-09-16', '2026-09-17'])
            self.assertFalse(list(path.parent.glob('*.tmp')))


if __name__ == '__main__':
    unittest.main()
