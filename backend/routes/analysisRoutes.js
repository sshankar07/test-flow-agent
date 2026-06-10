const express = require('express');
const axios = require('axios');
const router = express.Router();

// Helper: parse a manual test case into a scenario
function parseScenario(manualText) {
  const text = (manualText || '').toLowerCase();
  // state detection
  let state = 'TX';
  if (/california|\bca\b/.test(text)) state = 'CA';
  else if (/florida|\bfl\b/.test(text)) state = 'FL';
  else if (/texas|\btx\b/.test(text)) state = 'TX';

  // plan detection
  let plan = 'Silver';
  if (/\bbronze\b/.test(text)) plan = 'Bronze';
  else if (/\bgold\b/.test(text)) plan = 'Gold';
  else if (/\bsilver\b/.test(text)) plan = 'Silver';

  // effective date detection: ISO yyyy-mm-dd or mm/dd/yyyy
  let effectiveDate = '2026-01-01';
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    effectiveDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  } else {
    const mdy = text.match(/(\b[01]?\d)\/(?:[0-3]?\d)\/(\d{4})/);
    if (mdy) {
      // interpret as MM/DD/YYYY -> YYYY-MM-DD
      const parts = mdy[0].split('/');
      const mm = parts[0].padStart(2, '0');
      const dd = parts[1].padStart(2, '0');
      const yyyy = parts[2];
      effectiveDate = `${yyyy}-${mm}-${dd}`;
    }
  }

  // negative/missing effective date detection
  const negativeMissing = /without effective date|missing effective date|no effective date|effective date is missing|no effective date provided|not created|error response|expect.*400|expect.*error/i.test(manualText);

  return { state, plan, effectiveDate, negativeMissingEffectiveDate: !!negativeMissing };
}

