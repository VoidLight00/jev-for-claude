import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { ENDPOINT, requestJev, sanitizeResponse, validatePayload } from '../scripts/jev-evaluate.mjs';

const payload = {
  model: 'jev-latest',
  state: 'Synthetic support ticket: export button is unavailable.',
  questions: {
    urgent: { type: 'noul', instructions: 'Is immediate action required?' },
    team: { type: 'choice', instructions: 'Choose a team.', criteria: { product: 'UI behavior', support: 'Account help' } },
    severity: { type: 'score', instructions: 'Rate impact.', criteria: ['Low', 'High'] }
  }
};

const validProviderResponse = {
  model: 'jev-test',
  answers: {
    urgent: { type: 'noul', noul: 0.25, provider_note: 'drop this' },
    team: { type: 'choice', choice: 'product', probabilities: { product: 0.8, support: 0.2 }, confidence: 0.7, provider_note: 'drop this' },
    severity: { type: 'score', score: 0.4, legend: { '0': 'Low', '1': 'High' }, probabilities: { '0': 0.6, '1': 0.4 }, confidence: 0.6 }
  },
  usage: { input_tokens: 10, output_tokens: 5 },
  provider_echo: 'drop this'
};

function responseFrom(value, delayMs = 0) {
  const body = (async function* () {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield Buffer.from(JSON.stringify(value));
  })();
  return { ok: true, status: 200, body };
}

test('validates supported typed questions', () => {
  assert.equal(validatePayload(payload), payload);
  assert.throws(() => validatePayload({ ...payload, model: 'other' }), /jev-latest/);
  assert.throws(() => validatePayload({ ...payload, questions: { bad: { type: 'score', instructions: 'x', criteria: ['one'] } } }), /2-10/);
  assert.throws(() => validatePayload({ ...payload, questions: { bad: { type: 'score', instructions: 'x', criteria: ['Low', { label: 'High' }] } } }), /must be strings/);
  assert.throws(() => validatePayload({ ...payload, questions: { bad: { type: 'choice', instructions: 'x', criteria: { yes: 1, no: null } } } }), /strings or null/);
});

test('sanitizes provider output to requested typed answers', () => {
  const result = sanitizeResponse(payload, validProviderResponse);
  assert.deepEqual(Object.keys(result), ['model', 'answers', 'usage']);
  assert.deepEqual(result.answers.urgent, { type: 'noul', noul: 0.25 });
  assert.equal('provider_echo' in result, false);
  assert.equal('provider_note' in result.answers.team, false);
});

test('rejects missing answers and malformed probability distributions', () => {
  const missing = structuredClone(validProviderResponse);
  delete missing.answers.team;
  assert.throws(() => sanitizeResponse(payload, missing), /answer set/);

  const malformed = structuredClone(validProviderResponse);
  malformed.answers.team.probabilities = { product: 0.8 };
  assert.throws(() => sanitizeResponse(payload, malformed), /choice distribution/);

  const invalidNoul = structuredClone(validProviderResponse);
  invalidNoul.answers.urgent.noul = 2;
  assert.throws(() => sanitizeResponse(payload, invalidNoul), /noul/);
});

test('programmatic adapter is network-disabled by default', async () => {
  await assert.rejects(requestJev(payload, { apiKey: 'synthetic-test-key' }), /network disabled/);
});

test('uses fixed endpoint, explicit auth, no redirects, and sanitized output', async () => {
  let observed;
  const result = await requestJev(payload, {
    allowNetwork: true,
    apiKey: 'synthetic-test-key',
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return responseFrom(validProviderResponse);
    }
  });
  assert.equal(observed.url, ENDPOINT);
  assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.headers.authorization, 'Bearer synthetic-test-key');
  assert.equal(result.answers.urgent.noul, 0.25);
  assert.equal('provider_echo' in result, false);
});

test('timeout remains active while the response body is consumed', async () => {
  await assert.rejects(
    requestJev(payload, {
      allowNetwork: true,
      apiKey: 'synthetic-test-key',
      timeoutMs: 10,
      fetchImpl: async () => responseFrom(validProviderResponse, 50)
    }),
    /timed out/
  );
});

test('response bodies are bounded before JSON parsing', async () => {
  await assert.rejects(
    requestJev(payload, {
      allowNetwork: true,
      apiKey: 'synthetic-test-key',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        body: (async function* () { yield Buffer.alloc(256 * 1024 + 1, 65); })()
      })
    }),
    /exceeds 256 KiB/
  );
});

test('HTTP failures omit response bodies', async () => {
  await assert.rejects(
    requestJev(payload, { allowNetwork: true, apiKey: 'synthetic-test-key', fetchImpl: async () => ({ ok: false, status: 422, body: null }) }),
    (error) => error.message === 'Jev request failed with HTTP 422'
  );
});

test('CLI refuses network access without the explicit flag', () => {
  const result = spawnSync(process.execPath, [path.resolve('scripts/jev-evaluate.mjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, TYPESAFE_API_KEY: 'synthetic-test-key' }
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /network disabled/);
  assert.equal(result.stdout, '');
});
