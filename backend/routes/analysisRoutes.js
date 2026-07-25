const express = require('express');
const axios = require('axios');
const {
  buildEnrollmentFlow,
  buildJmeterResponse,
  buildPlaywrightResponse,
  buildPostmanResponse,
  parseScenario
} = require('../lib/analysisHelpers');

const router = express.Router();

router.post('/analyze', (req, res) => {
  const manualText = req.body && (req.body.manualTestCase || req.body.text || req.body.manual || '');
  console.log('[analyze] Received request. manualTestCase length:', manualText ? manualText.length : 0);
  const result = buildEnrollmentFlow(manualText);
  console.log('[analyze] Responding with Enrollment Creation Flow');
  res.json(result);
});

router.post('/generate-postman', (req, res) => {
  console.log('[generate-postman] Received request');
  res.json(buildPostmanResponse(req.body || {}));
});

router.post('/generate-playwright', (req, res) => {
  console.log('[generate-playwright] Received request');
  res.json(buildPlaywrightResponse(req.body || {}));
});

function sendJmeterResponse(req, res) {
  console.log('[generate-jmeter] Received request');
  res.json(buildJmeterResponse(req.body || {}));
}

router.post('/generate-jmeter', sendJmeterResponse);
router.post('/generate-jmeter-plan', sendJmeterResponse);

router.post('/generate/:kind', (req, res) => {
  const { kind } = req.params;
  console.log('[generate] kind=', kind);

  if (kind === 'postman') {
    return res.json(buildPostmanResponse(req.body || {}));
  }

  if (kind === 'playwright') {
    return res.json(buildPlaywrightResponse(req.body || {}));
  }

  if (kind === 'jmeter') {
    return res.json(buildJmeterResponse(req.body || {}));
  }

  return res.status(400).json({ error: 'Unknown generation kind' });
});

