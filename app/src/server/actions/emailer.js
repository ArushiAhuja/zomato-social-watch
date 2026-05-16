import nodemailer from 'nodemailer';

const DRY_RUN = process.env.DRY_RUN === 'true';

function buildSubject(post, category) {
  const categoryName = category?.name ?? 'Uncategorized';
  const truncated = (post.title || '').slice(0, 60) + ((post.title || '').length > 60 ? '…' : '');
  return `[SPILL ALERT] ${categoryName} | Score: ${post.escalation_score} | ${truncated}`;
}

function buildBody(post, category) {
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'SPILL SOCIAL WATCH — ESCALATION ALERT',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Title    : ${post.title || '(no title)'}`,
    `Source   : ${post.source}`,
    `Author   : ${post.author || 'unknown'}`,
    `Category : ${category?.name ?? 'Uncategorized'}`,
    `Score    : ${post.escalation_score} / 100`,
    `Posted   : ${post.post_created_at ? new Date(post.post_created_at).toISOString() : 'unknown'}`,
    `URL      : ${post.url || ''}`,
    '',
    '─── AI Reasoning ────────────────────────',
    post.reasoning || '(no reasoning)',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Sent by Spill Social Watch (automated)',
  ].join('\n');
}

let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return _transporter;
}

// post: the escalated post object
// category: the matching category object (or undefined)
// config: { emails: ['recipient@example.com', ...] }
export async function sendEmail(post, category, config) {
  const emails = config?.emails;
  if (!emails?.length) throw new Error('no recipient emails in config');
  if (!process.env.GMAIL_USER) throw new Error('GMAIL_USER env var not set');
  if (!process.env.GMAIL_APP_PASSWORD) throw new Error('GMAIL_APP_PASSWORD env var not set');

  const to = emails.join(', ');
  const subject = buildSubject(post, category);
  const text = buildBody(post, category);

  if (DRY_RUN) {
    console.log(`[emailer] DRY RUN — would send to ${to}`);
    console.log(`  Subject: ${subject}`);
    return;
  }

  await getTransporter().sendMail({
    from: `"Spill Social Watch" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
  });

  console.log(`[emailer] sent to ${to}`);
}
