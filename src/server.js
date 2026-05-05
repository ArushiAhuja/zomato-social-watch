import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import { validateEnv } from './env.js';
import fetchAll from './fetchers/index.js';
import { classifyAndScore } from './classifier.js';
import { fireActions } from './actions/index.js';
import { logToSheet } from './actions/sheets.js';
import {
  filterNew,
  upsertPosts,
  updateStatus,
  getPosts,
  getEscalations,
  getStatus,
} from './store.js';

validateEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MINUTES ?? '5', 10) * 60 * 1000;

// ─── Global error safety ──────────────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
});

// ─── Refresh cycle ────────────────────────────────────────────────────────────

let refreshInProgress = false;

async function runRefreshCycle() {
  if (refreshInProgress) {
    console.log('[server] Refresh already in progress, skipping.');
    return;
  }
  refreshInProgress = true;

  try {
    // 1. Fetch from all sources
    const raw = await fetchAll();

    // 2. Identify posts we haven't seen before
    const newPosts = filterNew(raw);
    if (!newPosts.length) {
      console.log('[server] Refresh complete: no new posts.');
      updateStatus({ batchSize: 0, newEscalations: 0, sourceBreakdown: buildBreakdown(raw) });
      return;
    }

    // 3. Classify + score new posts only
    const classified = await classifyAndScore(newPosts);

    // 4. Persist into store
    upsertPosts(classified);

    // 5a. Log every post to sheet (sheet.js skips silently if GOOGLE_SHEET_ID unset)
    for (const post of classified) {
      await logToSheet(post).catch((err) =>
        console.error(`[server] Sheet log failed for ${post.id}: ${err.message}`)
      );
    }

    // 5b. Fire email alerts for escalations only
    const escalations = classified.filter((p) => p.escalate);
    for (const post of escalations) {
      await fireActions(post);
    }

    // 6. Update status
    updateStatus({
      batchSize: newPosts.length,
      newEscalations: escalations.length,
      sourceBreakdown: buildBreakdown(raw),
    });

    console.log(
      `[server] Refresh complete: ${newPosts.length} new posts, ` +
      `${escalations.length} escalated, ` +
      `${classified.length} logged to sheet.`
    );
  } catch (err) {
    console.error(`[server] Refresh cycle error: ${err.message}`);
  } finally {
    refreshInProgress = false;
  }
}

function buildBreakdown(posts) {
  return posts.reduce((acc, p) => {
    acc[p.source] = (acc[p.source] ?? 0) + 1;
    return acc;
  }, {});
}

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
  ],
}));
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'frontend')));

app.get('/api/posts', (_req, res) => {
  res.json(getPosts());
});

app.get('/api/posts/escalations', (_req, res) => {
  res.json(getEscalations());
});

app.get('/api/status', (_req, res) => {
  res.json(getStatus());
});

app.post('/api/refresh', (req, res) => {
  res.json({ message: 'Refresh triggered.' });
  // Fire and forget — do not await so the response is immediate
  runRefreshCycle().catch((err) =>
    console.error(`[server] Manual refresh error: ${err.message}`)
  );
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] Dashboard → http://localhost:${PORT}`);
  runRefreshCycle();
  setInterval(runRefreshCycle, REFRESH_INTERVAL_MS);
  console.log(`[server] Auto-refresh every ${REFRESH_INTERVAL_MS / 60000} minutes.`);
});
