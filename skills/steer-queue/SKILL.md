---
description: Organize new steering instructions without losing current work.
disable-model-invocation: true
argument-hint: "[new instruction or queue update]"
---

Apply a steer/queue pass for: $ARGUMENTS

1. Summarize the current objective and current step.
2. Classify the new instruction as `STEER NOW`, `QUEUE NEXT`, `REPLACE`, or `CONFLICT`.
3. Preserve completed evidence and explicitly cancel obsolete steps.
4. Order remaining work by dependency and risk, with a bounded next action.
5. Surface any conflict that requires user choice.

This is a planning protocol only. It does not provide interrupt routing, background scheduling, or message delivery.
