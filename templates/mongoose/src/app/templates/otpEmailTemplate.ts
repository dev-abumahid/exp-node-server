export const otpEmailTemplate = (payload: { otp: string; verificationLink: string }) => {
  return `
    
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Verify Your Email</title>
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

        /* Top Header */
        .header {
            background: linear-gradient(135deg, #ff4d94, #ff6b6b);
            padding: 40px 20px;
            text-align: center;
            color: white;
        }
        .envelope {
            width: 78px;
            height: 78px;
            background: #fff;
            color: #ff4d94;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            margin-bottom: 12px;
        }

        .content {
            padding: 40px 30px;
            text-align: center;
        }
        .title {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 6px;
        }
        .subtitle {
            font-size: 15px;
            color: #64748b;
            margin-bottom: 30px;
        }

        /* OTP Table */
        .otp-table {
            margin: 25px auto 30px auto;
        }
        .otp-table td {
            padding: 0 6px;
        }
        .otp-box {
            width: 52px;
            height: 62px;
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 26px;
            font-weight: 700;
            color: #1e2937;
            text-align: center;
            vertical-align: middle;
            line-height: 60px;
        }

        .expiry {
            color: #ef4444;
            font-size: 14.5px;
            font-weight: 600;
            margin-bottom: 35px;
        }

        /* Button */
        .btn {
            display: inline-block;
            background: #4f46e5;
            color: #ffffff !important;
            padding: 16px 40px;
            font-size: 16px;
            font-weight: 600;
            text-decoration: none;
            border-radius: 10px;
            margin: 15px 0;
        }

        /* Footer - Gradient + Logo Fixed */
        .footer {
            background: linear-gradient(135deg, #ff4d94, #ff6b6b);
            padding: 45px 30px 35px;
            text-align: center;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Top Header -->
        <div class="header">
            <div class="envelope">✉️</div>
            <h1 style="font-size: 26px; margin: 0;">Email Verification</h1>
        </div>

        <!-- Content -->
        <div class="content">
            <p class="title">Here is your One Time Password</p>
            <p class="subtitle">to validate your email address</p>

            <table class="otp-table" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td><div class="otp-box">${payload.otp[0]}</div></td>
                    <td><div class="otp-box">${payload.otp[1]}</div></td>
                    <td><div class="otp-box">${payload.otp[2]}</div></td>
                    <td><div class="otp-box">${payload.otp[3]}</div></td>
                    <td><div class="otp-box">${payload.otp[4]}</div></td>
                    <td><div class="otp-box">${payload.otp[5]}</div></td>
                </tr>
            </table>

            <p class="expiry">OTP will expire in <strong>5 minutes</strong></p>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 35px 0;">

            <p style="font-size: 15px; color: #475569; margin-bottom: 12px;">
                Or click the button below to verify instantly:
            </p>
            
            <a href="${payload.verificationLink}" class="btn">
                Verify My Email
            </a>
        </div>

        <!-- Footer with Logo -->
        <div class="footer">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td align="center">
                        <!-- Logo -->
                        <img src="https://i.ibb.co.com/TnKvMyg/democompany.png" 
                             style="width: 75px; height: 75px; border-radius: 50%; display: block; margin: 0 auto 15px auto;" 
                             alt="Company Logo">
                        
                        <!-- Company Name -->
                        <h3 style="color: #ffffff; font-size: 24px; margin: 0 0 8px 0;">Company Name</h3>
                        <p style="color: #ffffff; opacity: 0.95; margin: 0 0 25px 0;">The Support Team</p>

                        <!-- Footer Text -->
                        <p style="color: #ffffff; font-size: 13.5px; opacity: 0.92; line-height: 1.5;">
                            This is an automated message — please do not reply.<br>
                            If you need assistance, contact our support team.
                        </p>
                        
                        <p style="color: #ffffff; font-size: 12px; opacity: 0.85; margin-top: 25px;">
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
