---
name: verify-discovery
description: End-to-end smoke test for the live discovery → generate pipeline (backend/services/discoveryService.js + backend/lib/analysisHelpers.js). Use after touching discovery capture, dynamic-variable detection, or Postman/Playwright/JMeter generation.
---

# Verify Discovery → Generate Pipeline

This project has two ways to produce Postman/Playwright/JMeter assets: a hardcoded manual-scenario
"enrollment demo" path, and a live-discovery path that records any website's API traffic via a
headed Playwright browser and generates assets from what it saw. This skill checks the live-discovery
path end to end, since it's the harder one to get right and the one most likely to regress silently.

## 1. Start all three services

```bash
node mock-enrollment-api/server.js   # http://localhost:4000
node backend/server.js               # http://localhost:5001
npm --prefix frontend run dev        # http://localhost:5173
```

If port 5001/4000 is already in use by another session's dev instance, run an isolated copy instead
of killing it: `PORT=5099 node backend/server.js`.

## 2. Run a discovery session against a real target

Use Playwright MCP (registered in this repo's `.mcp.json`) or the app's own UI to:

1. `POST /discovery/start` with `{"baseUrl": "<target>"}` — the mock API has no browsable UI, so
   point this at a real site with a login/flow (e.g. `https://opensource-demo.orangehrmlive.com`)
   or a small local test harness that fires a few `fetch()` calls on page load.
2. Perform a few actions in the opened browser (or let the harness page run automatically).
3. `POST /discovery/stop`.

## 3. Generate all three asset types

```bash
curl -s -X POST http://localhost:5001/agent/generate-postman -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:5001/agent/generate-playwright -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:5001/agent/generate-jmeter-plan -H "Content-Type: application/json" -d '{}'
```

Save the `script`/`collection`/`jmx` fields from each response to files.

## 4. Confirm the Playwright spec actually compiles

`@playwright/test` isn't a dependency anywhere in this repo (only bare `playwright` is, in
`backend/package.json`) — it's only needed transiently here for a syntax/compile check, not wired
into the app's runtime. The generated file uses an ESM `import`, so a plain `node --check` needs that
line stripped first:

```bash
node --check <(tail -n +2 discovered-flow.spec.ts)
```

A clean exit means no "Cannot redeclare block-scoped variable" errors — the historically broken case
was every captured step redeclaring `stepUrl`/`stepHeaders`/`stepBody`/`stepOptions` in one shared
scope. Each step must be wrapped in its own `{ ... }` block in
`buildCapturedPlaywrightResponse` (`backend/lib/analysisHelpers.js`).

## 5. Spot-check the specific defect classes this pipeline has previously hit

- **No plaintext secrets**: grep the raw session (`GET /discovery/session`) and generated artifacts
  for literal passwords/tokens — form-urlencoded bodies must be masked, not just JSON.
- **No duplicate steps**: identical repeated `(method, path, query, body)` requests should collapse
  to one step with a `repeatCount` annotation, not appear as separate steps in generated output.
- **Reused short values get templated correctly, without corrupting unrelated digits**: a short
  numeric id (e.g. an employee/order number) reused across requests should become `{{name}}` in the
  URL/body where it's actually the same value, but must NOT corrupt an unrelated number that merely
  contains the same digits (e.g. a port number). Check `replaceValueOccurrences` in
  `backend/lib/sanitize.js` — short values (<6 chars) require whole-token boundaries, not naive
  substring replace.
- **Operation names**: GETs shouldn't be mislabeled "Create Entity."
- **Per-step expected-outcome override**: `POST /discovery/session/overrides` with
  `{"overrides":[{"stepNumber": N, "expectedOutcome": "success"}]}` should change that step's
  assertion in all three generated formats to a 2xx-range check; leaving it unset must reproduce the
  literal captured-status assertion (regression check).

## 6. Manual-scenario regression check

With no discovery session active (`POST /discovery/clear` first), hit `/agent/analyze` and all three
generate endpoints with a manual test case — output must be byte-identical to before any discovery-
related change, since `backend/lib/analysisHelpers.js` shares sanitize/templating helpers between
both code paths.
