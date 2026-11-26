# PROPOSE WORKFLOW

Create an implementation proposal for a feature request. Never modify source code in this workflow.

## Input

The calling command or skill passes the feature request.

## Steps

1. Read `.expflow/config.json` and `.expflow/rules/backend.md`.
2. Understand the requested feature and its boundaries.
3. Inspect only the existing files that are relevant to the request.
4. Identify the existing architecture, conventions and reusable utilities.
5. Identify affected modules, database changes, API changes and security concerns.
6. Do not implement anything and do not create or edit source files.

## Change ID

Derive a short kebab-case ID from the feature, for example `user-referral-system`.
If `.expflow/changes/<change-id>/` already exists, choose a suffixed ID such as `user-referral-system-2`.

## Output

Create exactly two files under `.expflow/changes/<change-id>/`.

### proposal.md

Start with frontmatter:

---
id: <change-id>
status: proposed
created: <YYYY-MM-DD>
---

Then include these sections:

- Feature name
- Problem and objective
- Scope (in scope and out of scope)
- Affected modules
- API changes (if any)
- Database changes (if any)
- Security considerations
- Acceptance criteria (each criterion must be checkable)
- Risks and assumptions

### tasks.md

List small, independently executable tasks. Every task must have a clear completion condition:

# Tasks: <Feature name>

- [ ] T1 - <task>
  - Completion: <observable condition>
- [ ] T2 - <task>
  - Completion: <observable condition>

## Rules

- Keep the proposal concise and specific to this project.
- Do not repeat existing architecture documentation.
- Do not generate unnecessary specifications.
- Avoid speculative requirements.
- Use existing project conventions.
- Never modify source code.
- Tasks must be small, independently executable, and have a clear completion condition.

## Finish

Report:

- Change ID
- Files created
- Short implementation summary
- That explicit approval is required before `/apply`
