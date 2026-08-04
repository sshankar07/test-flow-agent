const test = require('node:test');
const assert = require('node:assert/strict');
const { isNoDisplayLaunchError } = require('./launchErrors');
const {
  MUST_CATCH,
  MUST_NOT_FLAG,
  mustCatchMessages,
  mustNotFlagMessages
} = require('./launchErrors.fixtures');

// The fixtures live in launchErrors.fixtures.js and are shared with
// discoveryService.guard.test.js on purpose: the wiring test stubs its launch
// failure using the SAME strings this file pins the predicate against, so the
// two can't drift into agreeing about different things.
//
// What that does NOT buy: proof that Playwright still emits these shapes. These
// are frozen snapshots of a message observed once. Re-sampling the real thing is
// launchErrors.contract.test.js's job.

test('fixture sets are non-empty (a vacuous loop must not pass as green)', () => {
  assert.ok(MUST_CATCH.length >= 3, 'MUST_CATCH should hold real fixtures');
  assert.ok(MUST_NOT_FLAG.length >= 3, 'MUST_NOT_FLAG should hold real fixtures');
});

test('every fixture records where its message came from', () => {
  // Provenance is the only thing separating "observed in the wild" from
  // "plausible string someone invented". It isn't proof, but an undocumented
  // fixture is unauditable — you can't tell whether it ever described reality.
  for (const fixture of [...MUST_CATCH, ...MUST_NOT_FLAG]) {
    assert.ok(
      typeof fixture.provenance === 'string' && fixture.provenance.length > 0,
      `fixture is missing provenance: ${fixture.message}`
    );
  }
});

test('recognizes genuine no-display launch failures', () => {
  for (const msg of mustCatchMessages()) {
    assert.ok(isNoDisplayLaunchError(msg), `should CATCH as no-display: ${msg}`);
  }
});

test('does not flag unrelated Playwright failures', () => {
  for (const msg of mustNotFlagMessages()) {
    assert.ok(!isNoDisplayLaunchError(msg), `should NOT flag as no-display: ${msg}`);
  }
});

test('accepts an Error object, not just a string', () => {
  assert.ok(isNoDisplayLaunchError(new Error('Missing X server or $DISPLAY')));
  assert.ok(!isNoDisplayLaunchError(new Error('has been closed')));
});

test('handles empty / nullish input safely', () => {
  for (const v of [undefined, null, '']) assert.equal(isNoDisplayLaunchError(v), false);
});
