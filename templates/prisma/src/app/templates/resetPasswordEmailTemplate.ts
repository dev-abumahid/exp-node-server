export const resetPasswordEmailTemplate = (resetLink: string, expiresIn: string) => {
  return `
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Reset Your Password</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
        }
        body {
            font-family: Arial, Helvetica, sans-serif;
            background-color: #f1f5f9;
            color: #1e2937;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 30px auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }

        /* Header - Pink/Red Gradient */
        .header {
            background: linear-gradient(135deg, #ff4d94, #ff6b6b);
            padding: 45px 30px;
            text-align: center;
            color: white;
        }
        .icon {
            width: 80px;
            height: 80px;
            background: #fff;
            color: #ff4d94;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 42px;
            margin-bottom: 15px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
        }

        .content {
            padding: 45px 35px;
            text-align: center;
        }
        .title {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 12px;
            color: #1e2937;
        }
        .message {
            font-size: 16px;
            color: #475569;
            margin-bottom: 35px;
        }

        /* Button */
        .btn {
            display: inline-block;
            background: #4f46e5;
            color: #ffffff !important;
            padding: 16px 42px;
            font-size: 17px;
            font-weight: 600;
            text-decoration: none;
            border-radius: 10px;
            margin: 15px 0 25px 0;
            box-shadow: 0 6px 20px rgba(79, 70, 229, 0.3);
        }

        /* Footer with Gradient - Same as OTP */
        .footer {
            background: linear-gradient(135deg, #ff4d94, #ff6b6b);
            padding: 45px 30px;
            text-align: center;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="icon">🔑</div>
            <h1 style="font-size: 28px; margin: 0;">Reset Your Password</h1>
        </div>

        <!-- Content -->
        <div class="content">
            <p class="title">Hello,</p>
            <p class="message">
                You requested to reset your password. Click the button below to create a new password.
            </p>

            <!-- Reset Button -->
            <a href="${resetLink}" class="btn">
                Reset Password
            </a>

            <p style="font-size: 15px; color: #64748b; margin: 20px 0 10px 0;">
                Or copy and paste this link in your browser:
            </p>
            <div style="font-size: 14px; color: #64748b; word-break: break-all;">
                <a href="${resetLink}" style="color: #3b82f6; text-decoration: none;">
                    ${resetLink}
                </a>
            </div>

            <!-- Warning -->
            <div style="background: #fef3c7; color: #92400e; padding: 16px 20px; border-radius: 8px; font-size: 14px; margin: 35px 0; text-align: left;">
                <strong>Note:</strong> This password reset link will expire in <strong>${expiresIn}</strong> for your security. 
                If you didn't request this, please ignore this email.
            </div>
        </div>

        <!-- Footer with Gradient + Proper Logo Alignment -->
        <div class="footer">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td align="center">
                        <!-- Logo -->
                        <img src="https://i.ibb.co.com/TnKvMyg/democompany.png" 
                             style="width: 75px; height: 75px; border-radius: 50%; display: block; margin: 0 auto 15px auto;" 
                             alt="Company Logo">

                        <!-- Company Info -->
                        <h3 style="color: #ffffff; font-size: 24px; margin: 0 0 8px 0;">Company Name</h3>
                        <p style="color: #ffffff; margin: 0 0 25px 0; opacity: 0.95;">The Support Team</p>

                        <!-- Footer Text -->
                        <p style="color: #ffffff; font-size: 13.5px; line-height: 1.5; opacity: 0.92;">
                            This is an automated message — please do not reply to this email.<br>
                            If you need help, feel free to contact our support.
                        </p>
                        
                        <p style="color: #ffffff; font-size: 12px; margin-top: 25px; opacity: 0.85;">
                            &copy; ${new Date().getFullYear()} Your Company. All rights reserved.
                        </p>
                    </td>
                </tr>
            </table>
        </div>
    </div>
</body>
</html>
    `;
};