router.post('/run-enrollment-flow', async (req, res) => {
  console.log('[run-enrollment-flow] Starting execution against mock enrollment API at http://localhost:4000');
  const baseUrl = 'http://localhost:4000';
  const steps = [];
  let currentStep = 'Unknown';
  const startNs = process.hrtime.bigint();

  const manualText = req.body && (req.body.manualTestCase || req.body.manual || req.body.text || '');
  const scenario = parseScenario(manualText);
  const state = scenario.state;
  const negative = scenario.negativeMissingEffectiveDate;
  const effectiveDate = scenario.effectiveDate;

  try {
    currentStep = 'Authenticate';
    console.log('[run] Authenticating...');
    const authResp = await axios.post(`${baseUrl}/auth/token`, { username: 'test', password: 'test' }, { timeout: 10000 });
    if (authResp.status !== 200) {
      throw new Error(`Auth failed with status ${authResp.status}`);
    }

    const accessToken = authResp.data && authResp.data.accessToken;
    if (!accessToken) {
      throw new Error('No accessToken in auth response');
    }
    steps.push({ name: 'Authenticate', status: 'PASSED', details: 'Access token generated' });

    currentStep = 'Create Member';
    console.log('[run] Creating member...');
    const memberResp = await axios.post(
      `${baseUrl}/members`,
      { firstName: 'Test', lastName: 'Member', dob: '1990-01-01', state },
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
    );
    if (memberResp.status !== 201) {
      throw new Error(`Create member failed with status ${memberResp.status}`);
    }

    const memberId = memberResp.data.memberId || memberResp.data.id;
    if (!memberId) {
      throw new Error('No memberId in create member response');
    }
    steps.push({ name: 'Create Member', status: 'PASSED', details: 'Member created' });

    currentStep = 'Get Plans';
    console.log('[run] Fetching plans...');
    const plansResp = await axios.get(`${baseUrl}/plans?state=${state}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });
    if (plansResp.status !== 200) {
      throw new Error(`Get plans failed with status ${plansResp.status}`);
    }

    const plansPayload = plansResp.data;
    const plans = Array.isArray(plansPayload)
      ? plansPayload
      : Array.isArray(plansPayload.plans)
        ? plansPayload.plans
        : Array.isArray(plansPayload.data)
          ? plansPayload.data
          : [];
    if (!Array.isArray(plans) || plans.length === 0) {
      throw new Error('No plans returned');
    }

    const plan = plans.find((item) => (
      ((item.name || '').toLowerCase().includes((scenario.plan || '').toLowerCase()))
      || ((item.type || '').toLowerCase() === (scenario.plan || '').toLowerCase())
    ));
    if (!plan) {
      throw new Error(`No ${scenario.plan} plan found`);
    }

    const planId = plan.planId || plan.id;
    steps.push({ name: 'Get Plans', status: 'PASSED', details: `${scenario.plan} plan selected` });

    currentStep = 'Submit Enrollment';
    console.log('[run] Submitting enrollment...');

    try {
      const enrollBody = { memberId, planId };
      if (!negative) {
        enrollBody.effectiveDate = effectiveDate;
      }

      const enrollResp = await axios.post(`${baseUrl}/enrollments`, enrollBody, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });

      if (negative) {
        throw new Error(`Expected enrollment submission to fail with 400 but received ${enrollResp.status}`);
      }

      if (enrollResp.status !== 201) {
        throw new Error(`Submit enrollment failed with status ${enrollResp.status}`);
      }

      const enrollmentId = enrollResp.data.enrollmentId || enrollResp.data.id;
      if (!enrollmentId) {
        throw new Error('No enrollmentId in enrollment response');
      }
      steps.push({ name: 'Submit Enrollment', status: 'PASSED', details: 'Enrollment submitted' });

      currentStep = 'Validate Enrollment';
      console.log('[run] Validating enrollment...');
      const validateResp = await axios.get(`${baseUrl}/enrollments/${enrollmentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      });
      if (validateResp.status !== 200) {
        throw new Error(`Validate enrollment failed with status ${validateResp.status}`);
      }

      const enrollmentStatus = validateResp.data.status;
      if (enrollmentStatus !== 'ACTIVE') {
        throw new Error(`Enrollment status is not ACTIVE: ${enrollmentStatus}`);
      }
      steps.push({ name: 'Validate Enrollment', status: 'PASSED', details: 'Enrollment status is ACTIVE' });

      const elapsedNs = process.hrtime.bigint() - startNs;
      const elapsedUs = Number(elapsedNs / 1000n);
      const executionTime = elapsedUs >= 1000 ? `${(elapsedUs / 1000).toFixed(2)} ms (${elapsedUs} µs)` : `${elapsedUs} µs`;

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
    } catch (enrollError) {
      if (enrollError.response && enrollError.response.status === 400 && negative) {
        steps.push({ name: 'Submit Enrollment', status: 'PASSED', details: 'Submit enrollment returned expected 400 for missing effectiveDate' });
        const elapsedNs = process.hrtime.bigint() - startNs;
        const elapsedUs = Number(elapsedNs / 1000n);
        const executionTime = elapsedUs >= 1000 ? `${(elapsedUs / 1000).toFixed(2)} ms (${elapsedUs} µs)` : `${elapsedUs} µs`;
        const result = {
          status: 'SUCCESS',
          message: 'Enrollment flow executed (negative test validated expected 400)',
          memberId,
          planId,
          executionTime,
          steps
        };
        console.log('[run-enrollment-flow] Success', result);
        return res.json(result);
      }

      throw enrollError;
    }
  } catch (error) {
    console.error('[run-enrollment-flow] Failed', error.message || error, error.response && error.response.data ? error.response.data : '');
    return res.status(500).json({
      status: 'FAILED',
      message: 'Enrollment flow failed',
      failedStep: currentStep,
      error: error.message || String(error)
    });
  }
});

module.exports = router;
