import { fileURLToPath } from 'url';
import fetchReddit from './reddit.js';
import fetchHackerNews from './hackernews.js';
import fetchGoogleNews from './news.js';
import fetchPlayStore from './playstore.js';
import fetchTwitter from './twitter.js';

export default async function fetchAll() {
  const sources = [
    { name: 'reddit',      fn: fetchReddit },
    { name: 'hackernews',  fn: fetchHackerNews },
    { name: 'google_news', fn: fetchGoogleNews },
    { name: 'playstore',   fn: fetchPlayStore },
    { name: 'twitter',     fn: fetchTwitter },
  ];

  const results = await Promise.allSettled(sources.map((s) => s.fn()));

  const merged = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      merged.push(...result.value);
    } else {
      console.error(`[${sources[i].name}] FAILED: ${result.reason?.message ?? result.reason}`);
    }
  });

  // Deduplicate by url
  const seen = new Set();
  const deduped = merged.filter((post) => {
    if (!post.url || seen.has(post.url)) return false;
    seen.add(post.url);
    return true;
  });

  // Sort newest first
  deduped.sort((a, b) => b.created_at - a.created_at);

  console.log(`\n[index] Total after dedup: ${deduped.length} posts`);
  return deduped;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const posts = await fetchAll();
  console.log('Total posts:', posts.length);
  console.log('\nSample (first 3):');
  posts.slice(0, 3).forEach((p) => {
    console.log(`  [${p.source}] ${p.created_at.toISOString()} | score:${p.score} | ${p.title.slice(0, 70)}`);
    console.log(`    url: ${p.url}`);
  });
}
