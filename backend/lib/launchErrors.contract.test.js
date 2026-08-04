const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { isNoDisplayLaunchError } = require('./launchErrors');
const { mustCatchMessages } = require('./launchErrors.fixtures');

// CONTRACT TEST — the only test here that samples reality instead of a snapshot.
//
// launchErrors.test.js pins the predicate against fixtures. discoveryService.guard.test.js
// proves the predicate is wired into startDiscovery. Both feed on strings WE wrote:
// if Playwright rewords its launch failure, or wraps it in a different error class,
// every one of those tests stays green while the guard in production silently stops
// matching anything. The guard would be fine; the input would have drifted out from
// under it.
//
// This test closes that loop by actually launching a headed browser with no display
// and asserting the REAL failure still satisfies the predicate. It's the difference
// between "our fixture matches our regex" and "the thing that will actually happen
// matches our regex".
//
// It is gated because it needs a genuinely display-less host:
//   - Linux only. On macOS/Windows a headed launch succeeds without an X server, so
//     the premise doesn't hold and the test can attest nothing.
//   - TESTFLOW_CONTRACT_LAUNCH=1, so a normal `npm test` on a dev laptop stays fast
//     and doesn't require browser binaries.
// CI runs it on ubuntu with DISPLAY unset (.github/workflows/test.yml). If you widen
// the guard for a new edge case, this is the test that tells you whether the edge
// case is real.

const DISPLAY_VARS = ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY'];

const enabled = process.env.TESTFLOW_CONTRACT_LAUNCH === '1';
const onLinux = process.platform === 'linux';

const skip = !enabled
  ? 'set TESTFLOW_CONTRACT_LAUNCH=1 to run (needs a display-less Linux host + chromium installed)'
  : !onLinux
    ? `cannot run on ${process.platform}: headed launch succeeds without an X server, so a pass would be vacuous`
    : false;

/** Launch headed chromium with every display hint stripped, from env and process alike. */
async function launchWithoutDisplay() {
  const childEnv = { ...process.env };
  for (const key of DISPLAY_VARS) delete childEnv[key];

  const saved = {};
  for (const key of DISPLAY_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return await chromium.launch({ headless: false, env: childEnv });
  } finally {
    for (const key of DISPLAY_VARS) {
      if (saved[key] !== undefined) process.env[key] = saved[key];
    }
  }
}

test('a REAL display-less headed launch still satisfies isNoDisplayLaunchError', { skip, timeout: 120000 }, async () => {
  let browser;
  let launchError;
  try {
    browser = await launchWithoutDisplay();
  } catch (err) {
    launchError = err;
  }

  // A launch that SUCCEEDS means this host has a display after all. Fail loudly
  // rather than reporting green — a vacuous pass here is exactly the kind of
  // reassurance-without-evidence this file exists to eliminate.
  if (!launchError) {
    if (browser) await browser.close();
    assert.fail(
      'headed chromium launched successfully with no DISPLAY — this host is not ' +
      'display-less, so the contract could not be checked. Run this in Docker/CI.'
    );
  }

  const observed = String(launchError.message || launchError);

  // Distinguish "the environment is broken" from "the contract is broken", so a
  // missing browser binary never gets misread as a drifted error message.
  if (/Executable doesn't exist|Executable not found/i.test(observed)) {
    assert.fail(
      'chromium is not installed, so no display-less launch was attempted. ' +
      `Run: npx playwright install chromium\nObserved: ${observed}`
    );
  }

  // Feed the caught OBJECT, not a string — this also exercises the `.message`
  // unwrapping, so a future Playwright error class that moves or wraps the text
  // fails here instead of in production.
  assert.ok(
    isNoDisplayLaunchError(launchError),
    'A real no-display launch failure is no longer recognized by the guard. The ' +
    'predicate did not change — Playwright\'s message did. Update NO_DISPLAY_ERROR ' +
    'in launchErrors.js AND add this message to MUST_CATCH in launchErrors.fixtures.js.' +
    `\n\nObserved message:\n${observed}` +
    `\n\nKnown fixtures:\n${mustCatchMessages().map((m) => `  - ${JSON.stringify(m)}`).join('\n')}`
  );
});
