---
description: Run an explicit typed Jev evaluation using a caller-supplied payload.
disable-model-invocation: true
argument-hint: "[payload file and intended judgment]"
---

Prepare or run a Jev judgment for: $ARGUMENTS

1. Confirm the state and each question are appropriate to send to an external service.
2. Use a minimal explicit JSON payload with `model: "jev-latest"` and typed `noul`, `choice`, or `score` questions.
3. Never collect a payload from conversation transcripts, settings, dotenv files, or unrelated repository files.
4. Show the payload scope before any network call.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/jev-evaluate.mjs" --allow-network --file <payload>` only when the user explicitly authorizes the call and `TYPESAFE_API_KEY` is already present in the process environment.
6. Report returned typed answers as probabilistic judgments, not facts.

Never call the API automatically. Do not print the API key or HTTP error bodies.
