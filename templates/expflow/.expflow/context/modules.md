# Project Module Registry

Read only the modules relevant to the current task. Do not load every module
context.

<!-- expflow:modules:start -->
| Module | Status | Route | Context |
| --- | --- | --- | --- |
| account | Implemented | /api/auth | modules/auth.md |
| profile | Implemented | /api/profile | modules/profile.md |
<!-- expflow:modules:end -->

## Capability contexts

These describe shared infrastructure that is not a single `src/app/modules/`
folder:

- Queue: `modules/queue.md`
- Email: `modules/email.md`
- Storage: `modules/storage.md`
- Rate limiting: `modules/rate-limit.md`
- API docs: `modules/api-docs.md`

## Rules

- Never load all module contexts.
- Load only relevant module documentation.
- Reuse implemented modules.
- Never recreate existing infrastructure.
- Inspect source only when implementation details are needed.
- Keep this registry in sync with `npx exp-node-server ai sync`.
