Implement Phase 1: Live API Flow Discovery from Browser Recording.

Project context:
This is TestFlow Agent. Current app already supports:
- Manual test case input
- Analyze Flow
- Generate Postman collection + environment
- Generate Playwright script
- Generate JMeter JMX
- Run Enrollment Flow
- Backend runs on port 5001
- Mock API runs on port 4000
- Frontend runs on port 5173

Do not break any existing features.

New feature:
Add a browser-based API discovery flow.

User story:
As a tester, I want to enter an application base URL, click Start Discovery, manually perform a flow in a browser, stop the recording, and then have TestFlow Agent capture all API calls used in that flow, including request payloads/test data, response data, headers, and dynamic variables. Then generated Postman/JMeter/Playwright outputs should be runnable standalone.

Frontend changes:

1. Add a new section in Automation Discovery panel:
Title: Live Discovery

Fields:
- Base URL text box
  placeholder: http://localhost:4000 or application URL
- Start Discovery button
- Stop Discovery button
- Discovery status text

2. Keep the existing manual test case section and existing buttons.

3. Start Discovery should call:
POST http://localhost:5001/discovery/start
Body:
{
  "baseUrl": "<value from base URL textbox>",
  "manualTestCase": "<current manual test case>"
}

4. Stop Discovery should call:
POST http://localhost:5001/discovery/stop

5. After stop, frontend should show:
- Captured API count
- Captured API list with method, URL, status, and payload indicator
- Dynamic variables detected
- A message: “Discovery completed. Generated assets will use captured API flow.”

6. Add a new generated output type:
capturedFlow

Show captured flow JSON in Generated Workspace.

Backend changes:

1. Add discovery endpoints in backend/server.js or a new route file:

POST /discovery/start
POST /discovery/stop
GET /discovery/session

2. Use Playwright to launch Chromium for recording.

Install dependency if missing:
playwright

Use this approach:
- Launch Chromium headed mode so the tester can interact manually.
- Create browser context.
- Open page at baseUrl.
- Attach request and response event listeners.
- Capture only API/XHR/fetch calls, not images/css/fonts/static files.
- Store captured calls in memory for now.

Capture for each API call:
{
  "id": "...",
  "timestamp": "...",
  "method": "POST",
  "url": "...",
  "path": "...",
  "requestHeaders": {},
  "requestBody": {},
  "responseStatus": 200,
  "responseHeaders": {},
  "responseBody": {},
  "durationMs": 123
}

3. Filtering:
Ignore static resources:
- .js
- .css
- .png
- .jpg
- .jpeg
- .gif
- .svg
- .ico
- .woff
- .woff2
- fonts
- images

Capture:
- fetch
- xhr
- document requests only if content-type is JSON
- requests where content-type includes application/json
- responses where content-type includes application/json

4. Stop Discovery:
- Close browser
- Return captured APIs and analysis:
{
  "status": "SUCCESS",
  "capturedApiCount": 5,
  "capturedApis": [...],
  "dynamicVariables": [...],
  "detectedSteps": [...]
}

5. Dynamic variable detection:
Inspect response bodies and detect common IDs/tokens:
- accessToken
- token
- memberId
- id
- planId
- enrollmentId
- correlationId

Also detect when later request body/path/header uses a value from earlier response.
Example:
Response 1 returns accessToken.
Later request Authorization header uses it.
Mark as variable:
{
  "name": "accessToken",
  "sourceStep": "Authenticate",
  "targetSteps": ["Create Member", "Get Plans", "Submit Enrollment"]
}

6. Update existing generation endpoints:
- /agent/generate-postman
- /agent/generate-playwright
- /agent/generate-jmeter-plan

If a captured discovery session exists, generate assets from capturedApis instead of hardcoded enrollment flow.

Important:
Generated assets must be standalone runnable.

Postman generation from captured flow:
- Generate collection requests in captured order.
- Preserve method, URL path, headers, request body.
- Use environment variable:
  baseUrl
- Replace absolute host with {{baseUrl}}.
- Add test scripts to extract detected dynamic variables.
- Replace later usages of dynamic values with {{variableName}}.
- Generate environment JSON with baseUrl and detected variables.

Playwright generation from captured flow:
- Generate API test using request fixture.
- Use:
const baseUrl = process.env.BASE_URL || '<baseUrl>';
- Replay captured APIs in order.
- Use extracted variables from earlier responses.
- Replace dynamic values in later requests.
- Add status assertions based on captured responseStatus.
- Add basic response validations for detected IDs/status fields.

JMeter generation from captured flow:
- Generate valid .jmx XML.
- Include User Defined Variables:
baseUrl and detected variables.
- Add HTTP samplers in captured order.
- Add Header Manager.
- Add JSON extractors for dynamic variables.
- Replace dynamic values in later requests with ${variableName}.
- Add response code assertions.

7. Keep fallback behavior:
If no captured flow exists, current manual scenario generation should continue working exactly as before.

8. Add clear console logs:
- Discovery started
- Browser opened
- API captured
- Discovery stopped
- Number of APIs captured
- Generated output using captured flow or fallback flow

9. Add error handling:
If baseUrl is missing, return 400.
If discovery already running, return 409.
If stop is called without active session, return useful error.
If browser launch fails, return error message.

10. Add README note or comments:
This Phase 1 uses Playwright headed browser capture for local demo. Future enhancement can support HAR upload/export and secured enterprise app handling.

Acceptance criteria:
1. User enters baseUrl.
2. Clicks Start Discovery.
3. Browser opens.
4. User performs flow manually.
5. Clicks Stop Discovery.
6. UI shows captured API calls.
7. Generate Postman uses captured API flow.
8. Downloaded Postman collection + environment can run standalone.
9. Generate Playwright uses captured API flow and can run standalone.
10. Generate JMeter JMX uses captured API flow and can run standalone.
11. Existing hardcoded/mock enrollment demo still works if no captured flow exists.

Do this incrementally and keep the UI stable. Do not redesign the dashboard.