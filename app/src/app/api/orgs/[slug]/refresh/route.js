import { NextResponse } from 'next/server';
import { getUser, getOrgAccess } from '../../../../../server/api-auth.js';
import { refreshOrg } from '../../../../../server/scheduler.js';

// POST /api/orgs/[slug]/refresh — trigger manual refresh (fire-and-forget)
export async function POST(request, { params }) {
  try {
    const { slug } = params;
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const access = await getOrgAccess(user, slug);
    if (!access) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    refreshOrg(access.orgId).catch((err) =>
      console.error(`[refresh] manual trigger failed for org ${access.orgId}:`, err.message)
    );

    return NextResponse.json({ message: 'refresh triggered' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
