#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skippedDirectories = new Set(['node_modules', 'coverage']);
const privateNames = [/^\.env(?:\..+)?$/i, /^id_(?:rsa|ed25519)$/i, /^credentials(?:\.json)?$/i, /^secrets?\.(?:json|ya?ml|txt)$/i, /^\.npmrc$/i, /^\.pypirc$/i];
const genericAuthor = 'Jev for Claude Contributors';
const genericEmail = ['contributors', 'example.invalid'].join('@');
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_GIT_OBJECTS = 5000;
const MAX_GIT_BLOBS = 2000;
const MAX_GIT_BLOB_BYTES = 32 * 1024 * 1024;

const contentRules = [
  ['absolute home path', /(?:\/Users\/[A-Za-z0-9._-]+(?:\/|\b)|\/home\/[A-Za-z0-9._-]+(?:\/|\b)|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+(?:\\|\b))/],
  ['private key material', new RegExp('-'.repeat(5) + 'BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY' + '-'.repeat(5))],
  ['common access token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/],
  ['authorization bearer value', /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+\/-]{20,}/i],
  ['hosted account identifier', /(?:github\.com|gitlab\.com|bitbucket\.org)(?::|\/)[A-Za-z0-9_.-]+\//i]
];
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function opaqueLabel(kind, value) {
  return `${kind}#${createHash('sha256').update(String(value)).digest('hex').slice(0, 12)}`;
}

function inspectText(findings, label, text, { allowGenericEmail = false } = {}) {
  for (const [rule, pattern] of contentRules) {
    if (pattern.test(text)) findings.push({ label, rule });
  }
  const emails = text.match(emailPattern) || [];
  if (emails.some((email) => !(allowGenericEmail && email.toLowerCase() === genericEmail))) {
    findings.push({ label, rule: 'email address' });
  }
}

export function isSafePublicRemote(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return false;
  if (contentRules.some(([rule, pattern]) => rule !== 'hosted account identifier' && pattern.test(value))) return false;
  const owner = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?';
  const repository = '[A-Za-z0-9._-]{1,100}';
  const httpsPattern = new RegExp(`^https://github\\.com/${owner}/${repository}(?:\\.git)?$`);
  const sshPattern = new RegExp(`^git@github\\.com:${owner}/${repository}\\.git$`);
  return httpsPattern.test(value) || sshPattern.test(value);
}

function hasCredentialBearingRemoteSyntax(value) {
  if (typeof value !== 'string') return true;
  if (/^[^\s@/:]+@/.test(value)) return true;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.username || parsed.password || parsed.search || parsed.hash);
  } catch {
    return false;
  }
}

async function walk(findings, root, directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(root, full) || '.';
    const label = opaqueLabel('file', relative);
    if (entry.name === '.git') continue;
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) await walk(findings, root, full);
      continue;
    }
    const info = await lstat(full);
    if (info.isSymbolicLink()) {
      findings.push({ label, rule: 'symbolic link not allowed in publication source' });
      continue;
    }
    if (!info.isFile()) continue;
    if (privateNames.some((pattern) => pattern.test(entry.name))) findings.push({ label, rule: 'private filename' });
    if (info.size > MAX_FILE_BYTES) {
      findings.push({ label, rule: 'file exceeds 1 MiB scan limit' });
      continue;
    }
    const bytes = await readFile(full);
    if (bytes.includes(0)) {
      findings.push({ label, rule: 'binary file not allowed' });
      continue;
    }
    inspectText(findings, label, bytes.toString('utf8'));
  }
}

function git(root, args, options = {}) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: options.encoding,
    input: options.input,
    maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore']
  });
}

