# Limitations

- The local hook runtime recognizes a deliberately narrow set of high-confidence destructive commands. It cannot prove that an arbitrary command is safe.
- Permission matchers and command parsing are best-effort. Shell expansion, aliases, scripts, encoded commands, and tool-specific behavior can evade simple local classification.
- Evidence counters record tool categories, not the semantic quality of tests, screenshots, assertions, or review.
- Browser QA is a user-invoked workflow. The plugin does not launch a browser automatically.
- Steer/queue is a planning protocol. It does not implement interrupt routing, background task scheduling, or message delivery.
- Compact checkpoints are bounded metadata used by the local hook runtime. They are not conversation summaries and the runtime does not read transcript files.
- Targeted file relevance and SEO auditing require human or model judgment when their skills are invoked.
- Jev evaluation is never automatic. It requires the explicit command flag, an API key supplied in the process environment, and a payload supplied by the caller.
- No hook reads environment files, sends conversation transcripts, or makes network requests.
