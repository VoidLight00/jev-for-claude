#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;

class SafeError extends Error {}

function assertStructured(value, label) {
  if (typeof value !== 'string' && !Array.isArray(value) && (!value || typeof value !== 'object')) {
    throw new SafeError(`${label} must be a string, object, or array`);
  }
}

export function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new SafeError('payload must be an object');
  if (payload.model !== 'jev-latest') throw new SafeError('model must be jev-latest');
  assertStructured(payload.state, 'state');
  if (!payload.questions || typeof payload.questions !== 'object' || Array.isArray(payload.questions) || Object.keys(payload.questions).length === 0) {
    throw new SafeError('questions must be a non-empty object');
  }
  for (const [id, question] of Object.entries(payload.questions)) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(id)) throw new SafeError('question ids must use 1-80 safe characters');
    if (!question || typeof question !== 'object' || Array.isArray(question)) throw new SafeError('each question must be an object');
    assertStructured(question.instructions, 'question instructions');
    if (question.type === 'noul') {
      if (question.criteria !== undefined && (!question.criteria || typeof question.criteria !== 'object' || Array.isArray(question.criteria))) {
        throw new SafeError('noul criteria must be an object');
      }
    } else if (question.type === 'choice') {
      if (!question.criteria || typeof question.criteria !== 'object' || Array.isArray(question.criteria)) throw new SafeError('choice criteria must be an object');
      const count = Object.keys(question.criteria).length;
      if (count < 2 || count > 255) throw new SafeError('choice criteria must have 2-255 options');
      if (!Object.values(question.criteria).every((value) => value === null || typeof value === 'string')) throw new SafeError('choice criteria values must be strings or null');
    } else if (question.type === 'score') {
      if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10) throw new SafeError('score criteria must have 2-10 levels');
      if (!question.criteria.every((value) => typeof value === 'string')) throw new SafeError('score criteria values must be strings');
    } else {
      throw new SafeError('unsupported question type');
    }
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) throw new SafeError('payload exceeds 256 KiB');
  return payload;
}

function finiteProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validDistribution(value, keys) {
  if (!exactKeys(value, keys)) return false;
  const probabilities = keys.map((key) => value[key]);
  if (!probabilities.every(finiteProbability)) return false;
  const sum = probabilities.reduce((total, current) => total + current, 0);
  return Math.abs(sum - 1) <= 0.001;
}

export function sanitizeResponse(payload, result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new SafeError('invalid Jev response');
  if (typeof result.model !== 'string' || !/^jev-[A-Za-z0-9._-]{1,40}$/.test(result.model) || !result.answers || typeof result.answers !== 'object' || Array.isArray(result.answers)) {
    throw new SafeError('invalid Jev response');
  }
  const requestedIds = Object.keys(payload.questions);
  if (!exactKeys(result.answers, requestedIds)) throw new SafeError('Jev response answer set does not match request');

  const answers = {};
  for (const id of requestedIds) {
    const question = payload.questions[id];
    const answer = result.answers[id];
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || answer.type !== question.type) {
      throw new SafeError('Jev response answer type mismatch');
    }
    if (question.type === 'noul') {
      if (!finiteProbability(answer.noul)) throw new SafeError('invalid noul answer');
      answers[id] = { type: 'noul', noul: answer.noul };
      continue;
    }
    if (question.type === 'choice') {
      const options = Object.keys(question.criteria);
      if (typeof answer.choice !== 'string' || !options.includes(answer.choice)) throw new SafeError('invalid choice answer');
      if (!finiteProbability(answer.confidence) || !validDistribution(answer.probabilities, options)) throw new SafeError('invalid choice distribution');
      const highest = Math.max(...options.map((key) => answer.probabilities[key]));
      if (Math.abs(answer.probabilities[answer.choice] - highest) > 0.001) throw new SafeError('invalid choice distribution');
      answers[id] = {
        type: 'choice',
        choice: answer.choice,
        probabilities: Object.fromEntries(options.map((key) => [key, answer.probabilities[key]])),
        confidence: answer.confidence
      };
      continue;
    }
    const levelKeys = question.criteria.map((_, index) => String(index));
    if (typeof answer.score !== 'number' || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > question.criteria.length - 1) {
      throw new SafeError('invalid score answer');
    }
    if (!finiteProbability(answer.confidence) || !validDistribution(answer.probabilities, levelKeys) || !exactKeys(answer.legend, levelKeys)) {
      throw new SafeError('invalid score distribution');
    }
    for (const key of levelKeys) {
      if (answer.legend[key] !== question.criteria[Number(key)]) throw new SafeError('invalid score legend');
    }
    const weightedScore = levelKeys.reduce((sum, key) => sum + Number(key) * answer.probabilities[key], 0);
    if (Math.abs(answer.score - weightedScore) > 0.001) throw new SafeError('invalid score distribution');
    answers[id] = {
      type: 'score',
      score: answer.score,
      legend: Object.fromEntries(levelKeys.map((key) => [key, question.criteria[Number(key)]])),
      probabilities: Object.fromEntries(levelKeys.map((key) => [key, answer.probabilities[key]])),
      confidence: answer.confidence
    };
  }

  if (!result.usage || typeof result.usage !== 'object' || Array.isArray(result.usage)) throw new SafeError('invalid Jev usage');
  const inputTokens = result.usage.input_tokens;
  const outputTokens = result.usage.output_tokens;
  if (!Number.isInteger(inputTokens) || inputTokens < 0 || !Number.isInteger(outputTokens) || outputTokens < 0) throw new SafeError('invalid Jev usage');

  return {
    model: result.model,
    answers,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens }
  };
}

