import { sendEmailAlert } from './emailer.js';
import { logToSheet } from './sheets.js';

const DRY_RUN = process.env.DRY_RUN === 'true';

export async function fireActions(post) {
  const opts = { dryRun: DRY_RUN };
  const results = { postId: post.id, email: null, sheet: null };

  // ACTION 1 — Email alert (escalations only)
  if (post.escalate) {
    try {
      await sendEmailAlert(post, opts);
      results.email = 'sent';
      console.log(`[actions] ✓ email ${DRY_RUN ? '(dry)' : 'sent'} for ${post.id}`);
    } catch (err) {
      results.email = `failed: ${err.message}`;
      console.error(`[actions] ✗ email failed for ${post.id}: ${err.message}`);
    }
  }

  // ACTION 2 — Sheet log (all posts)
  try {
    await logToSheet(post, opts);
    results.sheet = 'logged';
    console.log(`[actions] ✓ sheet ${DRY_RUN ? '(dry)' : 'logged'} for ${post.id}`);
  } catch (err) {
    results.sheet = `failed: ${err.message}`;
    console.error(`[actions] ✗ sheet failed for ${post.id}: ${err.message}`);
  }

  return results;
}
