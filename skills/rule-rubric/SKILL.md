---
description: Convert requirements into a testable rule rubric with evidence criteria.
disable-model-invocation: true
argument-hint: "[requirements or artifact]"
---

Build a rule rubric for: $ARGUMENTS

- Extract each independently testable requirement.
- Give every rule a stable ID, severity, pass condition, fail condition, and acceptable evidence.
- Mark subjective rules as judgment calls rather than pretending they are deterministic.
- Identify conflicts and precedence between rules.
- Evaluate only rules supported by inspected evidence; use `UNKNOWN` for missing evidence.
- Return a compact table and a final list of blockers.

Do not invent pass evidence or collapse several requirements into one vague score.
