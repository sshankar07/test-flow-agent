const { DEFAULT_BASE_URL, getCapturedDiscoverySession, normalizeBaseUrl } = require('../services/discoveryService');
const { replaceCredentialTokensInString, replaceValueOccurrences, templateUrlPathAndQuery, templateAbsoluteUrl, CSRF_TOKEN_HTML_PATTERNS } = require('./sanitize');

const DEFAULT_SCENARIO = {
  state: 'TX',
  plan: 'Silver',
  effectiveDate: '2026-01-01',
  negativeMissingEffectiveDate: false
};

function parseScenario(manualText) {
  const input = String(manualText || '');
  const text = input.toLowerCase();

  let state = 'TX';
  if (/california|\bca\b/.test(text)) state = 'CA';
  else if (/florida|\bfl\b/.test(text)) state = 'FL';
  else if (/texas|\btx\b/.test(text)) state = 'TX';

  let plan = 'Silver';
  if (/\bbronze\b/.test(text)) plan = 'Bronze';
  else if (/\bgold\b/.test(text)) plan = 'Gold';
  else if (/\bsilver\b/.test(text)) plan = 'Silver';

  let effectiveDate = '2026-01-01';
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    effectiveDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  } else {
    const mdyMatch = text.match(/(\b[01]?\d)\/([0-3]?\d)\/(\d{4})/);
    if (mdyMatch) {
      const mm = mdyMatch[1].padStart(2, '0');
      const dd = mdyMatch[2].padStart(2, '0');
      const yyyy = mdyMatch[3];
      effectiveDate = `${yyyy}-${mm}-${dd}`;
    }
  }

  const negativeMissingEffectiveDate = /without effective date|missing effective date|no effective date|effective date is missing|no effective date provided|not created|error response|expect.*400|expect.*error/i.test(input);

  return { state, plan, effectiveDate, negativeMissingEffectiveDate };
}

function buildEnrollmentFlow(inputText) {
  console.log('Building Enrollment Creation Flow from input length', inputText ? inputText.length : 0);
  const scenario = parseScenario(inputText || '');

  const steps = [
    {
      step: 1,
      action: 'Authenticate user',
      method: 'POST',
      endpoint: '{{baseUrl}}/auth/token',
      purpose: 'Generate access token for secured enrollment APIs'
    },
    {
      step: 2,
      action: 'Create member',
      method: 'POST',
      endpoint: '{{baseUrl}}/members',
      purpose: 'Create test member with generated demographic data'
    },
    {
      step: 3,
      action: 'Get available plans',
      method: 'GET',
      endpoint: `{{baseUrl}}/plans?state=${scenario.state}`,
      purpose: `Retrieve eligible plans for ${scenario.state}`
    },
    {
      step: 4,
      action: scenario.negativeMissingEffectiveDate ? 'Submit enrollment without effectiveDate' : 'Submit enrollment',
      method: 'POST',
      endpoint: '{{baseUrl}}/enrollments',
      purpose: scenario.negativeMissingEffectiveDate
        ? 'Submit enrollment without effectiveDate to validate API error handling'
        : 'Submit enrollment using memberId and planId'
    }
  ];

  if (!scenario.negativeMissingEffectiveDate) {
    steps.push({
      step: 5,
      action: 'Validate enrollment',
      method: 'GET',
      endpoint: '{{baseUrl}}/enrollments/{{enrollmentId}}',
      purpose: 'Validate enrollment status is ACTIVE'
    });
  }

  return {
    input: inputText || '',
    businessFlowName: 'Enrollment Creation Flow',
    detectedSteps: steps,
    dynamicVariables: ['baseUrl', 'accessToken', 'memberId', 'planId', 'enrollmentId', 'state'].concat(
      scenario.negativeMissingEffectiveDate ? [] : ['effectiveDate']
    ),
    scenario,
    validationChecklist: scenario.negativeMissingEffectiveDate
      ? [
        'Token response contains accessToken',
        'Member creation returns memberId',
        `Plans API returns at least one ${scenario.plan} plan`,
        'Submit enrollment returns HTTP 400 when effectiveDate missing'
      ]
      : [
        'Token response contains accessToken',
        'Member creation returns memberId',
        `Plans API returns at least one ${scenario.plan} plan`,
        'Enrollment response returns enrollmentId',
        'Enrollment status is ACTIVE'
      ],
    estimatedTimeSaving: {
      manualTime: '20 minutes',
      automatedTime: '10 seconds',
      savingPerRun: '19 minutes 50 seconds',
      estimatedTotalSaving: '1500 hours'
    }
  };
}

function getRequestBaseUrl(bodyBaseUrl) {
  return normalizeBaseUrl(bodyBaseUrl) || DEFAULT_BASE_URL;
}

function buildFallbackEnvironment(baseUrl) {
  return {
    name: 'TestFlow Enrollment Local Environment',
    values: [
      { key: 'baseUrl', value: baseUrl, enabled: true },
      { key: 'username', value: 'test', enabled: true },
      { key: 'password', value: 'test', enabled: true },
      { key: 'accessToken', value: '', enabled: true },
      { key: 'memberId', value: '', enabled: true },
      { key: 'planId', value: '', enabled: true },
      { key: 'enrollmentId', value: '', enabled: true }
    ],
    _postman_variable_scope: 'environment',
    _postman_exported_using: 'TestFlow Agent'
  };
}

