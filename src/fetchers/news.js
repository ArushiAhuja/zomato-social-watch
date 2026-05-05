import { createHash } from 'crypto';
import Parser from 'rss-parser';

const TIMEOUT_MS = 10_000;

// Default RSS feeds — all search specifically for Zomato/related terms, no auth needed.
// Add more via RSS_FEEDS env var (comma-separated URLs).
const DEFAULT_FEEDS = [
  {
    url: 'https://news.google.com/rss/search?q=zomato&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'google_news',
    label: 'Google News IN',
  },
  {
    url: 'https://news.google.com/rss/search?q=zomato+OR+blinkit+food+delivery&hl=en-US&gl=US&ceid=US:en',
    source: 'rss',
    label: 'Google News US',
  },
  {
    url: 'https://news.google.com/rss/search?q=%22Deepinder+Goyal%22+OR+%22blinkit%22&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'rss',
    label: 'Google News Founders',
  },
];

const parser = new Parser({
  customFields: { item: [['dc:creator', 'dcCreator']] },
  requestOptions: { timeout: TIMEOUT_MS },
});

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '').trim();
}

function makeNormalizer(source) {
  return function (item) {
    const url = item.link ?? item.guid ?? '';
    const id = createHash('md5').update(url).digest('hex');
    return {
      id: `${source}_${id}`,
      source,
      author: item.creator ?? item.dcCreator ?? item.author ?? 'Unknown',
      title: item.title ?? '',
      body: stripHtml(item.contentSnippet ?? item.content ?? ''),
      url,
      score: 0,
      created_at: item.pubDate ? new Date(item.pubDate) : new Date(),
      raw: item,
    };
  };
}

async function parseFeed(url, source, label) {
  const feed = await parser.parseURL(url);
  const posts = (feed.items ?? []).map(makeNormalizer(source));
  console.log(`[rss:${label}] OK — ${posts.length} posts`);
  return posts;
}

function getExtraFeeds() {
  const raw = process.env.RSS_FEEDS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url) => {
      let hostname = url;
      try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      return { url, source: 'rss', label: hostname };
    });
}

export default async function fetchNews() {
  const allFeeds = [...DEFAULT_FEEDS, ...getExtraFeeds()];
  const results = [];

  for (const { url, source, label } of allFeeds) {
    try {
      const posts = await parseFeed(url, source, label);
      results.push(...posts);
    } catch (err) {
      console.warn(`[rss:${label}] FAILED: ${err.message}`);
    }
  }

  return results;
}
