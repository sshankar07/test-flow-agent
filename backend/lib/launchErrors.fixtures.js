// Single source of truth for the launch-failure message shapes that
// `isNoDisplayLaunchError` (backend/lib/launchErrors.js) is pinned against.
//
// WHY THIS FILE EXISTS: these strings used to be transcribed independently into
// launchErrors.test.js (predicate fixtures) and discoveryService.guard.test.js
// (the stub that fakes a launch failure). Two copies of the same claim drift
// apart silently — and worse, BOTH are just my transcription of a message
// Playwright emitted once. Consolidating doesn't make them true; it means that
// when they're wrong, they're wrong in exactly one place and one fix corrects
// every test that leans on them.
//
// WHAT THIS FILE DOES NOT DO: it does not verify that Playwright still emits
// these shapes. A fixture is a frozen snapshot; if a Playwright upgrade rewords
// the message or wraps it in a new error class, every test here stays green
// while the guard in production stops matching anything. That gap is covered by
// launchErrors.contract.test.js, which performs a REAL display-less launch and
// re-samples the actual message. Fixtures assert our memory; the contract test
// re-checks reality. Keep both.
//
// If you widen or narrow NO_DISPLAY_ERROR, add a fixture on BOTH sides in the
// same change — the mustNotFlag set is the one that earns its keep, because
// false positives misdirect users and nobody notices until they're annoyed.

/**
 * Genuine no-display / no-X-server launch failures. These MUST be recognized.
 * If the pattern is narrowed too far these go red — a real Docker/CI failure
 * would stop being recognized and users would get a raw stack trace instead.
 */
const MUST_CATCH = [
  {
    // Observed verbatim from a headed `chromium.launch()` inside the repo's
    // Docker image. Note it ALSO contains "has been closed" — proof the guard
    // keys off the X-server marker and not that substring.
    message:
      'browserType.launch: Target page, context or browser has been closed\n' +
      'Looks like you launched a headed browser without having a XServer running.',
    provenance: 'observed: playwright headed launch in this repo\'s Docker image'
  },
  {
    message: 'Missing X server or $DISPLAY',
    provenance: 'observed: chromium ozone platform error, display-less Linux host'
  },
  {
    message: '[pid=60][err] ozone_platform_x11.cc(257): Missing X server or $DISPLAY',
    provenance: 'observed: same error with chromium\'s pid/source-location prefix'
  },
  {
    message:
      "Set either 'headless: true' or use 'xvfb-run' before running Playwright.  (XServer)",
    provenance: 'observed: playwright remediation hint appended to the launch error'
  }
];

/**
 * Unrelated but genuine Playwright failures. These MUST NOT be flagged.
 * A false positive tells a user "you're in Docker, run natively" for a problem
 * that has nothing to do with the display. The old guard matched
 * "has been closed" and wrongly caught the first one below — that is the exact
 * regression this set exists to prevent from coming back.
 */
const MUST_NOT_FLAG = [
  {
    message: 'Target page, context or browser has been closed',
    provenance: 'regression: the false positive the old over-broad guard produced'
  },
  {
    message: 'page.goto: Timeout 30000ms exceeded',
    provenance: 'unrelated: navigation timeout'
  },
  {
    message: 'net::ERR_CONNECTION_REFUSED at https://example.com',
    provenance: 'unrelated: target host down'
  },
  {
    message: 'locator.click: Element is not attached to the DOM',
    provenance: 'unrelated: stale element'
  },
  {
    message: 'browserType.launch: Executable not found at /path/to/chrome',
    provenance: 'unrelated: browser binary missing, NOT a display problem'
  }
];

const mustCatchMessages = () => MUST_CATCH.map((f) => f.message);
const mustNotFlagMessages = () => MUST_NOT_FLAG.map((f) => f.message);

module.exports = {
  MUST_CATCH,
  MUST_NOT_FLAG,
  mustCatchMessages,
  mustNotFlagMessages
};
