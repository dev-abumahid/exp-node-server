import type { Job, PgBoss } from 'pg-boss';
import { configs } from '../configs/index.js';
import { logger } from '../lib/logger.js';
import { otpEmailTemplate } from '../templates/otpEmailTemplate.js';
import { resetPasswordEmailTemplate } from '../templates/resetPasswordEmailTemplate.js';
import sendMail from '../utils/mail_sender.js';
import { getBoss } from './boss.js';

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

export type EmailJobOptions = {
  /** Delay before the first retry; it doubles on every further retry. */
  retryDelaySeconds?: number;
  retryLimit?: number;
  /** How often an idle worker checks for new jobs. */
  pollingIntervalSeconds?: number;
};

export const createEmailQueue = (
  boss: PgBoss,
  { retryDelaySeconds = 10, retryLimit = 3 }: EmailJobOptions = {},
) =>
  boss.createQueue(EMAIL_QUEUE, {
    retryLimit,
    retryDelay: retryDelaySeconds,
    retryBackoff: true,
    expireInSeconds: 60,
    // jobs carry OTPs and reset links, so don't keep them around
    deleteAfterSeconds: 60 * 60,
  });

export const enqueueEmail = (job: EmailJob) => getBoss().send(EMAIL_QUEUE, job);

/** Starts processing emails on `boss`. */
export const startEmailWorker = (
  boss: PgBoss,
  { pollingIntervalSeconds = 2 }: EmailJobOptions = {},
) =>
  boss.work<EmailJob>(EMAIL_QUEUE, { pollingIntervalSeconds }, async (jobs: Job<EmailJob>[]) => {
    for (const { id, data } of jobs) {
      try {
        await sendMail({ to: data.email, ...render(data) });
        logger.info(`Email (${data.type}) sent to ${data.email}`);
      } catch (err) {
        logger.error({ err, jobId: id }, `Failed to send ${data.type} email, will retry`);
        throw err; // let pg-boss retry the job
      }
    }
  });
