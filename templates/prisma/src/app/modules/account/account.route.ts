import { Router } from 'express';
import auth from '../../middlewares/auth.js';
import { rateLimiters } from '../../middlewares/rate_limiter.js';
import RequestValidator from '../../middlewares/request_validator.js';
import { socialAuthRouter } from '../../passport-js/index.js';
import { account_controller } from './account.controller.js';
import { account_validation } from './account.validation.js';

const accountRouter = Router();

accountRouter.post(
  '/sign-up',
  rateLimiters.signUp,
  rateLimiters.emailPerAddress,
  RequestValidator(account_validation.sign_up),
  account_controller.create_account,
);

accountRouter.post(
  '/sign-in',
  rateLimiters.signInIp,
  rateLimiters.signIn,
  RequestValidator(account_validation.sign_in),
  account_controller.login_user,
);

accountRouter.post(
  '/refresh-token',
  rateLimiters.refresh,
  RequestValidator(account_validation.refresh_token),
  account_controller.refresh_token,
);

accountRouter.post(
  '/sign-out',
  RequestValidator(account_validation.refresh_token),
  account_controller.sign_out,
);

accountRouter.post('/sign-out-all', auth(), account_controller.sign_out_everywhere);

accountRouter.put(
  '/verify-otp',
  rateLimiters.verify,
  RequestValidator(account_validation.verify_otp),
  account_controller.verify_account_using_otp,
);

accountRouter.put(
  '/verify-link',
  rateLimiters.verify,
  RequestValidator(account_validation.verify_link),
  account_controller.verify_account_using_link,
);

accountRouter.get('/me', auth(), account_controller.get_user_account);

accountRouter.put(
  '/change-password',
  rateLimiters.changePassword,
  auth(),
  RequestValidator(account_validation.change_password),
  account_controller.change_password,
);

accountRouter.put(
  '/resend-otp',
  rateLimiters.emailPerIp,
  rateLimiters.emailPerAddress,
  RequestValidator(account_validation.resend_otp),
  account_controller.resend_otp_and_verification_link,
);

accountRouter.put(
  '/forget-password',
  rateLimiters.emailPerIp,
  rateLimiters.emailPerAddress,
  RequestValidator(account_validation.forget_password),
  account_controller.forget_password_generate_reset_token,
);

accountRouter.put(
  '/reset-password',
  rateLimiters.verify,
  RequestValidator(account_validation.reset_pass),
  account_controller.reset_password_using_token,
);

// Social login: the front-end trades the `?code=` from the redirect for a token
accountRouter.post(
  '/social/exchange',
  rateLimiters.social,
  RequestValidator(account_validation.social_exchange),
  account_controller.exchange_social_login_code,
);

// GET /social/providers, /social/<provider> and /social/<provider>/callback
// for every provider enabled in .env (see passport-js/providers.ts)
accountRouter.use('/social', socialAuthRouter);

export default accountRouter;
