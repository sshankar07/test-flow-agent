// Detects a Playwright browser-launch failure caused specifically by there being
// NO DISPLAY / no X server — i.e. trying to run a *headed* browser inside Docker,
// CI, or a headless box. Live discovery needs a headed browser, so when this is the
// cause we return a friendly "run it natively" message instead of a raw stack trace.
//
// This heuristic is deliberately NARROW, and the narrowness is load-bearing.
// An over-broad guard is strictly worse than no guard: it doesn't just misfire, it
// actively points people at the wrong cause ("you're in Docker, run natively") for a
// failure that had nothing to do with the display — costing them an afternoon and
// their trust in the next message the tool prints.
//
// The mirror-image risk is a guard that's too tight: a genuine no-display failure
// stops being recognized. Both directions are pinned by fixtures in
// launchErrors.test.js — a MUST-catch set and a MUST-NOT-flag set. If you ever widen
// this pattern for a new edge case, add a fixture on BOTH sides in the same change;
// the must-not-flag set is the one that earns its keep, because false-positive
// regressions are the ones nobody notices until a user is annoyed.
const NO_DISPLAY_ERROR = /XServer|X server|\$DISPLAY/i;

/**
 * @param {string|Error} message  launch error (or its message)
 * @returns {boolean} true only for genuine no-display / no-X-server launch failures
 */
function isNoDisplayLaunchError(message) {
  const text = message && message.message ? message.message : message;
  return NO_DISPLAY_ERROR.test(String(text || ''));
}

module.exports = { isNoDisplayLaunchError, NO_DISPLAY_ERROR };