function buildFallbackPostmanCollection(scenario = DEFAULT_SCENARIO, baseUrl = DEFAULT_BASE_URL) {
  const { state, plan, effectiveDate, negativeMissingEffectiveDate } = scenario;
  const lowerPlan = (plan || '').toLowerCase();

  const collection = {
    info: {
      name: `TestFlow Agent - Enrollment Creation (${state} - ${plan})`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      { key: 'baseUrl', value: baseUrl },
      { key: 'username', value: 'test' },
      { key: 'password', value: 'test' }
    ],
    item: [
      {
        name: 'Authenticate',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: { mode: 'raw', raw: JSON.stringify({ username: '{{username}}', password: '{{password}}' }, null, 2) },
          url: { raw: '{{baseUrl}}/auth/token', host: ['{{baseUrl}}'], path: ['auth', 'token'] }
        },
        event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
          "pm.test('Status code is 200', function () { pm.response.to.have.status(200); });",
          'var json = pm.response.json();',
          "pm.test('accessToken exists', function () { pm.expect(json.accessToken).to.exist; });",
          "pm.environment.set('accessToken', json.accessToken);"
        ] } }]
      },
      {
        name: 'Create Member',
        request: {
          method: 'POST',
          header: [
            { key: 'Content-Type', value: 'application/json' },
            { key: 'Authorization', value: 'Bearer {{accessToken}}' }
          ],
          body: { mode: 'raw', raw: JSON.stringify({ firstName: 'Test', lastName: 'Member', dob: '1990-01-01', state }, null, 2) },
          url: { raw: '{{baseUrl}}/members', host: ['{{baseUrl}}'], path: ['members'] }
        },
        event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
          "pm.test('Status is 201', function () { pm.response.to.have.status(201); });",
          'var json = pm.response.json();',
          "pm.test('memberId exists', function () { pm.expect(json.memberId || json.id).to.exist; });",
          "pm.environment.set('memberId', json.memberId || json.id);"
        ] } }]
      },
      {
        name: `Get ${state} Plans`,
        request: {
          method: 'GET',
          header: [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }],
          url: { raw: `{{baseUrl}}/plans?state=${state}`, host: ['{{baseUrl}}'], path: ['plans'], query: [{ key: 'state', value: state }] }
        },
        event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
          "pm.test('Status is 200', function () { pm.response.to.have.status(200); });",
          'var json = pm.response.json();',
          "var plans = Array.isArray(json) ? json : Array.isArray(json.plans) ? json.plans : Array.isArray(json.data) ? json.data : [];",
          "pm.test('Plans are returned', function () { pm.expect(plans).to.be.an('array'); pm.expect(plans.length).to.be.greaterThan(0); });",
          `var plan = plans.find(function(p){ return (p.name && p.name.toLowerCase().includes('${lowerPlan}')) || (p.type && p.type.toLowerCase() === '${lowerPlan}'); });`,
          "pm.test('Found plan', function () { pm.expect(plan).to.exist; });",
          "pm.environment.set('planId', plan.planId || plan.id);"
        ] } }]
      }
    ]
  };

  const submitBody = { memberId: '{{memberId}}', planId: '{{planId}}' };
  if (!negativeMissingEffectiveDate) {
    submitBody.effectiveDate = effectiveDate;
  }

  const submitTests = negativeMissingEffectiveDate
    ? [
      "pm.test('Status is 400', function () { pm.response.to.have.status(400); });",
      'var json = pm.response.json();',
      "pm.test('error mentions effectiveDate', function () { pm.expect(json.error || JSON.stringify(json)).to.include('effectiveDate'); });"
    ]
    : [
      "pm.test('Status is 201', function () { pm.response.to.have.status(201); });",
      'var json = pm.response.json();',
      "pm.test('enrollmentId exists', function () { pm.expect(json.enrollmentId || json.id).to.exist; });",
      "pm.test('enrollment status is ACTIVE', function () { pm.expect(json.status).to.eql('ACTIVE'); });",
      "pm.environment.set('enrollmentId', json.enrollmentId || json.id);"
    ];

  collection.item.push({
    name: 'Submit Enrollment',
    request: {
      method: 'POST',
      header: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'Authorization', value: 'Bearer {{accessToken}}' }
      ],
      body: { mode: 'raw', raw: JSON.stringify(submitBody, null, 2) },
      url: { raw: '{{baseUrl}}/enrollments', host: ['{{baseUrl}}'], path: ['enrollments'] }
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: submitTests } }]
  });

  if (!negativeMissingEffectiveDate) {
    collection.item.push({
      name: 'Validate Enrollment',
      request: {
        method: 'GET',
        header: [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }],
        url: { raw: '{{baseUrl}}/enrollments/{{enrollmentId}}', host: ['{{baseUrl}}'], path: ['enrollments', '{{enrollmentId}}'] }
      },
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        "pm.test('Status is 200', function () { pm.response.to.have.status(200); });",
        'var json = pm.response.json();',
        "pm.test('Enrollment is ACTIVE', function () { pm.expect(json.status).to.eql('ACTIVE'); });"
      ] } }]
    });
  }

  return collection;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function filterHeaders(headers) {
  const skipped = new Set([
    'host', 'connection', 'content-length', 'accept-encoding', 'accept', 'accept-language', 'cookie', 'priority', 'user-agent',
    'upgrade-insecure-requests', 'cache-control', 'if-none-match', 'referer'
  ]);
  const skippedPrefixes = [':', 'sec-fetch-', 'sec-ch-ua'];
  return Object.entries(headers || {})
    .filter(([key]) => !key.startsWith(':'))
    .filter(([key]) => !skipped.has(key.toLowerCase()))
    .filter(([key]) => !skippedPrefixes.some((prefix) => key.toLowerCase().startsWith(prefix)));
}

function getApiName(api, index) {
  return api.operationName || `${api.method} ${api.path || api.fullUrl || api.url || `step-${index + 1}`}`;
}

function replaceStringValues(input, variables, formatter) {
  if (typeof input !== 'string') {
    return input;
  }

  let output = input;
  [...variables]
    .filter((variable) => variable && variable.value)
    .sort((left, right) => right.value.length - left.value.length)
    .forEach((variable) => {
      output = replaceValueOccurrences(output, variable.value, formatter(variable.name));
    });
  return output;
}

function applyTemplate(value, variables, formatter) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyTemplate(item, variables, formatter));
  }

  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = applyTemplate(item, variables, formatter);
    }
    return output;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    const directMatch = variables.find((variable) => String(variable.value) === String(value));
    return directMatch ? formatter(directMatch.name) : value;
  }

  return replaceStringValues(value, variables, formatter);
}

function getRelativeUrl(urlString, baseUrl, variables, formatter) {
  const url = new URL(urlString);
  const templated = templateUrlPathAndQuery(url.pathname, url.search, variables, formatter);
  return templated || url.pathname || '/';
}

function isRedirectStatus(status) {
  const code = Number(status);
  return code >= 300 && code < 400;
}

function resolveStatusAssertion(api) {
  const outcome = api.expectedOutcome || 'as-captured';
  if (outcome === 'success') {
    return { mode: 'range', min: 200, max: 299, jmeterPattern: '^2\\d\\d$' };
  }
  if (outcome === 'failure') {
    return { mode: 'range', min: 400, max: 599, jmeterPattern: '^[45]\\d\\d$' };
  }
  return { mode: 'exact', status: api.responseStatus };
}

