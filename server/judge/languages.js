import { spawnSync } from 'node:child_process';
import { config } from '../config.js';

const WIN = process.platform === 'win32';
const EXE = WIN ? 'main.exe' : 'main';
const PY = config.judge.python;

/**
 * Language catalogue. `compile`/`run` are argv arrays run inside the work dir.
 * Placeholders: {mem} = memory limit in MB, {exe} = absolute path to the built binary.
 *  - addressSpaceLimit: false for runtimes that reserve huge virtual ranges (JVM, V8, Go);
 *    their memory is still capped by the Job Object (Windows) / checked via max RSS (Linux).
 *  - timeFactor / memExtraMb: per-language allowances, like most judges give managed runtimes.
 */
export const LANGUAGES = [
  {
    id: 'cpp17', name: 'C++17 (GCC)', ext: 'cpp', source: 'main.cpp', mode: 'text/x-c++src',
    compile: ['g++', '-O2', '-std=gnu++17', '-pipe', '-DONLINE_JUDGE', ...(WIN ? ['-Wl,--stack,268435456'] : []), '-o', EXE, 'main.cpp'],
    run: ['{exe}'], probe: ['g++', '--version'],
  },
  {
    id: 'cpp20', name: 'C++20 (GCC)', ext: 'cpp', source: 'main.cpp', mode: 'text/x-c++src',
    compile: ['g++', '-O2', '-std=gnu++20', '-pipe', '-DONLINE_JUDGE', ...(WIN ? ['-Wl,--stack,268435456'] : []), '-o', EXE, 'main.cpp'],
    run: ['{exe}'], probe: ['g++', '--version'],
  },
  {
    id: 'c11', name: 'C11 (GCC)', ext: 'c', source: 'main.c', mode: 'text/x-csrc',
    compile: ['gcc', '-O2', '-std=gnu11', '-pipe', '-DONLINE_JUDGE', ...(WIN ? ['-Wl,--stack,268435456'] : []), '-o', EXE, 'main.c', '-lm'],
    run: ['{exe}'], probe: ['gcc', '--version'],
  },
  {
    id: 'java', name: 'Java', ext: 'java', source: 'Main.java', mode: 'text/x-java',
    compile: ['javac', '-encoding', 'UTF-8', '-J-Xmx512m', '-J-XX:-UsePerfData', 'Main.java'],
    run: ['java', '-Xss64m', '-Xmx{mem}m', '-XX:+UseSerialGC', '-XX:-UsePerfData', '-Dfile.encoding=UTF-8', '-cp', '.', 'Main'],
    probe: ['javac', '-version'], addressSpaceLimit: false, memExtraMb: 64, processes: 1,
  },
  {
    id: 'python3', name: 'Python 3', ext: 'py', source: 'main.py', mode: 'text/x-python',
    compile: [PY, '-m', 'py_compile', 'main.py'],
    run: [PY, '-B', '-S', 'main.py'], probe: [PY, '--version'],
  },
  {
    id: 'pypy3', name: 'PyPy 3', ext: 'py', source: 'main.py', mode: 'text/x-python',
    compile: null, run: ['pypy3', 'main.py'], probe: ['pypy3', '--version'], addressSpaceLimit: false,
  },
  {
    id: 'javascript', name: 'JavaScript (Node.js)', ext: 'js', source: 'main.js', mode: 'text/javascript',
    compile: ['node', '--check', 'main.js'],
    run: ['node', ...(WIN ? [] : ['--stack-size=65500']), 'main.js'], probe: ['node', '--version'],
    addressSpaceLimit: false, memExtraMb: 32,
  },
  {
    id: 'go', name: 'Go', ext: 'go', source: 'main.go', mode: 'text/x-go',
    compile: ['go', 'build', '-o', EXE, 'main.go'], run: ['{exe}'], probe: ['go', 'version'],
    addressSpaceLimit: false, compileEnv: true,
  },
  {
    id: 'rust', name: 'Rust 2021', ext: 'rs', source: 'main.rs', mode: 'text/x-rustsrc',
    compile: ['rustc', '-O', '--edition', '2021', '-o', EXE, 'main.rs'], run: ['{exe}'], probe: ['rustc', '--version'],
  },
];

const byId = new Map(LANGUAGES.map((l) => [l.id, l]));
export const getLanguage = (id) => byId.get(id);

let probed = null;

/** Detect which toolchains exist on this machine (cached). */
export function availableLanguages() {
  if (probed) return probed;
  probed = [];
  for (const lang of LANGUAGES) {
    try {
      const r = spawnSync(lang.probe[0], lang.probe.slice(1), { timeout: 15000, windowsHide: true, encoding: 'utf8' });
      if (r.status === 0) {
        const version = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/)[0].slice(0, 80);
        probed.push({ ...lang, version });
      }
    } catch {
      /* not installed */
    }
  }
  return probed;
}

/** Public, serialisable view of a language. */
export const publicLanguage = (l) => ({ id: l.id, name: l.name, mode: l.mode, ext: l.ext, version: l.version || null });
