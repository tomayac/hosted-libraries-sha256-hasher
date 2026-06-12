// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import fs from 'fs';

const TARGET_URL = 'https://developers.google.com/speed/libraries';
const OUTPUT_CSV = 'google_hosted_libraries_hashes.csv';

/**
 * Downloads a URL and calculates its SHA-256 hash in lowercase hexadecimal mode.
 * Returns null if the URL fails, timeouts, or returns a non-200 status.
 */
async function getSha256(url) {
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      timeout: 6000 // 6 second timeout
    });

    if (response.status !== 200) return null;

    return new Promise((resolve) => {
      const hash = crypto.createHash('sha256');
      response.data.on('data', (chunk) => hash.update(chunk));
      response.data.on('end', () => resolve(hash.digest('hex')));
      response.data.on('error', () => resolve(null));
    });
  } catch (error) {
    return null;
  }
}

/**
 * Returns an array of smart fallback URLs based on known historical naming changes.
 */
function getFallbackUrls(libName, version, scriptFilename) {
  const fallbacks = [];

  // Fallback 1: Indefinite Observable legacy naming (.bundle.js -> .js)
  if (libName === 'indefinite-observable' && scriptFilename.endsWith('.bundle.js')) {
    fallbacks.push(`https://ajax.googleapis.com/ajax/libs/${libName}/${version}/indefinite-observable.js`);
  }

  // Fallback 2: MooTools legacy naming (.min.js -> -yui-compressed.js)
  if (libName === 'mootools' && scriptFilename === 'mootools.min.js') {
    fallbacks.push(`https://ajax.googleapis.com/ajax/libs/${libName}/${version}/mootools-yui-compressed.js`);
  }

  // Fallback 3: General generic fallback from minified to standard unminified code
  if (scriptFilename.includes('.min.js')) {
    const unminified = scriptFilename.replace('.min.js', '.js');
    fallbacks.push(`https://ajax.googleapis.com/ajax/libs/${libName}/${version}/${unminified}`);
  }

  return fallbacks;
}

/**
 * Main scraper and pipeline function
 */
async function extractLibrariesAndHashes() {
  console.log(`Fetching page data from ${TARGET_URL}...`);
  
  try {
    const { data } = await axios.get(TARGET_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    const $ = cheerio.load(data);
    const candidateConfigs = [];

    // Loop through every library header block
    $('h3[id]').each((_, element) => {
      const libId = $(element).attr('id');
      if (!libId) return;

      let libName = libId.trim();
      let scriptFilename = null;
      const versions = new Set();

      let sibling = $(element).next();
      while (sibling.length && sibling[0].name !== 'h3') {
        const text = sibling.text();

        // 1. Extract true folder and true full filename suffix from the snippet text
        if (sibling[0].name === 'pre' || sibling.find('code').length) {
          const match = text.match(/https:\/\/ajax\.googleapis\.com\/ajax\/libs\/([^/]+)\/[^/'"\s]+\/([^'"\s>]+)/);
          if (match) {
            libName = match[1];
            scriptFilename = match[2];
          }
        }

        // 2. Extract version numbers anywhere they appear inside the text blocks
        if (text.toLowerCase().includes('version') || ['ul', 'ol', 'p', 'table'].includes(sibling[0].name)) {
          const foundVersions = text.match(/\b\d+\.\d+(?:\.\d+)?(?:[-\w.]+)?\b/g);
          if (foundVersions) {
            foundVersions.forEach(v => {
              versions.add(v.replace(/\.+$/, ''));
            });
          }
        }

        sibling = sibling.next();
      }

      if (!scriptFilename) {
        scriptFilename = `${libName}.js`;
      }

      if (versions.size > 0) {
        versions.forEach(version => {
          candidateConfigs.push({ libName, version, scriptFilename });
        });
      }
    });

    const totalItems = candidateConfigs.length;
    console.log(`\nGenerated ${totalItems} configuration routes. Starting validation and adaptive hashing...`);

    const writeStream = fs.createWriteStream(OUTPUT_CSV, { encoding: 'utf8' });
    writeStream.write('url,sha256\n');

    let validCount = 0;

    for (let i = 0; i < totalItems; i++) {
      const { libName, version, scriptFilename } = candidateConfigs[i];
      const primaryUrl = `https://ajax.googleapis.com/ajax/libs/${libName}/${version}/${scriptFilename}`;
      
      // Step A: Attempt primary URL parsed from the snippet
      let sha256 = await getSha256(primaryUrl);
      let finalUrl = primaryUrl;

      // Step B: If 404, run adaptive check through matching historical fallback schemes
      if (!sha256) {
        const fallbackUrls = getFallbackUrls(libName, version, scriptFilename);
        for (const fallbackUrl of fallbackUrls) {
          sha256 = await getSha256(fallbackUrl);
          if (sha256) {
            finalUrl = fallbackUrl;
            break; // Found working legacy file name! Stop searching.
          }
        }
      }

      // Step C: If any variant worked, write to CSV, otherwise cleanly ignore it
      if (sha256) {
        validCount++;
        console.log(`[${i + 1}/${totalItems}] VALID: ${finalUrl}`);
        const escapedUrl = finalUrl.includes(',') ? `"${finalUrl}"` : finalUrl;
        writeStream.write(`${escapedUrl},${sha256}\n`);
      } else {
        console.log(`[${i + 1}/${totalItems}] OMITTED (Verified 404): ${primaryUrl}`);
      }
    }

    writeStream.end();
    console.log(`\nSuccess! Saved ${validCount} fully validated clean records to '${OUTPUT_CSV}'.`);

  } catch (error) {
    console.error(`Fatal execution error: ${error.message}`);
  }
}

extractLibrariesAndHashes();