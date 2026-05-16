import { query } from './db.js';
import { fetchAll } from './fetchers/index.js';
import { classifyPosts } from './classifier.js';
import { fireEscalations } from './actions/index.js';

const jobs = new Map(); // orgId → intervalId

export async function initScheduler() {
  // Load all orgs that have at least 1 enabled source
  const { rows: orgs } = await query(`
    SELECT DISTINCT o.id, o.slug FROM organizations o
    JOIN source_configs sc ON sc.org_id = o.id AND sc.enabled = true
    WHERE o.onboarded = true
  `);
  for (const org of orgs) {
    startOrgJob(org.id);
  }
  console.log(`scheduler: started ${orgs.length} org jobs`);
}

export function startOrgJob(orgId, intervalMinutes = null) {
  if (jobs.has(orgId)) return;
  const interval = (intervalMinutes || parseInt(process.env.REFRESH_INTERVAL_MINUTES) || 5) * 60 * 1000;
  // Run immediately then on interval
  runOrgCycle(orgId).catch(err => console.error(`cycle error org ${orgId}:`, err.message));
  const id = setInterval(() => {
    runOrgCycle(orgId).catch(err => console.error(`cycle error org ${orgId}:`, err.message));
  }, interval);
  jobs.set(orgId, id);
}

export function stopOrgJob(orgId) {
  const id = jobs.get(orgId);
  if (id) {
    clearInterval(id);
    jobs.delete(orgId);
  }
}

export async function refreshOrg(orgId) {
  return runOrgCycle(orgId);
}

const SKIP_PREFIXES = new Set(['the', 'a', 'an', 'my', 'our', 'for', 'and', 'by', 'of', 'in', 'at']);

function brandKeyword(orgName) {
  const words = (orgName || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  // Prefer words ≥5 chars first, then fall back to ≥4, so we pick the most distinctive word
  for (const minLen of [5, 4]) {
    for (const w of words) {
      if (w.length >= minLen && !SKIP_PREFIXES.has(w)) return w;
    }
  }
  return null;
}

async function runOrgCycle(orgId) {
  let logId;
  try {
    // Start log
    const { rows: [log] } = await query(
      'INSERT INTO refresh_logs (org_id) VALUES ($1) RETURNING id',
      [orgId]
    );
    logId = log.id;

    // Load org name (for brand relevance filter)
    const { rows: [org] } = await query('SELECT name FROM organizations WHERE id = $1', [orgId]);
    const brand = brandKeyword(org?.name);

    // Load source configs
    const { rows: sourceConfigs } = await query(
      'SELECT source, enabled, credentials, config FROM source_configs WHERE org_id = $1 AND enabled = true',
      [orgId]
    );

    if (!sourceConfigs.length) {
      await query('UPDATE refresh_logs SET status=$1, completed_at=NOW() WHERE id=$2', ['completed', logId]);
      return;
    }

    // Load categories
    const { rows: categories } = await query(
      'SELECT id, name, description, severity, color FROM categories WHERE org_id = $1',
      [orgId]
    );

    // Build org config for fetchers
    const orgConfig = { orgId, sources: {} };
    for (const sc of sourceConfigs) {
      orgConfig.sources[sc.source] = { enabled: true, config: sc.config, credentials: sc.credentials };
    }

    // Fetch posts
    const rawPosts = await fetchAll(orgConfig);

    // Brand relevance filter — drop posts that don't mention the company at all
    const brandFiltered = brand
      ? rawPosts.filter(p => {
          const text = `${p.title || ''} ${p.body || ''}`.toLowerCase();
          return text.includes(brand);
        })
      : rawPosts;

    if (rawPosts.length !== brandFiltered.length) {
      console.log(`[org ${orgId}] brand filter "${brand}": kept ${brandFiltered.length}/${rawPosts.length} posts`);
    }

    // Dedupe by (org_id, source, external_id) against already-seen posts
    const seen = new Set();
    if (brandFiltered.length > 0) {
      const { rows: existing } = await query(
        `SELECT source || '::' || external_id as key FROM posts WHERE org_id = $1`,
        [orgId]
      );
      existing.forEach(r => seen.add(r.key));
    }

    const newPosts = brandFiltered.filter(p => !seen.has(`${p.source}::${p.id}`));

    if (!newPosts.length) {
      await query(
        'UPDATE refresh_logs SET status=$1, completed_at=NOW(), posts_fetched=0 WHERE id=$2',
        ['completed', logId]
      );
      return;
    }

    // Classify
    const classified = categories.length > 0
      ? await classifyPosts(newPosts, categories)
      : newPosts.map(p => ({ ...p, category_id: null, escalation_score: 0, sentiment_intensity: 0, reasoning: 'no categories configured', escalated: false }));

    // Store in DB
    for (const post of classified) {
      try {
        await query(
          `INSERT INTO posts (org_id, source, external_id, title, body, author, url, raw_engagement, escalation_score, category_id, sentiment_intensity, reasoning, escalated, post_created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (org_id, source, external_id) DO NOTHING`,
          [
            orgId, post.source, post.id, post.title, post.body, post.author, post.url,
            post.score || 0, post.escalation_score || 0, post.category_id || null,
            post.sentiment_intensity || 0, post.reasoning || null,
            post.escalated || false, post.created_at || new Date()
          ]
        );
      } catch (e) {
        console.error('post insert error:', e.message);
      }
    }

    const escalated = classified.filter(p => p.escalated);

    // Fire escalation actions
    if (escalated.length > 0) {
      const { rows: rules } = await query(
        'SELECT * FROM escalation_rules WHERE org_id = $1 AND enabled = true',
        [orgId]
      );
      if (rules.length > 0) {
        await fireEscalations(escalated, { orgId, rules, categories });
      }
    }

    // Update log
    await query(
      'UPDATE refresh_logs SET status=$1, completed_at=NOW(), posts_fetched=$2, posts_escalated=$3 WHERE id=$4',
      ['completed', newPosts.length, escalated.length, logId]
    );

    console.log(`[org ${orgId}] cycle done: ${newPosts.length} new, ${escalated.length} escalated`);
  } catch (err) {
    console.error(`[org ${orgId}] cycle failed:`, err.message);
    if (logId) {
      await query(
        'UPDATE refresh_logs SET status=$1, completed_at=NOW(), error=$2 WHERE id=$3',
        ['failed', err.message, logId]
      ).catch(() => {});
    }
  }
}

