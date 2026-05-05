# Zomato Social Watch
**Arushi Ahuja · Masters' Union · May 2026**

---

## What It Does

A real-time social monitoring dashboard that watches Reddit, Hacker News, Google News, the Play Store, and Twitter for Zomato mentions — classifies each post with GPT-4o-mini, scores it 0–100, and automatically fires alerts and logs for anything that matters.

Built in about a day. No frameworks, no databases, no deployment complexity. You run it with `npm start` and open a browser.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 18, ES modules | Native fetch, no extra HTTP libs needed |
| Server | Express | Minimal, well-understood |
| AI classification | GPT-4o-mini | Fast, cheap per token, reliable JSON output |
| Frontend | Vanilla HTML/CSS/JS | No build step, opens in any browser, easy to demo |
| Reddit | Public `.json` API, 7 subreddits in parallel | No auth needed, covers r/india, r/Zomato, r/LegalAdviceIndia etc. |
| News/RSS | Google News RSS × 3 queries | India, US, and founder-specific feeds |
| Play Store | `google-play-scraper` | Captures app store sentiment |
| Email | Nodemailer → Gmail SMTP | Works with any Google Workspace account |
| Sheets | Google Sheets API v4, service account | Full audit trail, shareable with the team |
| Twitter | X API v2 bearer token | Wired, pending tier upgrade for search access |

Live stats from this session: **416 posts fetched, 5 sources, 3 real write operations per escalated post.**

---

## Architecture

```
Every 5 minutes:
  Fetch → 7 Reddit endpoints + HN + 3 RSS feeds + Play Store (parallel, 10s timeout)
  Dedup  → seen-IDs set, never classify the same post twice
  Classify → GPT-4o-mini in batches of 5, structured JSON output
  Score  → deterministic rubric (no AI in the scoring math)
  Act    → score ≥ 50: Gmail alert + Sheets row; all posts: Sheets row
  Serve  → GET /api/posts, dashboard polls every 30s
```

The classify and score steps are intentionally separate. AI decides what a post is about. A deterministic formula decides whether it's urgent. That way the threshold is auditable and adjustable without retraining anything.

---

## Connectors (Live Read/Write)

1. **Reddit** — 7 parallel read endpoints, no auth, `User-Agent` header per Reddit policy
2. **Google News RSS** — 3 live feed queries (India, US, Deepinder Goyal / Blinkit)
3. **Gmail** — real emails sent via SMTP on escalation (tested and verified)
4. **Google Sheets** — appends a row for every classified post via service account
5. **Hacker News** — Algolia search API, sorted by date
6. **Play Store** — live app review scraping

That's 4 live read sources and 2 live write destinations. Minimum was 3.

---

## Scoring Note

**Categories.** I defined eight: DELIVERY_COMPLAINT, FOOD_SAFETY, FOUNDER_MENTION, VIRAL_NEGATIVE, COMPETITOR_ATTACK, PR_OPPORTUNITY, POLICY_REGULATORY, NOISE. These map to actual response workflows, not just sentiment buckets. A FOOD_SAFETY post goes to a different team than a COMPETITOR_ATTACK post. PR_OPPORTUNITY is deliberately included — missing a positive viral moment is also a failure.

**Escalation rubric.** Score = engagement (0–30, log-scaled) + recency (20 if <1h, 10 if <6h, 0 otherwise) + category severity (0–30) + AI sentiment intensity (0–20). Threshold: 50. Engagement is log-scaled so a post with 10,000 upvotes doesn't completely bury everything else. Category severity weights are: FOOD_SAFETY 30, VIRAL_NEGATIVE 25, FOUNDER_MENTION and POLICY_REGULATORY 20, DELIVERY_COMPLAINT and COMPETITOR_ATTACK 15, PR_OPPORTUNITY 10. The threshold is a single `.env` variable — no code change to tune it.

**What I excluded and why.** Comments and reply threads — the signal-to-noise ratio is too low to justify the scraping cost, and a top-level post getting 50 upvotes is already a sufficient proxy for thread sentiment. Follower count and verified status — irrelevant on Reddit and HN, and an anonymous post that resonates goes viral regardless of who wrote it. Sentiment polarity as a standalone field — the category already encodes negativity, so adding a separate positive/negative label would double-count. Historical data beyond one day — this is a real-time alert tool, not an analytics platform; older posts have already been actioned or ignored by the time they'd appear.

---

## Design Choices Worth Defending

**Why not a database?** This is a monitoring tool, not a record system. In-memory is faster to query, easier to reason about, and perfectly sufficient for a 5-minute refresh window. If Zomato's team wanted 30 days of history, they already have it in the Sheets log.

**Why GPT-4o-mini and not a larger model?** 325 posts classify in ~70 seconds at negligible cost. A bigger model would take longer and cost more for the same structured output. The rubric handles severity — the AI just needs to get the category right.

**Why these subreddits?** r/india, r/Zomato, r/LegalAdviceIndia, r/delhi, r/mumbai, r/bangalore, r/IndiaInvestments. These are where real Zomato complaints actually land — not r/food, not r/FoodDelivery. LegalAdviceIndia is particularly important: when someone posts there instead of r/Zomato, they've stopped venting and started preparing a consumer court filing.

**Why a dashboard at all?** An email-only system trains people to ignore alerts. The dashboard gives the on-call social person a full picture — they can see the score, the reasoning, and the source before deciding whether to act. The "Mark Reviewed" button means the feed stays clean across a shift.
