const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { maskValue, sanitizeHeaders, sanitizeValue, maskFormUrlEncodedString, replaceValueOccurrences, templateUrlPathAndQuery, extractCsrfTokenFromHtml } = require('../lib/sanitize');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generated');
const HAR_FILE_NAME = 'discovery-session.har';
const HAR_FILE_PATH = path.join(GENERATED_DIR, HAR_FILE_NAME);
const DEFAULT_BASE_URL = 'http://localhost:4000';

const STATIC_URL_MARKERS = [
  '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf',
  'fonts', 'images', 'analytics', 'google-analytics', 'gtag', 'hotjar', 'segment', 'clarity', 'favicon'
];
const SPECIFIC_VARIABLE_KEYS = new Set([
  'token', 'accessToken', 'refreshToken', 'memberId', 'customerId', 'employeeId', 'planId',
  'enrollmentId', 'orderId', 'transactionId', 'leaveRequestId', 'csrfToken', '_token', 'sessionId'
]);

let activeSession = null;
let lastCompletedSession = null;

function ensureGeneratedDir() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

function normalizeLaunchUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return '';
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return '';
  }
}

function normalizeBaseUrl(baseUrl) {
  const launchUrl = normalizeLaunchUrl(baseUrl);
  if (!launchUrl) {
    return '';
  }

  return new URL(launchUrl).origin;
}

function isJsonContentType(contentType) {
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
}

