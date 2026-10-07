---
description: Select the smallest relevant file set before reading or editing a codebase.
disable-model-invocation: true
argument-hint: "[change request]"
---

Determine targeted file relevance for: $ARGUMENTS

1. Translate the request into affected behaviors and likely entry points.
2. Use repository metadata and focused search to build a candidate list.
3. Rank files as `PRIMARY`, `DEPENDENCY`, `TEST`, `DOC`, or `UNRELATED` with one reason each.
4. Read primary files first, then expand only when imports, references, or failing checks justify it.
5. Before editing, state the minimal file set and what would cause expansion.
6. After editing, confirm no unrelated file was changed.

Do not scan or ingest the whole repository when focused discovery is sufficient.
