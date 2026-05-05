const HN_URL =
  'https://hn.algolia.com/api/v1/search_by_date?query=zomato&tags=story&hitsPerPage=25';

const TIMEOUT_MS = 10_000;

function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

function normalize(story) {
  const url =
    story.url || `https://news.ycombinator.com/item?id=${story.objectID}`;

  return {
    id: `hn_${story.objectID}`,
    source: 'hackernews',
    author: story.author ?? 'unknown',
    title: story.title ?? '',
    body: story.text ?? '',
    url,
    score: story.points ?? 0,
    created_at: new Date(story.created_at),
    raw: story,
  };
}

export default async function fetchHackerNews() {
  const res = await timedFetch(HN_URL, {
    headers: { 'User-Agent': 'zomato-social-watch/1.0' },
  });
  if (!res.ok) throw new Error(`HN Algolia HTTP ${res.status}`);
  const json = await res.json();
  const hits = json.hits ?? [];
  const posts = hits.map(normalize);
  console.log(`[hackernews] OK — ${posts.length} posts`);
  return posts;
}
