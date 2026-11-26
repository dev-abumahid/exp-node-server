# APPLY WORKFLOW

Implement an approved proposal. Running `/apply <change-id>` is the user's explicit approval for that proposal.

## Input

`<change-id>`

## Steps

1. Locate `.expflow/changes/<change-id>/`. If it does not exist, stop and list the available change IDs.
2. Read `proposal.md` and `tasks.md`. Do not read unrelated change directories.
3. Confirm the proposal is approved for implementation. If the status is not `proposed` or `approved`, stop and ask the user.
   - Running `/apply` itself counts as approval. Record it in the proposal frontmatter as `status: approved`.
4. Inspect only the source files relevant to the planned tasks.
5. Follow the existing project architecture and `.expflow/rules/backend.md`.
6. Implement tasks incrementally, in the order they are listed.
7. After each task, tick its checkbox in `tasks.md` and add a short completion note.
8. Add or update the tests required by the proposal.

## Rules

- Implement only the approved scope.
- Do not invent new requirements.
- Do not refactor unrelated modules.
- Reuse existing utilities, error handling and validation patterns.
- Never skip necessary tests.
- If the requirements are unclear, ask before proceeding.
- If the scope must change, update `proposal.md`, request approval, and stop.
- Never update `verification.md`; verification is a separate workflow.

## Reuse Policy

- Read the relevant `.expflow/context/` documents before implementing.
- Reuse existing services, utilities, queues and storage helpers.
- Follow the documented integration patterns and entry points.
- Never duplicate an existing module or infrastructure.
- If context documentation conflicts with the source, inspect the source and report the discrepancy.
- If the implementation changes module capabilities, routes or schemas, note that `/sync` is required.

## Finish

- Set the proposal frontmatter to `status: implemented` and `updated: <YYYY-MM-DD>`.
- Summarize the changed files.
- Report completed and pending tasks.
- Report the tests actually executed and their results.
- Do not archive automatically.
- Do not claim verification passed.
