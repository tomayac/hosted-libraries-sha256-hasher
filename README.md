<!--
  Copyright 2026 Google LLC
  SPDX-License-Identifier: Apache-2.0
-->

# Hosted Libraries SHA-256 Hasher

Scrapes popular CDN catalogs and npm popularity rankings, downloads web-relevant
files (`.js`, `.css`, `.wasm`, web fonts, `.json`, `.svg`, pre-compressed `.gz`),
and computes each file's SHA-256 hash. The output is a well-known-resources
allowlist for the [Cross-Origin Storage (COS) API](https://wicg.github.io/cross-origin-storage/).

## Why this matters for Cross-Origin Storage

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
real-world popularity.

## This works today

The [vite-plugin-cross-origin-storage](https://github.com/tomayac/vite-plugin-cross-origin-storage)
plugin demonstrates the full pipeline in practice: it splits bundled
`node_modules` dependencies into per-package vendor chunks at build time,
computes their SHA-256 hashes, and uses COS at runtime to serve those chunks
from a shared cross-origin cache. Sites built with the plugin that share common
dependencies (React, lodash, etc.) will find those chunks already cached across
visits — no repeated downloads.

The allowlist this project generates is the complement: it covers files loaded
directly from public CDNs (as opposed to build-tool-generated chunks), and
seeds the well-known-resources list with packages that are candidates for
COS sharing regardless of how they are currently loaded.

## Supported sources

| Source | Method | Output |
| --- | --- | --- |
| [Google Hosted Libraries](https://developers.google.com/speed/libraries) | Scrapes the catalog page, reconstructs CDN URLs | [`data/google-hosted-libraries-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/google-hosted-libraries-hashes.csv) |
| [Microsoft Ajax CDN](https://learn.microsoft.com/en-us/aspnet/ajax/cdn/overview) | Extracts URLs listed directly on the docs page | [`data/microsoft-ajax-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/microsoft-ajax-hashes.csv) |
| [cdnjs](https://cdnjs.com) | Parses the top-100 most-requested resources from the last 12 months of [Cloudflare usage stats](https://github.com/cdnjs/cf-stats) | [`data/cdnjs-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/cdnjs-hashes.csv) |
| [jsDelivr](https://www.jsdelivr.com) | Fetches the top 100 npm packages by actual jsDelivr CDN hit count (last month); resolves each to its latest stable version; hashes the canonical JS and CSS entry points identified by jsDelivr's entrypoints API | [`data/jsdelivr-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/jsdelivr-hashes.csv) |
| [npm popularity](https://www.npmjs.com) | Ranks cdnjs-hosted packages by npm download count; hashes all web-relevant files for the top 100's latest version on cdnjs (see below) | [`data/npm-popular-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/npm-popular-hashes.csv) |
| [Chromium pervasive resources](https://chromium.googlesource.com/chromium/src/+/lkgr/services/network/pervasive_resources/shared_resource_checker_patterns.h) | Reads Chromium's pervasive resource allowlist and hashes every concrete, versioned, non-rotating URL in it; resolves the current version of Google Maps and YouTube Player from their respective bootstrap endpoints; certain hosts are excluded from pattern resolution (see below) | [`data/chromium-pervasive-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/chromium-pervasive-hashes.csv) |
| [YouTube Player](https://www.youtube.com/iframe_api) _(extends Chromium)_ | Discovers all historical player IDs from [nadeko.net](https://youtube-player-ids.nadeko.net/) in addition to the current one; hashes the same five file types per version that Chromium tracks (see below) | [`data/youtube-player-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/youtube-player-hashes.csv) |
| [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) _(extends Chromium)_ | Probes all currently available quarterly versions (3.NN) via their versioned bootstrap URLs; hashes the same 16 JS files per version that Chromium tracks (see below) | [`data/google-maps-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/google-maps-hashes.csv) |

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

## Source details

### jsDelivr (CDN hit count)

jsDelivr's stats API ranks packages by actual CDN hit count — real browser
requests to `cdn.jsdelivr.net`. A file that gets billions of CDN hits per month
is loaded cross-origin by so many unrelated sites that its presence in cache
reveals nothing about a user's browsing history, which is the core COS fitness
criterion. This pipeline captures what is already being shared cross-origin
today.

The pipeline uses three API calls per package:

1. **Top packages** — `GET /v1/stats/packages?by=hits&type=npm&period=month&limit=200`
   returns the top npm packages by CDN hit count. GitHub-type packages are
   excluded (they don't follow stable semver CDN URL patterns).
2. **Version resolution** — `GET /v1/packages/npm/:pkg/resolved` returns the
   latest stable version, used to construct the pinned CDN URL.
3. **Entrypoints** — `GET /v1/packages/npm/:pkg@:version/entrypoints` returns
   the canonical JS and CSS file for the package, determined by jsDelivr's
   heuristics over package metadata and real usage patterns.

### npm popularity (forward-looking)

The npm pipeline is forward-looking: it seeds the allowlist with packages that
are universally used across the JS ecosystem today, whether or not they are
currently loaded from a CDN. The goal is to help shape a future where
frameworks and libraries that are today bundled into every app are instead
shared via COS — either loaded from public CDN URLs or, as the
[vite-plugin-cross-origin-storage](https://github.com/tomayac/vite-plugin-cross-origin-storage)
already demonstrates, via build-tool-generated vendor chunks whose hashes are
registered in the allowlist.

A package downloaded 50 million times a month by independent projects is a
strong candidate for cross-origin sharing, regardless of whether the ecosystem
has yet converged on loading it that way. React is the canonical example: it is
heavily bundled today, but a future version designed around COS-friendly loading
would benefit immediately from an allowlist that already contains its hashes.

The pipeline uses three steps:

1. **Seed** — fetch the top 1,000 packages from the
   [cdnjs API](https://api.cdnjs.com/libraries?fields=name&limit=1000).
   This constrains candidates to packages that already have a stable
   CDN-hosted artifact, which is the prerequisite for public CDN sharing.
2. **Name resolution** — for each cdnjs library, fetch its package config from
   the [cdnjs/packages](https://github.com/cdnjs/packages) repo and read
   `autoupdate.target` to get the canonical npm package name. Many cdnjs names
   differ from their npm equivalents (e.g. `three.js` → `three`, `moment.js` →
   `moment`); this step corrects ~140 of the 1,000 entries.
3. **Ranking** — batch-query the
   [npm downloads API](https://api.npmjs.org/downloads/point/last-month/) with
   the resolved npm names, sort descending, take the top 100, and hash all
   web-relevant files for each package's latest cdnjs version.

### Chromium-extended pipelines

Chromium's pervasive resource list
([`shared_resource_checker_patterns.h`](https://chromium.googlesource.com/chromium/src/+/lkgr/services/network/pervasive_resources/shared_resource_checker_patterns.h))
contains URL patterns for resources observed across many sites, with `:v`
placeholders for version components. The `chromium-pervasive` scraper resolves
these to the **current** version at run time. YouTube and Google Maps have
a meaningful history of versions still actively served and cached, so two
dedicated scrapers extend that coverage with historical versions.

**YouTube Player** (`youtube-player.js`): Chromium tracks five URL patterns per
player version (`base.js`, `captions.js`, `www-player.css`,
`www-widgetapi.js`, and the `youtube-nocookie.com` mirror of `www-player.css`).
`youtube-player.js` fetches all historical player IDs from
[nadeko.net](https://youtube-player-ids.nadeko.net/) and hashes the same five
files for each. The current version's URLs appear in both outputs and are
deduplicated in `combined-hashes.csv`.

**Google Maps JavaScript API** (`google-maps.js`): Chromium tracks 16 URL
patterns per Maps version — 14 files on `maps.googleapis.com` (`common.js`,
`controls.js`, `geocoder.js`, `geometry.js`, `infowindow.js`, `log.js`,
`main.js`, `map.js`, `marker.js`, `onion.js`, `places_impl.js`, `search.js`,
`search_impl.js`, `util.js`) plus `common.js` and `util.js` on the
`maps.google.com` mirror. `google-maps.js` probes a rolling window of quarterly
versions (3.NN) derived from the current date, extracts each version's internal
`(channel, release)` pair from the bootstrap self-reference, and hashes all 16
files. The version window updates automatically so no manual changes are needed
as new versions ship.

### URL pattern resolution: excluded hosts

Some hosts in the Chromium pervasive list are excluded from URL pattern
resolution. This is not a COS fitness judgment — ubiquitous files from any
domain are valid COS candidates. The exclusion exists because resolving a
versioned `:v` pattern for a tracking or ad domain and adding it to the
allowlist could undermine per-request tracking protections by allowing those
files to persist in a shared cross-origin cache. Concrete versioned URLs from
those hosts that appear directly in the Chromium list (without `:v` placeholders)
are not blocked — they are stable, widely cached, and appropriate COS candidates.

**reCAPTCHA** (`recaptcha/releases/:v/...`) is also excluded, for a different
reason: the release token rotates frequently and opaquely with no public version
log, so hashes go stale almost immediately. More fundamentally, the
`recaptcha__*.js` files carry active bot-detection logic that Google deliberately
rotates to stay ahead of adversaries; COS caching would directly undermine that.
The `styles__ltr.css` file is technically hashable but not worth including given
how short-lived each token is.

## Usage

```bash
npm install

# Run all sources and produce the combined CSV
npm start

# Run a single source only
npm run google
npm run google-maps
npm run microsoft
npm run cdnjs
npm run jsdelivr
npm run npm-popular
npm run chromium
npm run youtube
```

Any URL that returns a non-200 status or times out after 6 seconds is silently
omitted. For the Google Hosted Libraries CDN, known historical filename changes
(MooTools, Indefinite Observable) are handled via fallback URL resolution.

## License

[Apache 2.0](LICENSE)