async function readBoundedResponse(response) {
  const chunks = [];
  let size = 0;
  if (response.body && response.body[Symbol.asyncIterator]) {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_RESPONSE_BYTES) throw new SafeError('Jev response exceeds 256 KiB');
      chunks.push(bytes);
    }
  } else if (typeof response.arrayBuffer === 'function') {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_RESPONSE_BYTES) throw new SafeError('Jev response exceeds 256 KiB');
    chunks.push(bytes);
  } else if (typeof response.text === 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new SafeError('Jev response exceeds 256 KiB');
    chunks.push(Buffer.from(text));
  } else {
    throw new SafeError('invalid Jev response body');
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new SafeError('Jev response is not valid JSON');
  }
}

export async function requestJev(payload, { allowNetwork = false, apiKey, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  validatePayload(payload);
  if (!allowNetwork) throw new SafeError('network disabled: explicit allowNetwork is required');
  if (!apiKey) throw new SafeError('TYPESAFE_API_KEY is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new SafeError('timeout must be between 1 and 60000 ms');

  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SafeError('Jev request timed out'));
    }, timeoutMs);
  });

  const operation = (async () => {
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (controller.signal.aborted) throw new SafeError('Jev request timed out');
      throw new SafeError('Jev network request failed');
    }
    if (!response || typeof response.ok !== 'boolean' || typeof response.status !== 'number') throw new SafeError('invalid Jev HTTP response');
    if (!response.ok) throw new SafeError(`Jev request failed with HTTP ${response.status}`);
    const parsed = await readBoundedResponse(response);
    return sanitizeResponse(payload, parsed);
  })();

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_PAYLOAD_BYTES) throw new SafeError('input exceeds 256 KiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseArgs(argv) {
  const result = { allowNetwork: false, file: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--allow-network') result.allowNetwork = true;
    else if (arg === '--file') {
      if (!argv[i + 1]) throw new SafeError('--file requires a path');
      result.file = argv[++i];
    } else if (arg === '--help') result.help = true;
    else throw new SafeError('unknown argument');
  }
  return result;
}

async function cli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node scripts/jev-evaluate.mjs --allow-network [--file payload.json]\n');
    return;
  }
  if (!args.allowNetwork) throw new SafeError('network disabled: pass --allow-network for an explicit Jev API call');
  let text;
  try {
    text = args.file ? await readFile(args.file, 'utf8') : await readStdin();
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError('unable to read payload');
  }
  if (Buffer.byteLength(text) > MAX_PAYLOAD_BYTES) throw new SafeError('input exceeds 256 KiB');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new SafeError('payload is not valid JSON'); }
  const payload = validatePayload(parsed);
  const result = await requestJev(payload, { allowNetwork: true, apiKey: process.env.TYPESAFE_API_KEY });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  cli().catch((error) => {
    const message = error instanceof SafeError ? error.message : 'unexpected failure';
    process.stderr.write(`jev-evaluate: ${message}\n`);
    process.exitCode = 1;
  });
}

export { ENDPOINT, MAX_PAYLOAD_BYTES, MAX_RESPONSE_BYTES };
