# Optional Jev adapter

The adapter is separate from automatic hooks.

## Safety contract

- Network access is refused unless `--allow-network` is present.
- The endpoint is fixed to the official HTTPS System One endpoint.
- The API key is read only from `TYPESAFE_API_KEY` in the process environment.
- The adapter never reads dotenv files, Claude transcripts, settings, or conversations.
- Input must be explicit JSON from stdin or `--file` and is limited to 256 KiB.
- The complete response body is covered by the timeout and limited to 256 KiB before parsing.
- Requests reject redirects and have no automatic retries.
- Every requested answer is type-checked, probability distributions and score legends are validated, and output is rebuilt from approved fields only.
- HTTP error response bodies, provider-added fields, parse details, and arbitrary provider strings are not printed because they may repeat private input.

## Payload

Use the official request shape with `model`, `state`, and a named `questions` map. Version 0.1 supports `noul`, `choice`, and `score`, with a deliberately smaller criteria subset: Choice descriptions must be strings or `null`, and Score levels must be strings. Structured instructions remain supported. Other official criteria shapes are rejected locally rather than being claimed as supported.

## Example

`node scripts/jev-evaluate.mjs --allow-network --file evaluation.json`

This performs a paid external API call when valid credentials are present. The repository tests use a mock transport and never call the live service.