function parseMaybeJson(text, contentType) {
  if (text === null || text === undefined || text === '') {
    return null;
  }

  if (isJsonContentType(contentType)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

function extractHeaders(headerArray) {
  const headers = {};
  (headerArray || []).forEach((header) => {
    headers[header.name] = header.value;
  });
  return headers;
}

function containsStaticNoise(urlString) {
  const lower = String(urlString || '').toLowerCase();
  return STATIC_URL_MARKERS.some((marker) => lower.includes(marker));
}

function looksLikeBusinessApi(method, pathname, requestContentType, responseContentType, resourceType) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    || (pathname.includes('/api/') && (isJsonContentType(requestContentType) || isJsonContentType(responseContentType)))
    || (pathname.includes('/api/') && method === 'GET' && isJsonContentType(responseContentType))
    || ['fetch', 'xhr'].includes(resourceType);
}

function classifyHarEntry(entry) {
  const fullUrl = entry?.request?.url || '';
  if (!fullUrl) {
    return { included: false, excludeReason: 'missing url' };
  }

  const lowerUrl = fullUrl.toLowerCase();
  const pathname = new URL(fullUrl).pathname.toLowerCase();
  const method = String(entry.request.method || 'GET').toUpperCase();
  const requestHeaders = extractHeaders(entry.request.headers);
  const responseHeaders = extractHeaders(entry.response.headers);
  const requestContentType = requestHeaders['content-type'] || requestHeaders['Content-Type'] || '';
  const responseContentType = responseHeaders['content-type'] || responseHeaders['Content-Type'] || '';
  const resourceType = String(entry._resourceType || entry.resourceType || '').toLowerCase();

  if (containsStaticNoise(lowerUrl)) {
    return { included: false, excludeReason: 'static asset' };
  }

  if (pathname.includes('/i18n/') || pathname.includes('/messages')) {
    return { included: false, excludeReason: 'i18n/messages' };
  }

  if (pathname.includes('/events/push')) {
    return { included: false, excludeReason: 'event polling' };
  }

  if (!looksLikeBusinessApi(method, pathname, requestContentType, responseContentType, resourceType)) {
    return { included: false, excludeReason: 'non-business request' };
  }

  return { included: true, excludeReason: null };
}

function lastMeaningfulPathSegment(pathString) {
  const segments = String(pathString || '').split('/').filter((segment) => (
    segment && !/^[0-9a-f-]{6,}$/i.test(segment) && !/^\d+$/.test(segment)
  ));
  return segments.length ? segments[segments.length - 1] : (pathString || '');
}

function detectOperationName(api) {
  const lowerPath = String(api.path || '').toLowerCase();
  const method = String(api.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  if (/auth|token|login/.test(lowerPath)) return 'Authenticate';

  if (isMutation) {
    if (/submit|enroll|order|checkout|payment/.test(lowerPath)) return 'Submit Transaction';
    if (/user|member|customer|person|employee|create/.test(lowerPath)) return 'Create Entity';
    if (/status|detail|validate/.test(lowerPath)) return 'Validate Result';
    return `${method} ${lastMeaningfulPathSegment(api.path)}`;
  }

  if (/status|detail|validate/.test(lowerPath)) return 'Validate Result';
  if (/plan|product|search|list|get|dashboard|user|member|customer|person|employee/.test(lowerPath)) return 'Fetch Data';

  return `${method} ${lastMeaningfulPathSegment(api.path || api.fullUrl)}`;
}

function normalizeHarEntry(entry, index) {
  const url = new URL(entry.request.url);
  const requestHeaders = extractHeaders(entry.request.headers);
  const responseHeaders = extractHeaders(entry.response.headers);
  const requestContentType = requestHeaders['content-type'] || requestHeaders['Content-Type'] || '';
  const responseContentType = responseHeaders['content-type'] || responseHeaders['Content-Type'] || '';
  const requestBodyText = entry.request.postData?.text || null;
  const responseBodyText = entry.response.content?.text || null;
  const contentType = responseContentType || requestContentType || '';
  const classification = classifyHarEntry(entry);

  const normalized = {
    id: `step-${index + 1}`,
    stepNumber: index + 1,
    method: String(entry.request.method || 'GET').toUpperCase(),
    fullUrl: entry.request.url,
    baseUrl: url.origin,
    path: url.pathname,
    queryString: url.search || '',
    requestHeaders,
    requestBody: parseMaybeJson(requestBodyText, requestContentType),
    responseStatus: entry.response.status,
    responseHeaders,
    responseBody: parseMaybeJson(responseBodyText, responseContentType),
    durationMs: Number(entry.time || 0),
    contentType,
    operationName: '',
    included: classification.included,
    excludeReason: classification.excludeReason,
    expectedOutcome: 'as-captured'
  };

  normalized.operationName = detectOperationName(normalized);
  return normalized;
}

function dedupeIncludedApis(includedApis) {
  const representativeByKey = new Map();

  includedApis.forEach((api) => {
    const key = JSON.stringify([api.method, api.path, api.queryString, api.requestBody]);
    const existing = representativeByKey.get(key);
    if (existing) {
      existing.repeatCount += 1;
    } else {
      representativeByKey.set(key, { api, repeatCount: 1 });
    }
  });

  return Array.from(representativeByKey.values()).map(({ api, repeatCount }) => (
    repeatCount > 1 ? { ...api, repeatCount } : api
  ));
}

function buildRequestSearchArea(api) {
  return JSON.stringify({
    fullUrl: api.fullUrl,
    path: api.path,
    queryString: api.queryString,
    requestHeaders: api.requestHeaders,
    requestBody: api.requestBody
  }).toLowerCase();
}

const GENERIC_WRAPPER_KEYS = new Set(['data', 'items', 'item', 'results', 'result', 'rows', 'records', 'record', 'list', 'entries', 'content', 'payload', 'value', 'values']);

function toCamelCase(key) {
  return String(key).replace(/[_-]+([a-zA-Z0-9])/g, (_, chr) => chr.toUpperCase());
}

function singularize(word) {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y');
  if (/(ses|xes|ches|shes)$/i.test(word)) return word.replace(/es$/i, '');
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.replace(/s$/i, '');
  return word;
}

function getImmediateParentKey(jsonPath) {
  const withoutArrayIndices = String(jsonPath || '').replace(/\[\d+\]/g, '');
  const segments = withoutArrayIndices.split('.').filter(Boolean);
  return segments.length >= 2 ? segments[segments.length - 2] : null;
}

function pathBasedIdName(apiPath) {
  const lastSegment = lastMeaningfulPathSegment(apiPath);
  if (!lastSegment) {
    return null;
  }

  const words = String(lastSegment).replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return null;
  }

  const lastWord = singularize(words[words.length - 1]);
  const nameBase = toCamelCase([...words.slice(0, -1), lastWord].join('-'));
  return nameBase ? `${nameBase}Id` : null;
}

function deriveGenericIdName(api, jsonPath) {
  const parentKey = getImmediateParentKey(jsonPath);
  if (parentKey && !GENERIC_WRAPPER_KEYS.has(parentKey.toLowerCase()) && !/^\d+$/.test(parentKey)) {
    return `${toCamelCase(parentKey)}Id`;
  }

  return pathBasedIdName(api.path);
}

const GENERIC_ID_KEY_PATTERN = /(^id$|Id$|_id$|Number$|_number$)/;
const SHORT_VALUE_LENGTH_THRESHOLD = 6;

function deriveNameFromKey(key, api, nextPath) {
  return key === 'id' ? deriveGenericIdName(api, nextPath) : toCamelCase(key);
}

function collectVariableCandidates(value, currentPath, api, results) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectVariableCandidates(item, `${currentPath}[${index}]`, api, results));
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      const isSpecific = SPECIFIC_VARIABLE_KEYS.has(key);
      const isGenericIdLike = !isSpecific && GENERIC_ID_KEY_PATTERN.test(key);
      const normalizedName = isSpecific
        ? (key === '_token' ? 'csrfToken' : key)
        : isGenericIdLike
          ? deriveNameFromKey(key, api, nextPath)
          : null;

      if (normalizedName && item !== null && item !== undefined && item !== '') {
        results.push({
          name: normalizedName,
          sourceStep: api.stepNumber,
          jsonPath: `$.${nextPath}`,
          value: String(item),
          specific: isSpecific
        });
      }
      collectVariableCandidates(item, nextPath, api, results);
    });
  }
}

