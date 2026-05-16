import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';

const router = Router();

const ALL_SOURCES = ['reddit', 'hackernews', 'google_news', 'twitter', 'playstore', 'youtube'];

// GET /api/orgs/:org/sources
router.get('/:org/sources', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT source, enabled, credentials, config, updated_at FROM source_configs WHERE org_id = $1',
      [req.orgId]
    );

    const configMap = {};
    for (const row of rows) {
      configMap[row.source] = row;
    }

    const sources = ALL_SOURCES.map((source) => ({
      source,
      enabled: configMap[source]?.enabled ?? false,
      credentials: configMap[source]?.credentials ?? {},
      config: configMap[source]?.config ?? {},
      updated_at: configMap[source]?.updated_at ?? null,
    }));

    res.json(sources);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orgs/:org/sources/:source
router.patch('/:org/sources/:source', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { source } = req.params;

    if (!ALL_SOURCES.includes(source)) {
      return res.status(400).json({ error: `invalid source; must be one of: ${ALL_SOURCES.join(', ')}` });
    }

    const { enabled = false, credentials = {}, config = {} } = req.body;

    const { rows } = await query(
      `INSERT INTO source_configs (org_id, source, enabled, credentials, config)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (org_id, source) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         credentials = EXCLUDED.credentials,
         config = EXCLUDED.config,
         updated_at = NOW()
       RETURNING *`,
      [req.orgId, source, enabled, credentials, config]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
