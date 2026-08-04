const test = require('node:test');
const assert = require('node:assert/strict');
const pw = require('playwright');
const { startDiscovery } = require('./discoveryService');
const { MUST_CATCH, MUST_NOT_FLAG } = require('../lib/launchErrors.fixtures');

// "Assert the denominator, not just the findings."
// launchErrors.test.js proves the PREDICATE is correct. These tests prove the
// predicate is actually WIRED INTO the launch path — they simulate a browser-launch
// failure and assert startDiscovery routes it correctly. If someone ever deletes the
// guard from startDiscovery's catch block, the unit tests stay green but THESE go red.
// Silence has to prove it was earned.
//
// KNOWN LIMIT OF THIS FILE — read before trusting it further than it goes.
// The failure these tests route is authored by the stub below, not by Playwright.
// So they prove the WIRING (a matching error becomes a 503, a non-matching one
// doesn't) and nothing about whether the error arriving at that catch block in
// production still looks like this. Two specific blind spots:
//   1. Message drift — a Playwright upgrade rewords the launch failure. Covered
//      by launchErrors.contract.test.js, which performs a real display-less
//      launch and re-samples the actual message.
//   2. Error SHAPE drift — we throw a plain Error; the real one is a Playwright
//      error object that could gain a wrapper or move the text off `.message`.
//      Also covered by the contract test, which feeds the caught object itself
//      to the predicate rather than a string.
// The messages come from the shared corpus so this stub can't drift away from
// the fixtures the predicate is pinned against.

function withLaunchThrowing(message, fn) {
  const original = pw.chromium.launch;
  pw.chromium.launch = async () => { throw new Error(message); };
  return Promise.resolve().then(fn).finally(() => { pw.chromium.launch = original; });
}

test('every no-display fixture is mapped to a 503 (guard is wired in)', async () => {
  for (const { message } of MUST_CATCH) {
    await withLaunchThrowing(message, async () => {
      await assert.rejects(
        () => startDiscovery({ baseUrl: 'http://localhost:4000' }),
        (err) => err.statusCode === 503,
        `startDiscovery must convert this no-display launch failure into a 503: ${message}`
      );
    });
  }
});

test('unrelated launch failures are rethrown untouched (silence is earned)', async () => {
  for (const { message } of MUST_NOT_FLAG) {
    await withLaunchThrowing(message, async () => {
      await assert.rejects(
        () => startDiscovery({ baseUrl: 'http://localhost:4000' }),
        (err) => err.statusCode === undefined && err.message === message,
        `this launch failure must pass through with no 503 remapping: ${message}`
      );
    });
  }
});
