import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initScheduler } from './scheduler.js';

import authRouter from './routes/auth.js';
import orgsRouter from './routes/orgs.js';
import sourcesRouter from './routes/sources.js';
import categoriesRouter from './routes/categories.js';
import escalationsRouter from './routes/escalations.js';
import postsRouter from './routes/posts.js';
import onboardingRouter from './routes/onboarding.js';

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/orgs', orgsRouter);
app.use('/api/orgs', sourcesRouter);
app.use('/api/orgs', categoriesRouter);
app.use('/api/orgs', escalationsRouter);
app.use('/api/orgs', postsRouter);
app.use('/api/orgs', onboardingRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message || 'internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`spill backend running on :${PORT}`);
  try {
    await initScheduler();
  } catch (err) {
    console.error('scheduler init error:', err.message);
  }
});
