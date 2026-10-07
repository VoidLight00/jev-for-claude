---
description: Run a deliberate safety preflight before a risky or irreversible change.
disable-model-invocation: true
argument-hint: "[planned action]"
---

Perform a safety preflight for: $ARGUMENTS

1. State the intended outcome in one sentence.
2. List the exact resources that may change: files, branches, services, data, or accounts.
3. Separate reversible operations from irreversible or costly operations.
4. Identify missing authorization, credentials, backups, rollback paths, and scope boundaries.
5. Check for secret exposure, personal data, network calls, destructive commands, and publication side effects.
6. Propose the smallest reversible first step.
7. End with one verdict: `PROCEED`, `ASK`, or `BLOCK`, followed by concrete reasons.

Do not treat this rubric or the plugin hook as proof of safety. Inspect the actual command and target.
