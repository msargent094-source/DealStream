# DealStream — new OzBargain deals, minus the repeats

A small, installable Android/web PWA. It uses the **official OzBargain New Deals RSS feed** (not the curated front-page feed) and displays deals newest first. It stores viewed and bookmarked deal IDs privately in your browser's local storage.

## Features

- Scroll past a deal to mark it as seen. It is **not removed during your current scrolling session**, only when you refresh, reopen, change tabs, or explicitly update the list.
- Tabs for **Unseen**, **All** (with Unsee), and **Saved**.
- Search titles, stores and descriptions; tap to open the original OzBargain post.
- View/history counter, installable home-screen icon, light/dark mode, offline app shell.
- Export/import seen and saved history for phone migrations.
- No login, analytics, external scripts, subscriptions or fees.

## Deploy for free with GitHub Pages

**A public repository is required for GitHub Pages on a GitHub Free personal account.** The data is public OzBargain RSS content; your personal seen/saved history never leaves your phone. The repository will contain code plus a rolling archive of public deals.

1. Create a **new public GitHub repository**, e.g. `DealStream` (default branch `main`). Do not initialise it with a README if you plan to upload this package via GitHub web UI.
2. Unzip the project and upload all project **contents**, including the `.github` folder, to the repository root. GitHub's web uploader may omit hidden folders, so verify `.github/workflows/refresh-pages.yml` is present; if it isn't, add it separately using the GitHub web editor.
3. In the repository go to **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Go to **Actions → Update deals and publish PWA → Run workflow**, selecting `main`. The workflow downloads the official RSS feed, tests it, archives it, and deploys the app. Make sure Actions are enabled for the repository.
5. The workflow summary's `github-pages` deployment shows your URL, typically `https://YOUR-USERNAME.github.io/DealStream/`.
6. Open that URL in **Chrome on Android**, tap **⋮ → Add to Home screen → Install** (wording varies). Once installed it launches as a standalone app.

The source feed is checked about every 15 minutes via a GitHub Actions scheduled workflow. GitHub schedules are **best-effort** and may be delayed or skipped under load; refresh in the app rereads the last published data snapshot, not the RSS source directly. The site's RSS feed contains recent items only; the archive starts from your first successful workflow run and retains up to 60 days of deals (max 8,000). Deals older than the archive retention period won't be browsable, but seen/saved records can remain on your phone. Bookmarked deals whose source items have expired may temporarily not show up in the Saved list; you can still export the saved IDs.

**If scheduled updates stop**: GitHub disables scheduled workflows on some inactive public repositories after 60 days without activity. Re-enable the workflow in the Actions tab. OzBargain may also throttle/block feed requests or change its format; existing deployed content stays available if an update fails.

## Running and testing locally

Requires Python 3, with no packages to install.

```bash
python -m unittest discover -s tests -v
python scripts/update_feed.py  # requires internet access to fetch live RSS
python -m http.server 8000
```

Open `http://localhost:8000`. For a no-network demonstration of the parser, use:

```bash
python scripts/update_feed.py --fixture tests/fixtures/sample.xml --output /tmp/dealstream-fixture.json
```

The fixture is synthetic test data, **not real deals**; it isn't shipped as the deployed feed.

## Privacy and limitations

- Seen/saved history is local to the installed PWA/browser on each device; it doesn't sync automatically between phones or between Chrome and other browsers.
- Clearing browser site storage or uninstalling may erase your history. Export a backup first.
- Installation and offline support require a secure HTTPS origin; GitHub Pages provides HTTPS.
- Offline access depends on a successfully cached feed; if you open the app before the first refresh while offline, cards may be unavailable.
- An unofficial, personal RSS reader, not endorsed or operated by OzBargain. Headlines and previews belong to their original authors; open deal links to read full posts.