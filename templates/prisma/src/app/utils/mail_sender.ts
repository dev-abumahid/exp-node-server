import nodemailer from 'nodemailer';
import { configs } from '../configs/index.js';

type TMailContent = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
};

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: configs.email.app_email,
    pass: configs.email.app_password,
  },
});

// Email Sender Function
const sendMail = async (payload: TMailContent) => {
  if (!configs.email.app_email || !configs.email.app_password) {
    throw new Error('Email is not configured. Set APP_USER_EMAIL and APP_PASSWORD.');
  }

  return transporter.sendMail({
    from: configs.email.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.textBody,
    html: payload.htmlBody,
  });
};

export default sendMail;
