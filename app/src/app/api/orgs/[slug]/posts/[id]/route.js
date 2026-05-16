import { NextResponse } from 'next/server';
import { query } from '../../../../../../server/db.js';
import { getUser, getOrgAccess } from '../../../../../../server/api-auth.js';

// PATCH /api/orgs/[slug]/posts/[id] — mark reviewed
export async function PATCH(request, { params }) {
  try {
    const { slug, id } = params;
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const access = await getOrgAccess(user, slug);
    if (!access) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { rows: existing } = await query(
      'SELECT id FROM posts WHERE id = $1 AND org_id = $2',
      [id, access.orgId]
    );
    if (!existing.length) return NextResponse.json({ error: 'post not found' }, { status: 404 });

    const body = await request.json();
    const { reviewed } = body;
    if (reviewed === undefined) {
      return NextResponse.json({ error: 'reviewed field is required' }, { status: 400 });
    }

    const { rows } = await query(
      'UPDATE posts SET reviewed = $1 WHERE id = $2 RETURNING *',
      [reviewed, id]
    );

    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
