import { exponential, type Job } from 'agenda';
import { configs } from '../configs/index.js';
import { logger } from '../lib/logger.js';
import { otpEmailTemplate } from '../templates/otpEmailTemplate.js';
import { resetPasswordEmailTemplate } from '../templates/resetPasswordEmailTemplate.js';
import sendMail from '../utils/mail_sender.js';
import { getAgenda } from './agenda.js';

export const EMAIL_QUEUE = 'email';

/** Every email the app sends goes through this one queue. */
export type EmailJob =
  | { type: 'verify-account'; email: string; otp: string; verificationLink: string }
  | { type: 'reset-password'; email: string; resetLink: string };

const render = (job: EmailJob) => {
  switch (job.type) {
    case 'verify-account':
      return {
        subject: 'Verify Your Email',
        htmlBody: otpEmailTemplate(job),
        textBody: `Your verification code is ${job.otp}. Or verify using this link: ${job.verificationLink}`,
      };
    case 'reset-password':
      return {
        subject: 'Reset Your Password',
        htmlBody: resetPasswordEmailTemplate(job.resetLink, configs.jwt.reset_expires),
        textBody: `Reset your password using this link: ${job.resetLink}`,
      };
  }
};

export const defineEmailJob = () =>
  getAgenda().define(
    EMAIL_QUEUE,
    async ({ attrs }: Job<EmailJob>) => {
      const data = attrs.data;
      try {
        await sendMail({ to: data.email, ...render(data) });
        logger.info(`Email (${data.type}) sent to ${data.email}`);
      } catch (err) {
        logger.error({ err, jobId: attrs._id }, `Failed to send ${data.type} email, will retry`);
        throw err; // let Agenda retry the job
      }
    },
    {
      backoff: exponential({ delay: 10_000, factor: 2, maxRetries: 3 }),
      // jobs carry OTPs and reset links, so don't keep them around
      removeOnComplete: true,
    },
  );

export const enqueueEmail = (job: EmailJob) => getAgenda().now(EMAIL_QUEUE, job);
