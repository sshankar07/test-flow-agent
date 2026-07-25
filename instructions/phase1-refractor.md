Implement reusable generic website API discovery using Playwright HAR recording.

Project context:
TestFlow Agent currently has enrollment demo generation. Keep it working as fallback/demo.
Now add a reusable feature that can record API calls from ANY web application URL with UI.

Do not break existing features.
Keep ports:
- frontend 5173
- backend 5001
- mock API 4000

Goal:
Allow user to enter any application URL, click Start Discovery, manually perform any UI flow in the opened browser, click Stop Discovery, then generate standalone Postman, Playwright, and JMeter assets from the captured APIs.

This should NOT be hardcoded to enrollment.

Backend changes:

1. Add or update discovery endpoints:
POST /discovery/start
POST /discovery/stop
GET /discovery/session
GET /discovery/har/download
POST /discovery/clear

2. /discovery/start input:
{
  "baseUrl": "https://example.com",
  "manualTestCase": "optional text describing the business flow"
}

Behavior:
- Validate baseUrl starts with http:// or https://.
- Launch Playwright Chromium in headed mode.
- Create browser context with HAR recording:
  recordHar: {
    path: "./generated/discovery-session.har",
    content: "embed"
  }
- Open page at baseUrl.
- Store browser/context/page/baseUrl/manualTestCase/harPath in memory.
- Return:
{
  "status": "SUCCESS",
  "message": "Discovery browser started. Perform the flow in the opened browser, then click Stop Discovery."
}

3. /discovery/stop behavior:
- Close context so HAR file is written.
- Close browser.
- Read HAR file.
- Parse HAR entries.
- Filter captured requests to keep API/business calls and remove static noise.

Filtering rules:
Exclude URLs containing or ending with:
.js, .css, .png, .jpg, .jpeg, .gif, .svg, .ico, .webp, .woff, .woff2, .ttf, fonts, images, analytics, google-analytics, gtag, hotjar, segment, clarity, favicon

Include calls where:
- request method is POST, PUT, PATCH, DELETE
OR
- request/response content-type includes application/json
OR
- resource type looks like fetch/xhr
OR
- URL path contains api, graphql, services, rest, v1, v2

4. For each captured API, create normalized object:
{
  "id": "step-1",
  "stepNumber": 1,
  "method": "POST",
  "fullUrl": "https://site.com/api/login",
  "baseUrl": "https://site.com",
  "path": "/api/login",
  "queryString": "?x=1",
  "requestHeaders": {},
  "requestBody": {},
  "responseStatus": 200,
  "responseHeaders": {},
  "responseBody": {},
  "durationMs": 123,
  "contentType": "application/json",
  "operationName": "Login"
}

5. Add generic operation name detection:
Based on URL path and method:
- auth/token/login => Authenticate
- user/member/customer/person/create => Create Entity
- plan/product/search/list/get => Fetch Data
- submit/enroll/order/checkout/payment => Submit Transaction
- status/detail/validate => Validate Result
Fallback: METHOD + path

Do not hardcode only enrollment.

6. Add dynamic variable detection:
Inspect responseBody and detect common fields:
token, accessToken, refreshToken, id, userId, memberId, customerId, accountId, planId, orderId, enrollmentId, transactionId, correlationId, sessionId

For each detected variable:
{
  "name": "accessToken",
  "sourceStep": 1,
  "jsonPath": "$.accessToken",
  "valuePreview": "abc123..."
}

7. Add correlation:
If a later request header/body/url contains a value returned by an earlier response, replace it with variable syntax:
- Postman: {{variableName}}
- Playwright: ${variableName} or JS variable
- JMeter: ${variableName}

Examples:
Authorization: Bearer actual-token => Authorization: Bearer {{accessToken}}
/orders/12345 => /orders/{{orderId}}
body customerId: "C123" => customerId: "{{customerId}}"

8. /discovery/stop response:
{
  "status": "SUCCESS",
  "message": "Discovery completed. HAR captured and analyzed.",
  "capturedApiCount": 5,
  "harFileName": "discovery-session.har",
  "baseUrl": "...",
  "capturedApis": [...],
  "dynamicVariables": [...],
  "detectedSteps": [...]
}