function containsExactLeafValue(value, target) {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsExactLeafValue(item, target));
  }

  if (typeof value === 'object') {
    return Object.values(value).some((item) => containsExactLeafValue(item, target));
  }

  return String(value) === target;
}

function classifyWholeTokenMatch(candidateValue, api) {
  const lowerValue = candidateValue.toLowerCase();

  const pathSegments = String(api.path || '').split('/').map((segment) => segment.toLowerCase());
  if (pathSegments.includes(lowerValue)) {
    return { matched: true, strong: true };
  }

  const queryString = String(api.queryString || '').replace(/^\?/, '');
  const queryPairs = queryString ? queryString.split('&') : [];
  const queryMatch = queryPairs.some((pair) => {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      return false;
    }
    try {
      return decodeURIComponent(pair.slice(eqIndex + 1)).toLowerCase() === lowerValue;
    } catch {
      return pair.slice(eqIndex + 1).toLowerCase() === lowerValue;
    }
  });
  if (queryMatch) {
    return { matched: true, strong: true };
  }

  if (containsExactLeafValue(api.requestBody, candidateValue) || containsExactLeafValue(api.responseBody, candidateValue)) {
    return { matched: true, strong: false };
  }

  return { matched: false, strong: false };
}

function computeReuseStats(candidate, currentIndex, includedApis) {
  if (!candidate.value) {
    return { count: 0, strongMatches: 0 };
  }

  const useSubstringMatch = candidate.value.length >= SHORT_VALUE_LENGTH_THRESHOLD;
  let count = 0;
  let strongMatches = 0;

  for (let index = currentIndex + 1; index < includedApis.length; index += 1) {
    const api = includedApis[index];
    if (useSubstringMatch) {
      const haystack = buildRequestSearchArea(api);
      if (haystack.includes(candidate.value.toLowerCase())) {
        count += 1;
      }
    } else {
      const { matched, strong } = classifyWholeTokenMatch(candidate.value, api);
      if (matched) {
        count += 1;
        if (strong) strongMatches += 1;
      }
    }
  }

  return { count, strongMatches };
}

function isMutatingMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

function detectDynamicVariables(includedApis) {
  const candidatesByName = new Map();

  includedApis.forEach((api, index) => {
    if (!api.responseBody || typeof api.responseBody !== 'object') {
      return;
    }

    const candidates = [];
    collectVariableCandidates(api.responseBody, '', api, candidates);
    const fromMutatingStep = isMutatingMethod(api.method);

    candidates.forEach((candidate) => {
      const { count, strongMatches } = computeReuseStats(candidate, index, includedApis);
      const qualifies = candidate.specific || count > 0 || fromMutatingStep;
      if (!qualifies) {
        return;
      }

      // Prefer values reused as a URL path/query segment (strong signal this is "the"
      // entity being acted on) over ones only reused incidentally inside JSON, and give
      // a small bonus to identifiers returned by the mutating step that created them.
      const score = (strongMatches * 100) + (count * 10) + (fromMutatingStep ? 5 : 0);

      if (!candidatesByName.has(candidate.name)) {
        candidatesByName.set(candidate.name, []);
      }
      candidatesByName.get(candidate.name).push({ ...candidate, score });
    });
  });

  const variables = [];
  candidatesByName.forEach((candidates) => {
    const chosen = candidates.reduce((best, current) => (current.score > best.score ? current : best));
    variables.push({
      name: chosen.name,
      sourceStep: chosen.sourceStep,
      jsonPath: chosen.jsonPath,
      value: chosen.value,
      valuePreview: maskValue(chosen.value)
    });
  });

  return variables;
}

function replaceCorrelatedValues(value, variables, formatter) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceCorrelatedValues(item, variables, formatter));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceCorrelatedValues(item, variables, formatter)]));
  }

  if (typeof value === 'string') {
    let output = value;
    variables
      .filter((variable) => variable.value)
      .sort((left, right) => right.value.length - left.value.length)
      .forEach((variable) => {
        output = replaceValueOccurrences(output, variable.value, formatter(variable.name));
      });
    return output;
  }

  return value;
}

function detectEnvironmentHints(includedApis) {
  const hints = { username: false, password: false, csrfToken: false };
  includedApis.forEach((api) => {
    const search = buildRequestSearchArea(api);
    if (search.includes('username')) hints.username = true;
    if (search.includes('password')) hints.password = true;
    if (search.includes('_token') || search.includes('csrftoken') || search.includes('csrf')) hints.csrfToken = true;
  });
  return hints;
}

function extractFieldValue(body, fieldMatcher) {
  if (body === null || body === undefined) {
    return null;
  }

  if (typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body)) {
      if (fieldMatcher(key) && value !== null && value !== undefined && value !== '') {
        return String(value);
      }
    }
    return null;
  }

  if (typeof body === 'string') {
    for (const pair of body.split('&')) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }
      const key = pair.slice(0, eqIndex);
      if (fieldMatcher(key)) {
        const rawValue = pair.slice(eqIndex + 1);
        try {
          return decodeURIComponent(rawValue);
        } catch {
          return rawValue;
        }
      }
    }
  }

  return null;
}

function extractCredentialValues(includedApis) {
  const values = { username: null, password: null, csrfToken: null };
  const matchers = {
    username: (key) => /^username$/i.test(key),
    password: (key) => /^password$/i.test(key),
    csrfToken: (key) => /^_token$|^csrf(token)?$/i.test(key)
  };

  includedApis.forEach((api) => {
    Object.keys(matchers).forEach((field) => {
      if (values[field] === null) {
        const found = extractFieldValue(api.requestBody, matchers[field]);
        if (found) {
          values[field] = found;
        }
      }
    });
  });

  return values;
}