// Helper: build the Enrollment Creation Flow object (uses parsed scenario)
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
    }
  ];

  // Submit enrollment step
  const submitStep = {
    step: 4,
    action: scenario.negativeMissingEffectiveDate ? 'Submit enrollment without effectiveDate' : 'Submit enrollment',
    method: 'POST',
    endpoint: '{{baseUrl}}/enrollments',
    purpose: scenario.negativeMissingEffectiveDate ? 'Submit enrollment without effectiveDate to validate API error handling' : 'Submit enrollment using memberId and planId'
  };
  steps.push(submitStep);

  // Validate step only for positive scenarios
  if (!scenario.negativeMissingEffectiveDate) {
    steps.push({
      step: 5,
      action: 'Validate enrollment',
      method: 'GET',
      endpoint: '{{baseUrl}}/enrollments/{{enrollmentId}}',
      purpose: 'Validate enrollment status is ACTIVE'
    });
  }

  const flow = {
    input: inputText || '',
    businessFlowName: 'Enrollment Creation Flow',
    detectedSteps: steps,
    dynamicVariables: ['baseUrl', 'accessToken', 'memberId', 'planId', 'enrollmentId', 'state'].concat(scenario.negativeMissingEffectiveDate ? [] : ['effectiveDate']),
    scenario,
    validationChecklist: scenario.negativeMissingEffectiveDate ? [
      'Token response contains accessToken',
      'Member creation returns memberId',
      `Plans API returns at least one ${scenario.plan} plan`,
      'Submit enrollment returns HTTP 400 when effectiveDate missing'
    ] : [
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
  return flow;
}

// Helper: build Postman collection (v2.1)
function buildPostmanCollection(scenario = { state: 'TX', plan: 'Silver', effectiveDate: '2026-01-01', negativeMissingEffectiveDate: false }) {
  const { state, plan, effectiveDate, negativeMissingEffectiveDate } = scenario;
  const lowerPlan = (plan || '').toLowerCase();

  const collection = {
    info: {
      name: `TestFlow Agent - Enrollment Creation (${state} - ${plan})`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      { key: 'baseUrl', value: 'http://localhost:4000' },
      { key: 'username', value: 'test' },
      { key: 'password', value: 'test' }
    ],
    item: []
  };

  // Authenticate
  collection.item.push({
    name: 'Authenticate',
    request: {
      method: 'POST',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: { mode: 'raw', raw: JSON.stringify({ username: '{{username}}', password: '{{password}}' }, null, 2) },
      url: { raw: '{{baseUrl}}/auth/token', host: ['{{baseUrl}}'], path: ['auth', 'token'] }
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
      "pm.test('Status code is 200', function () { pm.response.to.have.status(200); });",
      "var json = pm.response.json();",
      "pm.test('accessToken exists', function () { pm.expect(json.accessToken).to.exist; });",
      "pm.environment.set('accessToken', json.accessToken);"
    ] } }]
  });

  // Create Member
  collection.item.push({
    name: 'Create Member',
    request: {
      method: 'POST',
      header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{accessToken}}' }],
      body: { mode: 'raw', raw: JSON.stringify({ firstName: 'Test', lastName: 'Member', dob: '1990-01-01', state: state }, null, 2) },
      url: { raw: '{{baseUrl}}/members', host: ['{{baseUrl}}'], path: ['members'] }
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
      "pm.test('Status is 201', function () { pm.response.to.have.status(201); });",
      "var json = pm.response.json();",
      "pm.test('memberId exists', function () { pm.expect(json.memberId || json.id).to.exist; });",
      "pm.environment.set('memberId', json.memberId || json.id);"
    ] } }]
  });

  // Get Plans
  collection.item.push({
    name: `Get ${state} Plans`,
    request: {
      method: 'GET',
      header: [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }],
      url: { raw: `{{baseUrl}}/plans?state=${state}`, host: ['{{baseUrl}}'], path: ['plans'], query: [{ key: 'state', value: state }] }
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
      "pm.test('Status is 200', function () { pm.response.to.have.status(200); });",
      "var json = pm.response.json();",
      "var plans = Array.isArray(json) ? json : Array.isArray(json.plans) ? json.plans : Array.isArray(json.data) ? json.data : [];",
      "pm.test('Plans are returned', function () { pm.expect(plans).to.be.an('array'); pm.expect(plans.length).to.be.greaterThan(0); });",
      `var plan = plans.find(function(p){ return (p.name && p.name.toLowerCase().includes('${lowerPlan}')) || (p.type && p.type.toLowerCase() === '${lowerPlan}'); });`,
      "pm.test('Found plan', function () { pm.expect(plan).to.exist; });",
      "pm.environment.set('planId', plan.planId || plan.id);"
    ] } }]
  });

  // Submit Enrollment
  const submitBody = { memberId: '{{memberId}}', planId: '{{planId}}' };
  if (!negativeMissingEffectiveDate) submitBody.effectiveDate = effectiveDate;

  const submitTests = negativeMissingEffectiveDate ? [
    "pm.test('Status is 400', function () { pm.response.to.have.status(400); });",
    "var json = pm.response.json();",
    "pm.test('error mentions effectiveDate', function () { pm.expect(json.error || JSON.stringify(json)).to.include('effectiveDate'); });"
  ] : [
    "pm.test('Status is 201', function () { pm.response.to.have.status(201); });",
    "var json = pm.response.json();",
    "pm.test('enrollmentId exists', function () { pm.expect(json.enrollmentId || json.id).to.exist; });",
    "pm.test('enrollment status is ACTIVE', function () { pm.expect(json.status).to.eql('ACTIVE'); });",
    "pm.environment.set('enrollmentId', json.enrollmentId || json.id);"
  ];

  collection.item.push({
    name: 'Submit Enrollment',
    request: {
      method: 'POST',
      header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{accessToken}}' }],
      body: { mode: 'raw', raw: JSON.stringify(submitBody, null, 2) },
      url: { raw: '{{baseUrl}}/enrollments', host: ['{{baseUrl}}'], path: ['enrollments'] }
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: submitTests } }]
  });

  // Validate Enrollment (only for positive scenarios)
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
        "var json = pm.response.json();",
        "pm.test('Enrollment is ACTIVE', function () { pm.expect(json.status).to.eql('ACTIVE'); });"
      ] } }]
    });
  }

  return collection;
}

