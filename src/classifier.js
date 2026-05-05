import OpenAI from 'openai';

const hasApiKey = !!process.env.OPENAI_API_KEY?.trim();
const client = hasApiKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const CATEGORIES = [
  'DELIVERY_COMPLAINT',
  'FOOD_SAFETY',
  'FOUNDER_MENTION',
  'VIRAL_NEGATIVE',
  'COMPETITOR_ATTACK',
  'PR_OPPORTUNITY',
  'POLICY_REGULATORY',
  'NOISE',
];

const CATEGORY_SEVERITY = {
  FOOD_SAFETY: 30,
  VIRAL_NEGATIVE: 25,
  POLICY_REGULATORY: 20,
  FOUNDER_MENTION: 20,
  DELIVERY_COMPLAINT: 15,
  COMPETITOR_ATTACK: 15,
  PR_OPPORTUNITY: 10,
  NOISE: 0,
};

const ESCALATE_THRESHOLD = parseInt(process.env.ESCALATE_THRESHOLD ?? '60', 10);
const BATCH_SIZE = 5;

function toDate(val) {
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return new Date(0);
}

function engagementScore(post) {
  if (post.source === 'playstore') return 0;
  const raw = post.score ?? 0;
  if (raw <= 0) return 0;
  return Math.min(30, Math.round((Math.log10(raw + 1) / Math.log10(10001)) * 30));
}

function recencyScore(post) {
  const ageMs = Date.now() - toDate(post.created_at).getTime();
  const ageHr = ageMs / (1000 * 60 * 60);
  if (ageHr < 1) return 20;
  if (ageHr < 6) return 10;
  return 0;
}

function computeScore(post, category, sentimentIntensity) {
  return (
    engagementScore(post) +
    recencyScore(post) +
    (CATEGORY_SEVERITY[category] ?? 0) +
    Math.min(20, Math.max(0, sentimentIntensity))
  );
}

const SYSTEM_PROMPT = `You are a social media analyst for Zomato's crisis & reputation team.
For each post you receive, output ONLY a valid JSON array — one object per post, same order.
Each object must have exactly these keys:
  "category": one of ${CATEGORIES.join(', ')}
  "sentiment_intensity": integer 0–20 (0 = neutral/positive, 20 = extremely negative/urgent)
  "reasoning": one sentence explaining your classification

Category definitions:
- DELIVERY_COMPLAINT: delayed, wrong, or missing orders
- FOOD_SAFETY: hygiene issues, foreign objects, illness reports
- FOUNDER_MENTION: Deepinder Goyal or Albinder Dhindsa named directly
- VIRAL_NEGATIVE: negative post with high engagement or viral potential
- COMPETITOR_ATTACK: unfavorable comparisons to Swiggy, Blinkit, Zepto
- PR_OPPORTUNITY: praise, loyalty stories, positive viral content
- POLICY_REGULATORY: government, FSSAI, legal, tax, or labor-related
- NOISE: irrelevant, spam, or only tangentially related to Zomato

Output ONLY the JSON array. No markdown, no explanation.`;

function buildUserMessage(batch) {
  return JSON.stringify(
    batch.map((post, i) => ({
      index: i,
      source: post.source,
      title: post.title,
      body: post.body ? post.body.slice(0, 400) : '',
      score: post.score,
    })),
    null,
    2
  );
}

function parseResponse(text, batchSize) {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array found in response');
    parsed = JSON.parse(match[0]);
  }
  if (!Array.isArray(parsed) || parsed.length !== batchSize) {
    throw new Error(
      `Expected array of ${batchSize}, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`
    );
  }
  return parsed;
}

function safeClassification(raw) {
  const category = CATEGORIES.includes(raw?.category) ? raw.category : 'NOISE';
  const sentimentIntensity = Number.isFinite(raw?.sentiment_intensity)
    ? Math.min(20, Math.max(0, raw.sentiment_intensity))
    : 0;
  const reasoning =
    typeof raw?.reasoning === 'string' ? raw.reasoning : 'Classification unavailable.';
  return { category, sentimentIntensity, reasoning };
}

function unclassified(post) {
  return {
    ...post,
    category: 'NOISE',
    sentiment_intensity: 0,
    reasoning: 'No OPENAI_API_KEY — add it to .env to enable AI classification.',
    score: computeScore(post, 'NOISE', 0),
    escalate: false,
  };
}

async function classifyBatch(batch) {
  if (!client) return batch.map(unclassified);

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(batch) },
      ],
    });

    const text = response.choices?.[0]?.message?.content ?? '';
    const results = parseResponse(text, batch.length);

    return batch.map((post, i) => {
      const { category, sentimentIntensity, reasoning } = safeClassification(results[i]);
      const score = computeScore(post, category, sentimentIntensity);
      return {
        ...post,
        category,
        sentiment_intensity: sentimentIntensity,
        reasoning,
        score,
        escalate: score >= ESCALATE_THRESHOLD,
      };
    });
  } catch (err) {
    console.error(`[classifier] Batch failed: ${err.message}`);
    return batch.map((post) => ({
      ...post,
      category: 'NOISE',
      sentiment_intensity: 0,
      reasoning: `Classification failed: ${err.message}`,
      score: computeScore(post, 'NOISE', 0),
      escalate: false,
    }));
  }
}

export async function classifyAndScore(posts) {
  if (!posts.length) return [];

  const batches = [];
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    batches.push(posts.slice(i, i + BATCH_SIZE));
  }

  console.log(`[classifier] ${posts.length} posts → ${batches.length} batches of up to ${BATCH_SIZE}`);

  const classified = [];
  for (let i = 0; i < batches.length; i++) {
    console.log(`[classifier] batch ${i + 1}/${batches.length}…`);
    const results = await classifyBatch(batches[i]);
    classified.push(...results);
  }

  const escalations = classified.filter((p) => p.escalate).length;
  console.log(`[classifier] Done. ${escalations}/${classified.length} flagged for escalation.`);
  return classified;
}

export function getTopEscalations(classifiedPosts, n = 5) {
  return classifiedPosts
    .filter((p) => p.escalate)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
