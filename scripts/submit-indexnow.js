/**
 * Submit sitemap to IndexNow API after production deployment (Netlify postBuild hook)
 */

import https from "https";

const INDEXNOW_KEY = process.env.INDEXNOW_KEY;
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL;

if (!INDEXNOW_KEY) {
  console.error("❌ Missing INDEXNOW_KEY environment variable.");
  process.exit(0);
}

if (!SITE_URL) {
  console.error("❌ Missing SITE_URL (Netlify provides URL automatically).");
  process.exit(0);
}

const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const HOST = new URL(SITE_URL).hostname;

const payload = JSON.stringify({
  host: HOST,
  key: INDEXNOW_KEY,
  keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
  urlList: [SITEMAP_URL]
});

const req = https.request(
  "https://api.indexnow.org/indexnow",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  },
  (res) => {
    console.log(`📬 IndexNow response: ${res.statusCode}`);
    res.on("data", (d) => process.stdout.write(d));
  }
);

req.on("error", (e) => {
  console.error(`❌ IndexNow submission failed: ${e.message}`);
});

req.write(payload);
req.end();
