const USER_AGENT = 'zomato-social-watch/1.0 by Certain-Lie2741';
const TIMEOUT_MS = 10_000;

// Global search + subreddit-scoped searches (restrict_sr=1 keeps results in that sub)
const ENDPOINTS = [
  'https://www.reddit.com/search.json?q=zomato&sort=new&t=day&limit=100',
  ...['india', 'IndiaInvestments', 'IndianFood', 'delhi', 'mumbai', 'bangalore'].map(
    (sr) =>
      `https://www.reddit.com/r/${sr}/search.json?q=zomato&restrict_sr=1&sort=new&t=day&limit=50`
  ),
];

function timedFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
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

async function fetchEndpoint(url) {
  const res = await timedFetch(url);

  if (res.status === 429) {
    console.warn(`[reddit] 429 on ${url} — skipping`);
    return [];
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const json = await res.json();
  return (json?.data?.children ?? []).map(normalize);
}

export default async function fetchReddit() {
  const results = await Promise.allSettled(ENDPOINTS.map(fetchEndpoint));

  // Merge and dedup by Reddit post ID (same post can appear in global + subreddit search)
  const seen = new Set();
  const posts = [];
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn(`[reddit] endpoint failed: ${result.reason?.message}`);
      continue;
    }
    for (const post of result.value) {
      if (!seen.has(post.id)) {
        seen.add(post.id);
        posts.push(post);
      }
    }
  }

  console.log(`[reddit] OK — ${posts.length} posts (${ENDPOINTS.length} endpoints)`);
  return posts;
}