function createPostmanTests(api, sourceVariables) {
  const statusAssertion = resolveStatusAssertion(api);
  const tests = statusAssertion.mode === 'exact'
    ? [`pm.test('Status is ${statusAssertion.status}', function () { pm.response.to.have.status(${statusAssertion.status}); });`]
    : [`pm.test('Status is in ${statusAssertion.min}-${statusAssertion.max} range', function () { pm.expect(pm.response.code).to.be.within(${statusAssertion.min}, ${statusAssertion.max}); });`];
  if (api.responseBody && typeof api.responseBody === 'object') {
    tests.push('var json = pm.response.json();');
  }

  sourceVariables.forEach((variable) => {
    const accessor = buildObjectAccessor(variable.jsonPath);
    tests.push(`pm.environment.set('${variable.name}', json${accessor});`);
    tests.push(`pm.test('${variable.name} exists', function () { pm.expect(json${accessor}).to.exist; });`);
  });

  return tests;
}

function jsonPathToSegments(responsePath) {
  const normalized = String(responsePath || '').replace(/^\$\./, '');
  if (!normalized) {
    return [];
  }

  return normalized.split('.').flatMap((part) => {
    const segments = [];
    const matcher = /([^[\]]+)|\[(\d+)\]/g;
    let match = matcher.exec(part);
    while (match) {
      if (match[1]) {
        segments.push(match[1]);
      } else if (match[2]) {
        segments.push(Number(match[2]));
      }
      match = matcher.exec(part);
    }
    return segments;
  });
}

function buildObjectAccessor(responsePath) {
  return jsonPathToSegments(responsePath)
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `['${segment}']`))
    .join('');
}

function getIncludedApis(session) {
  return Array.isArray(session.includedApis) && session.includedApis.length
    ? session.includedApis
    : (session.capturedApis || []).filter((api) => api.included !== false);
}

function getEnvironmentVariables(session) {
  const credentialValues = session.credentialValues || {};
  const values = [{ key: 'baseUrl', value: session.baseUrl || DEFAULT_BASE_URL, enabled: true }];
  const seen = new Set(['baseUrl']);
  const envHints = session.envHints || {};

  if (envHints.username && !seen.has('username')) {
    seen.add('username');
    values.push({ key: 'username', value: credentialValues.username || '', enabled: true });
  }

  if (envHints.password && !seen.has('password')) {
    seen.add('password');
    values.push({ key: 'password', value: credentialValues.password || '', enabled: true });
  }

  if (envHints.csrfToken && !seen.has('csrfToken')) {
    seen.add('csrfToken');
    values.push({ key: 'csrfToken', value: credentialValues.csrfToken || '', enabled: true });
  }

  (session.dynamicVariables || []).forEach((variable) => {
    if (!seen.has(variable.name)) {
      seen.add(variable.name);
      values.push({ key: variable.name, value: variable.value || '', enabled: true });
    }
  });

  return values;
}

function sanitizeTemplatedBody(value, formatter = (name) => `{{${name}}}`) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTemplatedBody(item, formatter));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const lower = key.toLowerCase();
        if (lower === 'username') return [key, formatter('username')];
        if (lower === 'password') return [key, formatter('password')];
        if (lower === '_token' || lower === 'csrftoken' || lower === 'csrf' || lower === 'csrf_token') return [key, formatter('csrfToken')];
        return [key, sanitizeTemplatedBody(item, formatter)];
      })
    );
  }

  if (typeof value === 'string') {
    return replaceCredentialTokensInString(value, formatter);
  }

  return value;
}

function sanitizeGeneratedHeaders(headers, variables) {
  const filtered = filterHeaders(headers);
  const authVariable = variables.find((variable) => variable.name === 'accessToken')?.name
    || variables.find((variable) => variable.name === 'token')?.name;

  return filtered.flatMap(([key, value]) => {
    const lower = key.toLowerCase();
    if (lower === 'authorization') {
      if (!authVariable) {
        return [];
      }

      return [{
        key,
        value: String(value || '').toLowerCase().startsWith('bearer ') ? `Bearer {{${authVariable}}}` : `{{${authVariable}}}`
      }];
    }

    return [{
      key,
      value: replaceCredentialTokensInString(applyTemplate(value, variables, (name) => `{{${name}}}`))
    }];
  });
}

function sanitizeGeneratedBody(body, variables) {
  return sanitizeTemplatedBody(applyTemplate(body, variables, (name) => `{{${name}}}`));
}

function sanitizeGeneratedJmeterBody(body, variables) {
  return sanitizeTemplatedBody(applyTemplate(body, variables, (name) => `\${${name}}`), (name) => `\${${name}}`);
}

function safeDecodeURIComponent(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function parseQueryToPostmanFormat(queryString) {
  if (!queryString) {
    return undefined;
  }

  const pairs = queryString.split('&').filter(Boolean).map((pair) => {
    const eqIndex = pair.indexOf('=');
    const key = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
    const value = eqIndex === -1 ? '' : pair.slice(eqIndex + 1);
    return { key: safeDecodeURIComponent(key), value: safeDecodeURIComponent(value) };
  });

  return pairs.length ? pairs : undefined;
}

function buildPostmanUrl(templatedUrl, isSameOrigin) {
  if (isSameOrigin) {
    const withoutHostVar = templatedUrl.replace(/^\{\{baseUrl\}\}/, '');
    const [pathPart, queryPart] = withoutHostVar.split('?');
    const path = pathPart.split('/').filter(Boolean);
    const query = parseQueryToPostmanFormat(queryPart);
    const urlObj = { raw: templatedUrl, host: ['{{baseUrl}}'], path };
    if (query) {
      urlObj.query = query;
    }
    return urlObj;
  }

  const [beforeQuery, queryPart] = templatedUrl.split('?');
  const query = parseQueryToPostmanFormat(queryPart);
  const match = beforeQuery.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/]+)(\/.*)?$/);
  const urlObj = { raw: templatedUrl };
  if (match) {
    const [, protocol, hostPart, pathPart] = match;
    urlObj.protocol = protocol;
    urlObj.host = hostPart.split('.');
    urlObj.path = (pathPart || '').split('/').filter(Boolean);
  }
  if (query) {
    urlObj.query = query;
  }
  return urlObj;
}

