<!--
  Copyright 2026 Google LLC
  SPDX-License-Identifier: Apache-2.0
-->

# Hosted Libraries SHA-256 Hasher

Scrapes popular CDN catalogs, downloads every listed `.js` and `.css` file, and computes its SHA-256 hash. Results are written to per-CDN CSVs and a deduplicated master CSV — ready for use in [Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) attributes or any other integrity-checking workflow.

## Supported CDNs

| CDN | Source | Output |
|---|---|---|
| [Google Hosted Libraries](https://developers.google.com/speed/libraries) | Scrapes the catalog page, reconstructs CDN URLs | [`google-hosted-libraries-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/google-hosted-libraries-hashes.csv) |
| [Microsoft Ajax CDN](https://learn.microsoft.com/en-us/aspnet/ajax/cdn/overview) | Extracts URLs listed directly on the docs page | [`microsoft-ajax-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/microsoft-ajax-hashes.csv) |

A deduplicated combined file (unique by SHA-256 hash) is written to [`combined-hashes.csv`](https://github.com/tomayac/hosted-libraries-sha256-hasher/blob/main/combined-hashes.csv).

Each row contains the full CDN URL and its lowercase hex SHA-256 digest:

```
url,sha256
https://ajax.googleapis.com/ajax/libs/d3js/7.9.0/d3.min.js,f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539
https://ajax.aspnetcdn.com/ajax/jQuery/jquery-3.7.1.min.js,…
```

## Usage

```bash
npm install

# Run all CDNs and produce the master CSV
npm start

# Run a single CDN only
npm run google
npm run microsoft
```

Any URL that returns a non-200 status or times out after 6 seconds is silently omitted. For the Google CDN, known historical filename changes (MooTools, Indefinite Observable) are handled via fallback URL resolution.

## License

[Apache 2.0](LICENSE)
