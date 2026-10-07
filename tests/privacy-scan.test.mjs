import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanRepository, isSafePublicRemote } from '../scripts/privacy-scan.mjs';

test('public remote exception does not permit token-shaped repository paths', () => {
  const tokenShape = ['sk', 'a'.repeat(32)].join('-');
  const host = ['github', 'com'].join('.');
  const httpsBase = ['https:', '', host, 'synthetic-owner'].join('/');
  const sshBase = ['git', host].join('@') + ':synthetic-owner';
  assert.equal(isSafePublicRemote(`${httpsBase}/${tokenShape}.git`), false);
  assert.equal(isSafePublicRemote(`${sshBase}/${tokenShape}.git`), false);
});

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


test('privacy scanner permits canonical credential-free public GitHub remotes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-privacy-test-'));
  const identity = {
    GIT_AUTHOR_NAME: 'Jev for Claude Contributors',
    GIT_AUTHOR_EMAIL: ['contributors', 'example.invalid'].join('@'),
    GIT_COMMITTER_NAME: 'Jev for Claude Contributors',
    GIT_COMMITTER_EMAIL: ['contributors', 'example.invalid'].join('@')
  };
  const owner = ['safe', 'owner'].join('-');
  const repository = ['safe', 'repository'].join('-');
  const host = ['github', 'com'].join('.');
  try {
    git(root, ['init', '-q']);
    await writeFile(path.join(root, 'README.md'), 'Synthetic clean fixture.\n');
    git(root, ['add', 'README.md']);
    git(root, ['commit', '-q', '-m', 'synthetic public remote fixture'], identity);
    git(root, ['remote', 'add', 'origin', `https://${host}/${owner}/${repository}.git`]);
    git(root, ['remote', 'add', 'backup', `git@${host}:${owner}/${repository}.git`]);

    const findings = await scanRepository(root);
    assert.deepEqual(findings, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('privacy scanner rejects credential-bearing remotes without echoing owner or credential', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-privacy-test-'));
  const identity = {
    GIT_AUTHOR_NAME: 'Jev for Claude Contributors',
    GIT_AUTHOR_EMAIL: ['contributors', 'example.invalid'].join('@'),
    GIT_COMMITTER_NAME: 'Jev for Claude Contributors',
    GIT_COMMITTER_EMAIL: ['contributors', 'example.invalid'].join('@')
  };
  const owner = ['synthetic', 'remote', 'owner'].join('-');
  const repository = ['synthetic', 'remote', 'repository'].join('-');
  const credential = 'ghp_' + 'B'.repeat(32);
  const host = ['github', 'com'].join('.');
  try {
    git(root, ['init', '-q']);
    await writeFile(path.join(root, 'README.md'), 'Synthetic clean fixture.\n');
    git(root, ['add', 'README.md']);
    git(root, ['commit', '-q', '-m', 'synthetic credential remote fixture'], identity);
    git(root, ['remote', 'add', 'origin', `https://${credential}@${host}/${owner}/${repository}.git`]);

    const findings = await scanRepository(root);
    assert.ok(findings.some((finding) => finding.rule === 'credential-bearing git remote'));
    assert.ok(findings.every((finding) => finding.label === 'git-metadata'));
    const rendered = JSON.stringify(findings);
    assert.equal(rendered.includes(owner), false);
    assert.equal(rendered.includes(credential), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