function resolveCsrfRefreshStep(session, urlFormatter) {
  const source = session.csrfRefreshSource;
  if (!source) {
    return null;
  }

  const baseUrl = session.baseUrl || DEFAULT_BASE_URL;
  const rawUrl = source.url;
  const isSameOrigin = rawUrl.startsWith(baseUrl);
  const relativeUrl = isSameOrigin
    ? getRelativeUrl(rawUrl, baseUrl, session.dynamicVariables, urlFormatter)
    : templateAbsoluteUrl(rawUrl, session.dynamicVariables, urlFormatter);
  const templatedUrl = isSameOrigin ? `${urlFormatter('baseUrl')}${relativeUrl}` : relativeUrl;
  const pattern = CSRF_TOKEN_HTML_PATTERNS[source.patternIndex];

  return { isSameOrigin, templatedUrl, pattern, method: source.method || 'GET' };
}

function buildCsrfRefreshPostmanItem(session) {
  const formatter = (name) => `{{${name}}}`;
  const step = resolveCsrfRefreshStep(session, formatter);
  if (!step) {
    return null;
  }

  const regexLiteral = new RegExp(step.pattern.source, step.pattern.flags).toString();

  return {
    name: 'Fetch Login Page (CSRF)',
    request: {
      method: step.method,
      header: [],
      url: buildPostmanUrl(step.templatedUrl, step.isSameOrigin)
    },
    event: [{
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          `var csrfMatch = pm.response.text().match(${regexLiteral});`,
          "pm.test('CSRF token extracted from login page', function () { pm.expect(csrfMatch && csrfMatch[1]).to.exist; });",
          "if (csrfMatch && csrfMatch[1]) { pm.environment.set('csrfToken', csrfMatch[1]); }"
        ]
      }
    }]
  };
}

