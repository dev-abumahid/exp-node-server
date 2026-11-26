# VERIFY WORKFLOW

Verify an implemented change against its proposal and acceptance criteria. Do not modify source code.

## Input

`<change-id>`

## Steps

1. Locate `.expflow/changes/<change-id>/`.
2. Read `proposal.md`, `tasks.md`, and the implementation diff.
3. Compare the implementation with every acceptance criterion.
4. Check that every required task is completed and that no unrelated files changed.
5. Run the project's own checks using `package.json` scripts and existing tools.

Typical checks, only when configured in the project:

- TypeScript typecheck (`npm run typecheck` or `npx tsc --noEmit`)
- Lint (`npm run lint`)
- Relevant unit and integration tests (`npm test -- <path>`)
- Build when appropriate (`npm run build`)
- Database migration consistency
- Authentication and authorization on changed endpoints
- Error handling and validation on changed endpoints
- Regression risk in touched modules

Do not invent commands that are not defined by the project.

## Rules

- Never modify source code during verification.
- Never claim a check passed without running it.
- Report skipped checks and why they were skipped.
- Identify missing tests.
- Report failures with the command, the relevant output and the likely cause.

## Output

Create `.expflow/changes/<change-id>/verification.md` with frontmatter:

---
id: <change-id>
status: passed | failed | partial
verified: <YYYY-MM-DD>
---

Then include:

- Checks table (check, command, result, notes)
- Acceptance criteria with evidence
- Missing tests
- Failures
- Summary

Use `passed` only when all required checks and acceptance criteria pass.
Use `partial` when some checks could not run.
Use `failed` when any required check fails.
