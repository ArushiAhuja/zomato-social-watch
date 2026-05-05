// Centralised env validation — import this before anything else in server.js.
// Hard-fails on missing required vars so the server never starts in a broken state.

const REQUIRED = [];

const OPTIONAL_WARN = [
  { key: 'GMAIL_USER',               note: 'email alerts disabled' },
  { key: 'GMAIL_APP_PASSWORD',       note: 'email alerts disabled' },
  { key: 'ALERT_EMAIL',              note: 'email alerts disabled' },
];

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());

  if (missing.length) {
    console.error('\n✖  Missing required environment variables:\n');
    missing.forEach((k) => console.error(`   • ${k}`));
    console.error('\nCopy .env.example to .env and fill in the values, then restart.\n');
    process.exit(1);
  }

  const missingOptional = OPTIONAL_WARN.filter((o) => !process.env[o.key]?.trim());
  if (missingOptional.length) {
    const notes = [...new Set(missingOptional.map((o) => o.note))];
    console.warn(`[env] Warning: ${notes.join(', ')} (set GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAIL to enable)`);
  }

  if (!process.env.GOOGLE_SHEET_ID?.trim()) {
    console.warn('[env] Warning: GOOGLE_SHEET_ID not set — sheet logging disabled');
  }

  // OpenAI (optional — classifier skips AI and uses defaults if absent)
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn('[env] OPENAI_API_KEY not set — AI classification disabled. Posts will be served unscored (category: NOISE, score: 0).');
  }

  // Reddit OAuth (optional — falls back to public API if absent)
  const hasRedditOAuth = process.env.REDDIT_CLIENT_ID?.trim() && process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!hasRedditOAuth) {
    console.warn('[env] REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set — using public Reddit API (lower rate limits)');
  }

  // Twitter (optional — fetcher silently skips if absent)
  const hasTwitter =
    process.env.TWITTER_BEARER_TOKEN?.trim() ||
    (process.env.TWITTER_API_KEY?.trim() && process.env.TWITTER_API_SECRET?.trim());
  if (!hasTwitter) {
    console.warn('[env] Twitter credentials not set — Twitter fetcher disabled (set TWITTER_BEARER_TOKEN or TWITTER_API_KEY + TWITTER_API_SECRET)');
  }

  // RSS extra feeds (optional)
  if (process.env.RSS_FEEDS?.trim()) {
    const count = process.env.RSS_FEEDS.split(',').filter((u) => u.trim()).length;
    console.log(`[env] RSS_FEEDS: ${count} extra feed(s) configured`);
  }

  if (process.env.DRY_RUN === 'true') {
    console.warn('[env] DRY_RUN=true — no emails or sheets will actually be sent');
  }
}
