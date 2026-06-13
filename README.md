<!--
  Copyright 2026 Google LLC
  SPDX-License-Identifier: Apache-2.0
-->

# Hosted Libraries SHA-256 Hasher

Scrapes popular CDN catalogs, downloads every listed `.js`, `.css`, `.wasm`, web font (`.woff2`, `.woff`, `.ttf`, `.otf`), `.json`, `.svg`, and pre-compressed (`.gz`) file, and
computes its SHA-256 hash. The primary use case is providing a
well-known-resources allowlist for the
[Cross-Origin Storage](https://wicg.github.io/cross-origin-storage/) (COS) API.

### Why this matters for Cross-Origin Storage

COS lets browsers share cached files across origins by SHA-256 hash, so a large
library downloaded once on site A can be reused on site B without a second
download. The privacy challenge is that checking whether a file is cached can
act as a cross-site tracking signal: if a file is rare or unique to a small
number of sites, its presence in the cache reveals which sites a user has
visited.

The mitigation is an allowlist of _well-known_ resources — files so widely
deployed that their presence in the cache tells an attacker nothing specific
about a user's browsing history. This project generates that allowlist by
gathering SHA-256 hashes from hand-curated CDNs and ranking candidates by
real-world popularity, so only genuinely ubiquitous resources are included.

## Supported sources

| Source                                                                                                                                                              | Method                                                                                                                                                                                                                                       | Output                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Google Hosted Libraries](https://developers.google.com/speed/libraries)                                                                                            | Scrapes the catalog page, reconstructs CDN URLs                                                                                                                                                                                              | [`data/google-hosted-libraries-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/google-hosted-libraries-hashes.csv) |
| [Microsoft Ajax CDN](https://learn.microsoft.com/en-us/aspnet/ajax/cdn/overview)                                                                                    | Extracts URLs listed directly on the docs page                                                                                                                                                                                               | [`data/microsoft-ajax-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/microsoft-ajax-hashes.csv)                   |
| [cdnjs](https://cdnjs.com)                                                                                                                                          | Parses the top-100 most-requested resources from the last 12 months of [Cloudflare usage stats](https://github.com/cdnjs/cf-stats)                                                                                                           | [`data/cdnjs-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/cdnjs-hashes.csv)                                     |
| [jsDelivr](https://www.jsdelivr.com)                                                                                                                               | Fetches the top 100 npm packages by actual jsDelivr CDN hit count (last month); resolves each to its latest stable version; hashes the canonical JS and CSS entry points identified by jsDelivr's entrypoints API                           | [`data/jsdelivr-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/jsdelivr-hashes.csv)                               |
| [Chromium pervasive resources](https://chromium.googlesource.com/chromium/src/+/lkgr/services/network/pervasive_resources/shared_resource_checker_patterns.h)      | Reads Chromium's pervasive resource allowlist and hashes every concrete, versioned, non-tracking URL in it; resolves the current version of Google Maps and YouTube Player from their respective bootstrap endpoints (see below); reCAPTCHA patterns are intentionally skipped (see below) | [`data/chromium-pervasive-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/chromium-pervasive-hashes.csv)           |
| [YouTube Player](https://www.youtube.com/iframe_api) _(extends Chromium)_                                                                                          | Discovers all historical player IDs from [nadeko.net](https://youtube-player-ids.nadeko.net/) in addition to the current one; hashes the same five file types per version that Chromium tracks (see below)                                  | [`data/youtube-player-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/youtube-player-hashes.csv)                   |
| [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) _(extends Chromium)_                                                     | Probes all currently available quarterly versions (3.NN) via their versioned bootstrap URLs; hashes the same 16 JS files per version that Chromium tracks (see below)                                                                        | [`data/google-maps-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/google-maps-hashes.csv)                         |

A combined file with all sources is written to
[`data/combined-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/combined-hashes.csv).
Rows are sorted by SHA-256 hash so all mirrors of the same file appear together;
exact `(sha256, url)` duplicates are removed.

Each row contains the lowercase hex SHA-256 digest followed by the full CDN URL:

```
sha256,url
f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539,https://ajax.googleapis.com/ajax/libs/d3js/7.9.0/d3.min.js
f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539,https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js
```

The per-source files follow the same format and are also sorted by hash.

### Why jsDelivr hit count, not npm download count

The previous pipeline ranked packages by npm download count. npm downloads
measure popularity in `node_modules` — the vast majority of which are bundled
into apps and never loaded from a CDN at all. A package can have tens of
millions of npm downloads per month and zero cross-origin CDN requests.

The COS allowlist needs CDN-request ubiquity: files that are actually loaded
cross-origin by browsers across many unrelated sites, so that their presence
in cache is non-identifying. jsDelivr's hit count is that signal directly —
it counts real browser requests to `cdn.jsdelivr.net`, not npm installs.

The jsDelivr pipeline uses three API calls per package:

1. **Top packages** — `GET /v1/stats/packages?by=hits&type=npm&period=month&limit=200`
   returns the top npm packages by CDN hit count. GitHub-type packages are
   excluded (they don't follow stable semver CDN URL patterns). A small
   blocklist removes clear-cut ad-tech packages (`prebid-universal-creative`,
   `search-insights`) whose hit counts reflect programmatic ad infrastructure
   rather than shared library usage.

2. **Version resolution** — `GET /v1/packages/npm/:pkg/resolved` returns the
   latest stable version, used to construct the pinned CDN URL.

3. **Entrypoints** — `GET /v1/packages/npm/:pkg@:version/entrypoints` returns
   the canonical JS and CSS file for the package, determined by jsDelivr's
   heuristics over package metadata and real usage patterns. This is more
   reliable than guessing from a raw file listing.

### How the Chromium-extended pipelines work

Chromium's pervasive resource list
([`shared_resource_checker_patterns.h`](https://chromium.googlesource.com/chromium/src/+/lkgr/services/network/pervasive_resources/shared_resource_checker_patterns.h))
includes URL patterns for the YouTube Player and Google Maps JavaScript API
using `:v` placeholders for the version component. The `chromium-pervasive`
scraper resolves these to the **current** version at run time by fetching each
service's bootstrap endpoint. That covers what Chromium itself knows about, but
both services have a meaningful history of versions that are still actively
served and cached by browsers — versions that are also legitimately
shareable across sites via COS.

Two dedicated scrapers extend the Chromium dataset with that history:

**YouTube Player** (`youtube-player.js`): Chromium's list contains five URL
patterns per player version (`base.js`, `captions.js`, `www-player.css`,
`www-widgetapi.js`, and the `youtube-nocookie.com` mirror of `www-player.css`).
The `chromium-pervasive` scraper resolves these for the current player ID only.
`youtube-player.js` additionally fetches all historical player IDs from
[nadeko.net](https://youtube-player-ids.nadeko.net/) — a public log that tracks
every player version ever rolled out — and hashes the same five files for each.
The current version's URLs appear in both outputs and are deduplicated in
`combined-hashes.csv`.

**reCAPTCHA** (`recaptcha/releases/:v/...`): intentionally excluded. The release token rotates frequently and opaquely — there is no public version log and no documented cadence — so any hashed file becomes stale almost immediately and the allowlist provides no meaningful sharing benefit. More fundamentally, the `recaptcha__*.js` files carry active bot-detection logic that Google deliberately rotates to stay ahead of adversaries; COS caching of these files would directly undermine that goal. The `styles__ltr.css` file is technically hashable but not worth including given how short-lived each token is in practice. Chromium's list contains 16
URL patterns per Maps version (14 files on `maps.googleapis.com` — `common.js`,
`controls.js`, `geocoder.js`, `geometry.js`, `infowindow.js`, `log.js`,
`main.js`, `map.js`, `marker.js`, `onion.js`, `places_impl.js`, `search.js`,
`search_impl.js`, `util.js` — plus `common.js` and `util.js` on the
`maps.google.com` mirror). The `chromium-pervasive` scraper resolves these for
the current version only. `google-maps.js` additionally probes a rolling window
of quarterly versions (3.NN) via their versioned bootstrap URLs (`?v=3.NN`),
extracts the internal `(channel, release)` pair that each bootstrap
self-references, and hashes all 16 files for every version Google currently
serves (typically the four most recent quarterly releases). The version window
is computed from the current date so no manual updates are needed as new
versions ship. The current version's URLs appear in both outputs and are
deduplicated in `combined-hashes.csv`.

## Usage

```bash
npm install

# Run all CDNs and produce the combined CSV
npm start

# Run a single CDN only
npm run google
npm run google-maps
npm run microsoft
npm run cdnjs
npm run jsdelivr
npm run chromium
npm run youtube
```

Any URL that returns a non-200 status or times out after 6 seconds is silently
omitted. For the Google CDN, known historical filename changes (MooTools,
Indefinite Observable) are handled via fallback URL resolution.

## License

[Apache 2.0](LICENSE)
