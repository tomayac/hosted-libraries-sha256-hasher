// Copyright 2026 Google LLC
// SPDX-License-Identifier: MPL-2.0

import axios from 'axios';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Hand-curated AI model source for the Public Hash List's optional model-hub
// section. Unlike the other sources, inclusion here is NOT gated on an objective
// cross-origin popularity signal: model weights are COS's headline use case yet a
// given build may be used on only a handful of sites, so it would never clear a
// popularity threshold. Eligibility is instead "published on a recognized public
// model hub." The hub is currently the Hugging Face Hub because it is today's
// de facto central hub for openly published models; the design is hub-agnostic,
// and additional hubs can be wired up the same way if the ecosystem shifts.
//
// User agents SHOULD include this section but MAY omit it (see README / design
// doc). It is emitted as a separate section in public-hash-list.dat.
//
// SHA-256 resolution: Hugging Face stores large files via Git LFS. The /raw/
// endpoint returns the tiny LFS pointer file rather than the actual bytes:
//   version https://git-lfs.github.com/spec/v1
//   oid sha256:<64-char hex>
//   size <bytes>
// Swapping /resolve/ → /raw/ in the download URL fetches this pointer (~100 B)
// and the oid IS the SHA-256 of the real file — no downloading GBs of weights.
//
// API: https://huggingface.co/api
//   /models?sort=downloads&limit=N        — most-downloaded models
//   /models/:id                           — model metadata incl. file siblings
// Pointer: https://huggingface.co/:id/raw/:rev/:file   (replaces /resolve/)

export const OUTPUT_CSV = 'data/huggingface-hashes.csv';
const HF_API = 'https://huggingface.co/api';
const HF_HOST = 'https://huggingface.co';
const TOP_N = 100;
const REVISION = 'main';
const UA =
  'public-hash-list (https://github.com/tomayac/public-hash-list)';
// Large, byte-identical weight/asset formats worth deduplicating via COS.
const HASHABLE = /\.(safetensors|bin|gguf|onnx|tflite|task|pt|npz|model)$/i;

async function getTopModels() {
  const { data } = await axios.get(`${HF_API}/models`, {
    params: { sort: 'downloads', direction: -1, limit: TOP_N },
    headers: { 'User-Agent': UA },
    timeout: 8000,
  });
  return data.map((m) => m.modelId || m.id).filter(Boolean);
}

async function getModelFiles(id) {
  try {
    const { data } = await axios.get(
      `${HF_API}/models/${id}`,
      { headers: { 'User-Agent': UA }, timeout: 8000 }
    );
    return (data.siblings || [])
      .map((s) => s.rfilename)
      .filter((f) => f && HASHABLE.test(f));
  } catch {
    return [];
  }
}

// Fetch the Git LFS pointer for a /resolve/ URL and extract its SHA-256.
// The pointer is a ~100-byte text file — no model weights are downloaded.
async function lfsHash(resolveUrl) {
  const rawUrl = resolveUrl.replace('/resolve/', '/raw/');
  try {
    const { data } = await axios.get(rawUrl, {
      headers: { 'User-Agent': UA },
      timeout: 8000,
      responseType: 'text',
    });
    const m = data.match(/^oid sha256:([0-9a-f]{64})$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function run() {
  console.log(`[huggingface] Fetching top ${TOP_N} models by downloads...`);
  let models;
  try {
    models = await getTopModels();
  } catch (err) {
    console.log(`[huggingface] SKIP: hub unreachable (${err.message}).`);
    return [];
  }

  const records = [];
  for (let i = 0; i < models.length; i++) {
    const id = models[i];
    const files = await getModelFiles(id);
    if (!files.length) {
      console.log(`[huggingface] SKIP ${id}: no hashable weight files`);
      continue;
    }
    for (const file of files) {
      const url = `${HF_HOST}/${id}/resolve/${REVISION}/${file}`;
      const sha256 = await lfsHash(url);
      if (sha256) {
        records.push({ url, sha256 });
        console.log(`[huggingface] [${i + 1}/${models.length}] VALID: ${url}`);
      } else {
        console.log(`[huggingface] [${i + 1}/${models.length}] OMITTED: ${url}`);
      }
    }
  }

  records.sort((a, b) => a.sha256.localeCompare(b.sha256));
  fs.mkdirSync('data', { recursive: true });
  const writeStream = fs.createWriteStream(OUTPUT_CSV, { encoding: 'utf8' });
  writeStream.write('sha256,url\n');
  for (const { url, sha256 } of records) {
    writeStream.write(`${sha256},${url}\n`);
  }
  writeStream.end();
  console.log(`[huggingface] Saved ${records.length} records to '${OUTPUT_CSV}'.`);
  return records;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
