# DealStream v2 — fresh OzBargain deals, zero repeats

An installable, mobile-first Android PWA using the [official OzBargain New Deals RSS feed](https://www.ozbargain.com.au/deals/feed). It isn't affiliated with OzBargain.

Live app: <https://msargent094-source.github.io/DealStream/>

## New in v2

- **Compact, phone-first layout** with a sticky tab bar, compact/detailed cards and large tap targets.
- **Automatic seen tracking.** As you genuinely scroll past a deal it is remembered; it remains on-screen in the current session until you refresh, switch tabs or reopen. Swipe right on a card to mark it seen, or swipe left to save; Undo is offered.
- **Four views:** Unseen, New since last visit, Saved, and All. New refers to deals published after your preceding visit. The first visit has no baseline, so New begins at zero.
- **Tailored feed:** follow stores by tapping their names; optionally show followed stores only; mute stores, keywords or entire categories. Saved deals remain available despite feed filters.
- **Persistent saved deals:** the device stores a copy of saved titles and links, so saved cards survive the 60-day rolling public archive. Existing v1 saved IDs are upgraded automatically when their source cards are available; an old ID with no metadata displays a fallback link.
- **Browsing conveniences:** resume anchor, scroll-to-top, seen threshold (earlier/balanced/later), search, infinite paging.
- **Personalisation:** automatic/light/dark theme, three font sizes, detailed/compact cards, price highlighting.
- **Clear update information:** source feed check time is separate from when your app last fetched the published snapshot. Refresh never claims to query OzBargain instantly.
- **Privacy:** all your seen records, saved records and preferences stay in browser storage. Export/import a v1 or v2 JSON backup; no account or subscription.

## Install on Android

Open <https://msargent094-source.github.io/DealStream/> in Chrome, tap **⋮ → Add to home screen → Install**. Existing installations upgrade automatically once the new service worker becomes active. If the old view remains, close and reopen the PWA, or refresh the page.

## Hosting & feeds

GitHub Pages hosts the static PWA. `.github/workflows/refresh-pages.yml` checks the RSS feed about every 10 minutes. This GitHub Actions schedule is best effort and may be delayed. It retains a rolling archive for 60 days, maximum 8,000 public posts. The PWA itself never scrapes or logs into OzBargain. While DealStream is open and visible, it automatically checks the latest **published GitHub Pages snapshot** every 10 minutes. Returning to an inactive app also checks if 10 minutes have passed. New deals appear automatically at the top; if you are reading farther down, updates wait until you scroll back to the top so your position is not lost. Pressing Refresh also loads the latest published snapshot, not the RSS feed directly.

## Tests

Python's built-in parser and packaging tests:

```sh
python -m unittest discover -s tests -v
node --check app.js
node --check sw.js
```

An optional local mobile Chromium smoke test requires Playwright and Chromium:

```sh
python tests/test_browser.py
```

The mobile test uses a synthetic data fixture, not live OzBargain, and covers browsing, persistent saved cards, filters, appearance and seen history.

## Data & compatibility

v1 keys `dealstream_seen_v1`, `dealstream_saved_v1`, and `dealstream_tab_v1` are **unchanged**. v2 adds preference, snapshot, resume and last-visit keys without deleting existing records. No server-side account is required. Clearing browser/PWA site storage or uninstalling may delete personal history, so export it first if switching phones. There is currently **no cross-device sync**. RSS previews may omit content from the full OzBargain post; tap **Open** for the original.
