/* Thin wrapper over CodeMirror 5 (loaded globally) with a <textarea> fallback. */

const MODE = {
  'text/x-c++src': 'text/x-c++src', 'text/x-csrc': 'text/x-csrc', 'text/x-java': 'text/x-java', 'text/x-python': 'python',
  'text/javascript': 'javascript', 'text/x-go': 'go', 'text/x-rustsrc': 'rust',
};

export const TEMPLATES = {
  cpp17: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    \n    return 0;\n}\n',
  cpp20: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    \n    return 0;\n}\n',
  c11: '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n',
  java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        \n    }\n}\n',
  python3: 'import sys\ninput = sys.stdin.readline\n\ndef main():\n    \n\nmain()\n',
  pypy3: 'import sys\ninput = sys.stdin.readline\n\ndef main():\n    \n\nmain()\n',
  javascript: "const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);\nlet pos = 0;\nconst next = () => data[pos++];\n\n",
  go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\twriter := bufio.NewWriter(os.Stdout)\n\tdefer writer.Flush()\n\t_ = reader\n\tfmt.Fprintln(writer)\n}\n',
  rust: 'use std::io::{self, Read, Write};\n\nfn main() {\n    let mut s = String::new();\n    io::stdin().read_to_string(&mut s).unwrap();\n    let mut it = s.split_ascii_whitespace();\n    let out = io::stdout();\n    let mut out = out.lock();\n    let _ = (&mut it, &mut out);\n}\n',
};

export function createEditor(host, { value = '', mode = 'text/x-c++src', readOnly = false } = {}) {
  if (window.CodeMirror) {
    const cm = window.CodeMirror(host, {
      value, mode: MODE[mode] || mode, lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
      matchBrackets: true, autoCloseBrackets: !readOnly, readOnly, viewportMargin: readOnly ? Infinity : 10,
      extraKeys: { Tab: (c) => (c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('    ', 'end')) },
    });
    return {
      get: () => cm.getValue(),
      set: (v) => cm.setValue(v),
      setMode: (m) => cm.setOption('mode', MODE[m] || m),
      focus: () => cm.focus(),
      refresh: () => cm.refresh(),
      onChange: (fn) => cm.on('change', () => fn(cm.getValue())),
    };
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.rows = 18;
  ta.readOnly = readOnly;
  ta.spellcheck = false;
  host.appendChild(ta);
  return {
    get: () => ta.value, set: (v) => { ta.value = v; }, setMode: () => {}, focus: () => ta.focus(), refresh: () => {},
    onChange: (fn) => ta.addEventListener('input', () => fn(ta.value)),
  };
}

/* Remember the last language and a draft per problem (per-browser convenience only). */
export const prefs = {
  get(k, d = null) { try { return localStorage.getItem(`ca-${k}`) ?? d; } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(`ca-${k}`); else localStorage.setItem(`ca-${k}`, v); } catch { /* ignore */ } },
};
