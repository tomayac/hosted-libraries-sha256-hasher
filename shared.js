// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import crypto from 'crypto';

export async function getSha256(url) {
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      timeout: 6000,
    });

    if (response.status !== 200) return null;

    return new Promise((resolve) => {
      const hash = crypto.createHash('sha256');
      response.data.on('data', (chunk) => hash.update(chunk));
      response.data.on('end', () => resolve(hash.digest('hex')));
      response.data.on('error', () => resolve(null));
    });
  } catch {
    return null;
  }
}
