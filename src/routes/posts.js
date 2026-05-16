import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { refreshOrg } from '../scheduler.js';

const router = Router();

// GET /api/orgs/:org/posts
router.get('/:org/posts', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const {
      source,
      category_id,
      escalated,
      reviewed,
      search,
      page = '1',
      limit = '50',
    } = req.query;

    const conditions = ['p.org_id = $1'];
    const values = [req.orgId];
    let idx = 2;

    if (source) {
      conditions.push(`p.source = $${idx++}`);
      values.push(source);
    }
    if (category_id) {
      conditions.push(`p.category_id = $${idx++}`);
      values.push(category_id);
    }
    if (escalated !== undefined) {
      conditions.push(`p.escalated = $${idx++}`);
      values.push(escalated === 'true');
    }
    if (reviewed !== undefined) {
      conditions.push(`p.reviewed = $${idx++}`);
      values.push(reviewed === 'true');
    }
    if (search) {
      conditions.push(`(p.title ILIKE $${idx} OR p.body ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const where = conditions.join(' AND ');
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM posts p WHERE ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const { rows } = await query(
      `SELECT
         p.id, p.source, p.external_id, p.title, p.body, p.author, p.url,
         p.raw_engagement, p.escalation_score, p.category_id,
         c.name as category_name, c.color as category_color,
         p.sentiment_intensity, p.reasoning, p.escalated, p.reviewed,
         p.fetched_at, p.post_created_at
       FROM posts p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where}
       ORDER BY p.fetched_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limitNum, offset]
    );

    res.json({
      posts: rows,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orgs/:org/posts/:id
router.patch('/:org/posts/:id', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: existing } = await query(
      'SELECT id FROM posts WHERE id = $1 AND org_id = $2',
      [id, req.orgId]
    );
    if (!existing.length) return res.status(404).json({ error: 'post not found' });

    const { reviewed } = req.body;
    if (reviewed === undefined) {
      return res.status(400).json({ error: 'reviewed field is required' });
    }

    const { rows } = await query(
      'UPDATE posts SET reviewed = $1 WHERE id = $2 RETURNING *',
      [reviewed, id]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/orgs/:org/status
router.get('/:org/status', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    // Last refresh log
    const { rows: logs } = await query(
      `SELECT started_at, completed_at, status, posts_fetched, posts_escalated
       FROM refresh_logs
       WHERE org_id = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [req.orgId]
    );

    // Total counts
    const { rows: counts } = await query(
      `SELECT
         COUNT(*) as total_fetched,
         COUNT(*) FILTER (WHERE escalated = true) as total_escalated
       FROM posts
       WHERE org_id = $1`,
      [req.orgId]
    );

    // Source breakdown
    const { rows: breakdown } = await query(
      `SELECT source, COUNT(*) as count
       FROM posts
       WHERE org_id = $1
       GROUP BY source`,
      [req.orgId]
    );

    // Active sources count
    const { rows: activeSources } = await query(
      `SELECT COUNT(*) as count FROM source_configs
       WHERE org_id = $1 AND enabled = true`,
      [req.orgId]
    );

    const sourceBreakdown = {};
    for (const row of breakdown) {
      sourceBreakdown[row.source] = parseInt(row.count, 10);
    }

    const lastLog = logs[0];
    res.json({
      lastRefresh: lastLog?.completed_at ?? lastLog?.started_at ?? null,
      totalFetched: parseInt(counts[0].total_fetched, 10),
      totalEscalated: parseInt(counts[0].total_escalated, 10),
      sourceBreakdown,
      activeSources: parseInt(activeSources[0].count, 10),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/orgs/:org/refresh
router.post('/:org/refresh', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    refreshOrg(req.orgId).catch((err) =>
      console.error(`[refresh] manual trigger failed for org ${req.orgId}:`, err.message)
    );
    res.json({ message: 'refresh triggered' });
  } catch (err) {
    next(err);
  }
});

export default router;
