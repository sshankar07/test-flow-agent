const SENSITIVE_KEYS = ['password', 'pass', 'pwd', 'secret', 'token', 'authorization', 'cookie', 'ssn', 'dob', 'csrf'];

const CREDENTIAL_KEY_RULES = [
  { pattern: /^username$/i, name: 'username' },
  { pattern: /^password$/i, name: 'password' },
  { pattern: /^_token$/i, name: 'csrfToken' },
  { pattern: /^csrf(token)?$/i, name: 'csrfToken' }
];

function isSensitiveKey(key) {
  return SENSITIVE_KEYS.some((sensitive) => String(key || '').toLowerCase().includes(sensitive));
}

function maskValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  const text = String(value);
  if (text.length <= 6) {
    return '******';
  }

  return `${text.slice(0, 2)}******${text.slice(-2)}`;
}

function sanitizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key, isSensitiveKey(key) ? '******' : value])
  );
}

function sanitizeValue(value, parentKey = '') {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, parentKey));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, isSensitiveKey(key) ? '******' : sanitizeValue(item, key)])
    );
  }

  return isSensitiveKey(parentKey) ? '******' : value;
}

const WHOLE_TOKEN_LENGTH_THRESHOLD = 6;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceValueOccurrences(text, value, replacement) {
  if (!value) {
    return text;
  }

  const input = String(text);
  if (value.length >= WHOLE_TOKEN_LENGTH_THRESHOLD) {
    return input.split(value).join(replacement);
  }

  const pattern = new RegExp(`(^|[^a-zA-Z0-9])${escapeRegExp(value)}(?![a-zA-Z0-9])`, 'g');
  return input.replace(pattern, (match, prefix) => `${prefix}${replacement}`);
}

function normalizeIdentifier(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function keyMatchesVariableName(key, variableName) {
  const normKey = normalizeIdentifier(key);
  const normName = normalizeIdentifier(variableName);
  if (!normKey || !normName) {
    return false;
  }

  return normKey === normName || normKey.includes(normName) || normName.includes(normKey);
}

function templatePathSegments(pathname, variables, formatter) {
  return String(pathname || '').split('/').map((segment) => {
    if (!segment) {
      return segment;
    }

    const match = variables.find((variable) => variable.value && String(variable.value) === segment);
    return match ? formatter(match.name) : segment;
  }).join('/');
}

function templateQueryString(search, variables, formatter) {
  if (!search) {
    return search;
  }

  const hasLeadingQuestion = search.startsWith('?');
  const queryString = hasLeadingQuestion ? search.slice(1) : search;
  if (!queryString) {
    return search;
  }

  // Query params are only templated when the param's own key resembles the variable's
  // name (e.g. ?empNumber=97 matching variable "empNumber") — never just because a short
  // generic value (a page offset, a timezone offset, a limit) happens to coincide with an
  // unrelated variable's value.
  const pairs = queryString.split('&').map((pair) => {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      return pair;
    }

    const key = pair.slice(0, eqIndex);
    const rawValue = pair.slice(eqIndex + 1);
    let decodedValue;
    try {
      decodedValue = decodeURIComponent(rawValue);
    } catch {
      decodedValue = rawValue;
    }

    const match = variables.find((variable) => (
      variable.value && String(variable.value) === decodedValue && keyMatchesVariableName(key, variable.name)
    ));
    return match ? `${key}=${formatter(match.name)}` : pair;
  });

  return (hasLeadingQuestion ? '?' : '') + pairs.join('&');
}

function templateUrlPathAndQuery(pathname, search, variables, formatter) {
  return templatePathSegments(pathname, variables, formatter) + templateQueryString(search, variables, formatter);
}

function templateAbsoluteUrl(urlString, variables, formatter) {
  try {
    const url = new URL(urlString);
    return `${url.protocol}//${url.host}${templateUrlPathAndQuery(url.pathname, url.search, variables, formatter)}`;
  } catch {
    return urlString;
  }
}

// Ordered list of generic patterns for locating a CSRF-style token embedded in an HTML
// page (login form pages, meta tags, Vue-style attribute props, etc.), tried in order.
// Kept as plain Perl5-compatible regex source (no JS-only features like named groups or
// lookbehind) so the same pattern can be embedded verbatim into a JMeter RegexExtractor.
const CSRF_TOKEN_HTML_PATTERNS = [
  { source: '<meta[^>]*name=["\']csrf-token["\'][^>]*content=["\']([^"\']+)["\']', flags: 'i' },
  { source: '<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']csrf-token["\']', flags: 'i' },
  { source: '<input[^>]*name=["\'](?:_token|csrf_token|csrfmiddlewaretoken)["\'][^>]*value=["\']([^"\']+)["\']', flags: 'i' },
  { source: '<input[^>]*value=["\']([^"\']+)["\'][^>]*name=["\'](?:_token|csrf_token|csrfmiddlewaretoken)["\']', flags: 'i' },
  { source: ':token=["\']&quot;([^&"\']+)&quot;["\']', flags: 'i' },
  { source: '["\'](?:_token|csrfToken|csrf_token)["\']\\s*[:=]\\s*["\']([^"\']+)["\']', flags: 'i' }
];

function extractCsrfTokenFromHtml(html) {
  const text = String(html || '');
  for (let index = 0; index < CSRF_TOKEN_HTML_PATTERNS.length; index += 1) {
    const { source, flags } = CSRF_TOKEN_HTML_PATTERNS[index];
    const match = new RegExp(source, flags).exec(text);
    if (match && match[1]) {
      return { token: match[1], patternIndex: index };
    }
  }

  return null;
}

function matchCredentialFieldName(key) {
  const rule = CREDENTIAL_KEY_RULES.find((entry) => entry.pattern.test(key));
  return rule ? rule.name : null;
}

function isFormUrlEncoded(text, contentType) {
  if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return true;
  }

  return typeof text === 'string' && /^([^&=]+=[^&]*)(&[^&=]+=[^&]*)*$/.test(text.trim());
}

function forEachFormPair(text, replacer) {
  return String(text).replace(/(^|[?&])([^&=]+)=([^&]*)/g, (match, prefix, key, value) => {
    const replacement = replacer(key, value);
    return replacement === null || replacement === undefined ? match : `${prefix}${key}=${replacement}`;
  });
}

function maskFormUrlEncodedString(text) {
  return forEachFormPair(text, (key, value) => (value && isSensitiveKey(key) ? maskValue(value) : null));
}

function replaceCredentialTokensInString(text, formatter = (name) => `{{${name}}}`) {
  return forEachFormPair(text, (key) => {
    const name = matchCredentialFieldName(key);
    return name ? formatter(name) : null;
  });
}

module.exports = {
  SENSITIVE_KEYS,
  isSensitiveKey,
  maskValue,
  sanitizeHeaders,
  sanitizeValue,
  isFormUrlEncoded,
  maskFormUrlEncodedString,
  matchCredentialFieldName,
  replaceCredentialTokensInString,
  replaceValueOccurrences,
  templateUrlPathAndQuery,
  templateAbsoluteUrl,
  CSRF_TOKEN_HTML_PATTERNS,
  extractCsrfTokenFromHtml
};
