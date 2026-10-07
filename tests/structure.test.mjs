import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const expectedPrinciples = [
  'safety-preflight',
  'rule-rubric',
  'browser-qa',
  'evidence-completion',
  'steer-queue',
  'compact-checkpoint',
  'targeted-file-relevance',
  'seo-audit'
];

test('plugin and marketplace manifests agree', async () => {
  const plugin = JSON.parse(await readFile('.claude-plugin/plugin.json', 'utf8'));
  const marketplace = JSON.parse(await readFile('.claude-plugin/marketplace.json', 'utf8'));
  assert.equal(plugin.name, 'jev-workflows');
  assert.equal(marketplace.plugins[0].name, plugin.name);
  assert.equal(marketplace.plugins[0].source, './');
  assert.equal(plugin.hooks, './hooks/hooks.json');
});

test('all eight principle skills are user-invoked only', async () => {
  const directories = await readdir('skills');
  for (const name of expectedPrinciples) {
    assert.ok(directories.includes(name), `missing skill ${name}`);
    const text = await readFile(`skills/${name}/SKILL.md`, 'utf8');
    assert.match(text, /disable-model-invocation:\s*true/);
  }
});

test('package is dependency-free and requires node 20', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.engines.node, '>=20');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});