function buildCapturedPostmanResponse(session) {
  const baseUrl = session.baseUrl || DEFAULT_BASE_URL;
  const includedApis = getIncludedApis(session);
  const csrfRefreshItem = buildCsrfRefreshPostmanItem(session);
  const collection = {
    info: {
      name: 'TestFlow Agent - Discovered API Flow',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [{ key: 'baseUrl', value: baseUrl }],
    item: [
      ...(csrfRefreshItem ? [csrfRefreshItem] : []),
      ...includedApis.map((api, index) => {
      const stepName = getApiName(api, index);
      const sourceVariables = session.dynamicVariables.filter((variable) => variable.sourceStep === api.stepNumber);
      const rawUrl = api.fullUrl || api.url;
      const relativeUrl = rawUrl.startsWith(baseUrl)
        ? replaceCredentialTokensInString(getRelativeUrl(rawUrl, baseUrl, session.dynamicVariables, (name) => `{{${name}}}`))
        : replaceCredentialTokensInString(templateAbsoluteUrl(rawUrl, session.dynamicVariables, (name) => `{{${name}}}`));
      const templatedUrl = rawUrl.startsWith(baseUrl)
        ? `{{baseUrl}}${relativeUrl}`
        : relativeUrl;
      const templatedBody = sanitizeGeneratedBody(api.requestBody, session.dynamicVariables);
      const headers = sanitizeGeneratedHeaders(api.requestHeaders, session.dynamicVariables);

      if (templatedBody && !headers.some((header) => header.key.toLowerCase() === 'content-type')) {
        headers.push({ key: 'Content-Type', value: 'application/json' });
      }

      const request = {
        method: api.method,
        header: headers,
        url: buildPostmanUrl(templatedUrl, rawUrl.startsWith(baseUrl))
      };

      if (templatedBody !== null && templatedBody !== undefined) {
        request.body = {
          mode: 'raw',
          raw: typeof templatedBody === 'string' ? templatedBody : JSON.stringify(templatedBody, null, 2)
        };
      }

      const item = {
        name: stepName,
        request,
        event: [{ listen: 'test', script: { type: 'text/javascript', exec: createPostmanTests(api, sourceVariables) } }]
      };

      if (isRedirectStatus(api.responseStatus) && (api.expectedOutcome || 'as-captured') === 'as-captured') {
        // Postman follows redirects by default, which would hide the captured 3xx status
        // from pm.response — disable it so the assertion below actually observes it.
        item.protocolProfileBehavior = { followRedirects: false };
      }

      return item;
      })
    ]
  };

  const environment = {
    name: 'TestFlow Captured Flow Environment',
    values: getEnvironmentVariables(session),
    _postman_variable_scope: 'environment',
    _postman_exported_using: 'TestFlow Agent'
  };

  console.log('[generate-postman] Generated output using captured flow');
  return {
    type: 'postman',
    source: 'capturedFlow',
    fileName: 'discovered-flow-collection.json',
    environmentFileName: 'discovered-flow-environment.json',
    estimatedManualEffort: '45 to 60 minutes',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Discovery completed. Generated assets are replaying the captured API flow.',
    capturedApiCount: includedApis.length,
    collection,
    environment
  };
}

function buildCsrfRefreshPlaywrightBlock(session) {
  const formatter = (name) => `{{${name}}}`;
  const step = resolveCsrfRefreshStep(session, formatter);
  if (!step) {
    return null;
  }

  const regexLiteral = new RegExp(step.pattern.source, step.pattern.flags).toString();
  const urlExpression = step.isSameOrigin
    ? `baseUrl + interpolateString(${JSON.stringify(step.templatedUrl.replace(/^\{\{baseUrl\}\}/, ''))}, variables)`
    : `interpolateString(${JSON.stringify(step.templatedUrl)}, variables)`;

  return [
    '  {',
    '    // 0) Fetch Login Page (CSRF)',
    `    const csrfPageResponse = await request.fetch(${urlExpression}, { method: ${JSON.stringify(step.method)} });`,
    '    const csrfPageText = await csrfPageResponse.text();',
    `    const csrfMatch = csrfPageText.match(${regexLiteral});`,
    '    if (csrfMatch && csrfMatch[1]) {',
    '      variables.csrfToken = csrfMatch[1];',
    '    }',
    '    expect(variables.csrfToken).toBeTruthy();',
    '  }'
  ].join('\n');
}

function buildCapturedPlaywrightResponse(session) {
  const baseUrl = session.baseUrl || DEFAULT_BASE_URL;
  const includedApis = getIncludedApis(session);
  const envHints = session.envHints || {};
  const credentialValues = session.credentialValues || {};
  const hasEmbeddedCredentials = Boolean(envHints.username || envHints.password || envHints.csrfToken);
  const stepBlocks = includedApis.map((api, index) => {
    const stepName = getApiName(api, index);
    const rawUrl = api.fullUrl || api.url;
    const relativeUrl = rawUrl.startsWith(baseUrl)
      ? replaceCredentialTokensInString(getRelativeUrl(rawUrl, baseUrl, session.dynamicVariables, (name) => `{{${name}}}`))
      : replaceCredentialTokensInString(templateAbsoluteUrl(rawUrl, session.dynamicVariables, (name) => `{{${name}}}`));
    const templatedHeaders = Object.fromEntries(
      sanitizeGeneratedHeaders(api.requestHeaders, session.dynamicVariables).map((header) => [header.key, header.value])
    );
    const templatedBody = sanitizeGeneratedBody(api.requestBody, session.dynamicVariables);
    const sourceVariables = session.dynamicVariables.filter((variable) => variable.sourceStep === api.stepNumber);
    const statusAssertion = resolveStatusAssertion(api);
    const responseStatusAssertion = statusAssertion.mode === 'exact'
      ? `  expect(step${index + 1}Response.status()).toBe(${statusAssertion.status});`
      : `  expect(step${index + 1}Response.status()).toBeGreaterThanOrEqual(${statusAssertion.min});\n  expect(step${index + 1}Response.status()).toBeLessThanOrEqual(${statusAssertion.max});`;
    const extractionLines = sourceVariables.map((variable) => {
      const pathSegments = jsonPathToSegments(variable.jsonPath)
        .map((segment) => (typeof segment === 'number' ? String(segment) : `'${segment}'`))
        .join(', ');
      return `  variables.${variable.name} = getByPath(step${index + 1}Json, [${pathSegments}]);\n  expect(variables.${variable.name}).toBeTruthy();`;
    }).join('\n');

    const bodySetup = templatedBody === null || templatedBody === undefined
      ? '  const stepBody: any = undefined;'
      : `  const stepBody: any = interpolateValue(${JSON.stringify(templatedBody, null, 2)}, variables);`;

    const bodyLines = [
      `// ${index + 1}) ${stepName}`,
      rawUrl.startsWith(baseUrl)
        ? `const stepUrl = baseUrl + interpolateString(${JSON.stringify(relativeUrl)}, variables);`
        : `const stepUrl = interpolateString(${JSON.stringify(relativeUrl)}, variables);`,
      `const stepHeaders: Record<string, any> = interpolateValue(${JSON.stringify(templatedHeaders, null, 2)}, variables) || {};`,
      bodySetup.trim(),
      'const stepOptions: { method: string; headers: Record<string, any>; data?: string; maxRedirects?: number } = {',
      `  method: ${JSON.stringify(api.method)},`,
      isRedirectStatus(api.responseStatus) && (api.expectedOutcome || 'as-captured') === 'as-captured'
        // request.fetch() follows redirects by default, which would hide the captured 3xx
        // status from the response below — disable it so the assertion actually observes it.
        ? '  maxRedirects: 0,'
        : '',
      '  headers: stepHeaders',
      '};',
      'if (stepBody !== undefined) {',
      "  stepOptions.data = typeof stepBody === 'string' ? stepBody : JSON.stringify(stepBody);",
      '}',
      `const step${index + 1}Response = await request.fetch(stepUrl, stepOptions);`,
      responseStatusAssertion.trim(),
      `const step${index + 1}ContentType = step${index + 1}Response.headers()['content-type'] || '';`,
      `const step${index + 1}Text = await step${index + 1}Response.text();`,
      `const step${index + 1}Json = step${index + 1}ContentType.includes('application/json') && step${index + 1}Text ? JSON.parse(step${index + 1}Text) : null;`,
      extractionLines.trim() || '// No dynamic variables extracted from this response.'
    ].filter(Boolean);

    return ['  {', ...bodyLines.map((line) => `    ${line.replace(/\n/g, '\n    ')}`), '  }'].join('\n');
  }).join('\n\n');

  const script = [
    '/**',
    ' * Captured API flow replay.',
    hasEmbeddedCredentials
      ? ' * Credentials/tokens below default to the values captured during discovery, so this'
      : ' * No credentials were detected in the captured flow.',
    hasEmbeddedCredentials ? ' * spec should run as-is against the same server. Session-bound values (CSRF tokens,' : '',
    hasEmbeddedCredentials ? ' * cookies) are typically short-lived and WILL likely need to be refreshed for a rerun' : '',
    hasEmbeddedCredentials ? ' * against a live server — override BASE_URL / USERNAME / PASSWORD / CSRF_TOKEN via a' : '',
    hasEmbeddedCredentials ? ' * .env file or environment variables if the captured session has expired.' : '',
    ' */',
    "import { test, expect } from '@playwright/test';",
    '',
    `const baseUrl = process.env.BASE_URL || ${JSON.stringify(baseUrl)};`,
    envHints.username ? `const username = process.env.USERNAME || ${JSON.stringify(credentialValues.username || '')};` : '',
    envHints.password ? `const password = process.env.PASSWORD || ${JSON.stringify(credentialValues.password || '')};` : '',
    envHints.csrfToken ? `const csrfToken = process.env.CSRF_TOKEN || ${JSON.stringify(credentialValues.csrfToken || '')};` : '',
    envHints.csrfToken ? '// NOTE: csrfToken above is a snapshot from discovery time and may already be expired/rotated — set CSRF_TOKEN in a .env file with a fresh value before running if requests fail with a 401/403.' : '',
    '',
    'function interpolateString(value: any, variables: Record<string, any>): string {',
    "  return String(value).replace(/\\{\\{([^}]+)\\}\\}/g, (_, key) => variables[key] ?? '');",
    '}',
    '',
    'function interpolateValue(value: any, variables: Record<string, any>): any {',
    '  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, variables));',
    "  if (value && typeof value === 'object') {",
    '    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateValue(item, variables)]));',
    '  }',
    "  if (typeof value === 'string') return interpolateString(value, variables);",
    '  return value;',
    '}',
    '',
    'function getByPath(value: any, segments: (string | number)[]): any {',
    '  return segments.reduce((current, segment) => (current === undefined || current === null ? undefined : current[segment]), value);',
    '}',
    '',
    "test('Captured API Flow - API replay', async ({ request }) => {",
    '  const variables: Record<string, any> = {',
    envHints.username ? '    username,' : '',
    envHints.password ? '    password,' : '',
    envHints.csrfToken ? '    csrfToken,' : '',
    '  };',
    buildCsrfRefreshPlaywrightBlock(session),
    stepBlocks,
    '});'
  ].filter(Boolean).join('\n');

  console.log('[generate-playwright] Generated output using captured flow');
  return {
    type: 'playwright',
    source: 'capturedFlow',
    fileName: 'discovered-flow.spec.ts',
    estimatedManualEffort: '60 to 90 minutes',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Discovery completed. Generated Playwright code is replaying the captured API flow.',
    script
  };
}

function buildResponseAssertion(api) {
  const statusAssertion = resolveStatusAssertion(api);
  const testString = statusAssertion.mode === 'exact' ? String(statusAssertion.status) : statusAssertion.jmeterPattern;
  const testType = statusAssertion.mode === 'exact' ? 8 : 2; // 8 = Equals, 2 = Matches (regex)

  return [
    '          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Status Assertion" enabled="true">',
    '            <collectionProp name="Asserion.test_strings">',
    `              <stringProp name="49586">${escapeXml(testString)}</stringProp>`,
    '            </collectionProp>',
    '            <stringProp name="Assertion.custom_message"></stringProp>',
    '            <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>',
    '            <boolProp name="Assertion.assume_success">false</boolProp>',
    `            <intProp name="Assertion.test_type">${testType}</intProp>`,
    '          </ResponseAssertion>',
    '          <hashTree/>'
  ];
}

function buildJsonExtractor(variable) {
  return [
    `          <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="Extract ${escapeXml(variable.name)}" enabled="true">`,
    `            <stringProp name="JSONPostProcessor.referenceNames">${escapeXml(variable.name)}</stringProp>`,
    `            <stringProp name="JSONPostProcessor.jsonPathExprs">${escapeXml(variable.jsonPath)}</stringProp>`,
    '            <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>',
    '            <stringProp name="JSONPostProcessor.defaultValues"></stringProp>',
    '          </JSONPostProcessor>',
    '          <hashTree/>'
  ];
}

function buildHeaderManager(headers) {
  const headerEntries = Object.entries(headers || {});
  if (!headerEntries.length) {
    return ['        <hashTree/>'];
  }

  return [
    '        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="Request Headers" enabled="true">',
    '          <collectionProp name="HeaderManager.headers">',
    ...headerEntries.flatMap(([key, value]) => [
      `            <elementProp name="${escapeXml(key)}" elementType="Header">`,
      `              <stringProp name="Header.name">${escapeXml(key)}</stringProp>`,
      `              <stringProp name="Header.value">${escapeXml(value)}</stringProp>`,
      '            </elementProp>'
    ]),
    '          </collectionProp>',
    '        </HeaderManager>',
    '        <hashTree/>'
  ];
}

function buildCsrfRefreshJmeterBlock(session) {
  const formatter = (name) => `\${${name}}`;
  const step = resolveCsrfRefreshStep(session, formatter);
  if (!step) {
    return [];
  }

  const regexSource = (step.pattern.flags.includes('i') ? '(?i)' : '') + step.pattern.source;

  return [
    '        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Fetch Login Page (CSRF)" enabled="true">',
    '          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>',
    '          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">',
    '            <collectionProp name="Arguments.arguments"/>',
    '          </elementProp>',
    `          <stringProp name="HTTPSampler.path">${escapeXml(step.templatedUrl)}</stringProp>`,
    `          <stringProp name="HTTPSampler.method">${escapeXml(step.method)}</stringProp>`,
    '        </HTTPSamplerProxy>',
    '        <hashTree>',
    '          <RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="Extract csrfToken" enabled="true">',
    '            <stringProp name="RegexExtractor.useHeaders">false</stringProp>',
    '            <stringProp name="RegexExtractor.refname">csrfToken</stringProp>',
    `            <stringProp name="RegexExtractor.regex">${escapeXml(regexSource)}</stringProp>`,
    '            <stringProp name="RegexExtractor.template">$1$</stringProp>',
    '            <stringProp name="RegexExtractor.default"></stringProp>',
    '            <stringProp name="RegexExtractor.match_number">1</stringProp>',
    '          </RegexExtractor>',
    '          <hashTree/>',
    '        </hashTree>'
  ];
}

function buildCookieManagerBlock() {
  return [
    '        <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true">',
    '          <collectionProp name="CookieManager.cookies"/>',
    '          <boolProp name="CookieManager.clearEachIteration">false</boolProp>',
    '          <stringProp name="CookieManager.policy">standard</stringProp>',
    '          <boolProp name="CookieManager.controlledByThread">false</boolProp>',
    '        </CookieManager>',
    '        <hashTree/>'
  ];
}

function buildCapturedJmeterResponse(session) {
  const baseUrl = session.baseUrl || DEFAULT_BASE_URL;
  const includedApis = getIncludedApis(session);
  const variableArgs = getEnvironmentVariables(session).map((variable) => ({
    key: variable.key,
    value: variable.value
  }));

  const samplerBlocks = includedApis.flatMap((api, index) => {
    const stepName = getApiName(api, index);
    const rawUrl = api.fullUrl || api.url;
    const relativeUrl = rawUrl.startsWith(baseUrl)
      ? replaceCredentialTokensInString(getRelativeUrl(rawUrl, baseUrl, session.dynamicVariables, (name) => `\${${name}}`), (name) => `\${${name}}`)
      : replaceCredentialTokensInString(templateAbsoluteUrl(rawUrl, session.dynamicVariables, (name) => `\${${name}}`), (name) => `\${${name}}`);
    const templatedHeaders = Object.fromEntries(
      sanitizeGeneratedHeaders(api.requestHeaders, session.dynamicVariables)
        .map((header) => [header.key, header.value.replaceAll('{{', '${').replaceAll('}}', '}')])
    );
    const templatedBody = sanitizeGeneratedJmeterBody(api.requestBody, session.dynamicVariables);
    const extractors = session.dynamicVariables
      .filter((variable) => variable.sourceStep === api.stepNumber)
      .flatMap((variable) => buildJsonExtractor(variable));
    const bodyValue = templatedBody === null || templatedBody === undefined
      ? ''
      : typeof templatedBody === 'string'
        ? templatedBody
        : JSON.stringify(templatedBody);
    const fullPath = rawUrl.startsWith(baseUrl) ? `\${baseUrl}${relativeUrl}` : relativeUrl;
    const samplerBody = bodyValue
      ? [
        '              <elementProp name="" elementType="HTTPArgument">',
        '                <boolProp name="HTTPArgument.always_encode">false</boolProp>',
        `                <stringProp name="Argument.value">${escapeXml(bodyValue)}</stringProp>`,
        '                <stringProp name="Argument.metadata">=</stringProp>',
        '              </elementProp>'
      ]
      : [];

    const suppressRedirects = isRedirectStatus(api.responseStatus) && (api.expectedOutcome || 'as-captured') === 'as-captured';

    return [
      `        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${escapeXml(stepName)}" enabled="true">`,
      '          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>',
      '          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">',
      '            <collectionProp name="Arguments.arguments">',
      ...samplerBody,
      '            </collectionProp>',
      '          </elementProp>',
      `          <stringProp name="HTTPSampler.path">${escapeXml(fullPath)}</stringProp>`,
      `          <stringProp name="HTTPSampler.method">${escapeXml(api.method)}</stringProp>`,
      // JMeter follows redirects by default, which would hide the captured 3xx status from
      // the response assertion below — disable it so the assertion actually observes it.
      suppressRedirects ? '          <boolProp name="HTTPSampler.follow_redirects">false</boolProp>' : '',
      suppressRedirects ? '          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>' : '',
      '        </HTTPSamplerProxy>',
      '        <hashTree>',
      ...buildHeaderManager(templatedHeaders),
      ...extractors,
      ...buildResponseAssertion(api),
      '        </hashTree>'
    ].filter(Boolean);
  });

  const jmx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.2">',
    '  <hashTree>',
    '    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Discovered API Flow Plan" enabled="true">',
    '      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments">',
    '        <collectionProp name="Arguments.arguments">',
    ...variableArgs.flatMap((variable) => [
      `          <elementProp name="${escapeXml(variable.key)}" elementType="Argument">`,
      `            <stringProp name="Argument.name">${escapeXml(variable.key)}</stringProp>`,
      `            <stringProp name="Argument.value">${escapeXml(variable.value)}</stringProp>`,
      '          </elementProp>'
    ]),
    '        </collectionProp>',
    '      </elementProp>',
    '    </TestPlan>',
    '    <hashTree>',
    '      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Captured Flow Thread Group" enabled="true">',
    '        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>',
    '        <elementProp name="ThreadGroup.main_controller" elementType="LoopController">',
    '          <boolProp name="LoopController.continue_forever">false</boolProp>',
    '          <intProp name="LoopController.loops">1</intProp>',
    '        </elementProp>',
    '        <stringProp name="ThreadGroup.num_threads">1</stringProp>',
    '        <stringProp name="ThreadGroup.ramp_time">1</stringProp>',
    '      </ThreadGroup>',
    '      <hashTree>',
    ...buildCookieManagerBlock(),
    ...buildCsrfRefreshJmeterBlock(session),
    ...samplerBlocks,
    '      </hashTree>',
    '    </hashTree>',
    '  </hashTree>',
    '</jmeterTestPlan>'
  ].join('\n');

  const testData = {
    description: 'Prerequisite variables for discovered-flow.jmx. These are already embedded in the JMX as User Defined Variables (TestPlan.user_defined_variables) — this file is provided as a readable reference of the same values, and can be used to update the JMX (or drive a CSV/JSON data-driven run) if the target values change.',
    variables: Object.fromEntries(variableArgs.map((variable) => [variable.key, variable.value]))
  };

  console.log('[generate-jmeter] Generated output using captured flow');
  return {
    type: 'jmeter',
    source: 'capturedFlow',
    fileName: 'discovered-flow.jmx',
    dataFileName: 'discovered-flow-data.json',
    estimatedManualEffort: '2 to 3 hours',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Discovery completed. Generated JMeter XML is replaying the captured API flow.',
    jmx,
    testData,
    summary: {
      threadGroup: { name: 'Captured Flow Thread Group', threads: 1, rampUp: 1, loops: 1 },
      steps: includedApis.map((api, index) => getApiName(api, index))
    }
  };
}

