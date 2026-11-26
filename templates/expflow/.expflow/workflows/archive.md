# ARCHIVE WORKFLOW

Archive a verified change and preserve its history. Do not modify source code.

## Input

`<change-id>`

## Steps

1. Locate `.expflow/changes/<change-id>/`.
2. Read `proposal.md`, `tasks.md` and `verification.md`.
3. Confirm `verification.md` has `status: passed`. Do not archive failed or partial changes.
4. Confirm every required task is checked.
5. Create `.expflow/archive/` if needed.
6. Move the complete directory to `.expflow/archive/<change-id>/`.
7. Update metadata in the archived files:
   - `proposal.md`: `status: archived`, `archived: <YYYY-MM-DD>`
   - `verification.md`: keep the verification result
8. Do not delete or modify source code.

If `.expflow/archive/<change-id>/` already exists, stop and ask the user before replacing anything.

## Finish

Report:

- Archived change ID
- Archive location
- Verification result
