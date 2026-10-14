export const resetPasswordEmailTemplate = (resetLink: string, expiresIn: string) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.6;">
    <div style="max-width: 480px; margin: 0 auto;">
        <p style="margin: 0 0 16px;">Hello,</p>
        <p style="margin: 0 0 24px;">We received a request to reset your password. Click the button below to choose a new one:</p>

        <p style="margin: 0 0 24px;">
            <a href="${resetLink}" style="display: inline-block; background-color: #1f2937; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Reset Password</a>
        </p>

        <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
        <p style="margin: 0 0 24px; font-size: 14px; word-break: break-all;">
            <a href="${resetLink}" style="color: #2563eb;">${resetLink}</a>
        </p>

        <p style="margin: 0; color: #6b7280; font-size: 13px;">This link will expire in ${expiresIn}. If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
</body>
</html>
`;
};
