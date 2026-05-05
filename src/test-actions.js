import { fireActions } from './actions/index.js';

// Simulate a high-scoring escalation post
const mockEscalation = {
  id: 'reddit_test_001',
  source: 'reddit',
  author: 'user123',
  title: 'Found a dead insect in my Zomato delivery — complete nightmare',
  body: 'Ordered from a restaurant via Zomato. Found a dead cockroach inside the biryani. Filed a complaint but got no response.',
  url: 'https://www.reddit.com/r/india/comments/test001/',
  score: 420,
  created_at: new Date(),
  category: 'FOOD_SAFETY',
  sentiment_intensity: 18,
  reasoning: 'User reports finding a dead insect in food — clear food safety incident with high viral potential.',
  score: 87,
  escalate: true,
};

// Simulate a non-escalation post (sheet-only)
const mockNoise = {
  id: 'hn_test_002',
  source: 'hackernews',
  author: 'hnuser',
  title: 'Zomato expands to new cities',
  body: '',
  url: 'https://news.ycombinator.com/item?id=99999',
  score: 5,
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
  category: 'NOISE',
  sentiment_intensity: 2,
  reasoning: 'Generic expansion news, no urgency.',
  escalate: false,
};

console.log('DRY_RUN =', process.env.DRY_RUN);
console.log('\n--- Firing actions for escalation post ---');
const r1 = await fireActions(mockEscalation);
console.log('Result:', r1);

console.log('\n--- Firing actions for noise post ---');
const r2 = await fireActions(mockNoise);
console.log('Result:', r2);
