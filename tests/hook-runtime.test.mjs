import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { analyzeCommand, isTestCommand, preToolDecision, sensitiveWritePath } from '../scripts/hook-runtime.mjs';

const runtime = path.resolve('scripts/hook-runtime.mjs');

function runHook(input, dataDir) {
  return spawnSync(process.execPath, [runtime], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir }
  });
}

test('command classifier denies only narrow catastrophic examples', () => {
  assert.equal(analyzeCommand('sudo rm -rf /').decision, 'deny');
  assert.equal(analyzeCommand('dd if=image.iso of=/dev/disk9').decision, 'deny');
  assert.equal(analyzeCommand('rm -rf build'), null);
});

test('command classifier asks for broad workspace destruction', () => {
  assert.equal(analyzeCommand('git reset --hard HEAD').decision, 'ask');
  assert.equal(analyzeCommand('git clean -fdx').decision, 'ask');
});

test('sensitive paths and test commands are classified without reading content', () => {
  assert.equal(sensitiveWritePath('config/.env.production'), true);
  assert.equal(sensitiveWritePath('src/config.js'), false);
  assert.equal(isTestCommand('npm test && echo done'), true);
  assert.equal(isTestCommand('npm run build'), false);
  assert.equal(preToolDecision({ tool_name: 'Write', tool_input: { file_path: '.env' } }).decision, 'ask');
});

test('configured hook command launches through the declared exec-form schema', async () => {
  const config = JSON.parse(await readFile('hooks/hooks.json', 'utf8'));
  const handler = config.hooks.PreToolUse[0].hooks[0];
  const args = handler.args.map((value) => value.replace('${CLAUDE_PLUGIN_ROOT}', path.resolve('.')));
  const result = spawnSync(handler.command, args, {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'configured', tool_name: 'Bash', tool_input: { command: 'sudo rm -rf /' } }),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('hook emits valid PreToolUse decision JSON', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jev-hook-test-'));
  try {
    const result = runHook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'sudo rm -rf /' } }, dir);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('bounded metadata produces a non-blocking evidence reminder', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jev-hook-test-'));
  try {
    runHook({ hook_event_name: 'SessionStart', session_id: 's2' }, dir);
    runHook({ hook_event_name: 'PostToolUse', session_id: 's2', tool_name: 'Edit', tool_input: { file_path: 'src/app.js' } }, dir);
    const stopped = runHook({ hook_event_name: 'Stop', session_id: 's2' }, dir);
    const output = JSON.parse(stopped.stdout);
    assert.match(output.systemMessage, /non-blocking reminder/);
    const stateDir = path.join(dir, 'bounded-state');
    const names = await readdir(stateDir);
    assert.equal(names.length, 1);
    const state = JSON.parse(await readFile(path.join(stateDir, names[0]), 'utf8'));
    assert.equal(state.edits, 1);
    assert.equal(state.recent[0].tool, 'Edit');
    assert.equal(JSON.stringify(state).includes('src/app.js'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
