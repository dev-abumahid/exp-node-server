# Profile Module

Status: Implemented
Module: profile
Route: /api/profile
Entry point: `src/app/modules/profile/`

## Capabilities

- Update the signed-in user's profile (`PATCH /api/profile`)
- Optional profile photo upload to Cloudinary
- Multipart form: `file` plus a JSON `data` field

## Integration

- Reuse `profile_service.update_profile_into_db`.
- Use `auth()`, `uploader.single('file')` and the existing JSON `data` parsing.
- Use `uploadCloud(file, folder)`; never write uploads to local disk.
- Never create a second profile model or a parallel upload path.

## Entry points

- `src/app/modules/profile/profile.route.ts`
- `src/app/modules/profile/profile.service.ts`
- `src/app/middlewares/uploader.ts`
- `src/app/utils/cloudinary.ts`

## Restrictions

- A profile belongs to exactly one account (`accountId` is unique).
- Do not expose another user's profile through this module.
- Do not bypass validation or the upload limits.
