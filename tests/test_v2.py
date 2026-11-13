"""Lightweight packaging/upgrade checks; does not need a browser or network."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class V2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/'index.html').read_text()
        cls.js=(ROOT/'app.js').read_text()
        cls.css=(ROOT/'styles.css').read_text()

    def test_core_history_keys_preserved(self):
        for key in ('dealstream_seen_v1','dealstream_saved_v1','dealstream_tab_v1'):
            self.assertIn(key,self.js)

    def test_all_navigation_controls_exist(self):
        for key in ('tab-unseen','tab-new','tab-saved','tab-all'):
            # tabs intentionally use data-tab instead of IDs in v2
            self.assertIn(key.removeprefix('tab-'),self.html)
        for key in ('filtersDialog','settingsDialog','resumeButton','undoButton','topButton'):
            self.assertIn(f'id="{key}"',self.html)

    def test_saved_snapshots_and_backup(self):
        self.assertIn('dealstream_saved_items_v2',self.js)
        self.assertIn('version:2',self.js)
        self.assertIn('function archivedSaved()',self.js)

    def test_installation_manifest_valid(self):
        manifest=json.loads((ROOT/'manifest.webmanifest').read_text())
        self.assertEqual(manifest['display'],'standalone')
        self.assertEqual(manifest['scope'],'./')
        self.assertTrue(any(i['sizes']=='192x192' for i in manifest['icons']))
        self.assertTrue(any(i['sizes']=='512x512' for i in manifest['icons']))

    def test_local_theme_and_accessibility(self):
        self.assertIn('document.documentElement.dataset.theme',self.js)
        self.assertIn('prefers-reduced-motion',self.css)
        self.assertIn('aria-label',self.html)

if __name__=='__main__':unittest.main()
