// Dependency-free secret scan over git-tracked files (CI) or, with --history, every blob in all commits.
import { execFileSync } from 'node:child_process';

const PATTERNS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['Generic secret key', /sk-[A-Za-z0-9]{32,}/],
  ['Private key block', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Assigned credential', /(api[_-]?key|secret|token|passwd|password)\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{20,}["']/i],
  ['Email-in-URL credential', /https?:\/\/[^\s/:@]+:[^\s/@]+@/],
];
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const history = process.argv.includes('--history');
const hits = [];
const scan = (label, text) => { for (const [name, re] of PATTERNS) if (re.test(text)) hits.push(`${name} in ${label}`); };

if (history) {
  const blobs = git('rev-list', '--objects', '--all').split('\n').filter(Boolean).map((l) => l.split(' ')).filter((p) => p[1] && !/package-lock\.json$/.test(p[1]));
  for (const [sha, path] of blobs) { try { scan(`${path} (${sha.slice(0, 8)})`, git('cat-file', '-p', sha)); } catch { /* binary or tree */ } }
} else {
  for (const f of git('ls-files').split('\n').filter((f) => f && !/package-lock\.json$|\.png$|\.mp4$/.test(f))) { try { scan(f, git('show', `:${f}`)); } catch { /* skip */ } }
}
if (hits.length) { console.error('Possible secrets:\n' + [...new Set(hits)].join('\n')); process.exit(1); }
console.log(`secret scan clean (${history ? 'full history' : 'tracked files'})`);
