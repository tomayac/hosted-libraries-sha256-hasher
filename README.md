<!--
  Copyright 2026 Google LLC
  SPDX-License-Identifier: Apache-2.0
-->

# Hosted Libraries SHA-256 Hasher

Scrapes popular CDN catalogs, downloads every listed `.js`, `.css`, `.wasm`, web font, JSON, and other web-relevant file, and
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

## Supported CDNs

| CDN                                                                                                                                                              | Source                                                                                                                                                                                       | Output                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Google Hosted Libraries](https://developers.google.com/speed/libraries)                                                                                         | Scrapes the catalog page, reconstructs CDN URLs                                                                                                                                              | [`data/google-hosted-libraries-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/google-hosted-libraries-hashes.csv) |
| [Microsoft Ajax CDN](https://learn.microsoft.com/en-us/aspnet/ajax/cdn/overview)                                                                                 | Extracts URLs listed directly on the docs page                                                                                                                                               | [`data/microsoft-ajax-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/microsoft-ajax-hashes.csv)                   |
| [cdnjs](https://cdnjs.com)                                                                                                                                       | Parses the top-100 most-requested resources from the last 12 months of [Cloudflare usage stats](https://github.com/cdnjs/cf-stats)                                                           | [`data/cdnjs-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/cdnjs-hashes.csv)                                     |
| [cdnjs](https://cdnjs.com) via npm popularity                                                                                                                    | Ranks cdnjs-hosted packages by npm download count; hashes all `.js`, `.css`, `.wasm`, web font, JSON, and other web-relevant files for the top 100's latest version (see below)                                                                | [`data/npm-popular-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/npm-popular-hashes.csv)                         |
| [Chromium pervasive resources](https://source.chromium.org/chromium/chromium/src/+/main:services/network/pervasive_resources/shared_resource_checker_patterns.h) | Extracts versioned, non-tracking `.js`, `.css`, `.wasm`, web font, JSON, and other web-relevant URLs from Chromium's pervasive resource allowlist; resolves Google Maps, YouTube Player, and reCAPTCHA version patterns dynamically; excludes ads/tracking domains and unversioned URLs via deterministic code | [`data/chromium-pervasive-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/chromium-pervasive-hashes.csv)           |
| [YouTube Player](https://www.youtube.com/iframe_api)                                                                                                             | Discovers the current player ID from the iframe API bootstrap and seeds from all historical IDs at [nadeko.net](https://youtube-player-ids.nadeko.net/); hashes all five per-version file types: `base.js`, `captions.js`, `www-player.css`, `www-widgetapi.js`, and the youtube-nocookie.com mirror of `www-player.css` (approach from [youtube-player-id-logger](https://codeberg.org/Fijxu/youtube-player-id-logger)) | [`data/youtube-player-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/youtube-player-hashes.csv)                   |

A combined file with all CDN mirrors is written to
[`data/combined-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/data/combined-hashes.csv).
Rows are sorted by SHA-256 hash so all mirrors of the same file appear together;
exact `(sha256, url)` duplicates are removed.

Each row contains the lowercase hex SHA-256 digest followed by the full CDN URL:

```
sha256,url
f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539,https://ajax.googleapis.com/ajax/libs/d3js/7.9.0/d3.min.js
f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539,https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js
```

The per-CDN files follow the same format and are also sorted by hash.

### How npm popularity ranking works

The `npm-popular` source uses three steps to produce a neutral, data-driven
ranking:

1. **Seed** — fetch the top 1,000 packages from the
   [cdnjs API](https://api.cdnjs.com/libraries?fields=name&limit=1000) (cdnjs's
   own popularity-sorted catalog). This constrains candidates to libraries that
   are actually hosted on cdnjs.

2. **Name resolution** — for each cdnjs library, fetch its package config from
   the [cdnjs/packages](https://github.com/cdnjs/packages) repo and read
   `autoupdate.target` to get the canonical npm package name. Many cdnjs names
   differ from their npm equivalents (e.g. `three.js` → `three`, `moment.js` →
   `moment`, `handlebars.js` → `handlebars`); this step corrects ~140 of the
   1,000 entries.

3. **Ranking** — batch-query the
   [npm downloads API](https://api.npmjs.org/downloads/point/last-month/) with
   the resolved npm names to get last-month download counts. Sort descending,
   take the top 100, and hash all `.js`, `.css`, `.wasm`, web font, JSON, and other web-relevant files for each package's latest
   cdnjs version.

## Usage

```bash
npm install

# Run all CDNs and produce the combined CSV
npm start

# Run a single CDN only
npm run google
npm run microsoft
npm run cdnjs
npm run npm-popular
npm run chromium
npm run youtube
```

Any URL that returns a non-200 status or times out after 6 seconds is silently
omitted. For the Google CDN, known historical filename changes (MooTools,
Indefinite Observable) are handled via fallback URL resolution.

## License

[Apache 2.0](LICENSE)
