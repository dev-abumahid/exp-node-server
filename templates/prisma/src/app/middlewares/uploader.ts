import multer from 'multer';
import { AppError } from '../utils/app_error.js';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Keeps the (size limited) file in memory and streams it to Cloudinary, so nothing
 * is ever left behind on disk when validation or the upload fails.
 */
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new AppError(`Only ${ALLOWED_IMAGE_TYPES.join(', ')} files are allowed`, 400));
  },
});

export default uploader;
