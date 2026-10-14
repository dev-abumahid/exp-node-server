export const accountSwaggerDocs = {
  '/api/auth/sign-up': {
    post: {
      tags: ['auth'],
      summary: 'Create  new account',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({
              email: 'user@gmail.com',
              password: 'password',
              fullName: 'User',
            }),
          },
        },
      },
      responses: {
        201: { description: 'account created successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
  '/api/auth/sign-in': {
    post: {
      tags: ['auth'],
      summary: 'Sign In your account',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({
              email: 'user@gmail.com',
              password: 'password',
            }),
          },
        },
      },
      responses: {
        201: { description: 'User signed in successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
  '/api/auth/verify-otp': {
    put: {
      tags: ['auth'],
      summary: 'Verify OTP',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({
              email: 'user@gmail.com',
              otp: '654321',
            }),
          },
        },
      },
      responses: {
        201: { description: 'OTP verification successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
  '/api/auth/verify-link': {
    put: {
      tags: ['auth'],
      summary: 'Verify Link',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({
              token: 'dsakfjasdkj',
            }),
          },
        },
      },
      responses: {
        201: { description: 'Token verification successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
  '/api/auth/me': {
    get: {
      tags: ['auth'],
      summary: 'Get me account',
      description: '',
      responses: {
        200: { description: 'account fetched successfully' },
        401: { description: 'unauthorized' },
      },
    },
  },
  '/api/auth/change-password': {
    put: {
      tags: ['auth'],
      summary: 'Change Password',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({
              oldPassword: '123456',
              newPassword: '654321',
            }),
          },
        },
      },
      responses: {
        201: { description: 'Passwrod change successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
  '/api/auth/resend-otp': {
    put: {
      tags: ['auth'],
      summary: 'Resend OTP',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({
              email: 'user@gmail.com',
            }),
          },
        },
      },
      responses: {
        201: { description: 'OTP resend successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
  '/api/auth/forget-password': {
    put: {
      tags: ['auth'],
      summary: 'Forget Password',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({
              email: 'user@gmail.com',
            }),
          },
        },
      },
      responses: {
        201: { description: 'Forget password successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
  '/api/auth/reset-password': {
    put: {
      tags: ['auth'],
      summary: 'Reset Password',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({
              token: 'dkfjadskfds',
              newPass: 'newpass',
            }),
          },
        },
      },
      responses: {
        201: { description: 'Password reset successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
  '/api/auth/refresh-token': {
    post: {
      tags: ['auth'],
      summary: 'Get a new access token (and a rotated refresh token)',
      description:
        'Browsers send the `refresh_token` cookie automatically; other clients send it in the body. ' +
        'Every call returns a new refresh token and invalidates the old one. Reusing an old ' +
        'refresh token ends the whole session.',
      requestBody: {
        required: false,
        content: {
          'application/json': {
            example: JSON.stringify({ refreshToken: 'only-for-non-browser-clients' }),
          },
        },
      },
      responses: {
        200: { description: '{ accessToken, refreshToken }, both also set as httpOnly cookies' },
        401: { description: 'Missing, invalid, expired or reused refresh token' },
      },
    },
  },
  '/api/auth/sign-out': {
    post: {
      tags: ['auth'],
      summary: 'Sign out this device (revokes its refresh token, clears the cookies)',
      responses: { 200: { description: 'Signed out' } },
    },
  },
  '/api/auth/sign-out-all': {
    post: {
      tags: ['auth'],
      summary: 'Sign out from all devices (revokes every access token)',
      responses: {
        200: { description: 'Signed out everywhere' },
        401: { description: 'unauthorized' },
      },
    },
  },
  '/api/auth/social/providers': {
    get: {
      tags: ['social auth'],
      summary: 'List the enabled social login providers',
      responses: { 200: { description: 'Providers, with the URL that starts each login' } },
    },
  },
  '/api/auth/social/{provider}': {
    get: {
      tags: ['social auth'],
      summary: 'Start a social login (open in the browser, not via fetch)',
      description:
        "Link to it from the front-end: <a href='/api/auth/social/google?returnTo=/dashboard'>Login with Google</a>. " +
        'After the provider, the browser is redirected to SOCIAL_REDIRECT_URL with `?code=` (and `returnTo`) on success, ' +
        'or `?error=` (access_denied, invalid_state, email_unverified, account_disabled, social_login_failed).',
      parameters: [
        {
          name: 'provider',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: ['google', 'facebook', 'github', 'twitter', 'linkedin', 'discord'],
          },
        },
        {
          name: 'returnTo',
          in: 'query',
          required: false,
          schema: { type: 'string', example: '/dashboard' },
          description: 'Path on the front-end to come back to. Only same-site paths are kept.',
        },
      ],
      responses: { 302: { description: 'Redirect to the provider' } },
    },
  },
  '/api/auth/social/exchange': {
    post: {
      tags: ['social auth'],
      summary: 'Trade the single-use code from the social login redirect for an access token',
      requestBody: {
        required: true,
        content: {
          'application/json': { example: JSON.stringify({ code: 'code-from-redirect' }) },
        },
      },
      responses: {
        200: { description: 'Logged in (token in body and httpOnly cookie)' },
        401: { description: 'Invalid, expired or already used code' },
      },
    },
  },
};
