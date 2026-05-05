import { Buffer } from 'buffer';

const TIMEOUT_MS = 10_000;
const SEARCH_QUERY = 'zomato -is:retweet lang:en';
const MAX_RESULTS = '10'; // free tier safe; bump to 100 on Basic tier

let cachedBearerToken = null;

function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function getBearerToken() {
  if (cachedBearerToken) return cachedBearerToken;

  // Prefer a pre-issued bearer token from the developer portal
  const direct = process.env.TWITTER_BEARER_TOKEN?.trim();
  if (direct) {
    cachedBearerToken = direct;
    return direct;
  }

  // Derive bearer token from consumer key + secret (OAuth2 app-only flow)
  const apiKey = process.env.TWITTER_API_KEY?.trim();
  const apiSecret = process.env.TWITTER_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;

  const credentials = Buffer.from(
    `${encodeURIComponent(apiKey)}:${encodeURIComponent(apiSecret)}`
  ).toString('base64');

  const res = await timedFetch('https://api.twitter.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twitter bearer token fetch failed HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error('Twitter OAuth2: no access_token in response');

  cachedBearerToken = data.access_token;
  return cachedBearerToken;
}

function normalize(tweet, usersById) {
  const user = usersById[tweet.author_id];
  const metrics = tweet.public_metrics ?? {};
  const text = tweet.text ?? '';

  return {
    id: `twitter_${tweet.id}`,
    source: 'twitter',
    author: user?.username ? `@${user.username}` : tweet.author_id,
    title: text.length > 120 ? text.slice(0, 120) + '…' : text,
    body: text,
    url: `https://twitter.com/i/web/status/${tweet.id}`,
    score: (metrics.like_count ?? 0) + (metrics.retweet_count ?? 0) * 2,
    created_at: new Date(tweet.created_at),
    raw: tweet,
  };
}

export default async function fetchTwitter() {
  let token;
  try {
    token = await getBearerToken();
  } catch (err) {
    console.error(`[twitter] Auth failed: ${err.message}`);
    return [];
  }

  if (!token) {
    console.warn('[twitter] Skipped — set TWITTER_BEARER_TOKEN or TWITTER_API_KEY + TWITTER_API_SECRET');
    return [];
  }

  const params = new URLSearchParams({
    query: SEARCH_QUERY,
    max_results: MAX_RESULTS,
    'tweet.fields': 'created_at,author_id,public_metrics',
    expansions: 'author_id',
    'user.fields': 'name,username',
  });

  const res = await timedFetch(
    `https://api.twitter.com/2/tweets/search/recent?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 429) {
    const reset = res.headers.get('x-rate-limit-reset');
    const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : 'unknown';
    console.warn(`[twitter] Rate limited — resets at ${resetAt}`);
    return [];
  }

  if (res.status === 401) {
    console.warn('[twitter] 401 Unauthorized — bearer token invalid or expired. Regenerate it at developer.twitter.com → your app → Keys and Tokens → Bearer Token → Regenerate.');
    return [];
  }

  if (res.status === 403) {
    console.warn('[twitter] 403 Forbidden — your X API plan does not include search. Basic tier ($100/mo) required for /2/tweets/search/recent.');
    return [];
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`[twitter] HTTP ${res.status} — skipping: ${text.slice(0, 200)}`);
    return [];
  }

  const json = await res.json();
  const tweets = json.data ?? [];

  if (!tweets.length) {
    console.log('[twitter] OK — 0 tweets (no results or no new activity)');
    return [];
  }

  const usersById = Object.fromEntries(
    (json.includes?.users ?? []).map((u) => [u.id, u])
  );

  const posts = tweets.map((t) => normalize(t, usersById));
  console.log(`[twitter] OK — ${posts.length} tweets`);
  return posts;
}
