import { NextResponse } from 'next/server';
import { query } from '../../../../server/db.js';
import { getUser, getOrgAccess } from '../../../../server/api-auth.js';

// GET /api/orgs/[slug] — get org details
export async function GET(request, { params }) {
  try {
    const { slug } = params;
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const access = await getOrgAccess(user, slug);
    if (!access) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { rows } = await query(
      'SELECT * FROM organizations WHERE id = $1',
      [access.orgId]
    );
    if (!rows.length) return NextResponse.json({ error: 'org not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/orgs/[slug] — update org
export async function PATCH(request, { params }) {
  try {
    const { slug } = params;
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const access = await getOrgAccess(user, slug);
    if (!access) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    if (!['owner', 'admin'].includes(access.orgRole)) {
      return NextResponse.json({ error: 'only owners and admins can update the org' }, { status: 403 });
    }

    const { name, website, description, competitors } = await request.json();
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (website !== undefined) { fields.push(`website = $${idx++}`); values.push(website); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (competitors !== undefined) { fields.push(`competitors = $${idx++}`); values.push(Array.isArray(competitors) ? competitors : []); }

    if (!fields.length) {
      return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
    }

    fields.push(`updated_at = NOW()`);
    values.push(access.orgId);

    const { rows } = await query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
