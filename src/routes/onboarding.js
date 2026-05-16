import { Router } from 'express';
import OpenAI from 'openai';
import { query } from '../db.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Industry keyword → relevant subreddits mapping
const INDUSTRY_SUBREDDITS = {
  aviation:    ['aviation', 'flying', 'india', 'IndianAviation', 'pilottraining', 'ATC'],
  food:        ['india', 'bangalore', 'delhi', 'mumbai', 'FoodIndia', 'IndianFood'],
  fintech:     ['india', 'personalfinance', 'IndiaInvestments', 'startups'],
  ecommerce:   ['india', 'IndiaOnlineShopping', 'startups'],
  edtech:      ['india', 'learnprogramming', 'cscareerquestions', 'IITAdmissions'],
  health:      ['india', 'HealthcareIndia', 'medicine'],
  travel:      ['india', 'travel', 'solotravel'],
  startup:     ['startups', 'india', 'entrepreneur', 'SaaS'],
  default:     ['india', 'startups'],
};

function detectIndustry(description = '', name = '') {
  const text = `${name} ${description}`.toLowerCase();
  if (/aviation|aircraft|pilot|flight|airline|airways|airport/.test(text)) return 'aviation';
  if (/food|restaurant|delivery|zomato|swiggy|eat/.test(text)) return 'food';
  if (/fintech|payment|bank|loan|credit|upi|neobank/.test(text)) return 'fintech';
  if (/ecommerce|shop|store|marketplace|retail/.test(text)) return 'ecommerce';
  if (/edtech|education|learning|course|tutor|school|academy/.test(text)) return 'edtech';
  if (/health|medical|doctor|hospital|pharma|wellness/.test(text)) return 'health';
  if (/travel|hotel|holiday|trip|booking/.test(text)) return 'travel';
  return 'default';
}

function buildFallbackConfig(org) {
  const name = org.name || 'company';
  const nameLC = name.toLowerCase();

  const categories = [
    { name: 'negative mentions',   description: `critical or negative posts about ${name}`, severity: 22, color: '#f87171' },
    { name: 'product complaint',   description: 'direct complaints about products or services', severity: 25, color: '#818cf8' },
    { name: 'safety & quality',    description: 'safety, reliability, or quality concerns', severity: 28, color: '#f87171' },
    { name: 'competitor mention',  description: 'comparisons or attacks involving competitors', severity: 14, color: '#818cf8' },
    { name: 'regulatory / legal',  description: 'compliance, legal, or policy-related issues', severity: 20, color: '#60a5fa' },
    { name: 'positive coverage',   description: 'praise, features, or positive community mentions', severity: 5, color: '#4ade80' },
    { name: 'noise',               description: 'low-signal or irrelevant mentions', severity: 0, color: '#334155' },
  ];

  const industry = detectIndustry(org.description, name);
  const subreddits = INDUSTRY_SUBREDDITS[industry] || INDUSTRY_SUBREDDITS.default;

  const sources = {
    reddit:      { queries: [nameLC, `${nameLC} review`, `${nameLC} complaint`], subreddits },
    hackernews:  { queries: [nameLC, `${nameLC} review`] },
    google_news: { rss_urls: [`https://news.google.com/rss/search?q=${encodeURIComponent(name)}&hl=en-US&gl=US&ceid=US:en`] },
    twitter:     { queries: [`"${nameLC}"`, `#${name.replace(/\s+/g, '')}`] },
    playstore:   { app_ids: [] },
  };

  return { categories, sources };
}

