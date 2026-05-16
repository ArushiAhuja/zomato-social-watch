const USER_AGENT = 'spill-social-watch/2.0';
const TIMEOUT_MS = 10_000;

function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    ...options,
    headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

function normalize(child) {
  const d = child.data ?? child;
  const ts = d.created_utc ?? 0;
  const permalink = d.permalink
    ? `https://www.reddit.com${d.permalink}`
    : `https://www.reddit.com/r/${d.subreddit}/comments/${d.id}/`;

  return {
    id: `reddit_${d.id}`,
    source: 'reddit',
    author: d.author ?? 'unknown',
    title: d.title ?? '',
    body: d.selftext ?? '',
    url: permalink,
    score: d.score ?? d.ups ?? 0,
    created_at: new Date(ts * 1000),
    raw: d,
  };
}

async function fetchEndpoint(url, headers = {}) {
  const res = await timedFetch(url, { headers });

  if (res.status === 429) {
    console.warn(`[reddit] 429 on ${url} — skipping`);
    return [];
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const json = await res.json();
  return (json?.data?.children ?? []).map(normalize);
}

// Accept { config, credentials } instead of env vars
// config.queries: array of search terms
// config.subreddits: array of subreddit names
// credentials.client_id, credentials.client_secret (optional, falls back to public API)
export async function fetchReddit({ config = {}, credentials = {} } = {}) {
  const queries = Array.isArray(config.queries) && config.queries.length
    ? config.queries
    : ['company'];
  const subreddits = Array.isArray(config.subreddits) ? config.subreddits : [];

  // Build auth headers if credentials provided
  let authHeaders = {};
  if (credentials.client_id && credentials.client_secret) {
    try {
      const tokenRes = await timedFetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          authHeaders = { Authorization: `Bearer ${tokenData.access_token}` };
        }
      }
    } catch (err) {
      console.warn('[reddit] OAuth token fetch failed, using public API:', err.message);
    }
  }

  // Always use global search with at most 3 queries to stay well within Vercel's 10s timeout.
  // Subreddit-scoped search is intentionally skipped — multiplying endpoints causes timeouts.
  const topQueries = queries.slice(0, 3);
  const endpoints = topQueries.map(q =>
    `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=relevance&t=week&limit=50`
  );

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const seen = new Set();
  const posts = [];
  let ok = 0, skipped = 0;

  for (const url of endpoints) {
    try {
      const batch = await fetchEndpoint(url, authHeaders);
      for (const post of batch) {
        if (!seen.has(post.id)) {
          seen.add(post.id);
          posts.push(post);
        }
      }
      ok++;
    } catch (err) {
      console.warn(`[reddit] endpoint failed: ${err.message}`);
      skipped++;
    }
    if (ok + skipped < endpoints.length) await delay(200);
  }

  console.log(`[reddit] OK — ${posts.length} posts (${ok}/${endpoints.length} endpoints)`);
  return posts;
}

export default fetchReddit;
