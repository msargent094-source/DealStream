# DealStream — fresh OzBargain deals, zero repeats

An installable, mobile-first Android PWA using the [official OzBargain New Deals RSS feed](https://www.ozbargain.com.au/deals/feed). It isn't affiliated with OzBargain.

Live app: <https://msargent094-source.github.io/DealStream/>

## New in v3

- **Compact, phone-first layout** with a sticky tab bar, compact/detailed cards and large tap targets.
- **Dwell-based seen tracking.** Deals must be visible for at least 550 ms before scrolling past can mark them seen. Fast flicks will not automatically mark unseen posts; it remains on-screen in the current session until you refresh, switch tabs or reopen. Swipe right on a card to mark it seen, or swipe left to save; Undo is offered.
- **Four views:** Unseen, New since last visit, Saved, and All. New refers to deals published after your preceding visit. The first visit has no baseline, so New begins at zero.
- **Tailored feed:** follow stores by tapping their names; highlight favourite keywords and stores; apply estimated price filters (free / under $25 / $50 / $100 / custom); optionally show followed stores only; mute stores, keywords or entire categories. Saved deals remain available despite feed filters.
- **Persistent saved deals:** the device stores a copy of saved titles and links, so saved cards survive the 60-day rolling public archive. Existing v1 saved IDs are upgraded automatically when their source cards are available; an old ID with no metadata displays a fallback link.
- **Browsing conveniences:** resume anchor, scroll-to-top, seen threshold (earlier/balanced/later), search, infinite paging.
- **Personalisation:** eight instant colour presets plus an unrestricted custom colour picker, independent automatic/light/dark theme, three font sizes, detailed/compact cards, price highlighting. Change colours with the palette icon in the header or via Settings. Your selection is saved alongside existing preferences.
- **Feed health and auto updates:** a freshness indicator warns if the source feed is more than 30 minutes old or an hour stale, and service worker updates display a reload prompt. The source feed check time is separate from when your app last fetched the published snapshot. Refresh never claims to query OzBargain instantly.
- **Privacy:** all your seen records, saved records and preferences stay in browser storage. Export/import a v1, v2 or v3 JSON backup, check storage, request persistent storage, and get periodic backup nudges. No account or subscription.

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

Optional local Chromium smoke tests for the existing app and new v3 features require Playwright and Chromium:

```sh
python tests/test_browser.py
python tests/test_browser_v3.py
```

The mobile test uses a synthetic data fixture, not live OzBargain, and covers browsing, persistent saved cards, filters, appearance and seen history.

## Data & compatibility

v1 keys `dealstream_seen_v1`, `dealstream_saved_v1`, and `dealstream_tab_v1` are **unchanged**. v2 adds preference, snapshot, resume and last-visit keys without deleting existing records. No server-side account is required. Clearing browser/PWA site storage or uninstalling may delete personal history, so export it first if switching phones. There is currently **no cross-device sync**. RSS previews may omit content from the full OzBargain post; tap **Open** for the original.

## Favourite alerts and price filtering

Favourite keywords and followed stores can highlight matching posts, with a quick **Favourite matches** filter. **Quiet alerts** are in-app toasts for *newly collected* matching posts while the app is open; there is no background push, server subscription, ringtone or notification permission required. No matching posts are tracked off-device. Price filtering uses the first dollar amount (or a clear “Free”) in deal titles; it is an estimate, not a verified final checkout price. Deals without a detectable price are excluded from limited-price views.

## Reliability and storage

Scrolling records exposure time while a deal is actually visible; a fast flick is not treated as reading every card. Rendering reuses existing cards when possible. Auto-refresh that would reorder deals is deferred while you read farther down, and applied on returning to the top. A separate feed cache keeps previously fetched deals available offline even across service-worker upgrades. New service-worker versions offer a reload prompt.

Seen and saved storage keys remain unchanged, and backups include all previous information plus v3 filters. If your phone/browser clears *all* site data, neither the service worker nor the app can recover history without an exported JSON backup. Persistent storage reduces ordinary eviction risks but does not replace backups.

## Colour schemes

Tap the colour-palette icon beside Refresh to open Appearance. Select any of eight presets, or pick a custom colour; the colours update instantly without reloading, and the choice persists on this device. Light/dark/Follow phone is independent of the palette. Accessible contrast is adjusted automatically for controls and text. All existing history, saved deals, RSS polling and filters remain unchanged.
