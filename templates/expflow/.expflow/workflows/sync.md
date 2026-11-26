# SYNC WORKFLOW

Refresh project context documentation from the actual source. Context is
documentation; source code is truth. Do not modify source code in this workflow.

## Input

An optional module or capability name. Without one, sync the whole project.

## Steps

1. Run `npx exp-node-server ai sync`.
2. Read `.expflow/context/sync-report.md`.
3. For each drift item, inspect only the relevant source files.
4. Read the existing context document before editing it.
5. Show the proposed edits to the user and wait for approval.
6. After approval, run `npx exp-node-server ai sync --apply` to update managed
   registry/model sections and create missing context stubs.
7. Fill each generated stub with verified capabilities, entry points, integration
   patterns and restrictions.
8. Remove or rename orphan context documents only after the user confirms.

## Rules

- Never modify source code.
- Never overwrite user-written context wholesale.
- Keep documents concise: what exists, where it is, how to use it, what not to duplicate.
- Source wins over stale documentation; report discrepancies instead of guessing.
- Do not load all context documents; only the affected modules.
- Do not invent capabilities, routes or modules.

## Finish

Report:

- What was synced
- Documents created or updated
- Drift that still needs manual work
- Anything the source code revealed that the documentation got wrong
