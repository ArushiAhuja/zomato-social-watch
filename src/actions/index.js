import { sendEmail } from './emailer.js';
import { appendToSheet } from './sheets.js';

export async function fireEscalations(posts, { orgId, rules, categories }) {
  for (const post of posts) {
    for (const rule of rules) {
      // Check if rule applies to this post
      const categoryMatch = rule.category_ids.length === 0 ||
        rule.category_ids.includes(post.category_id);
      const scoreMatch = post.escalation_score >= rule.score_threshold;

      if (!categoryMatch || !scoreMatch) continue;

      const category = categories.find(c => c.id === post.category_id);

      try {
        if (rule.action_type === 'email' && rule.config.emails?.length) {
          await sendEmail(post, category, rule.config);
        } else if (rule.action_type === 'sheets' && rule.config.sheet_id) {
          await appendToSheet(post, category, rule.config);
        } else if (rule.action_type === 'webhook' && rule.config.url) {
          await fireWebhook(post, category, rule.config);
        }
      } catch (err) {
        console.error(`action error (rule ${rule.id}):`, err.message);
      }
    }
  }
}

async function fireWebhook(post, category, config) {
  await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: post.source,
      title: post.title,
      url: post.url,
      score: post.escalation_score,
      category: category?.name,
      reasoning: post.reasoning,
    }),
  });
}
