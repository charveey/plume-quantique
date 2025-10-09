import type { Context } from "@netlify/functions";
import 'dotenv/config'; // Load .env automatically in local testing

export default async (req: Request, context: Context) => {
  const INDEXNOW_KEY = process.env.INDEXNOW_KEY;
  const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL;

  if (!INDEXNOW_KEY) {
    return new Response("❌ Missing INDEXNOW_KEY environment variable.", { status: 400 });
  }

  if (!SITE_URL) {
    return new Response(
      "❌ Cannot determine SITE_URL. Set SITE_URL in your .env for local testing.",
      { status: 400 }
    );
  }

  const sitemapUrl = `${SITE_URL}/sitemap.xml`;
  const host = new URL(SITE_URL).hostname;

  const payload = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: [sitemapUrl]
  };

  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    return new Response(`📬 IndexNow response: ${response.status}\n${text}`, {
      status: response.status
    });
  } catch (err: any) {
    return new Response(`❌ IndexNow submission failed: ${err.message}`, { status: 500 });
  }
};
