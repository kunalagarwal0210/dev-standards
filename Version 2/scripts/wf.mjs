#!/usr/bin/env node
// wf.mjs — build-workflow helper for Claude Code. Zero dependencies, Node 18+.
//
// Keeps the build state (.workflow/state.json), decides how GPT reviews run
// (Claudex proxy vs separate Codex instance), runs those reviews with stop caps,
// feeds the Claude Code status line, and serves the live progress dashboard.
//
// Usage: node scripts/wf.mjs <command> [args]   (run `node scripts/wf.mjs help`)

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';

// ---------- locate the MAIN repo root (works from inside any worktree) ----------
function findRoot() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', shell: isWin });
  if (r.status === 0 && r.stdout.trim()) return path.dirname(r.stdout.trim());
  return process.cwd();
}
const ROOT = findRoot();
const WF = path.join(ROOT, '.workflow');
const STATE = path.join(WF, 'state.json');
const CONFIG = path.join(WF, 'config.json');
const LOCK = path.join(WF, 'state.lock');
const TMP = path.join(WF, 'tmp');
const REVIEWS = path.join(ROOT, 'reviews');

const PHASES = [
  ['grill', 'Grill the idea'], ['spec', 'Spec'], ['tickets', 'Tickets'],
  ['design', 'Design gate'], ['build', 'Build'], ['ship', 'Ship'],
];
const TICKET_STAGES = ['queued', 'building', 'code-review', 'fixing', 'ready', 'batched', 'merged', 'escalated', 'blocked'];
const BATCH_STAGES = ['integrating', 'adversarial-review', 'fixing', 'human-gate', 'merged', 'escalated'];

// ---------- small utils ----------
const now = () => new Date().toISOString();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const die = (msg, code = 1) => { console.error(`wf: ${msg}`); process.exit(code); };
const readJSON = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };

function loadConfig() {
  const cfg = readJSON(CONFIG, null);
  if (!cfg) die(`missing ${path.relative(process.cwd(), CONFIG)} — copy the kit's .workflow/config.json into the repo root first`);
  return cfg;
}

function freshState(project = path.basename(ROOT)) {
  return {
    project,
    route: { code: null, adversarial: null, checkedAt: null },
    phases: PHASES.map(([id, label]) => ({ id, label, status: 'pending', updated: null })),
    tickets: {},
    batches: {},
    events: [],
    updated: now(),
  };
}

// Serialised read-modify-write so parallel workers can't clobber state.
function withState(fn) {
  fs.mkdirSync(WF, { recursive: true });
  let fd = null;
  for (let i = 0; i < 200; i++) {
    try { fd = fs.openSync(LOCK, 'wx'); break; } catch {
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 15000) fs.unlinkSync(LOCK); } catch {}
      sleep(50);
    }
  }
  if (fd === null) die('could not acquire state lock');
  const release = () => { try { fs.unlinkSync(LOCK); } catch {} };
  process.once('exit', release); // a die() inside fn must not leave the lock behind
  try {
    const st = readJSON(STATE, null) || freshState();
    const out = fn(st);
    st.updated = now();
    st.events = st.events.slice(-300);
    const tmp = STATE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
    fs.renameSync(tmp, STATE);
    return out;
  } finally {
    fs.closeSync(fd);
    release();
    process.removeListener('exit', release);
  }
}

function event(st, msg, kind = 'info', actor = null) {
  st.events.push({ t: now(), msg, kind, actor });
}

function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) opt[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) opt[k] = argv[++i];
      else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

const list = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

// ---------- routing: Claudex proxy or separate Codex instance ----------
function codexAvailable() {
  const r = spawnSync('codex', ['--version'], { encoding: 'utf8', shell: isWin });
  return r.status === 0;
}

async function proxyHasModel(cfg, model) {
  const base = process.env.ANTHROPIC_BASE_URL;
  if (!base || /api\.anthropic\.com/.test(base)) return { ok: false, why: 'ANTHROPIC_BASE_URL not set to a proxy' };
  const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '';
  const url = base.replace(/\/+$/, '') + (cfg.route?.proxyModelsPath || '/v1/models');
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'x-api-key': token },
      signal: AbortSignal.timeout(cfg.route?.timeoutMs || 3000),
    });
    if (!res.ok) return { ok: false, why: `proxy answered ${res.status} on ${url}` };
    const body = await res.json();
    const ids = (body.data || body.models || []).map((m) => m.id || m.name);
    return ids.includes(model)
      ? { ok: true, why: `proxy at ${base} lists ${model}` }
      : { ok: false, why: `proxy reachable but does not list ${model}` };
  } catch (e) {
    return { ok: false, why: `proxy not reachable (${e.name})` };
  }
}

