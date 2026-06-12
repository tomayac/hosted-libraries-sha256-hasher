<!--
  Copyright 2026 Google LLC
  SPDX-License-Identifier: Apache-2.0
-->

# Google Hosted Libraries SHA-256 Hasher

Scrapes the [Google Hosted Libraries](https://developers.google.com/speed/libraries) catalog, downloads every listed library file from `ajax.googleapis.com`, and computes its SHA-256 hash. Results are written to a CSV for use in [Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) attributes or any other integrity-checking workflow.

## Result

The latest run produced **387 verified records**:

[`google_hosted_libraries_hashes.csv`](https://github.com/tomayac/google-hosted-libraries-sha256-hasher/blob/main/google_hosted_libraries_hashes.csv)

Each row contains the full CDN URL and its lowercase hex SHA-256 digest:

```
url,sha256
https://ajax.googleapis.com/ajax/libs/d3js/7.9.0/d3.min.js,f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539
…
```

## Usage

```bash
npm install
npm start
```

The script fetches the library catalog, resolves each file URL (with fallbacks for known historical naming changes), and streams the results to `google_hosted_libraries_hashes.csv`. Any URL that returns a non-200 status or times out after 6 seconds is silently omitted.

## License

[Apache 2.0](LICENSE)