function isGitRoot(root) {
  try {
    const top = git(root, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    return path.resolve(top) === root;
  } catch {
    return false;
  }
}

function inspectGitIdentity(findings, root) {
  try {
    const identities = git(root, ['log', '--all', '--format=%an%x00%ae%x00%cn%x00%ce%x00'], { encoding: 'utf8' }).split('\0').map((value) => value.trim()).filter(Boolean);
    for (let index = 0; index < identities.length; index += 4) {
      if (identities[index] !== genericAuthor) findings.push({ label: 'git-history', rule: 'non-generic commit author identity' });
      if (identities[index + 1] !== genericEmail) findings.push({ label: 'git-history', rule: 'non-generic commit author address' });
      if (identities[index + 2] !== genericAuthor) findings.push({ label: 'git-history', rule: 'non-generic commit committer identity' });
      if (identities[index + 3] !== genericEmail) findings.push({ label: 'git-history', rule: 'non-generic commit committer address' });
    }
    const messages = git(root, ['log', '--all', '--format=%B%x00'], { encoding: 'utf8' });
    inspectText(findings, 'git-history', messages, { allowGenericEmail: true });
  } catch {
    findings.push({ label: 'git-history', rule: 'unable to inspect available git history' });
  }

  try {
    const metadata = git(root, ['config', '--local', '--get-regexp', '^(user\\.|remote\\..*\\.url$)'], { encoding: 'utf8' });
    for (const line of metadata.split('\n').filter(Boolean)) {
      const separator = line.indexOf(' ');
      const key = separator === -1 ? line : line.slice(0, separator);
      const value = separator === -1 ? '' : line.slice(separator + 1);
      if (key === 'user.name' && value !== genericAuthor) findings.push({ label: 'git-metadata', rule: 'non-generic local git user name' });
      else if (key === 'user.email' && value !== genericEmail) findings.push({ label: 'git-metadata', rule: 'non-generic local git user address' });
      else if (key.startsWith('remote.') && !isSafePublicRemote(value)) {
        inspectText(findings, 'git-metadata', value, { allowGenericEmail: true });
        if (hasCredentialBearingRemoteSyntax(value)) findings.push({ label: 'git-metadata', rule: 'credential-bearing git remote' });
      }
    }
  } catch (error) {
    if (error?.status !== 1) findings.push({ label: 'git-metadata', rule: 'unable to inspect local git metadata' });
  }
}

function inspectGitBlobs(findings, root) {
  let objectLines;
  try {
    objectLines = git(root, ['rev-list', '--objects', '--all'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\n').filter(Boolean);
  } catch {
    findings.push({ label: 'git-blobs', rule: 'unable to enumerate reachable git objects' });
    return;
  }
  if (objectLines.length > MAX_GIT_OBJECTS) {
    findings.push({ label: 'git-blobs', rule: 'git object count exceeds scan bound' });
    return;
  }
  for (const line of objectLines) {
    const separator = line.indexOf(' ');
    if (separator === -1) continue;
    const historicalPath = line.slice(separator + 1);
    const label = opaqueLabel('git-path', historicalPath);
    if (privateNames.some((pattern) => pattern.test(path.basename(historicalPath)))) findings.push({ label, rule: 'historical private filename' });
    inspectText(findings, label, historicalPath);
  }
  const hashes = [...new Set(objectLines.map((line) => line.slice(0, line.indexOf(' ') === -1 ? line.length : line.indexOf(' '))))];
  let checks;
  try {
    checks = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
      encoding: 'utf8',
      input: hashes.join('\n') + '\n',
      maxBuffer: 8 * 1024 * 1024
    }).split('\n').filter(Boolean);
  } catch {
    findings.push({ label: 'git-blobs', rule: 'unable to classify reachable git objects' });
    return;
  }
  const blobs = checks.map((line) => line.split(' ')).filter((parts) => parts[1] === 'blob').map(([hash, , size]) => ({ hash, size: Number(size) }));
  if (blobs.length > MAX_GIT_BLOBS) {
    findings.push({ label: 'git-blobs', rule: 'git blob count exceeds scan bound' });
    return;
  }
  const totalBytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_GIT_BLOB_BYTES) {
    findings.push({ label: 'git-blobs', rule: 'git blob bytes exceed scan bound' });
    return;
  }
  for (const blob of blobs) {
    const label = `git-blob#${blob.hash.slice(0, 12)}`;
    if (!Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > MAX_FILE_BYTES) {
      findings.push({ label, rule: 'historical blob exceeds 1 MiB scan limit' });
      continue;
    }
    try {
      const bytes = git(root, ['cat-file', 'blob', blob.hash], { maxBuffer: MAX_FILE_BYTES + 1024 });
      if (bytes.includes(0)) findings.push({ label, rule: 'binary historical blob not allowed' });
      else inspectText(findings, label, bytes.toString('utf8'), { allowGenericEmail: true });
    } catch {
      findings.push({ label, rule: 'unable to inspect historical blob' });
    }
  }
}

export async function scanRepository(root = defaultRoot) {
  const resolved = path.resolve(root);
  const findings = [];
  await walk(findings, resolved, resolved);
  if (isGitRoot(resolved)) {
    inspectGitIdentity(findings, resolved);
    inspectGitBlobs(findings, resolved);
  }
  return findings;
}

function parseArgs(argv) {
  if (argv.length === 0) return defaultRoot;
  if (argv.length === 2 && argv[0] === '--root') return argv[1];
  throw new Error('invalid arguments');
}

async function cli() {
  let root;
  try { root = parseArgs(process.argv.slice(2)); } catch { process.stderr.write('privacy scan failed: invalid arguments\n'); process.exitCode = 1; return; }
  let findings;
  try { findings = await scanRepository(root); } catch { process.stderr.write('privacy scan failed: unable to inspect repository\n'); process.exitCode = 1; return; }
  if (findings.length) {
    process.stderr.write(`privacy scan failed with ${findings.length} finding(s):\n`);
    for (const finding of findings) process.stderr.write(`- ${finding.rule} in ${finding.label}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('privacy scan passed\n');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await cli();
