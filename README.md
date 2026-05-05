# Zomato Social Watch

A real-time dashboard that monitors Reddit, Hacker News, Google News RSS, the Play Store, and Twitter/X for Zomato mentions — classifies each post with Claude AI, scores 0–100 by escalation priority, and fires email alerts and Google Sheets logs for anything that crosses the threshold.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18.0 | Check with `node --version` |
| npm | ≥ 9.0 | Bundled with Node |
| Anthropic API key | — | **Required.** Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| Gmail App Password | — | Optional. Enables email alerts |
| Google Service Account | — | Optional. Enables Google Sheets logging |
| Twitter API credentials | — | Optional. Enables Twitter/X feed |
| Reddit app credentials | — | Optional. Better Reddit rate limits (falls back to public API) |

---

## Setup

**1. Install dependencies**

```bash
cd zomato-social-watch
npm install
```

**2. Configure environment variables**

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```
ANTHROPIC_API_KEY=sk-ant-...
DRY_RUN=true
```

All other variables are optional for the first run. See `.env.example` for instructions on each one.

**3. Start the server**

```bash
npm start
```

**4. Open the dashboard**

[http://localhost:3001](http://localhost:3001)

The first fetch begins immediately on startup (allow ~60 seconds for classification to finish). The browser auto-polls every 30 seconds.

---

## Available Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the production server |
| `npm run dev` | Start with nodemon (auto-restarts on file change) |
| `npm run test:fetch` | Run all fetchers without starting the server or calling Claude |
| `npm run test:actions` | Dry-run email/sheet actions with a mock post |

---

## Data Sources

All sources run in parallel on every refresh cycle. Each has its own graceful fallback.

| Source | Method | Auth needed? |
|---|---|---|
| Reddit | Public API (arctic-shift fallback) | No — works out of the box |
| Hacker News | Algolia search API | No |
| Google News | RSS search (3 feeds: IN, US, founders/Blinkit) | No |
| Play Store | HTML scraper | No |
| Twitter / X | v2 Recent Search API | Optional — set `TWITTER_BEARER_TOKEN` or `TWITTER_API_KEY` + `TWITTER_API_SECRET` |

**Reddit OAuth (optional):** If you set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (from [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)), the app upgrades to authenticated API calls with higher rate limits. If those are absent, it falls back to the public API automatically.

**Extra RSS feeds:** Set `RSS_FEEDS=https://yourfeed.com/rss,https://another.com/feed` in `.env` to add any additional RSS sources on top of the defaults.

---

## How It Works

```
Every 5 minutes (configurable):
  1. Fetch    → All sources in parallel (10 s timeout each)
  2. Dedup    → Only posts not seen since server start proceed
  3. Classify → Claude AI: category + sentiment intensity (batches of 5)
  4. Score    → engagement + recency + category severity + sentiment (0–100)
  5. Act      → Score ≥ 60: email alert; all posts logged to Sheets
  6. Serve    → GET /api/posts for the dashboard
```

**Score rubric:**
- Engagement (log-scaled upvotes/likes): 0–30 pts
- Recency (<1 h = 20, <6 h = 10, older = 0)
- Category severity (FOOD_SAFETY = 30, VIRAL_NEGATIVE = 25 … NOISE = 0)
- Claude sentiment intensity: 0–20 pts
- Escalate threshold: ≥ 60 (override with `ESCALATE_THRESHOLD`)

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/posts` | All posts, score desc |
| `GET` | `/api/posts/escalations` | Posts with `escalate: true` |
| `GET` | `/api/status` | Last refresh time, totals, source breakdown |
| `POST` | `/api/refresh` | Trigger a manual fetch + classify cycle |

---

## Enabling Email Alerts

1. Enable 2-Step Verification on your Google account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) → create an App Password → copy the 16-character code
3. Set in `.env`:
   ```
   GMAIL_USER=you@gmail.com
   GMAIL_APP_PASSWORD=abcdefghijklmnop
   ALERT_EMAIL=team@yourcompany.com
   DRY_RUN=false
   ```

## Enabling Google Sheets Logging

1. Create a new Google Sheet
2. [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts) → create a service account → create a JSON key → download it
3. Share the Sheet with the service account's email (Editor access)
4. Set in `.env`:
   ```
   GOOGLE_SHEET_ID=<id from the sheet URL>
   GOOGLE_SERVICE_ACCOUNT_JSON=<contents of the JSON file, on one line>
   ```

Columns written: `Timestamp | Source | Category | Score | Escalated | Title | URL | Author | Reasoning`

## Enabling Twitter / X

1. Create an app at [developer.twitter.com](https://developer.twitter.com)
2. Copy the Bearer Token (or the API Key + Secret) from your app's "Keys and Tokens" page
3. Set in `.env`:
   ```
   # Option A — bearer token directly:
   TWITTER_BEARER_TOKEN=AAAA...

   # Option B — key + secret (app derives the bearer token automatically):
   TWITTER_API_KEY=your_consumer_key
   TWITTER_API_SECRET=your_consumer_secret
   ```

Free tier limits: 10 tweets per request, 1 request per 15 min. The fetcher returns an empty result on rate-limit (HTTP 429) rather than crashing.

---

## Troubleshooting

**Server exits immediately with "Missing required environment variables"**
→ Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.

**`npm run test:fetch` returns 0 posts from Reddit**
→ The Arctic Shift API is returning HTTP 400 — the fallback (reddit.com/search.json) kicks in automatically. If both fail, Reddit may be rate-limiting your IP — wait a few minutes and retry.

**All posts classified as NOISE / score always 0**
→ The Claude API is returning errors (likely a bad or missing `ANTHROPIC_API_KEY`). Check the server logs for `Classification failed` messages and verify your key at [console.anthropic.com](https://console.anthropic.com).

**Twitter fetcher logs "Skipped — set TWITTER_BEARER_TOKEN…"**
→ Twitter credentials are not set. This is non-fatal — all other sources still run.

**Email fails with "Invalid login" or "Username and Password not accepted"**
→ Use a Gmail **App Password** (16 chars), not your regular password. 2-Step Verification must be on.

**Google Sheets error: "The caller does not have permission"**
→ Share the Sheet with your service account's email address (Editor access).

**Play Store fetcher returns 0 or errors**
→ `google-play-scraper` scrapes Play Store HTML — Google can block it. Expected intermittently; the other sources are unaffected.

**Dashboard shows "Server unreachable"**
→ The Express server is not running or crashed. Check the terminal for startup errors (`npm start`).

---

## Known Limitations

- **In-memory store** — posts reset on server restart. No database.
- **Twitter free tier** — 1 search per 15 minutes max; only last 7 days of tweets.
- **Play Store scraper** — fragile HTML scraper; can break without notice if Google changes the page.
- **Classification latency** — ~65 seconds for 150 posts (sequential batches to stay within Claude rate limits).
- **Single operator** — no authentication, no multi-user support. Suitable for internal demo use only.
