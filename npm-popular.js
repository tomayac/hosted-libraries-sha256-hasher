// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getSha256 } from './shared.js';

export const OUTPUT_CSV = 'npm-popular-hashes.csv';
const CDNJS_API = 'https://api.cdnjs.com/libraries';
const NPM_DOWNLOADS_API = 'https://api.npmjs.org/downloads/point/last-month';
const CDNJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const TOP_N = 100;
const NPM_BATCH = 100;
const HASHABLE = /\.(js|css)$/i;

async function getCdnjsNames() {
  const { data } = await axios.get(`${CDNJS_API}?fields=name&limit=1000`);
  return data.results.map(p => p.name);
}

async function getNpmDownloads(names) {
  const downloads = {};
  for (let i = 0; i < names.length; i += NPM_BATCH) {
    const batch = names.slice(i, i + NPM_BATCH);
    try {
      const { data } = await axios.get(`${NPM_DOWNLOADS_API}/${batch.join(',')}`);
      for (const [name, info] of Object.entries(data)) {
        if (info?.downloads) downloads[name] = info.downloads;
      }
    } catch {
      // batch failed — skip silently (package may not exist on npm)
    }
  }
  return downloads;
}

async function getCdnjsFiles(name) {
  const { data: lib } = await axios.get(`${CDNJS_API}/${name}?fields=version`);
  const version = lib.version;
  const { data: ver } = await axios.get(`${CDNJS_API}/${name}/${version}?fields=files`);
  const files = (ver.files ?? []).filter(f => HASHABLE.test(f));
  return { version, files };
}

export async function run() {
  console.log('[npm-popular] Fetching top 1000 cdnjs package names...');
  const names = await getCdnjsNames();

  console.log(`[npm-popular] Querying npm download counts for ${names.length} packages...`);
  const downloads = await getNpmDownloads(names);

  const ranked = Object.entries(downloads)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);

  console.log(`[npm-popular] Top ${TOP_N} by npm downloads (last month):`);
  ranked.forEach(([name, count], i) =>
    console.log(`  ${String(i + 1).padStart(3)}. ${name}: ${count.toLocaleString()}`)
  );

  const records = [];
  const writeStream = fs.createWriteStream(OUTPUT_CSV, { encoding: 'utf8' });
  writeStream.write('url,sha256\n');

  let urlIndex = 0;
  for (const [name] of ranked) {
    let version, files;
    try {
      ({ version, files } = await getCdnjsFiles(name));
    } catch {
      console.log(`[npm-popular] SKIP ${name}: not found on cdnjs`);
      continue;
    }

    if (!files.length) {
      console.log(`[npm-popular] SKIP ${name}@${version}: no hashable files`);
      continue;
    }

    for (const file of files) {
      const url = `${CDNJS_CDN}/${name}/${version}/${file}`;
      urlIndex++;
      const sha256 = await getSha256(url);
      if (sha256) {
        records.push({ url, sha256 });
        console.log(`[npm-popular] VALID: ${url}`);
        writeStream.write(`${url},${sha256}\n`);
      } else {
        console.log(`[npm-popular] OMITTED: ${url}`);
      }
    }
  }

  writeStream.end();
  console.log(`[npm-popular] Saved ${records.length} records to '${OUTPUT_CSV}'.`);
  return records;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(err => { console.error(err.message); process.exit(1); });
}