function buildFallbackPlaywrightResponse(scenario, baseUrl) {
  const state = scenario.state;
  const plan = scenario.plan;
  const effectiveDate = scenario.effectiveDate;
  const negative = scenario.negativeMissingEffectiveDate;
  const planFindExpr = `p.name && p.name.toLowerCase().includes('${plan.toLowerCase()}') || (p.type && p.type.toLowerCase() === '${plan.toLowerCase()}')`;

  const scriptLines = [
    "import { test, expect } from '@playwright/test';",
    '',
    `const baseUrl = process.env.BASE_URL || '${baseUrl}';`,
    "const username = process.env.USERNAME || 'test';",
    "const password = process.env.PASSWORD || 'test';",
    '',
    "test('Enrollment Creation Flow - API', async ({ request }) => {",
    "  const auth = await request.post(baseUrl + '/auth/token', { data: { username, password } });",
    '  expect(auth.status()).toBe(200);',
    '  const authJson = await auth.json();',
    '  const accessToken = authJson.accessToken;',
    '  expect(accessToken).toBeTruthy();',
    '',
    "  const memberRes = await request.post(baseUrl + '/members', {",
    `    data: { firstName: 'Test', lastName: 'Member', dob: '1990-01-01', state: '${state}' },`,
    "    headers: { Authorization: 'Bearer ' + accessToken }",
    '  });',
    '  expect(memberRes.status()).toBe(201);',
    '  const memberJson = await memberRes.json();',
    '  const memberId = memberJson.memberId || memberJson.id;',
    '  expect(memberId).toBeTruthy();',
    '',
    `  const plansRes = await request.get(baseUrl + '/plans?state=${state}', { headers: { Authorization: 'Bearer ' + accessToken } });`,
    '  expect(plansRes.status()).toBe(200);',
    '  const plansJson = await plansRes.json();',
    '  const plans = Array.isArray(plansJson) ? plansJson : (plansJson && plansJson.plans) ? plansJson.plans : (plansJson && plansJson.data) ? plansJson.data : [];',
    '  expect(Array.isArray(plans)).toBeTruthy();',
    '  expect(plans.length).toBeGreaterThan(0);',
    `  const plan = plans.find(p => (${planFindExpr}));`,
    '  expect(plan).toBeTruthy();',
    '  const planId = plan.planId || plan.id;',
    '  expect(planId).toBeTruthy();',
    ''
  ];

  if (!negative) {
    scriptLines.push(
      "  const enrollRes = await request.post(baseUrl + '/enrollments', {",
      `    data: { memberId, planId, effectiveDate: '${effectiveDate}' },`,
      "    headers: { Authorization: 'Bearer ' + accessToken }",
      '  });',
      '  expect(enrollRes.status()).toBe(201);',
      '  const enrollJson = await enrollRes.json();',
      '  const enrollmentId = enrollJson.enrollmentId || enrollJson.id;',
      '  expect(enrollmentId).toBeTruthy();',
      '',
      "  const validateRes = await request.get(baseUrl + '/enrollments/' + enrollmentId, { headers: { Authorization: 'Bearer ' + accessToken } });",
      '  expect(validateRes.status()).toBe(200);',
      '  const validateJson = await validateRes.json();',
      "  expect(validateJson.status).toBe('ACTIVE');"
    );
  } else {
    scriptLines.push(
      "  const enrollRes = await request.post(baseUrl + '/enrollments', {",
      '    data: { memberId, planId },',
      "    headers: { Authorization: 'Bearer ' + accessToken }",
      '  });',
      '  expect(enrollRes.status()).toBe(400);',
      '  const errJson = await enrollRes.json();',
      "  expect(JSON.stringify(errJson)).toContain('effectiveDate');"
    );
  }

  scriptLines.push('});');

  return {
    type: 'playwright',
    fileName: 'enrollment-flow.spec.ts',
    estimatedManualEffort: '60 to 90 minutes',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Generated Playwright API test in under 1 minute. Manually coding and debugging this chained API test usually takes 60–90 minutes.',
    script: scriptLines.join('\n')
  };
}

