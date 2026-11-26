<!-- expflow:start -->
# ExpFlow Engineering Rules

Follow `.expflow/config.json` and `.expflow/rules/backend.md`.

## Workflow

- New features must use `/propose` first.
- Never implement before explicit approval.
- Use `/apply` only for an approved proposal.
- Run `/verify` before marking work complete.
- Use `/archive` only after successful verification.

## Engineering

- Follow the existing project architecture.
- Reuse existing utilities and patterns.
- Avoid unnecessary dependencies.
- Never duplicate business logic.
- Preserve backward compatibility unless requested.
- Never expose secrets or environment variables.
- Do not modify unrelated files.

## Context Efficiency

- Inspect only relevant files.
- Never read the entire codebase unnecessarily.
- Do not repeat existing project documentation.
- Keep generated artifacts concise.
<!-- expflow:end -->
