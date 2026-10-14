import { type Agenda, exponential, type Job } from 'agenda';
import mongoose from 'mongoose';
import { configs } from '../configs/index.js';
import { logger } from '../lib/logger.js';
import { otpEmailTemplate } from '../templates/otpEmailTemplate.js';
import { resetPasswordEmailTemplate } from '../templates/resetPasswordEmailTemplate.js';
import sendMail from '../utils/mail_sender.js';
import { getAgenda } from './agenda.js';

export const EMAIL_QUEUE = 'email';
// Agenda's default collection (see agenda.ts)
export const JOBS_COLLECTION = 'agendaJobs';

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
  retryDelayMs?: number;
  maxRetries?: number;
};

/** Registers the email job on a worker. */
export const defineEmailJob = (
  agenda: Agenda,
  { retryDelayMs = 10_000, maxRetries = 3 }: EmailJobOptions = {},
) =>
  agenda.define(
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
      backoff: exponential({ delay: retryDelayMs, factor: 2, maxRetries }),
      // Not `removeOnComplete`: Agenda emits "complete" before it forgets the job,
      // and the extra await of the removal makes drain() miss it and hang until its
      // timeout on every shutdown. A TTL index cleans up instead (below).
    },
  );

/**
 * Jobs carry OTPs and reset links, so finished email jobs (sent or given up on)
 * are deleted by MongoDB an hour later. Only the email job: other jobs are kept.
 */
export const ensureEmailJobCleanup = () =>
  mongoose.connection.db!.collection(JOBS_COLLECTION).createIndex(
    { lastFinishedAt: 1 },
    {
      name: 'email_jobs_ttl',
      expireAfterSeconds: 60 * 60,
      partialFilterExpression: { name: EMAIL_QUEUE },
    },
  );

export const enqueueEmail = (job: EmailJob) => getAgenda().now(EMAIL_QUEUE, job);
