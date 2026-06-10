const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 4000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
const members = {};
const enrollments = {};

// Constants
const SAMPLE_PLANS = {
  TX: [
    { planId: 'PLAN-001', name: 'Blue Cross Texas Basic', type: 'PPO', monthlyPremium: 299.99 },
    { planId: 'PLAN-002', name: 'Blue Cross Texas Plus', type: 'PPO', monthlyPremium: 449.99 },
    { planId: 'PLAN-003', name: 'Blue Cross Texas Premium', type: 'PPO', monthlyPremium: 599.99 }
  ]
};

// Token generation
const tokens = {};

// ============================================
// POST /auth/token - Generate access token
// ============================================
app.post('/auth/token', (req, res) => {
  console.log('\n[API Call] POST /auth/token');
  console.log('Request Body:', req.body);

  try {
    const accessToken = uuidv4();
    const expiresIn = 3600; // 1 hour

    tokens[accessToken] = {
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expiresIn * 1000)
    };

    const response = {
      accessToken,
      expiresIn
    };

    console.log('Response:', response);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// ============================================
// POST /members - Create new member
// ============================================
app.post('/members', (req, res) => {
  console.log('\n[API Call] POST /members');
  console.log('Request Body:', req.body);

  try {
    const { firstName, lastName, dob, state } = req.body;

    // Validation
    if (!firstName || !lastName || !dob || !state) {
      console.log('Validation Error: Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: firstName, lastName, dob, state' });
    }

    const memberId = `MEM-${uuidv4().substring(0, 8).toUpperCase()}`;

    const memberData = {
      memberId,
      firstName,
      lastName,
      dob,
      state,
      createdAt: new Date().toISOString()
    };

    members[memberId] = memberData;

    const response = { memberId };

    console.log('Member Created:', memberData);
    console.log('Response:', response);
    res.status(201).json(response);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// ============================================
// GET /plans - Retrieve plans by state
// ============================================
app.get('/plans', (req, res) => {
  console.log('\n[API Call] GET /plans');
  console.log('Query Params:', req.query);

  try {
    const { state } = req.query;

    if (!state) {
      console.log('Validation Error: state parameter is required');
      return res.status(400).json({ error: 'State parameter is required' });
    }

    const plans = SAMPLE_PLANS[state] || [];

    if (plans.length === 0) {
      console.log(`No plans found for state: ${state}`);
      return res.status(404).json({ error: `No plans available for state: ${state}` });
    }

    const response = {
      state,
      plans
    };

    console.log(`Plans retrieved for state ${state}:`, plans);
    console.log('Response:', response);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve plans' });
  }
});

// ============================================
// POST /enrollments - Create new enrollment
// ============================================
app.post('/enrollments', (req, res) => {
  console.log('\n[API Call] POST /enrollments');
  console.log('Request Body:', req.body);

  try {
    const { memberId, planId, effectiveDate } = req.body;

    // Validation
    if (!memberId || !planId || !effectiveDate) {
      console.log('Validation Error: Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: memberId, planId, effectiveDate' });
    }

    // Verify member exists
    if (!members[memberId]) {
      console.log(`Validation Error: Member not found - ${memberId}`);
      return res.status(404).json({ error: `Member ${memberId} not found` });
    }

    const enrollmentId = `ENR-${uuidv4().substring(0, 8).toUpperCase()}`;
    const status = 'ACTIVE';

    const enrollmentData = {
      enrollmentId,
      memberId,
      planId,
      effectiveDate,
      status,
      createdAt: new Date().toISOString()
    };

    enrollments[enrollmentId] = enrollmentData;

    const response = {
      enrollmentId,
      status
    };

    console.log('Enrollment Created:', enrollmentData);
    console.log('Response:', response);
    res.status(201).json(response);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Failed to create enrollment' });
  }
});

// ============================================
// GET /enrollments/:id - Retrieve enrollment
// ============================================
app.get('/enrollments/:id', (req, res) => {
  console.log('\n[API Call] GET /enrollments/:id');
  console.log('Enrollment ID:', req.params.id);

  try {
    const { id } = req.params;
    const enrollment = enrollments[id];

    if (!enrollment) {
      console.log(`Enrollment not found: ${id}`);
      return res.status(404).json({ error: `Enrollment ${id} not found` });
    }

    const memberData = members[enrollment.memberId];

    const response = {
      ...enrollment,
      memberDetails: memberData
    };

    console.log('Enrollment Retrieved:', response);
    console.log('Response:', response);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve enrollment' });
  }
});

// ============================================
// Health check endpoint
// ============================================
app.get('/health', (req, res) => {
  console.log('\n[API Call] GET /health');
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// Start server
// ============================================
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🚀 Mock Enrollment API Server`);
  console.log(`📍 Running on http://localhost:${PORT}`);
  console.log(`========================================\n`);
  console.log('Available Endpoints:');
  console.log('  POST   /auth/token           - Generate access token');
  console.log('  POST   /members              - Create member');
  console.log('  GET    /plans?state=TX       - Get plans by state');
  console.log('  POST   /enrollments          - Create enrollment');
  console.log('  GET    /enrollments/:id      - Get enrollment details');
  console.log('  GET    /health               - Health check');
  console.log(`========================================\n`);
});

module.exports = app;
