"""Appearance presets and privacy compatibility."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class AppearanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/'index.html').read_text()
        cls.app=(ROOT/'app.js').read_text()
        cls.css=(ROOT/'styles.css').read_text()
    def test_color_selector_and_one_tap_access(self):
        for name in ('appearanceButton','paletteOptions','customAccentInput','paletteSelection'):
            self.assertIn('id="'+name+'"',self.html)
        self.assertIn('setupPaletteControls();applyAppearance()',self.app)
        self.assertIn('accessibleAccent(value,isDark)',self.app)
        self.assertIn('const PALETTES = Object.freeze',self.app)
    def test_color_changes_preserve_history_keys(self):
        for name in ('dealstream_seen_v1','dealstream_saved_v1','dealstream_prefs_v2','dealstream_saved_items_v2'):
            self.assertIn(name,self.app)
        self.assertIn("st.prefs.palette='custom';st.prefs.customAccent=event.target.value;savePrefs()",self.app)
    def test_buttons_use_accessible_palette_tokens(self):
        self.assertIn('.tab.active{color:var(--accent-on);background:var(--accent)}',self.css)
        self.assertIn('.primary-button{background:var(--accent);color:var(--accent-on)',self.css)
        self.assertNotIn('var(--red)',self.css)
        self.assertIn("FEED_CACHE='dealstream-feed-v1'",(ROOT/'sw.js').read_text())
if __name__=='__main__':unittest.main()
