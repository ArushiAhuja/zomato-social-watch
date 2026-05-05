import gplay from 'google-play-scraper';

const APP_ID = 'com.application.zomato';
const APP_URL = 'https://play.google.com/store/apps/details?id=com.application.zomato';
const TIMEOUT_MS = 15_000; // Play Store scraper is slower than REST APIs

function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

function normalize(review) {
  const text = review.text ?? '';
  return {
    id: `playstore_${review.id}`,
    source: 'playstore',
    author: review.userName ?? 'Anonymous',
    title: text.slice(0, 80),
    body: text,
    url: APP_URL,
    score: review.score ?? 0,
    created_at: new Date(review.date),
    raw: review,
  };
}

export default async function fetchPlayStore() {
  const result = await withTimeout(
    gplay.reviews({
      appId: APP_ID,
      sort: gplay.sort.NEWEST,
      num: 25,
      lang: 'en',
      country: 'in',
    }),
    TIMEOUT_MS
  );

  const list = Array.isArray(result) ? result : (result.data ?? []);
  const posts = list.map(normalize);
  console.log(`[playstore] OK — ${posts.length} posts`);
  return posts;
}