9. /discovery/session:
Return current discovery session data:
- active true/false
- baseUrl
- capturedApiCount
- capturedApis
- dynamicVariables
- harFileName

10. /discovery/har/download:
Download saved HAR as attachment.
If no HAR exists, return 404.

11. /discovery/clear:
Clear active session/captured APIs/HAR metadata.
Do not delete user project files, only clear in-memory session state.

12. Update generation endpoints:
- /agent/generate-postman
- /agent/generate-playwright
- /agent/generate-jmeter-plan

If capturedApis exist, generate from capturedApis.
If no capturedApis exist, keep existing enrollment fallback.

Postman generation from capturedApis:
- Collection name: TestFlow Agent - Discovered API Flow
- Use {{baseUrl}} variable.
- Convert captured full URLs to relative path under {{baseUrl}} when same origin.
- Preserve method, headers, query params, and JSON body.
- Remove browser-only headers that should not be reused:
  host, connection, content-length, sec-fetch-*, sec-ch-ua*, accept-encoding, cookie unless needed
- If Authorization uses a detected token, replace with Bearer {{accessToken}}
- Add test scripts:
  - assert captured responseStatus
  - extract detected variables from response JSON
- Generate environment JSON:
  baseUrl = discovered base URL
  detected variables with blank values

Playwright generation from capturedApis:
- File name: discovered-flow.spec.ts
- Use:
const baseUrl = process.env.BASE_URL || "<discovered baseUrl>";
- Replay captured API calls in order using request fixture.
- Add status assertions based on captured responseStatus.
- Extract dynamic variables into JS const/let variables.
- Replace later usages with extracted variables.
- Keep code clean and readable.

JMeter generation from capturedApis:
- File name: discovered-flow.jmx
- Generate valid JMX XML.
- Use ${baseUrl}.
- Add one sampler per captured API.
- Add Header Manager.
- Add JSON Extractors for detected variables.
- Add response code assertions.
- Replace correlated values with ${variableName}.

13. Add safety/compliance note:
Do not capture/store passwords in generated logs if possible.
Mask sensitive fields in UI and output preview:
password, pass, pwd, secret, token, authorization, cookie, ssn, dob
For generated runnable assets, keep required values as variables, not raw secrets.

Frontend changes:

1. Add generic Live API Discovery section in Automation Discovery panel.

Fields:
- Application Base URL input
  placeholder: https://your-app-url.com
- Start Discovery button
- Stop Discovery button
- Download HAR button
- Clear Discovery button
- Discovery status

2. Start Discovery:
POST http://localhost:5001/discovery/start
Body:
{
  "baseUrl": baseUrlInput,
  "manualTestCase": manualTestCase
}

3. Stop Discovery:
POST http://localhost:5001/discovery/stop

4. After stop, show:
- Discovery completed message
- Captured API count
- Captured API list:
  method badge, path, status code, operation name
- Dynamic variables as chips
- Message:
“Generated assets will now use the captured API flow.”

5. Download HAR:
GET http://localhost:5001/discovery/har/download

6. Clear Discovery:
POST http://localhost:5001/discovery/clear
Then reset captured flow UI.

7. Existing Generate Postman / Playwright / JMeter buttons:
If captured flow exists, generated output should be from captured flow.
If no captured flow exists, use current manual enrollment scenario generation.

8. UI labels:
Rename section title to:
Live API Discovery

Button labels:
Start Discovery
Stop Discovery
Download HAR
Clear Discovery

9. Do not redesign the full UI.
Only add the generic discovery controls and captured API summary.

10. Keep existing manual enrollment demo working.

Acceptance criteria:

A. Generic website recording:
1. Enter any app URL with UI.
2. Click Start Discovery.
3. Browser opens.
4. User performs a flow manually.
5. Click Stop Discovery.
6. HAR is saved automatically.
7. UI shows captured API calls.
8. Download HAR works.

B. Generic asset generation:
1. Click Generate Postman.
2. Downloaded collection uses discovered APIs, not hardcoded enrollment.
3. Click Playwright.
4. Downloaded .ts uses discovered APIs.
5. Click JMeter.
6. Downloaded .jmx uses discovered APIs.

C. Fallback:
If no discovery session exists, existing enrollment demo still works.

D. Safety:
Do not show raw passwords, cookies, tokens, or authorization values in UI preview. Mask them.