router.post('/:org/onboard', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { rows: orgRows } = await query(
      'SELECT id, name, description, competitors, website FROM organizations WHERE id = $1',
      [req.orgId]
    );
    if (!orgRows.length) return res.status(404).json({ error: 'org not found' });
    const org = orgRows[0];

    const competitorsList = Array.isArray(org.competitors) ? org.competitors.join(', ') : '';
    let aiSucceeded = false;
    let generatedCategories = [];
    let generatedSources = {};

    // Try AI generation
    if (process.env.OPENAI_API_KEY && org.description) {
      const userMessage = `Company: ${org.name}
Website: ${org.website || 'not provided'}
Description: ${org.description}
Competitors: ${competitorsList || 'none'}

Generate a JSON response with this EXACT structure (no markdown, no explanation, raw JSON only):
{
  "categories": [
    {
      "name": "2-3 word name",
      "description": "one sentence describing what this category tracks",
      "severity": 0,
      "color": "#60a5fa"
    }
  ],
  "sources": {
    "reddit": { "queries": ["search term"], "subreddits": ["subreddit"] },
    "hackernews": { "queries": ["search term"] },
    "google_news": { "rss_urls": ["https://news.google.com/rss/search?q=TERM&hl=en-US&gl=US&ceid=US:en"] },
    "twitter": { "queries": ["@handle OR #brand"] },
    "playstore": { "app_ids": [] }
  }
}

Rules:
- Generate 6-8 categories specific to THIS company's risks (not generic)
- severity: integer 0-30 (30 = most critical)
- color: one of #f87171 #818cf8 #4ade80 #60a5fa #9b8ff7 #38bdf8 #c084fc
- For queries: use real search terms people would type when complaining/praising this company
- For subreddits: pick 4-6 specific subreddits where this company's customers/users actually post (NOT r/all). Pick subreddits by name only (no r/ prefix). For aviation: aviation, flying, IndianAviation. For food delivery: india, bangalore. Always include "india" for Indian companies.
- Be specific to the industry (e.g. for aviation: "DGCA violation", "flight delay complaint")`;

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 2048,
          temperature: 0.3,
          messages: [
            { role: 'system', content: 'You are a monitoring expert. Return ONLY valid JSON with no markdown, no explanation.' },
            { role: 'user', content: userMessage },
          ],
        });

        const text = response.choices[0].message.content.trim();
        const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          generatedCategories = parsed.categories;
          generatedSources = parsed.sources || {};
          aiSucceeded = true;
        }
      } catch (err) {
        console.warn('[onboarding] AI failed, using fallback:', err.message);
      }
    }

    // Fallback if AI failed or returned empty
    if (!aiSucceeded) {
      const fallback = buildFallbackConfig(org);
      generatedCategories = fallback.categories;
      generatedSources = fallback.sources;
    }

    // Delete existing categories and insert new ones
    await query('DELETE FROM categories WHERE org_id = $1', [req.orgId]);

    const insertedCategories = [];
    for (const cat of generatedCategories) {
      try {
        const { rows } = await query(
          `INSERT INTO categories (org_id, name, description, severity, color)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [req.orgId, cat.name, cat.description || null,
           typeof cat.severity === 'number' ? Math.min(30, Math.max(0, cat.severity)) : 10,
           cat.color || '#60a5fa']
        );
        insertedCategories.push(rows[0]);
      } catch (e) {
        console.error('[onboarding] category insert error:', e.message);
      }
    }

    // Update source configs with generated queries (merge with existing enabled state)
    const insertedSources = [];
    if (generatedSources && typeof generatedSources === 'object') {
      for (const [source, sourceConfig] of Object.entries(generatedSources)) {
        try {
          const { rows } = await query(
            `INSERT INTO source_configs (org_id, source, enabled, credentials, config)
             VALUES ($1, $2, false, '{}', $3)
             ON CONFLICT (org_id, source) DO UPDATE SET
               config = $3,
               updated_at = NOW()
             RETURNING *`,
            [req.orgId, source, JSON.stringify(sourceConfig || {})]
          );
          insertedSources.push(rows[0]);
        } catch (e) {
          console.error(`[onboarding] source upsert error for ${source}:`, e.message);
        }
      }
    }

    // Mark org as onboarded
    await query('UPDATE organizations SET onboarded = true, updated_at = NOW() WHERE id = $1', [req.orgId]);

    // Restart scheduler job for this org (it's now onboarded)
    try {
      const { startOrgJob } = await import('../scheduler.js');
      startOrgJob(req.orgId);
    } catch (e) {
      // scheduler import may fail if not initialized yet — ok
    }

    res.json({
      categories: insertedCategories,
      sources: insertedSources,
      ai_generated: aiSucceeded,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
