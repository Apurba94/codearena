import { badRequest } from './http.js';

/**
 * Tiny schema validator. Each rule: { type, required, min, max, pattern, enum, default, trim }.
 * Returns a new object containing only declared keys; throws 400 with per-field errors.
 */
export function validate(input, schema) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  const errors = {};
  for (const [key, rule] of Object.entries(schema)) {
    let v = src[key];
    if (v === undefined || v === null || v === '') {
      if (rule.required) errors[key] = 'is required';
      else if ('default' in rule) out[key] = rule.default;
      continue;
    }
    switch (rule.type) {
      case 'string': {
        if (typeof v !== 'string') { errors[key] = 'must be text'; continue; }
        if (rule.trim !== false) v = v.trim();
        if (rule.min != null && v.length < rule.min) { errors[key] = `must be at least ${rule.min} characters`; continue; }
        if (rule.max != null && v.length > rule.max) { errors[key] = `must be at most ${rule.max} characters`; continue; }
        if (rule.pattern && !rule.pattern.test(v)) { errors[key] = rule.patternMsg || 'has an invalid format'; continue; }
        break;
      }
      case 'int': {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isInteger(n)) { errors[key] = 'must be an integer'; continue; }
        if (rule.min != null && n < rule.min) { errors[key] = `must be ≥ ${rule.min}`; continue; }
        if (rule.max != null && n > rule.max) { errors[key] = `must be ≤ ${rule.max}`; continue; }
        v = n;
        break;
      }
      case 'bool':
        v = v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
        break;
      case 'array': {
        if (!Array.isArray(v)) { errors[key] = 'must be a list'; continue; }
        if (rule.max != null && v.length > rule.max) { errors[key] = `must have at most ${rule.max} items`; continue; }
        break;
      }
      default:
        break;
    }
    if (rule.enum && !rule.enum.includes(v)) { errors[key] = `must be one of: ${rule.enum.join(', ')}`; continue; }
    out[key] = v;
  }
  if (Object.keys(errors).length) {
    const first = Object.entries(errors)[0];
    throw badRequest(`${first[0]} ${first[1]}`, errors);
  }
  return out;
}

export const HANDLE_RE = /^[A-Za-z0-9_.-]{3,24}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CHECKER_RE = /^(tokens|lines|exact|tokens-ci|float:\d+(\.\d+)?(e-?\d+)?)$/;

export function parseTags(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}
