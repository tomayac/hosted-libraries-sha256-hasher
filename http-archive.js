// Copyright 2026 Google LLC
// SPDX-License-Identifier: MPL-2.0

// HTTP Archive BigQuery pipeline for the Public Hash List.
//
// The HTTP Archive monthly crawl records SHA-256 hashes of every response body
// via WebPageTest's payload._body_hash field. A maintainer-run BigQuery query
// (queries/http-archive.sql) identifies resources whose hash appears across ≥100
// independent origins — the k-anonymity privacy threshold — and ranks them by a
// traffic-weighted score (see query for the scoring formula).
//
// Unlike the other sources, hashes here are NOT computed by this pipeline:
// they come directly from the HTTP Archive. The ≥100-origins filter already
// applied in the query ensures every entry represents a resource so widespread
// that its presence in a shared cache reveals nothing specific about a user's
// browsing history.
//
// The query results are published as a world-readable Google Sheet:
//   https://docs.google.com/spreadsheets/d/1Cw4wguQ0X4xMqZlTRYlo6OHQaUr7UVYlFZaIQkXK2Jw/edit?usp=sharing
// This pipeline fetches the CSV export of that sheet.

import axios from 'axios';
import fs from 'fs';
import { fileURLToPath } from 'url';

export const OUTPUT_CSV = 'data/http-archive-hashes.csv';
// Published-to-web CSV export of the HTTP Archive query results sheet.
const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTOcTespiVHDRLIq16_3GsnnvJmut00x0fzWTLXSWBNya6Go_1kBrGoVJvxb8gEaP_L9FfKmXy3-kF-/pub?output=csv';

// Minimal RFC 4180 CSV parser. Handles double-quoted fields with escaped quotes.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (ch !== '\r') {
      field += ch;
    }
    i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function run() {
  console.log('[http-archive] Fetching query results from Google Sheets...');
  let csvText;
  try {
    const { data } = await axios.get(SHEET_CSV_URL, {
      responseType: 'text',
      timeout: 30000,
    });
    csvText = data;
  } catch (err) {
    console.log(`[http-archive] SKIP: could not fetch sheet (${err.message}).`);
    return [];
  }

  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    console.log('[http-archive] SKIP: empty or unreadable sheet.');
    return [];
  }

  const header = rows[0].map((h) => h.trim());
  const hashIdx = header.indexOf('body_hash');
  const urlIdx = header.indexOf('sample_url');

  if (hashIdx === -1 || urlIdx === -1) {
    console.log(
      `[http-archive] SKIP: expected columns 'body_hash' and 'sample_url' not found ` +
        `(got: ${header.join(', ')}).`
    );
    return [];
  }

  const records = [];
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sha256 = (row[hashIdx] ?? '').trim().toLowerCase();
    const url = (row[urlIdx] ?? '').trim();
    if (!/^[0-9a-f]{64}$/.test(sha256) || !url) { skipped++; continue; }
    records.push({ sha256, url });
  }

  if (skipped) {
    console.log(`[http-archive] ${skipped} rows skipped (invalid hash or missing URL).`);
  }

  records.sort((a, b) => a.sha256.localeCompare(b.sha256));
  fs.mkdirSync('data', { recursive: true });
  const ws = fs.createWriteStream(OUTPUT_CSV, { encoding: 'utf8' });
  ws.write('sha256,url\n');
  for (const { sha256, url } of records) ws.write(`${sha256},${url}\n`);
  ws.end();
  console.log(`[http-archive] Saved ${records.length} records to '${OUTPUT_CSV}'.`);
  return records;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
