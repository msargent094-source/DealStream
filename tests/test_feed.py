import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from xml.etree.ElementTree import ParseError
from scripts.update_feed import merge, parse_rss, update, valid_url

FIXTURE = Path(__file__).parent / "fixtures" / "sample.xml"
NOW = dt.datetime(2026,11,13,9,tzinfo=dt.timezone.utc)

class FeedTests(unittest.TestCase):
    def test_parse_rss_and_categories(self):
        items = parse_rss(FIXTURE.read_bytes())
        self.assertEqual(len(items),2)
        self.assertEqual(items[0]["id"],"123456")
        self.assertEqual(items[0]["merchant"],"Demo Store")
        self.assertEqual(items[0]["category"],"Electrical & Electronics")
        self.assertEqual(items[0]["description"],"Save on earbuds today.")
        self.assertEqual(items[1]["published"],"2026-11-13T01:40:00Z")
    def test_reject_untrusted_urls(self):
        self.assertTrue(valid_url("https://www.ozbargain.com.au/node/123"))
        self.assertFalse(valid_url("https://ozbargain.com.au.evil.com/"))
        self.assertFalse(valid_url("javascript:alert(1)"))
        self.assertFalse(valid_url("http://www.ozbargain.com.au/"))
    def test_archive_sorted_and_deduped(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"deals.json"
            first=update(FIXTURE.read_bytes(),path,NOW)
            self.assertEqual(first["items"][0]["id"],"123457")
            self.assertEqual(len(first["items"]),2)
            update(FIXTURE.read_bytes(),path,NOW)
            self.assertEqual(len(json.loads(path.read_text())["items"]),2)
    def test_expiration_and_previous_deals(self):
        previous=[{"id":"recent","published":"2026-11-12T13:00:00Z"},{"id":"old","published":"2026-01-01T00:00:00Z"}]
        items=merge(previous,parse_rss(FIXTURE.read_bytes()),NOW)
        self.assertIn("recent",[x["id"] for x in items])
        self.assertNotIn("old",[x["id"] for x in items])
    def test_malformed_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"deals.json"
            path.write_text('{"source":"sample","items":[]}')
            with self.assertRaises(ParseError): update(b"invalid xml",path,NOW)
            self.assertEqual(json.loads(path.read_text())["source"],"sample")
    def test_empty_feed_rejected(self):
        with self.assertRaisesRegex(ValueError,"No RSS items"):
            parse_rss(b"<rss><channel /></rss>")
if __name__=="__main__":
    unittest.main()
