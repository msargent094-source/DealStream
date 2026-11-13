"""Check 10-minute scheduling and in-app polling without external dependencies."""
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class RefreshTests(unittest.TestCase):
    def test_scheduled_checks_six_per_hour(self):
        workflow = (ROOT / '.github/workflows/refresh-pages.yml').read_text()
        matches = re.findall(r"cron:\s*['\"]([^'\"]+)['\"]", workflow)
        self.assertEqual(len(matches), 1)
        minutes, hour, day, month, weekday = matches[0].split()
        values = [int(v) for v in minutes.split(',')]
        self.assertEqual(len(values), 6)
        self.assertTrue(0 <= values[0] <= 9)
        self.assertEqual(values, list(range(values[0], 60, 10)))
        self.assertEqual([hour, day, month, weekday], ['*'] * 4)

    def test_app_polls_only_when_visible_and_preserves_history(self):
        app = (ROOT / 'app.js').read_text()
        self.assertIn('const REFRESH_INTERVAL_MS = 10 * 60 * 1000;', app)
        self.assertIn('window.setInterval(', app)
        self.assertIn('!document.hidden&&!st.loading', app)
        self.assertIn('st.pendingFeed={items:incoming,updated};', app)
        self.assertRegex(app,r'if\s*\(y\s*<\s*100\s*&&\s*st\.pendingFeed\)')
        for k in ['dealstream_seen_v1', 'dealstream_saved_v1', 'dealstream_saved_items_v2']:
            self.assertIn(k, app)

if __name__ == '__main__':
    unittest.main()
