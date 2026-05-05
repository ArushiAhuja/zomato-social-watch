import fetchAll from './fetchers/index.js';
import { classifyAndScore, getTopEscalations } from './classifier.js';

const posts = await fetchAll();
const sample = posts.slice(0, 10); // Keep API cost minimal for smoke test

console.log('\n--- Classifying first 10 posts ---\n');
const classified = await classifyAndScore(sample);

console.log('\n--- All Results ---');
classified.forEach((p) => {
  const flag = p.escalate ? '🚨' : '  ';
  console.log(`${flag} [${p.score.toString().padStart(3)}] [${p.category.padEnd(20)}] ${p.title.slice(0, 60)}`);
  console.log(`       reasoning: ${p.reasoning}`);
});

console.log('\n--- Top Escalations ---');
const top = getTopEscalations(classified);
if (!top.length) {
  console.log('No escalations in this sample (try a larger batch or different timing).');
} else {
  top.forEach((p) => {
    console.log(`\n  Score: ${p.score} | ${p.category} | ${p.source}`);
    console.log(`  Title: ${p.title}`);
    console.log(`  Why:   ${p.reasoning}`);
    console.log(`  URL:   ${p.url}`);
  });
}