// /agent/analyze
router.post('/analyze', (req, res) => {
  const manualText = req.body && (req.body.manualTestCase || req.body.text || req.body.manual || '');
  console.log('[analyze] Received request. manualTestCase length:', manualText ? manualText.length : 0);
  const result = buildEnrollmentFlow(manualText);
  console.log('[analyze] Responding with Enrollment Creation Flow');
  res.json(result);
});

// POST /agent/generate-postman
router.post('/generate-postman', (req, res) => {
  console.log('[generate-postman] Received request');
  const manualText = req.body && (req.body.manualTestCase || req.body.manual || req.body.text || '');
  const scenario = parseScenario(manualText);
  const collection = buildPostmanCollection(scenario);

  const environment = {
    name: 'TestFlow Enrollment Local Environment',
    values: [
      { key: 'baseUrl', value: 'http://localhost:4000', enabled: true },
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

  const response = {
    type: 'postman',
    fileName: 'testflow-enrollment-collection.json',
    environmentFileName: 'testflow-enrollment-environment.json',
    estimatedManualEffort: '45 to 60 minutes',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Generated reusable Postman collection + environment in under 1 minute. Manual setup usually takes 45–60 minutes.',
    collection,
    environment,
    scenario
  };

  console.log('[generate-postman] Returning collection + environment');
  res.json(response);
});

// POST /agent/generate-playwright
router.post('/generate-playwright', (req, res) => {
  console.log('[generate-playwright] Received request');
  const manualText = req.body && (req.body.manualTestCase || req.body.manual || req.body.text || '');
  const sc = parseScenario(manualText);
  const state = sc.state;
  const plan = sc.plan;
  const effectiveDate = sc.effectiveDate;
  const negative = sc.negativeMissingEffectiveDate;

  const planFindExpr = `p.name && p.name.toLowerCase().includes('${plan.toLowerCase()}') || (p.type && p.type.toLowerCase() === '${plan.toLowerCase()}')`;

  const scriptLines = [
    "import { test, expect } from '@playwright/test';",
    "",
    "// Enrollment Creation Flow - API test",
    "const baseUrl = process.env.BASE_URL || 'http://localhost:4000';",
    "const username = process.env.USERNAME || 'test';",
    "const password = process.env.PASSWORD || 'test';",
    "",
    "test('Enrollment Creation Flow - API', async ({ request }) => {",
    "  // 1) Authenticate",
    "  const auth = await request.post(baseUrl + '/auth/token', { data: { username, password } });",
    "  expect(auth.status()).toBe(200);",
    "  const authJson = await auth.json();",
    "  const accessToken = authJson.accessToken;",
    "  expect(accessToken).toBeTruthy();",
    "",
    "  // 2) Create member",
    `  const memberRes = await request.post(baseUrl + '/members', {`,
    `    data: { firstName: 'Test', lastName: 'Member', dob: '1990-01-01', state: '${state}' },`,
    "    headers: { Authorization: 'Bearer ' + accessToken }",
    "  });",
    "  expect(memberRes.status()).toBe(201);",
    "  const memberJson = await memberRes.json();",
    "  const memberId = memberJson.memberId || memberJson.id;",
    "  expect(memberId).toBeTruthy();",
    "",
    "  // 3) Get plans",
    `  const plansRes = await request.get(baseUrl + '/plans?state=${state}', { headers: { Authorization: 'Bearer ' + accessToken } });`,
    "  expect(plansRes.status()).toBe(200);",
    "  const plansJson = await plansRes.json();",
    "  const plans = Array.isArray(plansJson) ? plansJson : (plansJson && plansJson.plans) ? plansJson.plans : (plansJson && plansJson.data) ? plansJson.data : [];",
    "  expect(Array.isArray(plans)).toBeTruthy();",
    "  expect(plans.length).toBeGreaterThan(0);",
    `  const plan = plans.find(p => (${planFindExpr}));`,
    "  expect(plan).toBeTruthy();",
    "  const planId = plan.planId || plan.id;",
    "  expect(planId).toBeTruthy();",
    "",
    "  // 4) Submit enrollment",
  ];

  if (!negative) {
    scriptLines.push(
      "  const enrollRes = await request.post(baseUrl + '/enrollments', {",
      "    data: { memberId, planId, effectiveDate: '" + effectiveDate + "' },",
      "    headers: { Authorization: 'Bearer ' + accessToken }",
      "  });",
      "  expect(enrollRes.status()).toBe(201);",
      "  const enrollJson = await enrollRes.json();",
      "  const enrollmentId = enrollJson.enrollmentId || enrollJson.id;",
      "  expect(enrollmentId).toBeTruthy();",
      "",
      "  // 5) Validate enrollment",
      "  const validateRes = await request.get(baseUrl + '/enrollments/' + enrollmentId, { headers: { Authorization: 'Bearer ' + accessToken } });",
      "  expect(validateRes.status()).toBe(200);",
      "  const validateJson = await validateRes.json();",
      "  expect(validateJson.status).toBe('ACTIVE');"
    );
  } else {
    scriptLines.push(
      "  const enrollRes = await request.post(baseUrl + '/enrollments', {",
      "    data: { memberId, planId },",
      "    headers: { Authorization: 'Bearer ' + accessToken }",
      "  });",
      "  // Expect bad request when effectiveDate is missing",
      "  expect(enrollRes.status()).toBe(400);",
      "  const errJson = await enrollRes.json();",
      "  expect(JSON.stringify(errJson)).toContain('effectiveDate');"
    );
  }

  scriptLines.push("});");

  const script = scriptLines.join('\n');

  const response = {
    type: 'playwright',
    fileName: 'enrollment-flow.spec.ts',
    estimatedManualEffort: '60 to 90 minutes',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Generated Playwright API test in under 1 minute. Manually coding and debugging this chained API test usually takes 60–90 minutes.',
    script
  };

  console.log('[generate-playwright] Returning Playwright script object');
  res.json(response);
});

// POST /agent/generate-jmeter
router.post('/generate-jmeter', (req, res) => {
  console.log('[generate-jmeter] Received request');
  const manualText = req.body && (req.body.manualTestCase || req.body.manual || req.body.text || '');
  const sc = parseScenario(manualText);
  const state = sc.state;
  const effectiveDate = sc.effectiveDate;
  const negative = sc.negativeMissingEffectiveDate;

  // Build a simple JMX XML (valid enough for JMeter import)
  const jmxLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.2">',
    '  <hashTree>',
    '    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Test Plan" enabled="true">',
    '      <stringProp name="TestPlan.comments"></stringProp>',
    '      <boolProp name="TestPlan.functional_mode">false</boolProp>',
    '      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>',
    '      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments">',
    '        <collectionProp name="Arguments.arguments">',
    '          <elementProp name="baseUrl" elementType="Argument">',
    '            <stringProp name="Argument.name">baseUrl</stringProp>',
    '            <stringProp name="Argument.value">http://localhost:4000</stringProp>',
    '          </elementProp>',
    '          <elementProp name="username" elementType="Argument">',
    '            <stringProp name="Argument.name">username</stringProp>',
    '            <stringProp name="Argument.value">test</stringProp>',
    '          </elementProp>',
    '          <elementProp name="password" elementType="Argument">',
    '            <stringProp name="Argument.name">password</stringProp>',
    '            <stringProp name="Argument.value">test</stringProp>',
    '          </elementProp>',
    '        </collectionProp>',
    '      </elementProp>',
    '      <stringProp name="TestPlan.user_define_classpath"></stringProp>',
    '    </TestPlan>',
    '    <hashTree>',
    '      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Enrollment Flow Thread Group" enabled="true">',
    '        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>',
    '        <elementProp name="ThreadGroup.main_controller" elementType="LoopController">',
    '          <boolProp name="LoopController.continue_forever">false</boolProp>',
    '          <intProp name="LoopController.loops">1</intProp>',
    '        </elementProp>',
    '        <stringProp name="ThreadGroup.num_threads">1</stringProp>',
    '        <stringProp name="ThreadGroup.ramp_time">1</stringProp>',
    '        <longProp name="ThreadGroup.start_time">' + Date.now() + '</longProp>',
    '        <longProp name="ThreadGroup.end_time">' + Date.now() + '</longProp>',
    '      </ThreadGroup>',
    '      <hashTree>',
    '        <!-- Authenticate -->',
    '        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Authenticate" enabled="true">',
    '          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">',
    '            <collectionProp name="Arguments.arguments">',
    '              <elementProp name="username" elementType="HTTPArgument">',
    '                <stringProp name="Argument.name">username</stringProp>',
    '                <stringProp name="Argument.value">${username}</stringProp>',
    '                <boolProp name="HTTPArgument.always_encode">false</boolProp>',
    '              </elementProp>',
    '              <elementProp name="password" elementType="HTTPArgument">',
    '                <stringProp name="Argument.name">password</stringProp>',
    '                <stringProp name="Argument.value">${password}</stringProp>',
    '                <boolProp name="HTTPArgument.always_encode">false</boolProp>',
    '              </elementProp>',
    '            </collectionProp>',
    '          </elementProp>',
    '          <stringProp name="HTTPSampler.domain">${baseUrl}</stringProp>',
    '          <stringProp name="HTTPSampler.path">/auth/token</stringProp>',
    '          <stringProp name="HTTPSampler.method">POST</stringProp>',
    '          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>',
    '          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>',
    '        </HTTPSamplerProxy>',
    '        <hashTree/>',
    '        <!-- Create Member -->',
    '        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Create Member" enabled="true">',
    '          <stringProp name="HTTPSampler.domain">${baseUrl}</stringProp>',
    '          <stringProp name="HTTPSampler.path">/members</stringProp>',
    '          <stringProp name="HTTPSampler.method">POST</stringProp>',
    '        </HTTPSamplerProxy>',
    '        <hashTree/>',
    '        <!-- Get Plans -->',
    '        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Get Plans" enabled="true">',
    '          <stringProp name="HTTPSampler.domain">${baseUrl}</stringProp>',
    '          <stringProp name="HTTPSampler.path">/plans?state=${state}</stringProp>',
    '          <stringProp name="HTTPSampler.method">GET</stringProp>',
    '        </HTTPSamplerProxy>',
    '        <hashTree/>',
    '        <!-- Submit Enrollment -->',
    '        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Submit Enrollment" enabled="true">',
    '          <stringProp name="HTTPSampler.domain">${baseUrl}</stringProp>',
    '          <stringProp name="HTTPSampler.path">/enrollments</stringProp>',
    '          <stringProp name="HTTPSampler.method">POST</stringProp>',
    '        </HTTPSamplerProxy>',
    '        <hashTree/>',
  ];

  if (!negative) {
    jmxLines.push(
      '        <!-- Validate Enrollment -->',
      '        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Validate Enrollment" enabled="true">',
      '          <stringProp name="HTTPSampler.domain">${baseUrl}</stringProp>',
      '          <stringProp name="HTTPSampler.path">/enrollments/${enrollmentId}</stringProp>',
      '          <stringProp name="HTTPSampler.method">GET</stringProp>',
      '        </HTTPSamplerProxy>',
      '        <hashTree/>'
    );
  }

  jmxLines.push(
    '      </hashTree>',
    '    </hashTree>',
    '  </hashTree>',
    '</jmeterTestPlan>'
  );

  const jmx = jmxLines.join('\n');

  const response = {
    type: 'jmeter',
    fileName: 'enrollment-flow.jmx',
    estimatedManualEffort: '2 to 3 hours',
    generatedIn: 'under 1 minute',
    productivityMessage: 'Generated JMeter JMX plan in under 1 minute. Manually creating samplers, headers, extractors, correlations, and assertions usually takes 2–3 hours.',
    jmx,
    summary: {
      threadGroup: { name: 'Enrollment Flow Thread Group', threads: 1, rampUp: 1, loops: 1 },
      steps: negative ? ['Authenticate','Create Member','Get Plans','Submit Enrollment (expect 400)'] : ['Authenticate','Create Member','Get Plans','Submit Enrollment','Validate Enrollment']
    }
  };

  console.log('[generate-jmeter] Returning JMeter .jmx content');
  res.json(response);
});

// POST /agent/generate/:kind (back-compat)
router.post('/generate/:kind', (req, res) => {
  const { kind } = req.params;
  console.log('[generate] kind=', kind);

  if (kind === 'postman') {
    const collection = buildPostmanCollection();
    return res.json(collection);
  }

  if (kind === 'playwright') {
    // reuse the same Playwright script as /generate-playwright
    const scriptLines = [
      "import { test, expect } from '@playwright/test';",
      "",
      "// Enrollment Creation Flow - API test",
      "const baseUrl = process.env.BASE_URL || 'http://localhost:4000';",
      "const username = process.env.USERNAME || 'test';",
      "const password = process.env.PASSWORD || 'test';",
      "",
      "test('Enrollment Creation Flow - API', async ({ request }) => {",
      "  // 1) Authenticate",
      "  const auth = await request.post(baseUrl + '/auth/token', { data: { username, password } });",
      "  expect(auth.status()).toBe(200);",
      "  const authJson = await auth.json();",
      "  const accessToken = authJson.accessToken;",
      "  expect(accessToken).toBeTruthy();",
      "",
      "  // 2) Create member",
      "  const memberRes = await request.post(baseUrl + '/members', {",
      "    data: { firstName: 'Test', lastName: 'Member', dob: '1990-01-01', state: 'TX' },",
      "    headers: { Authorization: 'Bearer ' + accessToken }",
      "  });",
      "  expect(memberRes.status()).toBe(201);",
      "  const memberJson = await memberRes.json();",
      "  const memberId = memberJson.memberId || memberJson.id;",
      "  expect(memberId).toBeTruthy();",
      "",
      "  // 3) Get plans",
      "  const plansRes = await request.get(baseUrl + '/plans?state=TX', { headers: { Authorization: 'Bearer ' + accessToken } });",
      "  expect(plansRes.status()).toBe(200);",
      "  const plansJson = await plansRes.json();",
      "  const plans = Array.isArray(plansJson) ? plansJson : (plansJson && plansJson.plans) ? plansJson.plans : [];",
      "  expect(Array.isArray(plans)).toBeTruthy();",
      "  const plan = plans.find(p => p.name && p.name.includes('Silver'));",
      "  expect(plan).toBeTruthy();",
      "  const planId = plan.planId || plan.id;",
      "  expect(planId).toBeTruthy();",
      "",
      "  // 4) Submit enrollment",
      "  const enrollRes = await request.post(baseUrl + '/enrollments', {",
      "    data: { memberId, planId, effectiveDate: '2026-01-01' },",
      "    headers: { Authorization: 'Bearer ' + accessToken }",
      "  });",
      "  expect(enrollRes.status()).toBe(201);",
      "  const enrollJson = await enrollRes.json();",
      "  const enrollmentId = enrollJson.enrollmentId || enrollJson.id;",
      "  expect(enrollmentId).toBeTruthy();",
      "",
      "  // 5) Validate enrollment",
      "  const validateRes = await request.get(baseUrl + '/enrollments/' + enrollmentId, { headers: { Authorization: 'Bearer ' + accessToken } });",
      "  expect(validateRes.status()).toBe(200);",
      "  const validateJson = await validateRes.json();",
      "  expect(validateJson.status).toBe('ACTIVE');",
      "});"
    ];
    const script = scriptLines.join('\n');
    return res.type('text/plain').send(script);
  }

  if (kind === 'jmeter') {
    const plan = {
      userDefinedVariables: {
        baseUrl: 'http://localhost:4000',
        username: 'test',
        password: 'test'
      },
      threadGroup: { name: 'Enrollment Flow Thread Group', threads: 10, rampUp: 10, loops: 1 },
      httpHeaderManager: { 'Content-Type': 'application/json' },
      steps: [
        { name: 'Authenticate', method: 'POST', endpoint: '${baseUrl}/auth/token', body: { username: '${username}', password: '${password}' }, assertions: [{ type: 'status', expected: 200 }, { type: 'jsonPath', path: '$.accessToken', expectedExists: true }] },
        { name: 'Create Member', method: 'POST', endpoint: '${baseUrl}/members', authHeader: 'Bearer ${accessToken}', body: { firstName: 'Test', lastName: 'Member', dob: '1990-01-01', state: 'TX' }, assertions: [{ type: 'status', expected: 201 }, { type: 'jsonPath', path: '$.memberId', expectedExists: true }] },
        { name: 'Get Plans', method: 'GET', endpoint: '${baseUrl}/plans?state=TX', authHeader: 'Bearer ${accessToken}', assertions: [{ type: 'status', expected: 200 }, { type: 'jsonPathEither', path1: '$', path2: '$.plans', expectedExists: true }, { type: 'findSilver', expected: true }] },
        { name: 'Submit Enrollment', method: 'POST', endpoint: '${baseUrl}/enrollments', authHeader: 'Bearer ${accessToken}', body: { memberId: '${memberId}', planId: '${planId}', effectiveDate: '2026-01-01' }, assertions: [{ type: 'status', expected: 201 }, { type: 'jsonPath', path: '$.enrollmentId', expectedExists: true }] },
        { name: 'Validate Enrollment', method: 'GET', endpoint: '${baseUrl}/enrollments/${enrollmentId}', authHeader: 'Bearer ${accessToken}', assertions: [{ type: 'status', expected: 200 }, { type: 'jsonPath', path: '$.status', expectedValue: 'ACTIVE' }] }
      ]
    };
    return res.json(plan);
  }

  res.status(400).json({ error: 'Unknown generation kind' });
});

// POST /agent/run-enrollment-flow
router.post('/run-enrollment-flow', async (req, res) => {
  console.log('[run-enrollment-flow] Starting execution against mock enrollment API at http://localhost:4000');
  const baseUrl = 'http://localhost:4000';
  const steps = [];
  let currentStep = 'Unknown';
  const startNs = process.hrtime.bigint();

  const manualText = req.body && (req.body.manualTestCase || req.body.manual || req.body.text || '');
  const sc = parseScenario(manualText);
  const state = sc.state;
  const negative = sc.negativeMissingEffectiveDate;
  const effectiveDate = sc.effectiveDate;

  try {
    // 1) Authenticate
    currentStep = 'Authenticate';
    console.log('[run] Authenticating...');
    const authResp = await axios.post(`${baseUrl}/auth/token`, { username: 'test', password: 'test' }, { timeout: 10000 });
    if (authResp.status !== 200) throw new Error('Auth failed with status ' + authResp.status);
    const accessToken = authResp.data && authResp.data.accessToken;
    if (!accessToken) throw new Error('No accessToken in auth response');
    steps.push({ name: 'Authenticate', status: 'PASSED', details: 'Access token generated' });

    // 2) Create member
    currentStep = 'Create Member';
    console.log('[run] Creating member...');
    const memberResp = await axios.post(`${baseUrl}/members`, { firstName: 'Test', lastName: 'Member', dob: '1990-01-01', state }, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 });
    if (memberResp.status !== 201) throw new Error('Create member failed with status ' + memberResp.status);
    const memberId = memberResp.data.memberId || memberResp.data.id;
    if (!memberId) throw new Error('No memberId in create member response');
    steps.push({ name: 'Create Member', status: 'PASSED', details: 'Member created' });

    // 3) Get plans
    currentStep = 'Get Plans';
    console.log('[run] Fetching plans...');
    const plansResp = await axios.get(`${baseUrl}/plans?state=${state}`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 });
    if (plansResp.status !== 200) throw new Error('Get plans failed with status ' + plansResp.status);
    const plansPayload = plansResp.data;
    const plans = Array.isArray(plansPayload)
      ? plansPayload
      : Array.isArray(plansPayload.plans)
      ? plansPayload.plans
      : Array.isArray(plansPayload.data)
      ? plansPayload.data
      : [];
    if (!Array.isArray(plans) || plans.length === 0) throw new Error('No plans returned');
    const plan = plans.find(p => ((p.name || '').toLowerCase().includes((sc.plan || '').toLowerCase())) || ((p.type || '').toLowerCase() === (sc.plan || '').toLowerCase()));
    if (!plan) throw new Error(`No ${sc.plan} plan found`);
    const planId = plan.planId || plan.id || plan.planId;
    steps.push({ name: 'Get Plans', status: 'PASSED', details: `${sc.plan} plan selected` });

    // 4) Submit enrollment
    currentStep = 'Submit Enrollment';
    console.log('[run] Submitting enrollment...');

    try {
      const enrollBody = { memberId, planId };
      if (!negative) enrollBody.effectiveDate = effectiveDate;
      const enrollResp = await axios.post(`${baseUrl}/enrollments`, enrollBody, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 });

      if (negative) {
        // If negative case but API returned success, treat as failure
        throw new Error('Expected enrollment submission to fail with 400 but received ' + enrollResp.status);
      }

      if (enrollResp.status !== 201) throw new Error('Submit enrollment failed with status ' + enrollResp.status);
      const enrollmentId = enrollResp.data.enrollmentId || enrollResp.data.id;
      if (!enrollmentId) throw new Error('No enrollmentId in enrollment response');
      steps.push({ name: 'Submit Enrollment', status: 'PASSED', details: 'Enrollment submitted' });

      // 5) Validate enrollment
      currentStep = 'Validate Enrollment';
      console.log('[run] Validating enrollment...');
      const validateResp = await axios.get(`${baseUrl}/enrollments/${enrollmentId}`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 });
      if (validateResp.status !== 200) throw new Error('Validate enrollment failed with status ' + validateResp.status);
      const enrollmentStatus = validateResp.data.status;
      if (enrollmentStatus !== 'ACTIVE') throw new Error('Enrollment status is not ACTIVE: ' + enrollmentStatus);
      steps.push({ name: 'Validate Enrollment', status: 'PASSED', details: 'Enrollment status is ACTIVE' });

      const elapsedNs = process.hrtime.bigint() - startNs;
      const elapsedUs = Number(elapsedNs / 1000n); // microseconds
      const executionTime = elapsedUs >= 1000 ? `${(elapsedUs/1000).toFixed(2)} ms (${elapsedUs} µs)` : `${elapsedUs} µs`;

      const result = {
        status: 'SUCCESS',
        message: 'Enrollment flow executed successfully',
        memberId,
        planId,
        enrollmentId,
        enrollmentStatus,
        executionTime,
        steps
      };
      console.log('[run-enrollment-flow] Success', result);
      return res.json(result);
    } catch (enrollErr) {
      // handle negative case where we expect 400
      if (enrollErr.response && enrollErr.response.status === 400 && negative) {
        steps.push({ name: 'Submit Enrollment', status: 'PASSED', details: 'Submit enrollment returned expected 400 for missing effectiveDate' });
        const elapsedNs = process.hrtime.bigint() - startNs;
        const elapsedUs = Number(elapsedNs / 1000n);
        const executionTime = elapsedUs >= 1000 ? `${(elapsedUs/1000).toFixed(2)} ms (${elapsedUs} µs)` : `${elapsedUs} µs`;
        const result = {
          status: 'SUCCESS',
          message: 'Enrollment flow executed (negative test validated expected 400)',
          memberId,
          planId,
          executionTime,
          steps
        };
        return res.json(result);
      }
      throw enrollErr;
    }
  } catch (err) {
    console.error('[run-enrollment-flow] Failed', err.message || err, err.response && err.response.data ? err.response.data : '');
    return res.status(500).json({ status: 'FAILED', message: 'Enrollment flow failed', failedStep: currentStep, error: err.message || String(err) });
  }
});

module.exports = router;