// Returns { via: 'claudex'|'codex'|'unavailable', model, why }
async function detectRoute(cfg, kind) {
  const r = cfg.reviews[kind];
  const forced = process.env.WF_ROUTE || cfg.route?.force;
  if (forced === 'claudex') return { via: 'claudex', model: r.proxyModel, why: 'forced by WF_ROUTE/config' };
  if (forced === 'codex') return { via: 'codex', model: r.codexModel, why: 'forced by WF_ROUTE/config' };

  const p = await proxyHasModel(cfg, r.proxyModel);
  if (p.ok) return { via: 'claudex', model: r.proxyModel, why: p.why };
  if (codexAvailable()) return { via: 'codex', model: r.codexModel, why: `${p.why}; using separate Codex instance` };
  return { via: 'unavailable', model: null, why: `${p.why}; and \`codex\` CLI not found on PATH` };
}

// ---------- running a reviewer ----------
function winQuote(a) {
  if (a === '') return '""';
  return /[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}

function runReviewer(cfg, via, vars, cwd) {
  const runner = cfg.runners[via];
  const args = runner.args.map((a) => a.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''));
  const env = { ...process.env };
  // A nested `claude -p` may refuse to start if it thinks it's inside another session.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  const res = spawnSync(runner.cmd, isWin ? args.map(winQuote) : args, {
    cwd, env, encoding: 'utf8', shell: isWin,
    maxBuffer: 64 * 1024 * 1024,
    timeout: cfg.reviewTimeoutMs || 25 * 60 * 1000,
  });
  return res;
}

