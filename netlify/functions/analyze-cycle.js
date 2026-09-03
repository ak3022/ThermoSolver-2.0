// Netlify serverless function: proxies an image + prompt to Google's Gemini
// API to extract a thermodynamic cycle as structured JSON, without ever
// exposing the API key to the browser. This is what lets the "AI import"
// feature work on a plain static deploy (no claude.ai / Artifact involved).
//
// Setup: get a key from Google AI Studio — https://aistudio.google.com/apikey
// (NOT the Vertex AI / GCP console route). As long as you don't link a Cloud
// Billing account to that key, it runs on the free tier only: once you hit
// the free quota, requests just get rejected (429) — you are never charged.
// In Netlify's dashboard: Site configuration -> Environment variables, add
// GEMINI_API_KEY with that value. Never commit a key into this file or git.
//
// Model/quota specifics drift over time — if this starts failing, check
// https://ai.google.dev/gemini-api/docs/models and https://ai.google.dev/gemini-api/docs/rate-limits
// for the current free-tier model name and swap the MODEL constant below.

const MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 2000;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_PROMPT_CHARS = 65536;
const MAX_IMAGE_BASE64_CHARS = 28 * 1024 * 1024; // ~20MB binary, base64 inflates ~4/3

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return respond(503, { error: 'AI import is not configured on this deployment yet (missing GEMINI_API_KEY).' });
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

  const parts = [{ text: prompt }];
  if (imageBase64) {
    if (typeof imageBase64 !== 'string' || imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      return respond(400, { error: 'Image too large' });
    }
    const mimeType = ALLOWED_IMAGE_TYPES.includes(imageMediaType) ? imageMediaType : 'image/png';
    parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
  }

  let apiResp;
  try {
    apiResp = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json', // ask Gemini to return JSON directly
        },
      }),
    });
  } catch (e) {
    return respond(502, { error: 'Could not reach the AI service — try again.' });
  }

  if (!apiResp.ok) {
    let detail = '';
    try { detail = (await apiResp.json()).error?.message || ''; } catch (e) {}
    if (apiResp.status === 400 && /API key/i.test(detail)) return respond(503, { error: 'AI import is misconfigured (invalid API key).' });
    if (apiResp.status === 429) return respond(429, { error: "You've hit the free-tier rate limit — try again in a minute." });
    return respond(502, { error: detail || 'The AI service returned an error.' });
  }

  const json = await apiResp.json();
  const candidate = (json.candidates || [])[0];
  const text = ((candidate && candidate.content && candidate.content.parts) || []).map((p) => p.text || '').join('');
  if (!text) {
    const reason = candidate && candidate.finishReason;
    if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT') {
      return respond(422, { error: 'The AI declined to process that image/description.' });
    }
    return respond(502, { error: 'The AI service returned an empty response.' });
  }

  const parsed = extractJson(text);
  if (parsed === null) {
    return respond(422, { error: "Could not find a valid cycle in that — try a clearer screenshot, or add a text description." });
  }

  return respond(200, { data: parsed });
};

// Tolerant JSON extraction: the whole reply, else a markdown code fence, else
// the span from the first { or [ to the last } or ] — belt-and-suspenders on
// top of responseMimeType:'application/json', which should already give clean JSON.
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
