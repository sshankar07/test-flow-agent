# TestFlow Agent — Enrollment API Discovery & Automation Generator

## Overview

**TestFlow Agent** is a hackathon project that converts plain-English manual QA test cases into reusable API automation assets.

A tester can enter a business flow such as enrollment creation, and the agent will:

- Understand the requested test scenario
- Detect the required API orchestration flow
- Identify dynamic variables such as `accessToken`, `memberId`, `planId`, and `enrollmentId`
- Generate a reusable Postman collection and environment file
- Generate a Playwright API test script
- Generate a JMeter `.jmx` test plan
- Execute the enrollment flow against a mock enrollment API
- Validate whether the enrollment was created successfully or whether a negative validation behaved as expected

The goal is to reduce repetitive manual QA effort and speed up the creation of API automation assets.

---

## Problem Statement

Functional testers often spend significant time creating test data, identifying API sequences, correlating dynamic values, and building automation artifacts manually.

For an enrollment creation flow, a tester may need to:

1. Log in and generate an access token
2. Create a member
3. Fetch eligible plans
4. Select a plan
5. Submit enrollment
6. Validate enrollment status
7. Capture dynamic values across API calls
8. Build Postman, Playwright, or JMeter assets for reuse

This process is repetitive, time-consuming, and error-prone.

---

## Solution

TestFlow Agent acts as an automation discovery assistant.

The user enters a manual test case in plain English. The agent analyzes the intent and generates an executable API flow.

Example input:

```text
Create an enrollment for a Texas member.
Generate valid member test data.
Get available plans for Texas.
Select a Silver plan.
Submit enrollment with effective date 01/01/2026.
Validate enrollment status is ACTIVE and enrollment ID is generated.
```

The agent detects:

```text
POST {{baseUrl}}/auth/token
POST {{baseUrl}}/members
GET  {{baseUrl}}/plans?state=TX
POST {{baseUrl}}/enrollments
GET  {{baseUrl}}/enrollments/{{enrollmentId}}
```

It then generates automation assets that can be copied, downloaded, imported, and reused.

---

## Key Features

### 1. Plain-English Test Case Analysis

The tester provides the enrollment scenario in natural language.

The agent detects:

- State, such as Texas, California, or Florida
- Plan type, such as Silver, Bronze, or Gold
- Effective date
- Positive or negative validation intent
- Required API sequence
- Required dynamic variables
- Required validations

---

### 2. Postman Collection Generation

The agent generates:

- Postman collection JSON
- Postman environment JSON
- Dynamic variable chaining
- Test scripts for response validation
- Token, member ID, plan ID, and enrollment ID extraction

The generated collection can be imported directly into Postman.

Generated files:

```text
testflow-enrollment-collection.json
testflow-enrollment-environment.json
```

---

### 3. Playwright API Test Generation

The agent generates a Playwright API test script.

The script validates:

- Authentication
- Member creation
- Plan selection
- Enrollment submission
- Enrollment status validation

Generated file:

```text
enrollment-flow.spec.ts
```

---

### 4. JMeter Test Plan Generation

The agent generates a JMeter `.jmx` test plan.

The JMeter plan includes:

- Thread group
- HTTP samplers
- Header manager
- JSON extractors
- Dynamic variable correlation
- Assertions

Generated file:

```text
enrollment-flow.jmx
```

---

### 5. Positive and Negative Scenario Support

TestFlow Agent supports both happy-path and negative validation scenarios.

#### Positive scenario

```text
Create an enrollment for a California member.
Select a Bronze plan.
Submit enrollment with effective date 03/01/2026.
Validate enrollment status is ACTIVE.
```

Expected behavior:

- State: `CA`
- Plan: `Bronze`
- Effective date: `2026-03-01`
- Enrollment status: `ACTIVE`

#### Negative scenario

```text
Create an enrollment for a Texas member with missing effective date.
Submit enrollment without effective date.
Validate API returns an error response and enrollment is not created.
```

Expected behavior:

- Submit enrollment without `effectiveDate`
- API returns HTTP `400`
- Error response contains `effectiveDate`
- No enrollment ID is generated

---

### 6. Live Enrollment Flow Execution

The application can execute the generated enrollment flow against a mock enrollment API.

On success, the UI displays:

```text
Enrollment Created and Validated Successfully
Enrollment ID
Member ID
Plan ID
Status: ACTIVE
Execution Time
```

This helps demonstrate that the generated flow is not just static text but represents an executable business process.

---

## Demo Flow

A judge can test the application using this flow:

1. Enter a manual enrollment test case.
2. Click **Analyze Flow**.
3. Review the detected API flow.
4. Click **Generate Postman**.
5. Copy or download the Postman collection and environment.
6. Click **Playwright**.
7. Copy or download the generated Playwright `.ts` script.
8. Click **JMeter**.
9. Download the generated JMeter `.jmx` file.
10. Click **Run Enrollment Flow**.
11. Review the enrollment ID and ACTIVE status validation.

