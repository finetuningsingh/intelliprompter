// IntelliPrompter core, shared by the browser page (index.html) and the Node replay (replay.js).
// Each talking point is its own Score question; all of them go to Jev in one call over the same transcript,
// so points can be covered in any order. Code owns the policy: a point is checked off once its score
// reaches the threshold, and stays checked.

// Coverage levels from Allie's description of her IntelliPrompter (TypeSafe Discord).
export const CRITERIA = [
  'No mention of this topic at all',
  'Topic is mentioned but not expanded upon at all',
  'Topic is discussed',
  'Topic is thoroughly discussed',
];

// Only the most recent speech matters for points still open; older text was already scored.
export const MAX_TRANSCRIPT_CHARS = 6000;

// Jev is reachable two ways with the same request and answer shapes: OpenRouter's decisions endpoint,
// or TypeSafe's own API. OpenRouter keys start with sk-or-; anything else is treated as a TypeSafe key.
export const PROVIDERS = {
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/alpha/decisions', model: 'typesafe/jev-1.13' },
  typesafe: { name: 'TypeSafe', url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest' },
};
export const providerFor = (key) => (/^sk-or-/.test(key) ? 'openrouter' : 'typesafe');

// Returns jev(state, questions) -> {answers, cost}. TypeSafe reports tokens, not dollars, so its cost is null.
// `url` overrides the endpoint (the page sends TypeSafe calls through server.js); `key` may be empty
// when that server holds the key itself.
export function makeJev({ provider, key, url, headers = {} }) {
  const p = PROVIDERS[provider];
  return async (state, questions) => {
    const res = await fetch(url ?? p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
      body: JSON.stringify({ model: p.model, state, questions }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error(`${p.name} rejected the key (401).`);
    if (!res.ok || json.error) {
      const detail = json.error?.message ?? json.error ?? json.detail ?? res.statusText;
      throw new Error(`${p.name} -> ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
    return { answers: json.answers, cost: provider === 'openrouter' ? json.usage?.cost ?? 0 : null };
  };
}

export function buildQuestions(points) {
  return Object.fromEntries(points.map((p) => [p.id, {
    type: 'score',
    instructions:
      `A speaker is talking live from a list of talking points, in their own words and in any order. ` +
      `\`transcript\` is what they have said so far (speech-to-text, so expect errors). ` +
      `How much has the speaker covered this talking point: "${p.text}"?`,
    criteria: CRITERIA,
  }]));
}

export const buildState = (transcript) => ({ transcript: transcript.slice(-MAX_TRANSCRIPT_CHARS) });

// Scores `points` (each {id, text}) against `transcript`. `jev(state, questions)` resolves to {answers, cost}.
export async function scorePoints(jev, transcript, points) {
  if (!points.length) return { scores: {}, cost: 0 };
  const { answers, cost } = await jev(buildState(transcript), buildQuestions(points));
  const scores = {};
  for (const p of points) {
    const a = answers[p.id];
    if (a) scores[p.id] = { score: a.score, confidence: a.confidence, probabilities: a.probabilities };
  }
  return { scores, cost };
}

export function parsePoints(text) {
  return text.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
    .map((t, i) => ({ id: `p${i}`, text: t }));
}
