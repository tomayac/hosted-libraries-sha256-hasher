// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import { run as runCdnjs } from './cdnjs.js';
import { run as runGoogle } from './google-hosted-libraries.js';
import { run as runMicrosoft } from './microsoft-ajax.js';
import { run as runNpmPopular } from './npm-popular.js';

const OUTPUT_CSV = 'combined-hashes.csv';

async function main() {
  const [googleRecords, microsoftRecords, cdnjsRecords, npmPopularRecords] = await Promise.all([
    runGoogle(),
    runMicrosoft(),
    runCdnjs(),
    runNpmPopular(),
  ]);

  // Deduplicate by SHA-256 hash — same content served from multiple CDNs counts once
  const seen = new Set();
  const combined = [];
  for (const record of [...googleRecords, ...microsoftRecords, ...cdnjsRecords, ...npmPopularRecords]) {
    if (!seen.has(record.sha256)) {
      seen.add(record.sha256);
      combined.push(record);
    }
  }

  const writeStream = fs.createWriteStream(OUTPUT_CSV, { encoding: 'utf8' });
  writeStream.write('url,sha256\n');
  for (const { url, sha256 } of combined) {
    const escaped = url.includes(',') ? `"${url}"` : url;
    writeStream.write(`${escaped},${sha256}\n`);
  }
  writeStream.end();

  const total = googleRecords.length + microsoftRecords.length + cdnjsRecords.length + npmPopularRecords.length;
  console.log(`\nCombined: ${combined.length} unique records (from ${total} total) saved to '${OUTPUT_CSV}'.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
