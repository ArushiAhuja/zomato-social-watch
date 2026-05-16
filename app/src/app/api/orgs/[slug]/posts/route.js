import { NextResponse } from 'next/server';
import { query } from '../../../../../server/db.js';
import { getUser, getOrgAccess } from '../../../../../server/api-auth.js';

// GET /api/orgs/[slug]/posts — list posts with filters
export async function GET(request, { params }) {
  try {
    const { slug } = params;
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const access = await getOrgAccess(user, slug);
    if (!access) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const category_id = searchParams.get('category_id');
    const escalated = searchParams.get('escalated');
    const reviewed = searchParams.get('reviewed');
    const search = searchParams.get('search');
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';

    const conditions = ['p.org_id = $1'];
    const values = [access.orgId];
    let idx = 2;

    if (source) {
      conditions.push(`p.source = $${idx++}`);
      values.push(source);
    }
    if (category_id) {
      conditions.push(`p.category_id = $${idx++}`);
      values.push(category_id);
    }
    if (escalated !== null && escalated !== undefined) {
      conditions.push(`p.escalated = $${idx++}`);
      values.push(escalated === 'true');
    }
    if (reviewed !== null && reviewed !== undefined) {
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

    return NextResponse.json({
      posts: rows,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
