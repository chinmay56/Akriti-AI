const SENSITIVE_NAME_PATTERN =
  /(password|passcode|passwd|pwd|credit.?card|card.?number|cc-|cc_|cvc|cvv|expiry|expiration|ssn|social.?security|token|secret|api.?key|auth|otp|pin|security.?code|bank|routing)/i;

const URL_SECRET_PARAM_PATTERN =
  /(^|[_-])(token|secret|key|password|passcode|auth|session|jwt|signature|sig|credential|access|refresh)([_-]|$)/i;

export const MASK = '[masked]';

export function compactText(value: string | null | undefined, maxLength = 500): string {
  const compacted = (value ?? '').replace(/\s+/g, ' ').trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, maxLength - 1)}...`;
}

export function isSensitiveName(value: string | null | undefined): boolean {
  return Boolean(value && SENSITIVE_NAME_PATTERN.test(value));
}

export function isSensitiveInput(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (type === 'password' || type === 'hidden') {
      return true;
    }
  }

  const signal = [
    element.getAttribute('name'),
    element.id,
    element.getAttribute('autocomplete'),
    element.getAttribute('placeholder'),
    element.getAttribute('aria-label')
  ]
    .filter(Boolean)
    .join(' ');

  return isSensitiveName(signal);
}

export function shouldSkipElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') {
    return true;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return isSensitiveInput(element);
  }

  return false;
}

export function sanitizeAttribute(name: string, value: string): string {
  const attributeName = name.toLowerCase();
  if (
    attributeName === 'value' ||
    attributeName === 'srcdoc' ||
    attributeName.includes('secret') ||
    attributeName.includes('token') ||
    isSensitiveName(attributeName)
  ) {
    return MASK;
  }

  if (attributeName === 'href' || attributeName === 'src' || attributeName === 'action') {
    return sanitizeUrl(value);
  }

  return compactText(value, 300);
}

export function sanitizeUrl(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value, window.location.href);
    url.searchParams.forEach((_paramValue, paramName) => {
      if (URL_SECRET_PARAM_PATTERN.test(paramName)) {
        url.searchParams.set(paramName, MASK);
      }
    });
    return url.toString();
  } catch {
    return compactText(value, 300);
  }
}
