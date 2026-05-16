import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';

const router = Router();

// GET /api/orgs/:org/categories
router.get('/:org/categories', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM categories WHERE org_id = $1 ORDER BY severity DESC',
      [req.orgId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/orgs/:org/categories
router.post('/:org/categories', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { name, description, severity, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { rows } = await query(
      `INSERT INTO categories (org_id, name, description, severity, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.orgId,
        name.trim(),
        description || null,
        typeof severity === 'number' ? severity : 10,
        color || '#6366f1',
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orgs/:org/categories/:id
router.patch('/:org/categories/:id', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify belongs to org
    const { rows: existing } = await query(
      'SELECT id FROM categories WHERE id = $1 AND org_id = $2',
      [id, req.orgId]
    );
    if (!existing.length) return res.status(404).json({ error: 'category not found' });

    const { name, description, severity, color } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (severity !== undefined) { fields.push(`severity = $${idx++}`); values.push(severity); }
    if (color !== undefined) { fields.push(`color = $${idx++}`); values.push(color); }

    if (!fields.length) {
      return res.status(400).json({ error: 'no fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await query(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/orgs/:org/categories/:id
router.delete('/:org/categories/:id', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify belongs to org
    const { rows: existing } = await query(
      'SELECT id FROM categories WHERE id = $1 AND org_id = $2',
      [id, req.orgId]
    );
    if (!existing.length) return res.status(404).json({ error: 'category not found' });

    // Prevent deleting last category
    const { rows: countResult } = await query(
      'SELECT COUNT(*) as cnt FROM categories WHERE org_id = $1',
      [req.orgId]
    );
    if (parseInt(countResult[0].cnt, 10) <= 1) {
      return res.status(400).json({ error: 'cannot delete the last category' });
    }

    await query('DELETE FROM categories WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