function buildFallbackJmeterResponse(scenario, baseUrl) {
  const negative = scenario.negativeMissingEffectiveDate;
  const jmx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.2">',
    '  <hashTree>',
    '    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Enrollment Test Plan" enabled="true">',
    '      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments">',
    '        <collectionProp name="Arguments.arguments">',
    `          <elementProp name="baseUrl" elementType="Argument"><stringProp name="Argument.name">baseUrl</stringProp><stringProp name="Argument.value">${escapeXml(baseUrl)}</stringProp></elementProp>`,
    '        </collectionProp>',
    '      </elementProp>',
    '    </TestPlan>',
    '    <hashTree>',
    '      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Enrollment Flow Thread Group" enabled="true">',
    '        <elementProp name="ThreadGroup.main_controller" elementType="LoopController">',
    '          <boolProp name="LoopController.continue_forever">false</boolProp>',
    '          <intProp name="LoopController.loops">1</intProp>',
    '        </elementProp>',
    '        <stringProp name="ThreadGroup.num_threads">1</stringProp>',
    '        <stringProp name="ThreadGroup.ramp_time">1</stringProp>',
    '      </ThreadGroup>',
    '      <hashTree>',
    '        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Authenticate" enabled="true">',
    '          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>',
    '          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">',
    '            <collectionProp name="Arguments.arguments">',
    '              <elementProp name="" elementType="HTTPArgument">',
    '                <boolProp name="HTTPArgument.always_encode">false</boolProp>',
    '                <stringProp name="Argument.value">{&quot;username&quot;:&quot;test&quot;,&quot;password&quot;:&quot;test&quot;}</stringProp>',
    '                <stringProp name="Argument.metadata">=</stringProp>',
    '              </elementProp>',
    '            </collectionProp>',
    '          </elementProp>',
    '          <stringProp name="HTTPSampler.path">${baseUrl}/auth/token</stringProp>',
    '          <stringProp name="HTTPSampler.method">POST</stringProp>',
    '        </HTTPSamplerProxy>',
    '        <hashTree/>',
    '      </hashTree>',
    '    </hashTree>',
    '  </hashTree>',
    '</jmeterTestPlan>'
  ].join('\n');

  return {
    type: 'jmeter',
    fileName: 'enrollment-flow.jmx',
    estimatedManualEffort: '2 to 3 hours',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Generated JMeter JMX plan in under 1 minute. Manually creating samplers, headers, extractors, correlations, and assertions usually takes 2–3 hours.',
    jmx,
    summary: {
      threadGroup: { name: 'Enrollment Flow Thread Group', threads: 1, rampUp: 1, loops: 1 },
      steps: negative ? ['Authenticate', 'Create Member', 'Get Plans', 'Submit Enrollment (expect 400)'] : ['Authenticate', 'Create Member', 'Get Plans', 'Submit Enrollment', 'Validate Enrollment']
    }
  };
}

