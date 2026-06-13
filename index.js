// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import { run as runChromium } from './chromium-pervasive.js';
import { run as runCdnjs } from './cdnjs.js';
import { run as runGoogle } from './google-hosted-libraries.js';
import { run as runGoogleMaps } from './google-maps.js';
import { run as runJsdelivr } from './jsdelivr.js';
import { run as runMicrosoft } from './microsoft-ajax.js';
import { run as runNpmPopular } from './npm-popular.js';
import { run as runYouTube } from './youtube-player.js';

const OUTPUT_CSV = 'data/combined-hashes.csv';

async function main() {
  const [
    googleRecords,
    microsoftRecords,
    cdnjsRecords,
    jsdelivrRecords,
    npmPopularRecords,
    chromiumRecords,
    youtubeRecords,
    googleMapsRecords,
  ] = await Promise.all([
    runGoogle(),
    runMicrosoft(),
    runCdnjs(),
    runJsdelivr(),
    runNpmPopular(),
    runChromium(),
    runYouTube(),
    runGoogleMaps(),
  ]);

  // Deduplicate identical (sha256, url) pairs, keep all CDN mirrors of the same hash
  const seen = new Set();
  const combined = [];
  for (const record of [
    ...googleRecords,
    ...microsoftRecords,
    ...cdnjsRecords,
    ...jsdelivrRecords,
    ...npmPopularRecords,
    ...chromiumRecords,
    ...youtubeRecords,
    ...googleMapsRecords,
  ]) {
    const key = `${record.sha256}\t${record.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(record);
    }
  }

  combined.sort((a, b) => a.sha256.localeCompare(b.sha256));

  fs.mkdirSync('data', { recursive: true });
  const writeStream = fs.createWriteStream(OUTPUT_CSV, { encoding: 'utf8' });
  writeStream.write('sha256,url\n');
  for (const { url, sha256 } of combined) {
    const escaped = url.includes(',') ? `"${url}"` : url;
    writeStream.write(`${sha256},${escaped}\n`);
  }
  writeStream.end();

  const total =
    googleRecords.length +
    microsoftRecords.length +
    cdnjsRecords.length +
    jsdelivrRecords.length +
    npmPopularRecords.length +
    chromiumRecords.length +
    youtubeRecords.length +
    googleMapsRecords.length;
  const uniqueHashes = new Set(combined.map((r) => r.sha256)).size;
  console.log(
    `\nCombined: ${combined.length} rows (${uniqueHashes} unique hashes, from ${total} total) saved to '${OUTPUT_CSV}'.`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
