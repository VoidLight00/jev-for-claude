#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_INPUT_BYTES = 256 * 1024;
const MAX_RECENT_EVENTS = 32;
const MAX_STATE_FILES = 20;
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function emit(value) {
  process.stdout.write(JSON.stringify(value));
}

async function readInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error('hook input exceeds limit');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function stateRoot() {
  const base = process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'jev-for-claude');
  return path.join(base, 'bounded-state');
}

function statePath(sessionId) {
  const digest = createHash('sha256').update(String(sessionId || 'unknown')).digest('hex').slice(0, 24);
  return path.join(stateRoot(), digest + '.json');
}

function freshState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    startedAt: now,
    updatedAt: now,
    toolCalls: 0,
    edits: 0,
    failures: 0,
    testEvidence: 0,
    browserEvidence: 0,
    lastEditAt: null,
    lastEvidenceAt: null,
    compactCheckpoints: 0,
    stopReminders: 0,
    recent: []
  };
}

async function loadState(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return parsed && parsed.version === 1 ? parsed : freshState();
  } catch {
    return freshState();
  }
}

async function saveState(file, state) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  state.updatedAt = new Date().toISOString();
  const temp = file + '.tmp';
  await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
  await rename(temp, file);
}

function addRecent(state, event, tool, category) {
  state.recent.push({ event, tool: tool || null, category, at: new Date().toISOString() });
  if (state.recent.length > MAX_RECENT_EVENTS) {
    state.recent.splice(0, state.recent.length - MAX_RECENT_EVENTS);
  }
}

function commandOf(input) {
  const value = input?.tool_input?.command;
  return typeof value === 'string' ? value : '';
}

function filePathOf(input) {
  const value = input?.tool_input?.file_path ?? input?.tool_input?.path ?? input?.tool_input?.notebook_path;
  return typeof value === 'string' ? value : '';
}

function isTestCommand(command) {
  return /(?:^|[;&|]\s*)(?:npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|bun\s+test|node\s+--test|pytest(?:\s|$)|go\s+test(?:\s|$)|cargo\s+test(?:\s|$)|dotnet\s+test(?:\s|$)|mvn(?:w)?\s+test(?:\s|$)|gradle(?:w)?\s+test(?:\s|$))/i.test(command);
}

function isBrowserTool(tool) {
  return /(?:playwright|puppeteer|browser|chrome)/i.test(tool || '');
}

function sensitiveWritePath(value) {
  if (!value) return false;
  const base = path.basename(value).toLowerCase();
  return base === '.env' || base.startsWith('.env.') || base === '.npmrc' || base === '.pypirc' || base === 'credentials' || base === 'credentials.json' || base === 'id_rsa' || base === 'id_ed25519' || base.endsWith('.pem') || base.endsWith('.key');
}

function analyzeCommand(command) {
  const normalized = command.replace(/\s+/g, ' ').trim();
  const unixRootRemoval = /(?:^|[;&|]\s*)(?:sudo\s+)?rm\s+(?:(?:-[a-z]*r[a-z]*f[a-z]*)|(?:-[a-z]*f[a-z]*r[a-z]*)|(?:--recursive\s+--force)|(?:--force\s+--recursive))(?:\s+--no-preserve-root)?\s+\/(?:\*|\s|$|[;&|])/i;
  const deviceFormat = /(?:^|[;&|]\s*)(?:sudo\s+)?(?:mkfs(?:\.[a-z0-9]+)?\s+\/dev\/|dd\s+[^;&|]*\bof=\/dev\/)/i;
  const windowsRootRemoval = /(?:^|[;&|]\s*)Remove-Item\b[^;&|]*\b-Recurse\b[^;&|]*\b-Force\b[^;&|]*(?:[A-Za-z]:\\(?:\s|$)|[A-Za-z]:\\\*(?:\s|$))/i;
  if (unixRootRemoval.test(normalized) || deviceFormat.test(normalized) || windowsRootRemoval.test(normalized)) {
    return { decision: 'deny', reason: 'High-confidence system-root or block-device destruction detected. The hook blocks only this narrow class; it is not a general safety proof.' };
  }

  const forcedGitClean = /(?:^|[;&|]\s*)git\s+clean\s+[^;&|]*(?:-[a-z]*f[a-z]*[dx]|-[a-z]*[dx][a-z]*f|--force)/i;
  const hardReset = /(?:^|[;&|]\s*)git\s+reset\s+--hard(?:\s|$)/i;
  const broadLocalRemoval = /(?:^|[;&|]\s*)(?:sudo\s+)?rm\s+(?:(?:-[a-z]*r[a-z]*f[a-z]*)|(?:-[a-z]*f[a-z]*r[a-z]*))\s+(?:\.|\.\/\*|\*)(?:\s|$|[;&|])/i;
  if (forcedGitClean.test(normalized) || hardReset.test(normalized) || broadLocalRemoval.test(normalized)) {
    return { decision: 'ask', reason: 'Potentially destructive workspace-wide command detected. Review the exact target and recovery plan before proceeding.' };
  }
  return null;
}