function findCsrfRefreshSource(capturedApis) {
  const authStep = capturedApis.find((api) => extractFieldValue(api.requestBody, (key) => /^_token$|^csrf(token)?$/i.test(key)));
  if (!authStep) {
    return null;
  }

  const earlierSteps = capturedApis
    .filter((api) => api.stepNumber < authStep.stepNumber)
    .sort((a, b) => b.stepNumber - a.stepNumber);

  for (const api of earlierSteps) {
    if (typeof api.responseBody !== 'string') {
      continue;
    }

    const found = extractCsrfTokenFromHtml(api.responseBody);
    if (found) {
      return {
        url: api.fullUrl,
        method: api.method,
        patternIndex: found.patternIndex,
        authStepNumber: authStep.stepNumber
      };
    }
  }

  return null;
}

function buildDetectedSteps(includedApis, dynamicVariables) {
  return includedApis.map((api) => ({
    step: api.stepNumber,
    action: api.operationName,
    method: api.method,
    endpoint: templateUrlPathAndQuery(api.path, api.queryString, dynamicVariables, (name) => `{{${name}}}`),
    purpose: 'Captured during live API discovery'
  }));
}

function maskDisplayBody(body) {
  if (typeof body === 'string') {
    return maskFormUrlEncodedString(body);
  }

  return sanitizeValue(body);
}

function buildMaskedApis(capturedApis) {
  return capturedApis.map((api) => ({
    ...api,
    requestHeaders: sanitizeHeaders(api.requestHeaders),
    requestBody: maskDisplayBody(api.requestBody),
    responseHeaders: sanitizeHeaders(api.responseHeaders),
    responseBody: maskDisplayBody(api.responseBody)
  }));
}

function summarizeExcludedReasons(capturedApis) {
  return capturedApis
    .filter((api) => !api.included)
    .reduce((summary, api) => {
      const reason = api.excludeReason || 'unknown';
      summary[reason] = (summary[reason] || 0) + 1;
      return summary;
    }, {});
}

function buildSessionSummary(session) {
  if (!session) {
    return {
      active: false,
      status: 'IDLE',
      baseUrl: '',
      capturedApiCount: 0,
      capturedApis: [],
      includedApis: [],
      dynamicVariables: [],
      detectedSteps: [],
      harFileName: fs.existsSync(HAR_FILE_PATH) ? HAR_FILE_NAME : null
    };
  }

  const includedApis = session.includedApis || [];
  return {
    active: session.status === 'RUNNING',
    status: session.status,
    message: session.message,
    baseUrl: session.baseUrl,
    manualTestCase: session.manualTestCase,
    startedAt: session.startedAt,
    completedAt: session.completedAt || null,
    capturedApiCount: includedApis.length,
    capturedApis: buildMaskedApis(session.capturedApis),
    includedApis: buildMaskedApis(includedApis),
    dynamicVariables: session.dynamicVariables.map(({ value, ...variable }) => variable),
    detectedSteps: session.detectedSteps,
    harFileName: session.harFileName || (fs.existsSync(HAR_FILE_PATH) ? HAR_FILE_NAME : null)
  };
}

function getDiscoverySession() {
  return buildSessionSummary(activeSession || lastCompletedSession);
}

function getCapturedDiscoverySession() {
  return lastCompletedSession && Array.isArray(lastCompletedSession.includedApis) && lastCompletedSession.includedApis.length
    ? lastCompletedSession
    : null;
}

function getHarFilePath() {
  return fs.existsSync(HAR_FILE_PATH) ? HAR_FILE_PATH : null;
}

