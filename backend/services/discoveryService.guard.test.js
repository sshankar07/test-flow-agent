const test = require('node:test');
const assert = require('node:assert/strict');
const pw = require('playwright');
const { startDiscovery } = require('./discoveryService');

// "Assert the denominator, not just the findings."
// launchErrors.test.js proves the PREDICATE is correct. These tests prove the
// predicate is actually WIRED INTO the launch path — they simulate a browser-launch
// failure and assert startDiscovery routes it correctly. If someone ever deletes the
// guard from startDiscovery's catch block, the unit tests stay green but THESE go red.
// Silence has to prove it was earned.

function withLaunchThrowing(message, fn) {
  const original = pw.chromium.launch;
  pw.chromium.launch = async () => { throw new Error(message); };
  return Promise.resolve().then(fn).finally(() => { pw.chromium.launch = original; });
}

test('a genuine no-display launch failure is mapped to a 503 (guard is wired in)', async () => {
  await withLaunchThrowing('Missing X server or $DISPLAY', async () => {
    await assert.rejects(
      () => startDiscovery({ baseUrl: 'http://localhost:4000' }),
      (err) => err.statusCode === 503,
      'startDiscovery must convert a no-display launch failure into a 503'
    );
  });
});

test('an unrelated launch failure is rethrown untouched (silence is earned)', async () => {
  await withLaunchThrowing('Target page, context or browser has been closed', async () => {
    await assert.rejects(
      () => startDiscovery({ baseUrl: 'http://localhost:4000' }),
      (err) => err.statusCode === undefined && /has been closed/.test(err.message),
      'an unrelated launch failure must pass through with no 503 remapping'
    );
  });
});