function preToolDecision(input) {
  const tool = input.tool_name || '';
  if (tool === 'Bash' || tool === 'PowerShell') return analyzeCommand(commandOf(input));
  if (EDIT_TOOLS.has(tool) && sensitiveWritePath(filePathOf(input))) {
    return { decision: 'ask', reason: 'This write targets a credential or secret-bearing filename. Confirm that no real secrets will be committed or exposed.' };
  }
  return null;
}

function decisionOutput(decision) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision.decision,
      permissionDecisionReason: decision.reason
    }
  };
}

async function prune(root, keepFile) {
  let entries;
  try { entries = await readdir(root); } catch { return; }
  const rows = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(root, name);
    try { rows.push({ full, mtime: (await stat(full)).mtimeMs }); } catch {}
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  for (const row of rows.slice(MAX_STATE_FILES)) {
    if (row.full !== keepFile) await unlink(row.full).catch(() => {});
  }
}

async function main() {
  let input;
  try { input = await readInput(); } catch { return; }
  const event = input.hook_event_name || '';
  const file = statePath(input.session_id);
  const state = await loadState(file);
  const tool = typeof input.tool_name === 'string' ? input.tool_name : '';

  if (event === 'SessionStart') {
    await saveState(file, freshState());
    await prune(path.dirname(file), file);
    return;
  }

  if (event === 'PreToolUse') {
    const decision = preToolDecision(input);
    if (decision) emit(decisionOutput(decision));
    return;
  }

  if (event === 'PostToolUse' || event === 'PostToolUseFailure') {
    state.toolCalls += 1;
    const failed = event === 'PostToolUseFailure';
    if (failed) state.failures += 1;
    let category = failed ? 'failure' : 'other';
    if (!failed && EDIT_TOOLS.has(tool)) {
      state.edits += 1;
      state.lastEditAt = new Date().toISOString();
      category = 'edit';
    } else if (!failed && (tool === 'Bash' || tool === 'PowerShell') && isTestCommand(commandOf(input))) {
      state.testEvidence += 1;
      state.lastEvidenceAt = new Date().toISOString();
      category = 'test';
    } else if (!failed && isBrowserTool(tool)) {
      state.browserEvidence += 1;
      state.lastEvidenceAt = new Date().toISOString();
      category = 'browser';
    }
    addRecent(state, event, tool, category);
    await saveState(file, state);
    return;
  }

  if (event === 'PreCompact') {
    state.compactCheckpoints += 1;
    addRecent(state, event, null, 'checkpoint');
    await saveState(file, state);
    return;
  }

  if (event === 'Stop') {
    const editTime = state.lastEditAt ? Date.parse(state.lastEditAt) : 0;
    const evidenceTime = state.lastEvidenceAt ? Date.parse(state.lastEvidenceAt) : 0;
    if (editTime > evidenceTime && state.stopReminders < 3) {
      state.stopReminders += 1;
      await saveState(file, state);
      emit({ systemMessage: 'Jev for Claude observed successful edit tool use after the last recognized test or browser tool. This is a non-blocking reminder, not proof that verification is missing; run the relevant checks or state why they do not apply.' });
    }
    return;
  }

  if (event === 'SessionEnd') {
    await unlink(file).catch(() => {});
    await prune(path.dirname(file), '');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(() => {
    process.exitCode = 0;
  });
}

export { analyzeCommand, isTestCommand, preToolDecision, sensitiveWritePath };
