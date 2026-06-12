// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import { run as runGoogle } from './google-hosted-libraries.js';
import { run as runMicrosoft } from './microsoft-ajax.js';

const MASTER_CSV = 'all-hashes.csv';

async function main() {
  const [googleRecords, microsoftRecords] = await Promise.all([
    runGoogle(),
    runMicrosoft(),
  ]);

  // Deduplicate by URL across all CDNs, preserving first-seen order
  const seen = new Set();
  const merged = [];
  for (const record of [...googleRecords, ...microsoftRecords]) {
    if (!seen.has(record.url)) {
      seen.add(record.url);
      merged.push(record);
    }
  }

  const writeStream = fs.createWriteStream(MASTER_CSV, { encoding: 'utf8' });
  writeStream.write('url,sha256\n');
  for (const { url, sha256 } of merged) {
    const escaped = url.includes(',') ? `"${url}"` : url;
    writeStream.write(`${escaped},${sha256}\n`);
  }
  writeStream.end();

  console.log(`\nMaster CSV: ${merged.length} deduplicated records saved to '${MASTER_CSV}'.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
