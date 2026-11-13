"""v3 offline packaging and backwards-compatible history safeguards."""
from pathlib import Path
import unittest
import re

ROOT=Path(__file__).resolve().parents[1]

class V3Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app=(ROOT/'app.js').read_text()
        cls.html=(ROOT/'index.html').read_text()
        cls.sw=(ROOT/'sw.js').read_text()

    def test_preserve_all_existing_user_storage_keys(self):
        for name in ('dealstream_seen_v1','dealstream_saved_v1','dealstream_tab_v1',
                     'dealstream_prefs_v2','dealstream_saved_items_v2','dealstream_last_visit_v2'):
            self.assertIn(name,self.app)

    def test_favourites_filters_prices_backup(self):
        for name in ('favoriteKeywordsInput','quietAlertsCheckbox','priceFilterSelect','customMaxInput',
                     'matchOnlyButton','feedHealth','feedDetail','storageStatus','storageCheckButton',
                     'protectStorageButton','backupNudge','updateNotice'):
            self.assertIn(f'id="{name}"',self.html)
        for name in ('DWELL_MS = 550','function firstPrice','function priceAllowed','function isFavourite',
                     'function recordExposure','function checkStorage','function setupAppUpdates','version:3'):
            self.assertIn(name,self.app)

    def test_offline_data_survives_sw_upgrade(self):
        self.assertIn("FEED_CACHE='dealstream-feed-v1'",self.sw)
        self.assertRegex(self.sw, r"SHELL_CACHE='dealstream-shell-v[4-9][0-9]*'")
        self.assertIn("headers.set('X-DealStream-Cache','offline')",self.sw)
        self.assertIn('await data.put(feedKey(),record)',self.sw)

    def test_existing_workflow_unchanged(self):
        yml=(ROOT/'.github/workflows/refresh-pages.yml').read_text()
        self.assertRegex(yml, r"cron: ['\"](?:[0-9]+,){5}[0-9]+ \\* \\* \\* \\*['\"]")
        self.assertIn('python -m unittest discover -s tests -v',yml)

if __name__=='__main__':unittest.main()
