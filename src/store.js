const MAX_POSTS = 200;

const state = {
  posts: [],          // ClassifiedPost[], newest-first, capped at MAX_POSTS
  seenIds: new Set(), // never shrinks — guards against re-firing actions
  status: {
    lastRefresh: null,      // ISO string
    totalFetched: 0,        // cumulative across all refreshes
    totalEscalated: 0,      // cumulative
    sourceBreakdown: {},    // { reddit: N, hackernews: N, ... } for latest batch
  },
};

// Returns only posts whose id hasn't been seen before, and marks them seen.
export function filterNew(posts) {
  const fresh = posts.filter((p) => !state.seenIds.has(p.id));
  fresh.forEach((p) => state.seenIds.add(p.id));
  return fresh;
}

// Merges new classified posts into the store, keeps newest MAX_POSTS.
export function upsertPosts(newPosts) {
  const merged = [...newPosts, ...state.posts];

  // Dedup by id (new posts win if somehow duplicated)
  const seen = new Set();
  state.posts = merged
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, MAX_POSTS);
}

export function updateStatus({ batchSize, newEscalations, sourceBreakdown }) {
  state.status.lastRefresh = new Date().toISOString();
  state.status.totalFetched += batchSize;
  state.status.totalEscalated += newEscalations;
  state.status.sourceBreakdown = sourceBreakdown;
}

export function getPosts() {
  return [...state.posts].sort((a, b) => b.score - a.score);
}

export function getEscalations() {
  return getPosts().filter((p) => p.escalate);
}

export function getStatus() {
  return { ...state.status };
}
