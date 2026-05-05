import nodemailer from 'nodemailer';

const NEXT_STEPS = {
  FOOD_SAFETY: 'Flag for customer safety team immediately — potential health incident.',
  DELIVERY_COMPLAINT: 'Review delivery SLA breach and consider proactive refund.',
  FOUNDER_MENTION: 'Escalate to comms/PR team — founder reputation management.',
  VIRAL_NEGATIVE: 'Monitor share velocity; prepare a public response draft.',
  COMPETITOR_ATTACK: 'Flag for brand team; track if this becomes a trend.',
  POLICY_REGULATORY: 'Escalate to legal/compliance team for review.',
  PR_OPPORTUNITY: 'Share with marketing — potential content for amplification.',
  NOISE: 'No action required.',
};

function buildSubject(post) {
  const truncated = post.title.slice(0, 60) + (post.title.length > 60 ? '…' : '');
  return `[ZOMATO ALERT] ${post.category} | Score: ${post.score} | ${truncated}`;
}

function buildBody(post) {
  const nextStep = NEXT_STEPS[post.category] ?? 'Review and assess.';
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'ZOMATO SOCIAL WATCH — ESCALATION ALERT',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Title    : ${post.title}`,
    `Source   : ${post.source}`,
    `Author   : ${post.author}`,
    `Category : ${post.category}`,
    `Score    : ${post.score} / 100`,
    `Posted   : ${post.created_at.toISOString()}`,
    `URL      : ${post.url}`,
    '',
    '─── AI Reasoning ────────────────────────',
    post.reasoning,
    '',
    '─── Suggested Next Step ─────────────────',
    nextStep,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Sent by Zomato Social Watch (automated)',
  ].join('\n');
}

let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    // Explicit SMTP settings work for both @gmail.com and Google Workspace domains
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

export async function sendEmailAlert(post, { dryRun = false } = {}) {
  const to = process.env.ALERT_EMAIL;
  if (!to) throw new Error('ALERT_EMAIL env var not set');
  if (!process.env.GMAIL_USER) throw new Error('GMAIL_USER env var not set');
  if (!process.env.GMAIL_APP_PASSWORD) throw new Error('GMAIL_APP_PASSWORD env var not set');

  const subject = buildSubject(post);
  const text = buildBody(post);

  if (dryRun) {
    console.log(`[emailer] DRY RUN — would send to ${to}`);
    console.log(`  Subject: ${subject}`);
    return;
  }

  await getTransporter().sendMail({
    from: `"Zomato Social Watch" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
  });
}
