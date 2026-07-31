const test = require('node:test');
const assert = require('node:assert/strict');
const { isNoDisplayLaunchError } = require('./launchErrors');

// ── MUST CATCH ─────────────────────────────────────────────────────────────
// Genuine no-display / no-X-server launch failures. If the pattern is ever
// narrowed too far, these go red — a real Docker/CI failure would stop being
// recognized and users would get a raw stack trace instead of guidance.
const MUST_CATCH = [
  // The real Playwright message observed in Docker. Note it ALSO contains
  // "has been closed" — proof the guard keys off the X-server marker, not that.
  'browserType.launch: Target page, context or browser has been closed\n' +
    'Looks like you launched a headed browser without having a XServer running.',
  'Missing X server or $DISPLAY',
  '[pid=60][err] ozone_platform_x11.cc(257): Missing X server or $DISPLAY',
  "Set either 'headless: true' or use 'xvfb-run' before running Playwright.  (XServer)",
];

// ── MUST NOT FLAG ──────────────────────────────────────────────────────────
// Unrelated, genuine Playwright failures. THIS is the set that earns its keep:
// a false positive here tells a user "you're in Docker, run natively" for a
// problem that has nothing to do with the display. The old guard matched
// "has been closed" and wrongly caught the first one below — that's the exact
// regression this file exists to prevent from coming back.
const MUST_NOT_FLAG = [
  'Target page, context or browser has been closed',
  'page.goto: Timeout 30000ms exceeded',
  'net::ERR_CONNECTION_REFUSED at https://example.com',
  'locator.click: Element is not attached to the DOM',
  'browserType.launch: Executable not found at /path/to/chrome',
];

test('fixture sets are non-empty (a vacuous loop must not pass as green)', () => {
  assert.ok(MUST_CATCH.length >= 3, 'MUST_CATCH should hold real fixtures');
  assert.ok(MUST_NOT_FLAG.length >= 3, 'MUST_NOT_FLAG should hold real fixtures');
});

test('recognizes genuine no-display launch failures', () => {
  for (const msg of MUST_CATCH) {
    assert.ok(isNoDisplayLaunchError(msg), `should CATCH as no-display: ${msg}`);
  }
});

test('does not flag unrelated Playwright failures', () => {
  for (const msg of MUST_NOT_FLAG) {
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
