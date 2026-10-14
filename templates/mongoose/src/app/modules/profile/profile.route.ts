import { Router } from 'express';
import auth from '../../middlewares/auth.js';
import RequestValidator from '../../middlewares/request_validator.js';
import uploader from '../../middlewares/uploader.js';
import { AppError } from '../../utils/app_error.js';
import { profile_controller } from './profile.controller.js';
import { profile_validations } from './profile.validation.js';

const router = Router();

router.patch(
  '/',
  auth(),
  uploader.single('file'),
  // multipart forms send the JSON fields as a `data` string
  (req, _res, next) => {
    try {
      req.body = req.body?.data ? JSON.parse(req.body.data) : {};
      next();
    } catch {
      next(new AppError('`data` must be valid JSON', 400));
    }
  },
  RequestValidator(profile_validations.update_profile),
  profile_controller.update_profile,
);

export default router;
