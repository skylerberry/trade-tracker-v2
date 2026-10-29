import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('update',Path(__file__).resolve().parents[1]/'scripts/update-themes.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class DerivationTests(unittest.TestCase):
 def test_ytd_uses_last_prior_year_session(self):
  b=[['2025-12-30',101,90,100],['2026-01-02',112,99,110],['2026-09-10',140,120,125]]
  self.assertEqual(module.derive({'b':b},'2026-09-10'),{'ytd':25.0,'dist52h':None})
 def test_new_listing_has_no_ytd(self):
  self.assertIsNone(module.derive({'b':[['2026-09-10',100,90,95]]},'2026-09-10')['ytd'])
 def test_missing_session_is_excluded(self):
  self.assertIsNone(module.derive({'b':[['2026-09-09',100,90,95]]},'2026-09-10'))
 def test_high_uses_252_sessions(self):
  from datetime import date,timedelta
  rows=[[(date(2025,1,1)+timedelta(days=i)).isoformat(),200 if i==0 else 100,80,90] for i in range(253)]
  self.assertAlmostEqual(module.derive({'b':rows},rows[-1][0])['dist52h'],10)
class LatestSessionTests(unittest.TestCase):
 def test_saturday_targets_friday(self):
  from datetime import datetime
  from zoneinfo import ZoneInfo
  et=ZoneInfo('America/New_York')
  # Friday 2026-09-25 9pm PT is Saturday 00:00 ET.
  self.assertEqual(module.latest_completed_session(datetime(2026,9,26,0,0,tzinfo=et)).isoformat(),'2026-09-25')
 def test_sunday_targets_friday(self):
  from datetime import datetime
  from zoneinfo import ZoneInfo
  et=ZoneInfo('America/New_York')
  self.assertEqual(module.latest_completed_session(datetime(2026,9,27,15,0,tzinfo=et)).isoformat(),'2026-09-25')
 def test_weekday_before_close_targets_previous_weekday(self):
  from datetime import datetime
  from zoneinfo import ZoneInfo
  et=ZoneInfo('America/New_York')
  self.assertEqual(module.latest_completed_session(datetime(2026,9,25,16,14,tzinfo=et)).isoformat(),'2026-09-24')
 def test_weekday_after_close_targets_that_day(self):
  from datetime import datetime
  from zoneinfo import ZoneInfo
  et=ZoneInfo('America/New_York')
  self.assertEqual(module.latest_completed_session(datetime(2026,9,25,16,15,tzinfo=et)).isoformat(),'2026-09-25')
 def test_monday_morning_targets_friday(self):
  from datetime import datetime
  from zoneinfo import ZoneInfo
  et=ZoneInfo('America/New_York')
  self.assertEqual(module.latest_completed_session(datetime(2026,9,28,9,0,tzinfo=et)).isoformat(),'2026-09-25')
class CatalogWindowTests(unittest.TestCase):
 def test_six_month_return_is_mapped_from_scanner(self):
  src=Path(__file__).resolve().parents[1].joinpath('scripts/update-themes.py').read_text()
  self.assertIn("'h': r.get('ret6m')", src)
class DescriptionTests(unittest.TestCase):
 def test_canonical_sources_override_snapshot_and_preserve_fallback(self):
  import tempfile,json
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   fallback=root/'fallback.json'; does=root/'does.csv'; identity=root/'identity.csv'
   fallback.write_text(json.dumps({'ABC':{'name':'Old name','does':'Old description'},'XYZ':{'does':'Kept'}}))
   does.write_text('Symbol,Does\nABC,"Makes tools, for builders."\nXYZ,\n')
   identity.write_text('Symbol,CompanyName\nABC,Current name\n')
   result=module.load_descriptions(fallback,does,identity)
   self.assertEqual(result['ABC'],{'name':'Current name','does':'Makes tools, for builders.'})
   self.assertEqual(result['XYZ']['does'],'Kept')
if __name__=='__main__':unittest.main()
