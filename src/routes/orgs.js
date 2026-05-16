import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';

const router = Router();

// GET /api/orgs — list user's orgs
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.*, COUNT(om2.id) as member_count
       FROM organizations o
       JOIN org_members om ON om.org_id = o.id AND om.user_id = $1
       LEFT JOIN org_members om2 ON om2.org_id = o.id
       GROUP BY o.id ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/orgs — create org
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, slug, website, description, competitors } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'slug is required' });
    }
    const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$|^[a-z0-9]{3}$/;
    if (!slugRegex.test(slug) || slug.length < 3 || slug.length > 50) {
      return res.status(400).json({ error: 'slug must be 3-50 chars, lowercase alphanumeric and hyphens' });
    }

    const competitorsList = Array.isArray(competitors) ? competitors : [];

    let org;
    try {
      const { rows } = await query(
        `INSERT INTO organizations (name, slug, website, description, competitors)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name.trim(), slug, website || null, description || null, competitorsList]
      );
      org = rows[0];
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'slug already taken' });
      }
      throw err;
    }

    // Insert owner membership
    await query(
      'INSERT INTO org_members (user_id, org_id, role) VALUES ($1, $2, $3)',
      [req.user.id, org.id, 'owner']
    );

    res.status(201).json(org);
  } catch (err) {
    next(err);
  }
});

// GET /api/orgs/:org — get org details
router.get('/:org', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM organizations WHERE id = $1',
      [req.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'org not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orgs/:org — update org
router.patch('/:org', requireAuth, requireOrgAccess, async (req, res, next) => {
  try {
    if (!['owner', 'admin'].includes(req.orgRole)) {
      return res.status(403).json({ error: 'only owners and admins can update the org' });
    }

    const { name, website, description, competitors } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (website !== undefined) { fields.push(`website = $${idx++}`); values.push(website); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (competitors !== undefined) { fields.push(`competitors = $${idx++}`); values.push(Array.isArray(competitors) ? competitors : []); }

    if (!fields.length) {
      return res.status(400).json({ error: 'no fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.orgId);

    const { rows } = await query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