---

## Sample Test Cases

### Texas Silver Plan

```text
Create an enrollment for a Texas member.
Generate valid member test data.
Get available plans for Texas.
Select a Silver plan.
Submit enrollment with effective date 01/01/2026.
Validate enrollment status is ACTIVE and enrollment ID is generated.
```

### California Bronze Plan

```text
Create an enrollment for a California member.
Generate valid member demographic data.
Get available plans for California.
Select a Bronze plan.
Submit enrollment with effective date 03/01/2026.
Validate enrollment status is ACTIVE.
Validate member ID, plan ID, and enrollment ID are generated.
```

### Negative Validation — Missing Effective Date

```text
Create an enrollment for a Texas member with missing effective date.
Generate valid member test data.
Get available plans for Texas.
Select a Silver plan.
Submit enrollment without effective date.
Validate API returns an error response and enrollment is not created.
```

### Regression Scenario

```text
Execute enrollment regression for Texas.
Create a new member.
Fetch available plans.
Select Silver plan.
Submit enrollment.
Validate enrollment status is ACTIVE.
Validate response time is less than 2 seconds for each API.
Validate access token, member ID, plan ID, and enrollment ID are captured correctly.
```

---

## Architecture

```text
testflow-agent/
│
├── frontend/
│   └── React UI for test case input, flow discovery, generated assets, and execution result
│
├── backend/
│   └── Agent API that analyzes scenarios and generates Postman, Playwright, and JMeter outputs
│
├── mock-enrollment-api/
│   └── Mock business API for authentication, member creation, plan lookup, and enrollment creation
│
└── README.md
```

---

## Technology Stack

- React
- Node.js
- Express.js
- Postman Collection JSON
- Playwright API Testing
- JMeter `.jmx`
- GitHub Copilot-assisted development
- Mock enrollment API

---

## Local Setup

### 1. Start the Mock Enrollment API

```bash
cd mock-enrollment-api
node server.js
```

Expected URL:

```text
http://localhost:4000
```

---

### 2. Start the Backend Agent API

```bash
cd backend
node server.js
```

Expected URL:

```text
http://localhost:5001
```

---

### 3. Start the Frontend

```bash
cd frontend
npm run dev
```

Expected URL:

```text
http://localhost:5173
```

---

## API Flow Used in Demo

### Authentication

```http
POST /auth/token
```

Generates access token.

### Create Member

```http
POST /members
```

Creates test member data.

### Get Plans

```http
GET /plans?state=TX
```

Returns eligible plans for the requested state.

### Submit Enrollment

```http
POST /enrollments
```

Creates enrollment using `memberId`, `planId`, and `effectiveDate`.

### Validate Enrollment

```http
GET /enrollments/{enrollmentId}
```

Validates enrollment status.

---

## Generated Assets

### Postman

```text
testflow-enrollment-collection.json
testflow-enrollment-environment.json
```

### Playwright

```text
enrollment-flow.spec.ts
```

### JMeter

```text
enrollment-flow.jmx
```

---

## Productivity Impact

TestFlow Agent reduces the effort needed to create repeatable API automation assets.

Typical manual effort:

- Postman collection with variables and validations: 45–60 minutes
- Playwright chained API test: 60–90 minutes
- JMeter plan with headers, extractors, assertions, and correlation: 2–3 hours

Generated by TestFlow Agent:

```text
Under 1 minute per artifact
```

---

## Why This Matters

This project demonstrates how QA teams can move from manual testing steps to reusable automation assets quickly.

Instead of manually analyzing API calls and rebuilding flows for every project, testers can describe the business scenario and allow the agent to generate a structured, reusable automation workspace.

This improves:

- QA productivity
- Test data setup speed
- Regression readiness
- API automation consistency
- Reuse across projects
- Onboarding for functional testers

---

## Hackathon Value

TestFlow Agent is designed for the **Reasoning Agents** challenge because it performs multi-step reasoning:

1. Understands manual business intent
2. Maps the intent to API orchestration
3. Detects variables and validations
4. Generates executable assets
5. Supports positive and negative validation
6. Runs the flow and reports the result

It is not only a code generator. It is a workflow discovery and automation assistant for QA teams.

---

## Future Enhancements

Potential next steps:

- HAR file upload and API flow discovery
- Swagger/OpenAPI ingestion
- Real JMeter execution and report generation
- Test data generation using rules or AI
- Defect creation integration
- CI/CD pipeline generation
- Support for more business domains beyond enrollment
- Microsoft Teams or GitHub integration for automation review
- Secure environment variable management

---

## Project Summary

**TestFlow Agent** converts manual enrollment test cases into reusable API automation assets.

It helps QA teams quickly generate:

- API flow documentation
- Postman collections
- Playwright API tests
- JMeter test plans
- Executable enrollment validation results

This project shows how agentic automation can reduce manual QA effort and accelerate regression automation delivery.
