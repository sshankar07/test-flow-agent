Fix generic HAR discovery generation. Do not redesign UI. Do not break existing enrollment fallback.

Keep ports:
- frontend 5173
- backend 5001
- mock API 4000

Current discovery bugs:
1. It replaces normal numbers with {{id}}, breaking URLs like /api/v2 and i18n.
2. It creates many duplicate id variables.
3. It includes invalid browser/HTTP2 headers like :authority, :method, :path, :scheme.
4. It uses full login page URL as baseUrl instead of origin.
5. It captures too much noise and generates non-runnable Postman/Playwright/JMeter.

Fix backend discovery parser/generator.

Files to inspect:
- backend/server.js
- any backend discovery/generator helper files

Required fixes:

1. Base URL normalization:
If user enters https://opensource-demo.orangehrmlive.com/web/index.php/auth/login,
set generated baseUrl to origin:
https://opensource-demo.orangehrmlive.com

Generated request URLs should use:
{{baseUrl}}/web/index.php/...
Playwright should use:
const baseUrl = process.env.BASE_URL || "https://opensource-demo.orangehrmlive.com";

2. Stop replacing every numeric value or generic id.
Remove any logic that blindly replaces:
- numbers
- v2
- i18n
- browser version numbers
- dates
- query limits/offsets
with {{id}}.

Never turn:
v2 into v{{id}}
i18n into i{{id}}{{id}}n
Chrome/148 into Chrome/{{id}}

3. Dynamic variable detection:
Do NOT create variables for every field named id.
Only create a variable when:
- field name is specific, like accessToken, token, refreshToken, memberId, customerId, employeeId, planId, enrollmentId, orderId, transactionId, leaveRequestId
OR
- a response value is actually reused in a later request URL/body/header.

If variable name would be generic "id", derive a meaningful name from context:
- /employees/... id => employeeId
- /leave/... id => leaveId or leaveRequestId
- /buzz/... post.id => postId
Otherwise skip generic id extraction.

Deduplicate environment variables by key.

4. Header cleanup:
Remove these headers from generated Postman/Playwright/JMeter:
- any header starting with :
- host
- connection
- content-length
- accept-encoding
- sec-fetch-*
- sec-ch-ua*
- priority
- user-agent
- upgrade-insecure-requests
- cache-control
- if-none-match
- referer unless needed
- cookie by default
- authorization should be kept only as Bearer {{accessToken}} if accessToken is detected, otherwise mask or omit

5. Sensitive data masking:
Do not output raw password, token, authorization, cookie, csrf token, _token, secret in UI previews or generated downloadable files unless converted to variables.
For form bodies:
password=admin123 should become password={{password}}
_token=actualValue should become _token={{csrfToken}}
Add environment variables:
username
password
csrfToken only if needed.

6. Business API filtering:
Exclude static resources and low-value noise:
- js, css, png, jpg, jpeg, gif, svg, ico, webp, woff, woff2, ttf
- fonts
- analytics
- google-analytics
- gtag
- hotjar
- segment
- clarity
- favicon

Also exclude i18n/message calls by default:
paths containing /i18n/ or /messages

Exclude event polling/push by default:
paths containing /events/push

Include:
- POST, PUT, PATCH, DELETE
- JSON APIs with path containing /api/
- GET /api/ calls with application/json response

7. Add captured API classification:
Each captured API should have:
- included: true/false
- excludeReason if false
- operationName
- method
- path
- responseStatus

Frontend can still show captured APIs, but generation should use only included APIs.

8. Postman generation from captured HAR:
- Use {{baseUrl}} + relative path.
- Do not use absolute URL in raw when same origin.
- Do not include browser-only headers.
- Do not include duplicate id variables.
- Add status assertion only.
- Add extraction only for meaningful detected variables.
- Collection should be clean enough to import.

9. Playwright generation:
- Use clean relative paths:
await request.get(`${baseUrl}/web/index.php/api/v2/...`)
- Do not include browser pseudo headers.
- Do not replace v2 or i18n.
- Do not extract every id.
- Keep code readable.
- If login/form POST is captured and requires csrfToken, add a clear TODO comment:
  // TODO: CSRF/session token may need refresh before standalone replay.

10. JMeter generation:
- Same cleanup rules.
- Use ${baseUrl}.
- Do not include pseudo headers.
- Do not create duplicate id variables.

11. Environment generation:
- Deduplicate variables.
- Always include baseUrl.
- Include username/password only if login request has them.
- Include meaningful detected variables only.
- Do not repeat id 40 times.

12. Add logging:
- total HAR entries
- included API count
- excluded count
- excluded reasons summary
- dynamic variables count

13. Keep existing enrollment demo working when no discovery session exists.

Acceptance test using OrangeHRM HAR:
Generated files should NOT contain:
- {{id}} inside v2
- i{{id}}{{id}}n
- duplicate id variables
- :authority
- :method
- :path
- :scheme
- raw password value
- full login URL as baseUrl

Generated files SHOULD contain:
- baseUrl = https://opensource-demo.orangehrmlive.com
- clean paths like /web/index.php/api/v2/...
- only meaningful environment variables
- clean Postman/Playwright/JMeter output