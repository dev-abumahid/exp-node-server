export const otpEmailTemplate = (payload: { otp: string; verificationLink: string }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.6;">
    <div style="max-width: 480px; margin: 0 auto;">
        <p style="margin: 0 0 16px;">Hello,</p>
        <p style="margin: 0 0 16px;">Use the code below to verify your email address:</p>

        <p style="margin: 0 0 16px; font-size: 28px; font-weight: 700; letter-spacing: 6px;">${payload.otp}</p>

        <p style="margin: 0 0 24px; color: #6b7280; font-size: 14px;">This code will expire in 5 minutes.</p>

        <p style="margin: 0 0 16px;">Or verify instantly using this link:</p>
        <p style="margin: 0 0 24px;">
            <a href="${payload.verificationLink}" style="display: inline-block; background-color: #1f2937; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Verify Email</a>
        </p>

        <p style="margin: 0; color: #6b7280; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
</body>
</html>
`;
};
