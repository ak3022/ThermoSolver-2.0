# ThermoSolver

An interactive thermodynamic cycle solver and visualizer, built for students to
learn cycle analysis by building and editing cycles themselves rather than
asking an AI for the answer.

Pick a standard cycle (Rankine, Brayton, Otto, Diesel, or a Carnot cycle for
either steam or an ideal gas) or build a custom one, fill in whatever
properties you know at each state, and the rest of the cycle solves live —
state properties, per-process heat/work, net work, thermal efficiency, back
work ratio, and T–s / P–v / h–s diagrams with the saturation dome drawn in.

This is the spiritual successor to an earlier notebook-based version
(`ThermoSolver-Steam-IdealGas`) that used Jupyter + CoolProp + Bokeh. This
version is a single self-contained web page — no install, no server, no
Python required — so it can just be opened or hosted anywhere.

## Running it locally

It's one static HTML file with no build step. Either:

- Open `index.html` directly in a browser, or
- Serve the folder (nicer for font loading over `http://`):

```bash
python -m http.server 5173
```

then visit `http://localhost:5173/`.

## How the physics works

- **Steam properties** — a from-scratch implementation of IAPWS-IF97
  Region 1 (compressed/saturated liquid), Region 2 (superheated/saturated
  vapor), and Region 4 (the saturation curve), verified against the official
  IAPWS certification values to 6+ significant figures. A general Newton-
  Raphson solver on top lets you fix a state from *any* two independent
  properties (P, T, h, s, v, u, or quality x), not just the handful of
  combinations steam tables usually give you directly.
  Region 3 (near/above the critical point, roughly p > 16.5 MPa with T
  between ~350–374°C) isn't implemented — the solver flags it as
  out-of-range rather than silently returning a wrong answer.
- **Ideal gas properties** — constant (cold-air-standard) specific heats for
  Air, N₂, O₂, CO₂, H₂, He, Ar, CH₄, and CO. This is the same simplification
  used in most intro thermodynamics courses for air-standard cycle analysis.
- **Cycle engine** — treats each cycle as a loop of states connected by
  processes (isobaric, isochoric, isothermal, isenthalpic, isentropic with
  optional isentropic efficiency, or polytropic), and iteratively propagates
  known properties around the loop until everything that *can* be solved,
  is. Energy balances correctly distinguish steady-flow devices (turbines,
  compressors, boilers — Q − W = Δh) from closed piston-cylinder processes
  (Otto/Diesel — Q − W = Δu, with boundary work computed per process type);
  mixing these two bases is a common source of silently-wrong Otto/Diesel
  efficiency numbers, so this was checked against the classical closed-form
  efficiency formulas for Otto, Diesel, and Carnot as part of building it.

## AI import ("upload a screenshot")

The "✨ Import from a screenshot" button reads a textbook problem (image
and/or typed text) and fills in a cycle for you. It works two different ways
depending on where the page is running, picked automatically at load time —
see `aiMode` in `index.html`:

- **Inside a published Claude Artifact** — uses the platform's `sample`
  capability directly (`window.claude.use('sample')`). Billed against the
  *viewer's* own Claude usage, no API key involved, nothing to configure.
- **Anywhere else (e.g. this deployed on Netlify)** — calls this site's own
  `/.netlify/functions/analyze-cycle`, which holds a Gemini API key
  server-side and proxies the request to Google's Gemini API. This is what
  makes the feature work for a normal public visitor with no Claude account
  of their own, at genuinely zero cost to the site owner — see below.

## Deploying to Netlify

The whole app is a static file plus one serverless function — no build step.

1. Push this repo to GitHub (a new repo under your own account — I can push
   the code, but creating the GitHub account/repo itself is something only
   you can do).
2. In Netlify, "Add new site" → "Import an existing project" → connect that
   GitHub repo. Build settings are already in `netlify.toml`
   (`publish = "."`, `functions = "netlify/functions"`) — Netlify should
   auto-detect it.
3. To enable AI import at zero cost: get a key from
   [Google AI Studio](https://aistudio.google.com/apikey) — **not** the
   Vertex AI / GCP console route. As long as no Cloud Billing account is
   linked to that key, it runs on the free tier only: past the free quota,
   requests are simply rejected (HTTP 429) rather than charged — there is no
   way for this to bill you. In the Netlify site's **Site configuration →
   Environment variables**, add `GEMINI_API_KEY` with that value. Never
   commit a key into this repo.
4. Every `git push` to the connected branch auto-redeploys.

Without step 3, everything else works fine — the AI button just shows a
clear "not configured yet" message instead of failing silently. Gemini's
free-tier model name and rate limits do drift over time — if AI import starts
failing, check `MODEL` in `netlify/functions/analyze-cycle.js` against
[ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models).

## Status

This is an MVP. Known gaps to build on next:
- Region 3 steam (supercritical boilers)
- Reheat/regeneration variants of Rankine, intercooling/reheat for Brayton
- Saving/sharing a specific cycle configuration (currently resets on reload)
- A custom domain once a name is settled on
