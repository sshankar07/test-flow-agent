# Copilot Instructions

## Build, lint, and test commands

- From the repository root, use the frontend package scripts:
  - `npm --prefix frontend run build`
  - `npm --prefix frontend run lint`
- Local service startup commands from the README:
  - `node mock-enrollment-api/server.js` runs the mock enrollment API on `http://localhost:4000`
  - `node backend/server.js` runs the backend agent API on `http://localhost:5001`
  - `npm --prefix frontend run dev` runs the Vite frontend on `http://localhost:5173`
- There is no automated test runner configured for the application yet, so there is no supported full-suite or single-test command. `mock-enrollment-api/package.json` still has the default placeholder `npm test` script and it intentionally exits with an error.

## High-level architecture

- The app is split into three local services:
  - `frontend/` is the React dashboard.
  - `backend/` is the Express API that analyzes manual test cases and generates automation assets.
  - `mock-enrollment-api/` is the mock business API that the generated assets and live execution run against.
- `frontend/src/App.jsx` is the main UI surface. It keeps the manual test case, detected flow, generated artifact payload, status text, and toast/scroll behavior in one component, and it calls the backend directly at `http://localhost:5001/agent`.
- `backend/server.js` is intentionally thin and mounts `backend/routes/analysisRoutes.js` at `/agent`. `analysisRoutes.js` is the real core of the system: it parses the manual scenario, builds the canonical enrollment flow, generates Postman/Playwright/JMeter outputs, and can execute the flow live against the mock API.
- `mock-enrollment-api/server.js` is an in-memory Express service. It exposes the fixed enrollment sequence `/auth/token -> /members -> /plans -> /enrollments -> /enrollments/:id` and stores tokens, members, and enrollments in process memory only.
- The main product flow is:
  1. Frontend sends a manual test case to `/agent/analyze`.
  2. Backend converts that text into a normalized scenario plus `detectedSteps` and `dynamicVariables`.
  3. The same scenario drives all generator endpoints so Postman, Playwright, JMeter, and live execution stay aligned.
  4. Live execution replays the flow against the mock API and returns step-by-step status back to the UI.

## Key conventions

- Treat `parseScenario()` in `backend/routes/analysisRoutes.js` as the single source of truth for scenario inference. It defaults to `TX`, `Silver`, and `2026-01-01`, accepts both ISO and `MM/DD/YYYY` dates, and detects the negative path from phrases about missing effective dates or expected errors.
- Keep all output types in sync. If behavior changes for one of Postman, Playwright, JMeter, or `run-enrollment-flow`, update the shared scenario semantics for the others too; they are expected to represent the same business flow.
- The shared dynamic variable vocabulary is important to the whole app: `baseUrl`, `accessToken`, `memberId`, `planId`, `enrollmentId`, `state`, and positive-path `effectiveDate`.
- Backend endpoints are tolerant about input field names and usually accept `manualTestCase`, `manual`, or `text`. Preserve that compatibility when extending request payloads.
- Positive and negative scenarios intentionally diverge only at enrollment submission time. Positive flows include `effectiveDate` and a validation step; negative "missing effective date" flows omit `effectiveDate`, expect HTTP 400, and skip the validate-enrollment request.
- The frontend currently uses hardcoded local URLs (`http://localhost:5001/agent` and `http://localhost:4000`). If you introduce configurability, update analyze, generate, and run flows consistently rather than changing only one call site.
- Generated artifacts are meant to be standalone demo assets with stable filenames such as `testflow-enrollment-collection.json`, `testflow-enrollment-environment.json`, `enrollment-flow.spec.ts`, and `enrollment-flow.jmx`.
- Keep UI changes incremental. `instructions/phase1-live.md` explicitly says to preserve existing features and keep the dashboard stable instead of redesigning it.
- If MCP servers are available, prefer Playwright MCP for UI debugging and validation work in this repo; the project is a local web app with a frontend, backend, and mock API that benefit from browser-driven inspection.