async function startDiscovery({ baseUrl, manualTestCase }) {
  const launchUrl = normalizeLaunchUrl(baseUrl);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!launchUrl || !normalizedBaseUrl) {
    const error = new Error('baseUrl must start with http:// or https://');
    error.statusCode = 400;
    throw error;
  }

  if (activeSession && activeSession.status === 'RUNNING') {
    const error = new Error('Discovery session already running');
    error.statusCode = 409;
    throw error;
  }

  ensureGeneratedDir();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    recordHar: {
      path: HAR_FILE_PATH,
      content: 'embed'
    }
  });
  const page = await context.newPage();

  activeSession = {
    status: 'RUNNING',
    message: 'Discovery browser started. Perform the flow in the opened browser, then click Stop Discovery.',
    launchUrl,
    baseUrl: normalizedBaseUrl,
    manualTestCase: manualTestCase || '',
    startedAt: new Date().toISOString(),
    completedAt: null,
    browser,
    context,
    page,
    harPath: HAR_FILE_PATH,
    harFileName: HAR_FILE_NAME,
    capturedApis: [],
    includedApis: [],
    dynamicVariables: [],
    detectedSteps: [],
    envHints: { username: false, password: false, csrfToken: false }
  };

  await page.goto(launchUrl, { waitUntil: 'domcontentloaded' });

  return {
    active: true,
    status: 'SUCCESS',
    message: activeSession.message,
    baseUrl: normalizedBaseUrl,
    harFileName: HAR_FILE_NAME
  };
}

async function stopDiscovery() {
  if (!activeSession || activeSession.status !== 'RUNNING') {
    const error = new Error('No active discovery session to stop');
    error.statusCode = 400;
    throw error;
  }

  const session = activeSession;
  session.completedAt = new Date().toISOString();

  await session.context.close();
  await session.browser.close();

  const harJson = JSON.parse(fs.readFileSync(session.harPath, 'utf8'));
  const allEntries = harJson.log?.entries || [];
  session.capturedApis = allEntries.map(normalizeHarEntry);
  session.includedApis = dedupeIncludedApis(session.capturedApis.filter((api) => api.included));
  session.dynamicVariables = detectDynamicVariables(session.includedApis);
  session.detectedSteps = buildDetectedSteps(session.includedApis, session.dynamicVariables);
  session.envHints = detectEnvironmentHints(session.includedApis);
  session.credentialValues = extractCredentialValues(session.includedApis);
  session.csrfRefreshSource = findCsrfRefreshSource(session.capturedApis);
  session.status = 'SUCCESS';
  session.message = 'Discovery completed. HAR captured and analyzed.';

  const excludedSummary = summarizeExcludedReasons(session.capturedApis);
  console.log('[discovery] HAR analysis', {
    totalHarEntries: allEntries.length,
    includedApiCount: session.includedApis.length,
    excludedCount: session.capturedApis.length - session.includedApis.length,
    excludedReasons: excludedSummary,
    dynamicVariablesCount: session.dynamicVariables.length
  });

  lastCompletedSession = {
    ...session,
    browser: null,
    context: null,
    page: null
  };
  activeSession = null;

  return buildSessionSummary(lastCompletedSession);
}

async function clearDiscoverySession() {
  if (activeSession && activeSession.status === 'RUNNING') {
    try {
      if (activeSession.context) await activeSession.context.close();
      if (activeSession.browser) await activeSession.browser.close();
    } catch (error) {
      console.warn('[discovery] Failed to close browser while clearing session', error.message || error);
    }
  }

  activeSession = null;
  lastCompletedSession = null;
  return buildSessionSummary(null);
}

function applyStepOverrides(overrides) {
  const overridesByStep = new Map((overrides || []).map((entry) => [Number(entry.stepNumber), entry.expectedOutcome]));

  [activeSession, lastCompletedSession].forEach((session) => {
    if (!session) {
      return;
    }

    [session.capturedApis, session.includedApis].forEach((apis) => {
      (apis || []).forEach((api) => {
        if (overridesByStep.has(api.stepNumber)) {
          api.expectedOutcome = overridesByStep.get(api.stepNumber);
        }
      });
    });
  });

  return buildSessionSummary(activeSession || lastCompletedSession);
}

module.exports = {
  DEFAULT_BASE_URL,
  applyStepOverrides,
  clearDiscoverySession,
  getCapturedDiscoverySession,
  getDiscoverySession,
  getHarFilePath,
  normalizeBaseUrl,
  replaceCorrelatedValues,
  startDiscovery,
  stopDiscovery
};
