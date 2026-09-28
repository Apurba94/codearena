import { marked } from '/vendor/marked/marked.esm.js';
import DOMPurify from '/vendor/dompurify/purify.es.mjs';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Markdown + TeX. Math ($...$, $$...$$) is cut out before markdown parsing (so _ and * inside
 * formulas survive), the HTML is sanitised, then KaTeX output (which escapes its input) is spliced back.
 */
export function renderMarkdown(src) {
  const math = [];
  const stash = (tex, display) => {
    math.push({ tex, display });
    return `@@MATH${math.length - 1}@@`;
  };
  let text = String(src || '')
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(tex, true))
    .replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (_, pre, tex) => pre + stash(tex, false))
    .replace(/\\\$/g, '$');
  let htmlOut = DOMPurify.sanitize(marked.parse(text), { USE_PROFILES: { html: true } });
  htmlOut = htmlOut.replace(/@@MATH(\d+)@@/g, (_, i) => {
    const { tex, display } = math[Number(i)];
    try {
      return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore' });
    } catch {
      return `<code>${tex.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</code>`;
    }
  });
  // external links open in a new tab, safely
  return htmlOut.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"');
}
