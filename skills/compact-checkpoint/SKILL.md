---
description: Create a compact, evidence-grounded checkpoint before context loss or handoff.
disable-model-invocation: true
argument-hint: "[scope or handoff target]"
---

Create a compact checkpoint for: $ARGUMENTS

Include only:
- objective and non-negotiable constraints;
- verified facts and their evidence locations;
- files changed and commands actually run;
- decisions made and rejected alternatives;
- open blockers, unknowns, and the next three actions;
- safety or privacy boundaries that must survive handoff.

Do not copy secrets, full conversations, large logs, or unverified assumptions. Keep the checkpoint short enough to re-read before acting.
