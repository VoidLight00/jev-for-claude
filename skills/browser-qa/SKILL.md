---
description: Verify a web UI through browser interaction and visible evidence.
disable-model-invocation: true
argument-hint: "[URL, flow, or acceptance criteria]"
---

Run browser QA for: $ARGUMENTS

1. Define the observable acceptance criteria before interacting.
2. Use the available browser tool to inspect the rendered page, not only source files or API responses.
3. Exercise the smallest representative flow, including one failure or empty state when relevant.
4. Verify navigation, saved state, visible text, and responsive behavior separately.
5. Capture evidence only after the page settles. Inspect the saved image itself when screenshots are used.
6. Report each criterion as `PASS`, `FAIL`, or `NOT TESTED`, with the exact observation.

If no browser tool or runnable app is available, say `NOT TESTED`; do not substitute instructions or unit tests and claim browser QA passed.
