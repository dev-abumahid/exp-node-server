import catchAsync from '../../utils/catch_async.js';
import manageResponse from '../../utils/manage_response.js';
import { clearSessionCookies, createSession } from '../../utils/session.js';
import { account_services } from './account.service.js';

const create_account = catchAsync(async (req, res) => {
  const result = await account_services.create_account_into_db(req);
  manageResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Account created successfully',
    data: result,
  });
});

const verify_account_using_otp = catchAsync(async (req, res) => {
  const result = await account_services.verify_account_using_otp_into_db(req);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Otp verification successful',
    data: result,
  });
});

const verify_account_using_link = catchAsync(async (req, res) => {
  const result = await account_services.verify_account_using_link_into_db(req);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Account verification successful',
    data: result,
  });
});

const login_user = catchAsync(async (req, res) => {
  const user = await account_services.login_user_into_db(req);
  const tokens = await createSession(res, user);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User logged in successfully',
    data: tokens,
  });
});

const get_user_account = catchAsync(async (req, res) => {
  const result = await account_services.get_user_account_from_db(req);

  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Account fetched successfully',
    data: result,
  });
});

const change_password = catchAsync(async (req, res) => {
  const user = await account_services.change_password_into_db(req);
  // every session was revoked, so give this one a fresh start
  const tokens = await createSession(res, user);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Password changed successfully',
    data: tokens,
  });
});

const resend_otp_and_verification_link = catchAsync(async (req, res) => {
  const result = await account_services.resend_otp_and_verification_link_from_db(req);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'If the account exists and is not verified, a new OTP has been sent',
    data: result,
  });
});

const forget_password_generate_reset_token = catchAsync(async (req, res) => {
  const result = await account_services.forget_password_generate_reset_token_from_db(req);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'If an account exists for this email, a password reset link has been sent',
    data: result,
  });
});

const reset_password_using_token = catchAsync(async (req, res) => {
  const result = await account_services.reset_password_using_token_into_db(req);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Password reset successfully',
    data: result,
  });
});

const refresh_token = catchAsync(async (req, res) => {
  const { user, familyId } = await account_services.refresh_session_from_db(req);
  const tokens = await createSession(res, user, familyId);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tokens refreshed successfully',
    data: tokens,
  });
});

const sign_out = catchAsync(async (req, res) => {
  await account_services.sign_out_from_db(req);
  clearSessionCookies(res);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Signed out successfully',
  });
});

const sign_out_everywhere = catchAsync(async (req, res) => {
  await account_services.sign_out_everywhere_from_db(req);
  clearSessionCookies(res);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Signed out from all devices',
  });
});

const exchange_social_login_code = catchAsync(async (req, res) => {
  const user = await account_services.exchange_social_login_code_from_db(req);
  const tokens = await createSession(res, user);
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User logged in successfully',
    data: tokens,
  });
});

export const account_controller = {
  create_account,
  login_user,
  get_user_account,
  change_password,
  verify_account_using_otp,
  resend_otp_and_verification_link,
  verify_account_using_link,
  forget_password_generate_reset_token,
  reset_password_using_token,
  refresh_token,
  sign_out,
  sign_out_everywhere,
  exchange_social_login_code,
};