function getGenerationMode(body) {
  const capturedSession = getCapturedDiscoverySession();
  if (capturedSession && Array.isArray(capturedSession.includedApis) && capturedSession.includedApis.length > 0) {
    return { mode: 'captured', session: capturedSession };
  }

  const baseUrl = getRequestBaseUrl(body && body.baseUrl);
  const scenario = parseScenario(body && (body.manualTestCase || body.manual || body.text || ''));
  return { mode: 'fallback', scenario, baseUrl };
}

function buildPostmanResponse(body) {
  const generation = getGenerationMode(body);
  if (generation.mode === 'captured') {
    return buildCapturedPostmanResponse(generation.session);
  }

  console.log('[generate-postman] Generated output using fallback flow');
  return {
    type: 'postman',
    fileName: 'testflow-enrollment-collection.json',
    environmentFileName: 'testflow-enrollment-environment.json',
    estimatedManualEffort: '45 to 60 minutes',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Generated reusable Postman collection + environment in under 1 minute. Manual setup usually takes 45–60 minutes.',
    collection: buildFallbackPostmanCollection(generation.scenario, generation.baseUrl),
    environment: buildFallbackEnvironment(generation.baseUrl),
    scenario: generation.scenario
  };
}

function buildPlaywrightResponse(body) {
  const generation = getGenerationMode(body);
  if (generation.mode === 'captured') {
    return buildCapturedPlaywrightResponse(generation.session);
  }

  console.log('[generate-playwright] Generated output using fallback flow');
  return buildFallbackPlaywrightResponse(generation.scenario, generation.baseUrl);
}

function buildJmeterResponse(body) {
  const generation = getGenerationMode(body);
  if (generation.mode === 'captured') {
    return buildCapturedJmeterResponse(generation.session);
  }

  console.log('[generate-jmeter] Generated output using fallback flow');
  return buildFallbackJmeterResponse(generation.scenario, generation.baseUrl);
}

module.exports = {
  buildEnrollmentFlow,
  buildJmeterResponse,
  buildPlaywrightResponse,
  buildPostmanResponse,
  parseScenario
};
