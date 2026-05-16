import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';

const router = Router();
const VALID_ACTION_TYPES = ['email', 'webhook', 'sheets'];

// GET /api/orgs/:org/escalations
router.get('/:org/escalations', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT er.*,
         COALESCE(
           json_agg(c.*) FILTER (WHERE c.id IS NOT NULL),
           '[]'
         ) as category_details
       FROM escalation_rules er
       LEFT JOIN categories c ON c.id = ANY(er.category_ids) AND c.org_id = er.org_id
       WHERE er.org_id = $1
       GROUP BY er.id
       ORDER BY er.created_at DESC`,
      [req.orgId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/orgs/:org/escalations
router.post('/:org/escalations', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { name, category_ids, score_threshold, action_type, config, enabled } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!action_type || !VALID_ACTION_TYPES.includes(action_type)) {
      return res.status(400).json({ error: `action_type must be one of: ${VALID_ACTION_TYPES.join(', ')}` });
    }

    const { rows } = await query(
      `INSERT INTO escalation_rules (org_id, name, category_ids, score_threshold, action_type, config, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.orgId,
        name.trim(),
        Array.isArray(category_ids) ? category_ids : [],
        typeof score_threshold === 'number' ? score_threshold : 60,
        action_type,
        config || {},
        enabled !== undefined ? enabled : true,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orgs/:org/escalations/:id
router.patch('/:org/escalations/:id', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: existing } = await query(
      'SELECT id FROM escalation_rules WHERE id = $1 AND org_id = $2',
      [id, req.orgId]
    );
    if (!existing.length) return res.status(404).json({ error: 'escalation rule not found' });

    const { name, category_ids, score_threshold, action_type, config, enabled } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (category_ids !== undefined) { fields.push(`category_ids = $${idx++}`); values.push(Array.isArray(category_ids) ? category_ids : []); }
    if (score_threshold !== undefined) { fields.push(`score_threshold = $${idx++}`); values.push(score_threshold); }
    if (action_type !== undefined) {
      if (!VALID_ACTION_TYPES.includes(action_type)) {
        return res.status(400).json({ error: `action_type must be one of: ${VALID_ACTION_TYPES.join(', ')}` });
      }
      fields.push(`action_type = $${idx++}`); values.push(action_type);
    }
    if (config !== undefined) { fields.push(`config = $${idx++}`); values.push(config); }
    if (enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(enabled); }

    if (!fields.length) {
      return res.status(400).json({ error: 'no fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await query(
      `UPDATE escalation_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/orgs/:org/escalations/:id
router.delete('/:org/escalations/:id', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: existing } = await query(
      'SELECT id FROM escalation_rules WHERE id = $1 AND org_id = $2',
      [id, req.orgId]
    );
    if (!existing.length) return res.status(404).json({ error: 'escalation rule not found' });

    await query('DELETE FROM escalation_rules WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
