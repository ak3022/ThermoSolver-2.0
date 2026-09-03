// Netlify serverless function: proxies an image + prompt to the Claude API to
// extract a thermodynamic cycle as structured JSON, without ever exposing the
// API key to the browser. This is what lets the "AI import" feature work on a
// plain static deploy (no claude.ai / Artifact platform involved).
//
// Setup: in the Netlify site's dashboard, Site configuration -> Environment
// variables, add ANTHROPIC_API_KEY with a key from console.anthropic.com.
// Never commit a key into this file or into git.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap, plenty for reading a problem into JSON
const MAX_TOKENS = 2000;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_PROMPT_CHARS = 65536;
const MAX_IMAGE_BASE64_CHARS = 28 * 1024 * 1024; // ~20MB binary, base64 inflates ~4/3

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return respond(503, { error: 'AI import is not configured on this deployment yet (missing ANTHROPIC_API_KEY).' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return respond(400, { error: 'Invalid request body' });
  }
  const { prompt, imageBase64, imageMediaType } = body;
  if (!prompt || typeof prompt !== 'string') {
    return respond(400, { error: 'Missing prompt' });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return respond(400, { error: 'Prompt too long' });
  }

  const content = [{ type: 'text', text: prompt }];
  if (imageBase64) {
    if (typeof imageBase64 !== 'string' || imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      return respond(400, { error: 'Image too large' });
    }
    const mediaType = ALLOWED_IMAGE_TYPES.includes(imageMediaType) ? imageMediaType : 'image/png';
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } });
  }

  let apiResp;
  try {
    apiResp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content }],
      }),
    });
  } catch (e) {
    return respond(502, { error: 'Could not reach the AI service — try again.' });
  }

  if (!apiResp.ok) {
    let detail = '';
    try { detail = (await apiResp.json()).error?.message || ''; } catch (e) {}
    if (apiResp.status === 401) return respond(503, { error: 'AI import is misconfigured (invalid API key).' });
    if (apiResp.status === 429) return respond(429, { error: 'Too many requests right now — try again shortly.' });
    return respond(502, { error: detail || 'The AI service returned an error.' });
  }

  const json = await apiResp.json();
  const text = (json.content || []).map((b) => b.text || '').join('');
  if (!text) return respond(502, { error: 'The AI service returned an empty response.' });

  const parsed = extractJson(text);
  if (parsed === null) {
    return respond(422, { error: "Could not find a valid cycle in that — try a clearer screenshot, or add a text description." });
  }

  return respond(200, { data: parsed });
};

// Tolerant JSON extraction: the whole reply, else a markdown code fence, else
// the span from the first { or [ to the last } or ] — mirrors how Claude's
// own sample.json() capability reads a reply.
function extractJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch (e) {}
  }
  const starts = ['{', '['].map((c) => text.indexOf(c)).filter((i) => i !== -1);
  const ends = ['}', ']'].map((c) => text.lastIndexOf(c)).filter((i) => i !== -1);
  if (starts.length && ends.length) {
    const start = Math.min(...starts), end = Math.max(...ends);
    if (end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
    }
  }
  return null;
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
