/**
 * Output checkers. Each returns { ok, message }.
 *   tokens     whitespace-insensitive token comparison (default, like most judges)
 *   tokens-ci  same, case-insensitive (for YES/no style answers)
 *   lines      line by line, ignoring trailing spaces and trailing blank lines
 *   exact      byte-exact except CRLF vs LF and a trailing newline
 *   float:EPS  tokens; numbers match if absolute OR relative error ≤ EPS
 */
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const clip = (s) => (s.length > 32 ? `${s.slice(0, 29)}...` : s);
const tokenize = (s) => s.split(/\s+/).filter(Boolean);

function compareTokens(expected, actual, eq) {
  const e = tokenize(expected);
  const a = tokenize(actual);
  const n = Math.min(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (!eq(e[i], a[i])) {
      return { ok: false, message: `${ordinal(i + 1)} token differs - expected: '${clip(e[i])}', found: '${clip(a[i])}'` };
    }
  }
  if (a.length < e.length) return { ok: false, message: `answer too short - expected ${e.length} tokens, found ${a.length}` };
  if (a.length > e.length) return { ok: false, message: `extra output - expected ${e.length} tokens, found ${a.length}` };
  return { ok: true, message: `ok ${e.length} token${e.length === 1 ? '' : 's'}` };
}

function normLines(s) {
  const lines = s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function check(checker, expected, actual) {
  const kind = String(checker || 'tokens');
  if (kind === 'tokens') return compareTokens(expected, actual, (x, y) => x === y);
  if (kind === 'tokens-ci') return compareTokens(expected, actual, (x, y) => x.toLowerCase() === y.toLowerCase());
  if (kind.startsWith('float:')) {
    const eps = Number(kind.slice(6)) || 1e-6;
    const isNum = (t) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t);
    return compareTokens(expected, actual, (x, y) => {
      if (isNum(x) && isNum(y)) {
        const a = Number(x);
        const b = Number(y);
        const diff = Math.abs(a - b);
        return diff <= eps || diff <= eps * Math.abs(a);
      }
      return x === y;
    });
  }
  if (kind === 'lines') {
    const e = normLines(expected);
    const a = normLines(actual);
    for (let i = 0; i < Math.max(e.length, a.length); i++) {
      if (e[i] !== a[i]) {
        if (e[i] === undefined) return { ok: false, message: `extra output starting at line ${i + 1}` };
        if (a[i] === undefined) return { ok: false, message: `output ends early at line ${i + 1}` };
        return { ok: false, message: `line ${i + 1} differs - expected: '${clip(e[i])}', found: '${clip(a[i])}'` };
      }
    }
    return { ok: true, message: `ok ${e.length} line${e.length === 1 ? '' : 's'}` };
  }
  if (kind === 'exact') {
    const norm = (s) => s.replace(/\r\n?/g, '\n').replace(/\n$/, '');
    return norm(expected) === norm(actual)
      ? { ok: true, message: 'ok exact match' }
      : { ok: false, message: 'output differs from the expected answer' };
  }
  return { ok: false, message: `unknown checker '${kind}'` };
}
