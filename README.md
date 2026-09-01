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

## Status

This is an MVP. Known gaps to build on next:
- Region 3 steam (supercritical boilers)
- Reheat/regeneration variants of Rankine, intercooling/reheat for Brayton
- Saving/sharing a specific cycle configuration (currently resets on reload)
- A real domain + persistent hosting beyond the current Artifact link
