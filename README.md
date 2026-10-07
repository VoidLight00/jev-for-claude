# Jev for Claude

A dependency-free Claude Code plugin that turns eight practical engineering principles into explicit user-invoked skills, adds conservative local hooks, and provides an optional typed Jev API adapter.

This is an independent, unofficial community project. It is not an Anthropic or TypeSafe product and is not affiliated with or endorsed by either company. The implementation is original and does not reuse third-party repository code, local `CLAUDE.md` files, or user settings.

## What it provides

| Skill | Purpose |
| --- | --- |
| `/jev-workflows:safety-preflight` | Check scope, reversibility, authorization, privacy, and rollback before risky work. |
| `/jev-workflows:rule-rubric` | Convert requirements into testable rules and evidence criteria. |
| `/jev-workflows:browser-qa` | Verify a rendered web flow with observable evidence. |
| `/jev-workflows:evidence-completion` | Audit whether completion claims are actually supported. |
| `/jev-workflows:steer-queue` | Classify new instructions and maintain a bounded work queue. |
| `/jev-workflows:compact-checkpoint` | Produce a short evidence-grounded handoff checkpoint. |
| `/jev-workflows:targeted-file-relevance` | Select the smallest relevant file set before broad reading or edits. |
| `/jev-workflows:seo-audit` | Audit technical and on-page SEO without promising rankings. |
| `/jev-workflows:jev-judge` | Prepare or run an explicit typed Jev evaluation. |

All skills set `disable-model-invocation: true`. They run only when the user invokes the namespaced skill.

## Automatic hooks

The hook runtime is local, dependency-free, bounded, and fail-open on malformed input.

- `PreToolUse` denies a narrow set of high-confidence system-root or block-device destruction patterns.
- `PreToolUse` asks for confirmation on selected workspace-wide destructive commands and writes to secret-bearing filenames.
- `PostToolUse` records only bounded categories and counters, never tool content, prompts, transcripts, or full paths.
- `PreCompact` saves a small metadata checkpoint for the current session.
- `Stop` can emit a non-blocking reminder when recognized edits occurred after the last recognized test or browser tool.
- `SessionEnd` removes that session's local state.

These hooks are guardrails, not a semantic Jev judgment and not proof that a command is safe or that testing is complete. See [limitations](docs/LIMITATIONS.md).

## Optional Jev evaluation

No automatic hook makes a network request. The separate adapter calls the official System One endpoint only when all of these are true:

1. the caller supplies an explicit JSON payload through stdin or `--file`;
2. `--allow-network` is present;
3. `TYPESAFE_API_KEY` already exists in the process environment.

```sh
node scripts/jev-evaluate.mjs --allow-network --file evaluation.json
```

The endpoint is fixed, redirects are rejected, input is capped at 256 KiB, requests time out, there are no automatic retries, and HTTP error bodies are not printed. See [adapter details](docs/JEV_ADAPTER.md). Running the adapter with valid credentials can incur external usage charges. Repository tests use a mock transport only.

## Install in Claude Code

In a Claude Code session, replace `<owner>` with the public repository owner:

```text
/plugin marketplace add <owner>/jev-for-claude
/plugin install jev-workflows@jev-workflows-marketplace
```

Choose user scope for all projects or project/local scope for a narrower installation. Reload plugins or start a new session, then run `/jev-workflows:safety-preflight`. Installing does not enable Jev network calls or store an API key.

## Local validation

Requirements: Node.js 20 or newer. There are no package dependencies.

```sh
npm test
npm run privacy
bash gates/verify_jev_for_claude.sh
```

The master gate also runs `claude plugin validate --strict` when a Claude executable is available. The public project brand remains Jev for Claude; its neutral internal Claude plugin ID is `jev-workflows`. The gate does not install the plugin or start a paid Claude session.

For a local, one-session load during development:

```sh
claude --plugin-dir .
```

Review the plugin before loading it. This repository does not modify user or project Claude settings.

## Privacy and publication gate

`scripts/privacy-scan.mjs` fails on symlinks, private filenames, binary or oversized files, email addresses, absolute home paths, hosted-account identifiers, common token forms, private key material, and bearer values. If the directory is a Git repository, it also scans commit identity and messages, local Git metadata, and every reachable historical blob within fail-closed object and byte bounds. Findings use opaque hashes instead of raw filenames and never print matched values or Git stderr.

Git commits are expected to use the generic author name `Jev for Claude Contributors` and a non-personal address using local part `contributors` at the reserved `example.invalid` domain. The scanner is intentionally conservative but cannot guarantee that all personal or secret data is absent. Review staged changes and Git history before publication.

## Design boundaries

- No dependencies and no install scripts.
- No automatic network access.
- No reading of full conversations, transcript files, dotenv files, or Claude settings.
- No global installation, repository creation, commit, push, or release behavior.
- No claim that skill instructions implement interrupt routing or background scheduling.
- No reuse of local `CLAUDE.md`, settings, or third-party repository content.

## References

- Claude Code plugin manifest: https://code.claude.com/docs/en/plugins/manifest-reference
- Claude Code marketplace manifest: https://code.claude.com/docs/en/plugins/marketplace-reference
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code skills: https://code.claude.com/docs/en/skills
- TypeSafe System One API: https://docs.typesafe.ai/api
- Optional principle context video: https://www.youtube.com/watch?v=jlEMo6Dsh9E

The video is a contextual reference only. Statements in it are not treated as benchmarks, API guarantees, or implementation evidence.

## License

MIT. Copyright is held by the generic contributor collective named in [LICENSE](LICENSE).
