---
description: Check whether completion claims are supported by direct evidence.
disable-model-invocation: true
argument-hint: "[task or claimed result]"
---

Audit evidence completion for: $ARGUMENTS

- Restate the requested deliverables and side effects.
- Map every completion claim to inspected evidence: file content, command exit status, rendered output, persisted UI state, or external confirmation.
- Distinguish implementation, configuration, execution, persistence, and publication.
- Mark configured-but-untested items separately from verified behavior.
- Re-run only the smallest checks needed to close material gaps.
- Return `COMPLETE`, `PARTIAL`, or `BLOCKED`, followed by evidence and remaining limitations.

A hook counter, file existence, toast, redirect, or generated screenshot call is not sufficient evidence by itself.
