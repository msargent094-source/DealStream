#!/usr/bin/env python3
"""Update a rolling archive from OzBargain's official /deals/feed RSS feed."""
import argparse
import datetime as dt
import email.utils
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import xml.etree.ElementTree as ET

SOURCE = "https://www.ozbargain.com.au/deals/feed"
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "deals.json"
AGE_DAYS = 60
LIMIT = 8000

class StripTags(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.bits = []
    def handle_data(self, text):
        self.bits.append(text)

def plain(source, limit=350):
    parser = StripTags()
    parser.feed(html.unescape(source or ""))
    return re.sub(r"\s+", " ", " ".join(parser.bits)).strip()[:limit]

def child(item, name):
    node = item.find(name)
    return (node.text or "").strip() if node is not None else ""

def valid_url(url):
    try:
        parsed = urlparse(url)
        return parsed.scheme == "https" and parsed.hostname in ("www.ozbargain.com.au", "ozbargain.com.au")
    except ValueError:
        return False

def date(value):
    if not value:
        return None
    try:
        obj = email.utils.parsedate_to_datetime(value)
    except (ValueError, TypeError, IndexError):
        try:
            obj = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
    if obj.tzinfo is None:
        obj = obj.replace(tzinfo=dt.timezone.utc)
    return obj.astimezone(dt.timezone.utc)

def iso(obj):
    return obj.isoformat().replace("+00:00", "Z")

def parse_rss(payload):
    root = ET.fromstring(payload)
    items = root.findall("./channel/item")
    if not items:
        raise ValueError("No RSS items found; feed structure may have changed")
    result = []
    for item in items:
        url = child(item, "link")
        if not valid_url(url):
            continue
        published = date(child(item, "pubDate"))
        title = plain(child(item, "title"), 500)
        if not title or not published:
            continue
        guid = child(item, "guid") or url
        node = re.search(r"/node/(\d+)(?:$|[/?#])", url) or re.search(r"/node/(\d+)(?:$|[/?#])", guid)
        deal_id = (node.group(1) if node else guid)[:180]
        merchant = re.search(r"\s@\s([^@]+)$", title)
        categories = [c.text.strip() for c in item.findall("category") if c.text and c.text.strip()]
        result.append({
            "id": deal_id, "title": title, "url": url, "published": iso(published),
            "merchant": merchant.group(1).strip()[:80] if merchant else "",
            "category": categories[0][:80] if categories else "",
            "description": plain(child(item, "description"))
        })
    if not result:
        raise ValueError("RSS contained no usable deal records")
    return result

def retrieve():
    request = Request(SOURCE, headers={
        "User-Agent": "Mozilla/5.0 (compatible; DealStreamRSS/1.0; personal noncommercial feed reader)",
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1"
    })
    with urlopen(request, timeout=30) as response:
        body = response.read(1000001)
    if len(body) > 1000000:
        raise ValueError("RSS feed exceeded expected size")
    return body

def merge(existing, incoming, now):
    merged = {str(x["id"]): x for x in existing
              if isinstance(x, dict) and x.get("id") and date(x.get("published"))}
    for item in incoming:
        merged[item["id"]] = item
    cutoff = now - dt.timedelta(days=AGE_DAYS)
    output = [x for x in merged.values() if (d := date(x.get("published"))) and d >= cutoff]
    output.sort(key=lambda x: date(x["published"]), reverse=True)
    return output[:LIMIT]

def update(data, output=DEST, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    incoming = parse_rss(data)
    previous = []
    if output.exists():
        saved = json.loads(output.read_text(encoding="utf-8"))
        if not isinstance(saved, dict) or not isinstance(saved.get("items"), list):
            raise ValueError("Existing feed archive invalid; will not overwrite")
        previous = saved["items"]
    result = {"source": SOURCE, "updatedAt": iso(now), "items": merge(previous, incoming, now)}
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(".tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(output)
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--output", type=Path, default=DEST)
    args = parser.parse_args()
    try:
        if args.fixture:
            raw = args.fixture.read_bytes()
        else:
            try:
                raw = retrieve()
            except (HTTPError, URLError, TimeoutError):
                time.sleep(5)
                raw = retrieve()
        result = update(raw, args.output)
    except (ET.ParseError, ValueError, HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        print("Feed update failed; archive left unchanged:", exc, file=sys.stderr)
        return 1
    print("Fetched", len(parse_rss(raw)), "new-feed entries; archived", len(result["items"]))
    return 0

if __name__ == "__main__":
    sys.exit(main())
