import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanRepository } from '../scripts/privacy-scan.mjs';

function git(root, args, env = {}) {
  return execFileSync('git', ['-C', root, ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

test('privacy scanner rejects a non-generic committer without echoing identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-privacy-test-'));
  const personalName = ['Synthetic', 'Personal', 'Committer'].join(' ');
  const personalAddress = ['synthetic-personal', 'example.com'].join('@');
  const identity = {
    GIT_AUTHOR_NAME: 'Jev for Claude Contributors',
    GIT_AUTHOR_EMAIL: ['contributors', 'example.invalid'].join('@'),
    GIT_COMMITTER_NAME: personalName,
    GIT_COMMITTER_EMAIL: personalAddress
  };
  try {
    git(root, ['init', '-q']);
    await writeFile(path.join(root, 'README.md'), 'Synthetic clean fixture.\n');
    git(root, ['add', 'README.md']);
    git(root, ['commit', '-q', '-m', 'synthetic commit identity fixture'], identity);

    const findings = await scanRepository(root);
    assert.ok(findings.some((finding) => finding.rule === 'non-generic commit committer identity'));
    assert.ok(findings.some((finding) => finding.rule === 'non-generic commit committer address'));
    const rendered = JSON.stringify(findings);
    assert.equal(rendered.includes(personalName), false);
    assert.equal(rendered.includes(personalAddress), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('privacy scanner catches a secret in a deleted reachable blob', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-privacy-test-'));
  const identity = {
    GIT_AUTHOR_NAME: 'Jev for Claude Contributors',
    GIT_AUTHOR_EMAIL: ['contributors', 'example.invalid'].join('@'),
    GIT_COMMITTER_NAME: 'Jev for Claude Contributors',
    GIT_COMMITTER_EMAIL: ['contributors', 'example.invalid'].join('@')
  };
  try {
    git(root, ['init', '-q']);
    await writeFile(path.join(root, 'leaked.txt'), 'ghp_' + 'A'.repeat(32));
    await writeFile(path.join(root, '.env.synthetic'), 'SYNTHETIC=true\n');
    git(root, ['add', 'leaked.txt', '.env.synthetic']);
    git(root, ['commit', '-q', '-m', 'synthetic fixture'], identity);
    await unlink(path.join(root, 'leaked.txt'));
    await unlink(path.join(root, '.env.synthetic'));
    await writeFile(path.join(root, 'README.md'), 'Synthetic clean fixture.\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'remove synthetic fixture'], identity);

    const findings = await scanRepository(root);
    assert.ok(findings.some((finding) => finding.rule === 'common access token' && finding.label.startsWith('git-blob#')));
    assert.ok(findings.some((finding) => finding.rule === 'historical private filename' && finding.label.startsWith('git-path#')));
    assert.equal(findings.some((finding) => finding.label.includes('leaked.txt') || finding.label.includes('.env.synthetic')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