function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function specText(spec) {
  if (!spec) return '(no spec recorded — review against the acceptance criteria you can infer from the diff and commit messages, and flag the missing spec as a blocking issue)';
  const m = String(spec).match(/^#?(\d+)$/);
  if (m) {
    const r = spawnSync('gh', ['issue', 'view', m[1], '--json', 'title,body', '--jq', '"# " + .title + "\\n\\n" + .body'], { cwd: ROOT, encoding: 'utf8', shell: isWin });
    return r.status === 0 ? r.stdout : `(could not fetch GitHub issue #${m[1]}: ${r.stderr.trim()})`;
  }
  const p = path.isAbsolute(spec) ? spec : path.join(ROOT, spec);
  try { return fs.readFileSync(p, 'utf8'); } catch { return `(spec file not found: ${spec})`; }
}

const ROLE = { code: 'Sol', adversarial: 'Astra' };

async function review(id, kind, opt) {
  if (!['code', 'adversarial'].includes(kind)) die('--kind must be code or adversarial');
  const cfg = loadConfig();
  const st0 = readJSON(STATE, null) || die('no state yet — run `wf init` first');
  const isBatch = !!st0.batches[id];
  const ent = isBatch ? st0.batches[id] : st0.tickets[id];
  if (!ent) die(`unknown ticket/batch ${id}`);
  if (kind === 'code' && isBatch) die('code review is per ticket; batches get --kind adversarial');
  if (kind === 'adversarial' && !isBatch) die('adversarial review runs per merge batch; create one with `wf batch add`');

  if (['ready', 'batched', 'merged', 'human-gate'].includes(ent.stage) && !opt.again) {
    console.log(`ALREADY_PASSED ${id} is at stage ${ent.stage}. Use --again to force another round (still counts toward the cap).`);
    process.exit(0);
  }
  const max = cfg.maxRounds[kind];
  const done = ent.rounds?.[kind] || 0;
  if (done >= max) {
    withState((st) => {
      const e = isBatch ? st.batches[id] : st.tickets[id];
      e.stage = 'escalated'; e.escalation = `Stop cap: ${done}/${max} ${ROLE[kind]} rounds used`;
      event(st, `${id}: stop cap reached before another ${ROLE[kind]} round — needs your decision`, 'escalation', 'you');
    });
    console.log(`STOP_CAP ${id} — ${done}/${max} rounds already used. Escalate to the human.`);
    process.exit(3);
  }

  const route = await detectRoute(cfg, kind);
  withState((st) => { st.route[kind] = { ...route, checkedAt: now() }; st.route.checkedAt = now(); });
  if (route.via === 'unavailable') {
    withState((st) => event(st, `${id}: no route to ${ROLE[kind]} — ${route.why}`, 'error'));
    console.log(`NO_ROUTE ${route.why}`);
    process.exit(2);
  }

  const n = done + 1;
  const cwd = opt.cwd || ent.worktree || ROOT;
  if (!fs.existsSync(cwd)) die(`working folder not found: ${cwd}`);

  const prevFile = (ent.reviews || []).filter((r) => r.kind === kind).slice(-1)[0]?.file;
  const vars = {
    id, round: n, max, base: cfg.baseRef || 'origin/main',
    title: ent.title || '',
    spec: isBatch
      ? ent.tickets.map((t) => `## ${t} — ${st0.tickets[t]?.title || ''}\n\n${specText(st0.tickets[t]?.spec)}`).join('\n\n---\n\n')
      : specText(ent.spec),
    ui: !isBatch && ent.ui ? 'yes' : 'no',
    design: cfg.designDir || 'docs/design',
    tickets: isBatch ? ent.tickets.join(', ') : id,
    previous: prevFile ? path.join(ROOT, prevFile) : 'none (first round)',
  };
  const tpl = fs.readFileSync(path.join(WF, 'prompts', kind === 'code' ? 'code-review.md' : 'adversarial-review.md'), 'utf8');
  fs.mkdirSync(TMP, { recursive: true });
  const promptPath = path.join(TMP, `${id}-${kind}-r${n}.prompt.md`);
  fs.writeFileSync(promptPath, render(tpl, vars));

  const stageName = kind === 'code' ? 'code-review' : 'adversarial-review';
  withState((st) => {
    const e = isBatch ? st.batches[id] : st.tickets[id];
    e.stage = stageName; e.round = { kind, n, max }; e.updated = now();
    event(st, `${id}: ${ROLE[kind]} review round ${n}/${max} started via ${route.via === 'claudex' ? 'Claudex proxy' : 'separate Codex'} (${route.model})`, 'review', ROLE[kind].toLowerCase());
  });

  const instruction = `Read the review brief at ${promptPath} and follow it exactly. Do not modify any files. Reply with the review only.`;
  const res = runReviewer(cfg, route.via, { model: route.model, instruction, promptDir: TMP, cwd }, cwd);
  const out = (res.stdout || '').trim();

  fs.mkdirSync(REVIEWS, { recursive: true });
  const relFile = path.join('reviews', `${id}-${kind}-r${n}.md`);
  const header = `<!-- ${ROLE[kind]} ${kind} review · ${id} · round ${n}/${max} · via ${route.via} · ${route.model} · ${now()} -->\n\n`;
  fs.writeFileSync(path.join(ROOT, relFile), header + (out || `(no output)\n\nstderr:\n${res.stderr || res.error || ''}`));

  const verdict = (out.match(/^\s*VERDICT:\s*(PASS|FAIL)\s*$/im) || [])[1]?.toUpperCase();
  const blocking = Number((out.match(/^\s*BLOCKING:\s*(\d+)\s*$/im) || [])[1]);

  if (res.status !== 0 || !verdict) {
    withState((st) => {
      const e = isBatch ? st.batches[id] : st.tickets[id];
      e.stage = isBatch ? 'integrating' : 'building';
      delete e.round;
      event(st, `${id}: ${ROLE[kind]} review produced no verdict (exit ${res.status ?? res.error?.code}). See ${relFile}. Round not counted.`, 'error');
    });
    console.log(`REVIEW_ERROR see ${relFile}`);
    process.exit(4);
  }

  const result = withState((st) => {
    const e = isBatch ? st.batches[id] : st.tickets[id];
    e.rounds = { ...(e.rounds || {}), [kind]: n };
    e.reviews = [...(e.reviews || []), { kind, n, file: relFile, verdict, blocking: isNaN(blocking) ? null : blocking, via: route.via, t: now() }];
    const hist = e.reviews.filter((r) => r.kind === kind).map((r) => r.blocking);
    const noProgress = hist.length >= 2 && hist.at(-1) !== null && hist.at(-2) !== null && hist.at(-1) >= hist.at(-2);
    e.updated = now(); delete e.round;
    if (verdict === 'PASS') {
      e.stage = isBatch ? 'human-gate' : 'ready';
      event(st, `${id}: ${ROLE[kind]} passed on round ${n}${isBatch ? ' — waiting for your ship decision' : ''}`, 'pass', ROLE[kind].toLowerCase());
      return 0;
    }
    if (n >= max || noProgress) {
      e.stage = 'escalated';
      e.escalation = noProgress ? `No progress: blocking issues went ${hist.at(-2)} → ${hist.at(-1)}` : `Stop cap: ${n}/${max} ${ROLE[kind]} rounds used`;
      event(st, `${id}: ${e.escalation} — needs your decision`, 'escalation', 'you');
      return 3;
    }
    e.stage = 'fixing';
    event(st, `${id}: ${ROLE[kind]} found ${isNaN(blocking) ? 'some' : blocking} blocking issue(s) — Sonnet fixing`, 'fail', 'sonnet');
    return 1;
  });

  console.log(`${result === 3 ? 'ESCALATED' : verdict} ${id} ${kind} round ${n}/${max} blocking=${isNaN(blocking) ? '?' : blocking} review=${relFile}`);
  process.exit(result);
}

// ---------- status line ----------
function statusline() {
  const st = readJSON(STATE, null);
  if (!st) { return; } // silent in projects with no build, so a global status line stays clean
  const phase = st.phases.find((p) => p.status === 'active') || [...st.phases].reverse().find((p) => p.status === 'done');
  const ts = Object.values(st.tickets);
  const ready = ts.filter((t) => ['ready', 'batched', 'merged'].includes(t.stage)).length;
  const live = Object.entries(st.tickets).filter(([, t]) => ['building', 'code-review', 'fixing'].includes(t.stage))
    .map(([id, t]) => `${id} ${t.stage}${t.round ? ` r${t.round.n}/${t.round.max}` : ''}`);
  const esc = [...Object.entries(st.tickets), ...Object.entries(st.batches)].filter(([, e]) => e.stage === 'escalated').map(([id]) => id);
  const gate = Object.entries(st.batches).filter(([, b]) => b.stage === 'human-gate').map(([id]) => id);
  const via = st.route?.code?.via || st.route?.adversarial?.via;
  const parts = [`◆ ${phase ? phase.label : 'Not started'}`];
  if (ts.length) parts.push(`${ready}/${ts.length} tickets ready`);
  if (live.length) parts.push(live.slice(0, 2).join(', ') + (live.length > 2 ? ` +${live.length - 2}` : ''));
  if (gate.length) parts.push(`${gate.join(',')} waiting on you`);
  if (esc.length) parts.push(`⚠ ${esc.join(',')} escalated`);
  if (via) parts.push(`GPT via ${via === 'claudex' ? 'Claudex' : via === 'codex' ? 'Codex' : 'none'}`);
  console.log(parts.join('  │  '));
}

// ---------- full status (readable assessment for /wf-start and /wf-status) ----------
function statusFull() {
  const st = readJSON(STATE, null);
  if (!st) {
    console.log('NOT_INITIALISED — no build in this project (.workflow/state.json absent).');
    console.log('Start one with: wf init "<Project name>"');
    return;
  }
  const active = st.phases.find((p) => p.status === 'active');
  const lastDone = [...st.phases].reverse().find((p) => p.status === 'done');
  const blockedPhase = st.phases.find((p) => p.status === 'blocked');
  console.log(`Project: ${st.project}`);
  console.log(`Phase:   ${active ? `${active.label} (active)` : blockedPhase ? `${blockedPhase.label} (blocked)` : lastDone ? `${lastDone.label} (done)` : 'not started'}`);

  const ts = Object.entries(st.tickets);
  if (ts.length) {
    const byStage = {};
    ts.forEach(([id, t]) => { (byStage[t.stage] ||= []).push(id); });
    console.log('Tickets:');
    TICKET_STAGES.forEach((s) => { if (byStage[s]) console.log(`  ${s.padEnd(13)} ${byStage[s].join(', ')}`); });
  } else {
    console.log('Tickets: none registered yet');
  }

  const batches = Object.entries(st.batches);
  if (batches.length) {
    console.log('Batches:');
    batches.forEach(([id, b]) => console.log(`  ${id.padEnd(6)} ${b.stage}  (${(b.tickets || []).join(', ')})`));
  }

  const esc = [...Object.entries(st.tickets), ...Object.entries(st.batches)].filter(([, e]) => e.stage === 'escalated');
  const gate = Object.entries(st.batches).filter(([, b]) => b.stage === 'human-gate');
  if (gate.length) console.log(`WAITING ON YOU (ship gate): ${gate.map(([id]) => id).join(', ')}`);
  if (esc.length) console.log(`ESCALATED (needs your decision): ${esc.map(([id, e]) => `${id} — ${e.escalation || 'see events'}`).join('; ')}`);

  const doneish = new Set(['ready', 'batched', 'merged']);
  const nxt = Object.entries(st.tickets).filter(([, t]) => t.stage === 'queued' && (t.blockedBy || []).every((b) => doneish.has(st.tickets[b]?.stage))).map(([id]) => id);
  console.log(`Unblocked & queued: ${nxt.length ? nxt.join(', ') : '(none)'}`);

  const via = st.route?.code?.via || st.route?.adversarial?.via;
  if (via) console.log(`GPT reviews route via: ${via}`);
}

// ---------- dashboard ----------
function dash(opt) {
  const cfg = readJSON(CONFIG, {});
  const port = Number(opt.port || cfg.dashboardPort || 4777);
  const html = path.join(WF, 'dashboard.html');
  http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) {
      if (!fs.existsSync(html)) { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end(`dashboard.html not found at ${html}`); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return fs.createReadStream(html).pipe(res);
    }
    if (req.url.startsWith('/state.json')) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(readJSON(STATE, freshState())));
    }
    res.writeHead(404); res.end();
  }).listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Build dashboard on ${url}  (Ctrl+C to stop)`);
    if (opt.open) spawnSync(isWin ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open', isWin ? ['""', url] : [url], { shell: isWin });
  });
}

// ---------- commands ----------
const HELP = `wf — build workflow helper

  init [project]                         create .workflow/state.json, update .gitignore
  route                                  show how Sol and Astra reviews will run right now
  phase <grill|spec|tickets|design|build|ship> <pending|active|done|blocked>
  ticket add <ID> --title "..." [--spec path|#issue] [--blocked-by T01,T02] [--frontier F1] [--ui]
  ticket set <ID> key=value ...          e.g. branch=feat/T03-login worktree=../app-T03
  ticket stage <ID> <stage> [--note "..."]   stages: ${TICKET_STAGES.join(', ')}
  ticket show <ID> | ticket next         next = unblocked queued tickets
  batch add <BID> <T..> [--branch b] [--worktree path]
  batch stage <BID> <stage> [--note "..."]   stages: ${BATCH_STAGES.join(', ')}
  review <ID> --kind code|adversarial [--cwd path] [--again]
        exit 0 pass · 1 fail (fix and re-run) · 2 no route · 3 escalate to human · 4 reviewer error
  log "<message>" [--actor opus|sonnet|sol|astra|you]
  status                                 readable assessment of the current build (phase, tickets, gates)
  statusline                             one-line summary (used by Claude Code status line)
  dash [--port 4777] [--open]            live progress dashboard
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parseArgs(rest);

  switch (cmd) {
    case 'init': {
      fs.mkdirSync(WF, { recursive: true });
      if (fs.existsSync(STATE) && !opt.force) { console.log('state already exists (use --force to reset)'); break; }
      fs.writeFileSync(STATE, JSON.stringify(freshState(pos[0] || path.basename(ROOT)), null, 2));
      const gi = path.join(ROOT, '.gitignore');
      const lines = ['.workflow/state.json', '.workflow/state.json.tmp', '.workflow/state.lock', '.workflow/tmp/', 'reviews/'];
      const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
      const add = lines.filter((l) => !cur.split(/\r?\n/).includes(l));
      if (add.length) fs.appendFileSync(gi, `${cur && !cur.endsWith('\n') ? '\n' : ''}# build workflow (local state)\n${add.join('\n')}\n`);
      console.log(`initialised ${path.relative(process.cwd(), STATE) || STATE}`);
      break;
    }
    case 'route': {
      const cfg = loadConfig();
      const code = await detectRoute(cfg, 'code');
      const adv = await detectRoute(cfg, 'adversarial');
      withState((st) => { st.route = { code: { ...code, checkedAt: now() }, adversarial: { ...adv, checkedAt: now() }, checkedAt: now() }; });
      console.log(`Code review (Sol):        ${code.via.padEnd(11)} ${code.model || ''}\n   ${code.why}`);
      console.log(`Adversarial (Astra):      ${adv.via.padEnd(11)} ${adv.model || ''}\n   ${adv.why}`);
      break;
    }
    case 'phase': {
      const [id, status] = pos;
      if (!PHASES.some(([p]) => p === id)) die(`unknown phase ${id}`);
      if (!['pending', 'active', 'done', 'blocked'].includes(status)) die('status must be pending|active|done|blocked');
      withState((st) => {
        if (status === 'active') st.phases.forEach((p) => { if (p.status === 'active' && p.id !== id) p.status = 'done'; });
        const p = st.phases.find((x) => x.id === id); p.status = status; p.updated = now();
        event(st, `Phase “${p.label}” → ${status}`, 'phase', opt.actor || null);
      });
      break;
    }
    case 'ticket': {
      const [sub, id, ...more] = pos;
      if (sub === 'next') {
        const st = readJSON(STATE, freshState());
        const doneish = new Set(['ready', 'batched', 'merged']);
        const nxt = Object.entries(st.tickets).filter(([, t]) => t.stage === 'queued' && (t.blockedBy || []).every((b) => doneish.has(st.tickets[b]?.stage)));
        console.log(nxt.length ? nxt.map(([k, t]) => `${k}\t${t.frontier || '-'}\t${t.ui ? 'ui' : '  '}\t${t.title}`).join('\n') : '(nothing unblocked)');
        break;
      }
      if (!id) die('ticket id required');
      if (sub === 'show') { console.log(JSON.stringify(readJSON(STATE, freshState()).tickets[id] || null, null, 2)); break; }
      withState((st) => {
        if (sub === 'add') {
          st.tickets[id] = {
            ...(st.tickets[id] || {}), title: opt.title || id, spec: opt.spec || null,
            blockedBy: list(opt['blocked-by']), frontier: opt.frontier || null, ui: !!opt.ui,
            stage: st.tickets[id]?.stage || 'queued', rounds: st.tickets[id]?.rounds || {}, updated: now(),
          };
          event(st, `Ticket ${id} registered: ${st.tickets[id].title}`, 'info', 'opus');
        } else if (sub === 'set') {
          const t = st.tickets[id] || die(`unknown ticket ${id}`);
          more.forEach((kv) => { const i = kv.indexOf('='); t[kv.slice(0, i)] = kv.slice(i + 1); });
          t.updated = now();
        } else if (sub === 'stage') {
          const t = st.tickets[id] || die(`unknown ticket ${id}`);
          const stage = more[0];
          if (!TICKET_STAGES.includes(stage)) die(`stage must be one of ${TICKET_STAGES.join(', ')}`);
          t.stage = stage; t.updated = now();
          if (stage !== 'escalated') delete t.escalation;
          if (stage === 'escalated' && opt.note) t.escalation = opt.note;
          event(st, `${id} → ${stage}${opt.note ? ` (${opt.note})` : ''}`, stage === 'escalated' ? 'escalation' : 'stage', opt.actor || null);
        } else die(`unknown ticket subcommand ${sub}`);
      });
      break;
    }
    case 'batch': {
      const [sub, id, ...more] = pos;
      if (!id) die('batch id required');
      withState((st) => {
        if (sub === 'add') {
          const missing = more.filter((t) => !st.tickets[t]);
          if (missing.length) die(`unknown tickets: ${missing.join(', ')}`);
          st.batches[id] = { tickets: more, branch: opt.branch || `batch/${id}`, worktree: opt.worktree || null, stage: 'integrating', rounds: {}, updated: now() };
          more.forEach((t) => { st.tickets[t].stage = 'batched'; st.tickets[t].batch = id; });
          event(st, `Batch ${id} opened with ${more.join(', ')}`, 'info', 'opus');
        } else if (sub === 'stage') {
          const b = st.batches[id] || die(`unknown batch ${id}`);
          const stage = more[0];
          if (!BATCH_STAGES.includes(stage)) die(`stage must be one of ${BATCH_STAGES.join(', ')}`);
          b.stage = stage; b.updated = now();
          if (stage !== 'escalated') delete b.escalation;
          if (stage === 'escalated' && opt.note) b.escalation = opt.note;
          if (stage === 'merged') b.tickets.forEach((t) => { if (st.tickets[t]) st.tickets[t].stage = 'merged'; });
          event(st, `Batch ${id} → ${stage}${opt.note ? ` (${opt.note})` : ''}`, stage === 'escalated' ? 'escalation' : 'stage', opt.actor || null);
        } else if (sub === 'set') {
          const b = st.batches[id] || die(`unknown batch ${id}`);
          more.forEach((kv) => { const i = kv.indexOf('='); b[kv.slice(0, i)] = kv.slice(i + 1); });
        } else die(`unknown batch subcommand ${sub}`);
      });
      break;
    }
    case 'review': return review(pos[0], opt.kind, opt);
    case 'log': withState((st) => event(st, pos.join(' '), 'info', opt.actor || null)); break;
    case 'status': statusFull(); break;
    case 'statusline': statusline(); break;
    case 'dash': dash(opt); break;
    default: console.log(HELP);
  }
}

main();
