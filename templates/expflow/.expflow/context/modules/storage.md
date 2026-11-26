# Storage Module

Status: Implemented
Module: storage
Route: internal (used by profile uploads)

## Capabilities

- In-memory multipart upload with multer
- Image upload to Cloudinary
- Size and type limits; no local disk storage

## Integration

- Use `uploader.single('file')` on routes that accept an image.
- Call `uploadCloud(file, folder)` from a service after validation.
- Reuse the existing Cloudinary configuration.
- Never add a second upload pipeline or a local `uploads/` folder.

## Entry points

- `src/app/middlewares/uploader.ts`
- `src/app/utils/cloudinary.ts`

## Restrictions

- Only JPEG, PNG, WebP and GIF up to 5 MB.
- Never trust the client mimetype alone; Cloudinary validates the image.
- Never expose Cloudinary secrets.
