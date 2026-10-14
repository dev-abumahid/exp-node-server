import type { Agenda } from 'agenda';
import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newAgenda } from '../../src/app/queues/agenda.js';
import { defineEmailJob, enqueueEmail, type EmailJob } from '../../src/app/queues/email.queue.js';
import { startQueues, stopQueues } from '../../src/app/queues/index.js';
import sendMail from '../../src/app/utils/mail_sender.js';

// the real queue (tests/setup.ts mocks it for the route tests); only SMTP is faked
vi.unmock('../../src/app/queues/email.queue.js');
vi.mock('../../src/app/utils/mail_sender.js', () => ({ default: vi.fn() }));

const send = vi.mocked(sendMail);
const FAST = { processEvery: 50, retryDelayMs: 50, maxRetries: 2 };

const email = (to: string): EmailJob => ({
  type: 'reset-password',
  email: to,
  resetLink: `https://app.test/reset?token=${to}`,
});

const jobs = () => mongoose.connection.db!.collection('agendaJobs');

/** Polls until `check` passes or `timeoutMs` is over. */
const waitFor = async (check: () => unknown | Promise<unknown>, timeoutMs = 5000) => {
  const start = Date.now();
  for (;;) {
    try {
      await check();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
};

/** Lets workers run for a while, to show that nothing else happens. */
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

const extraWorkers: Agenda[] = [];
afterEach(async () => {
  await Promise.all(extraWorkers.splice(0).map((w) => w.stop()));
  await stopQueues().catch(() => {});
});

describe('email queue (Agenda)', () => {
  it('sends a queued email once, and finished jobs expire', async () => {
    send.mockResolvedValue({} as never);
    await startQueues(FAST);

    await enqueueEmail(email('a@test.com'));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.com', subject: 'Reset Your Password' }),
    );
    // jobs carry reset links and OTPs: MongoDB deletes finished email jobs after an hour
    await waitFor(async () =>
      expect(await jobs().findOne({ name: 'email' })).toHaveProperty('lastFinishedAt'),
    );
    const ttl = (await jobs().indexes()).find((i) => i.name === 'email_jobs_ttl');
    expect(ttl).toMatchObject({
      expireAfterSeconds: 3600,
      partialFilterExpression: { name: 'email' },
    });
  });

  it('retries a failed send', async () => {
    send.mockRejectedValueOnce(new Error('SMTP down')).mockResolvedValue({} as never);
    await startQueues(FAST);

    await enqueueEmail(email('retry@test.com'));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it('gives up after the retry limit', async () => {
    send.mockRejectedValue(new Error('SMTP down'));
    await startQueues(FAST);

    await enqueueEmail(email('broken@test.com'));

    // the first attempt + 2 retries, and then nothing more
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    await settle();
    expect(send).toHaveBeenCalledTimes(3);
    const [job] = await jobs().find().toArray();
    expect(job).toMatchObject({ failReason: 'SMTP down' });
  });

  it('never sends the same email twice, even with several workers', async () => {
    send.mockResolvedValue({} as never);
    await startQueues(FAST);
    const second = newAgenda(FAST);
    defineEmailJob(second, FAST);
    extraWorkers.push(second);
    await second.start();

    const recipients = ['1', '2', '3', '4', '5', '6'].map((n) => `${n}@test.com`);
    await Promise.all(recipients.map((to) => enqueueEmail(email(to))));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(recipients.length));
    await settle();
    const sentTo = send.mock.calls.map(([mail]) => mail.to).sort();
    expect(sentTo).toEqual(recipients.sort());
  });

  it('sends the emails that were queued while no worker was running', async () => {
    send.mockResolvedValue({} as never);
    await startQueues(FAST);
    await stopQueues();
    await enqueueEmail(email('queued@test.com'));
    await settle();
    expect(send).not.toHaveBeenCalled();

    await startQueues(FAST); // e.g. after a deploy

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('waits for a running send to finish before shutting down', async () => {
    let finished = false;
    send.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 300));
      finished = true;
      return {} as never;
    });
    await startQueues(FAST);
    await enqueueEmail(email('slow@test.com'));
    await waitFor(() => expect(send).toHaveBeenCalled());

    await stopQueues();

    expect(finished).toBe(true);
  });
});
