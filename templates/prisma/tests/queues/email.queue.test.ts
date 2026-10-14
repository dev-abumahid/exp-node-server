import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { getBoss, newBoss } from '../../src/app/queues/boss.js';
import {
  createEmailQueue,
  EMAIL_QUEUE,
  enqueueEmail,
  type EmailJob,
  startEmailWorker,
} from '../../src/app/queues/email.queue.js';
import { startQueues, stopQueues } from '../../src/app/queues/index.js';
import sendMail from '../../src/app/utils/mail_sender.js';

// the real queue (tests/setup.ts mocks it for the route tests); only SMTP is faked
vi.unmock('../../src/app/queues/email.queue.js');
vi.mock('../../src/app/utils/mail_sender.js', () => ({ default: vi.fn() }));

/**
 * pg-boss needs a real PostgreSQL, so these tests only run when one is given:
 *   docker compose up -d && TEST_DATABASE_URL=postgresql://... npm test
 * Each run uses its own schema, dropped afterwards.
 */
const url = process.env.TEST_DATABASE_URL;
const schema = `pgboss_test_${randomBytes(4).toString('hex')}`;
const FAST = {
  connectionString: url,
  schema,
  retryDelaySeconds: 1,
  retryLimit: 2,
  pollingIntervalSeconds: 0.5,
  maintenance: false,
};

const send = vi.mocked(sendMail);

const email = (to: string): EmailJob => ({
  type: 'reset-password',
  email: to,
  resetLink: `https://app.test/reset?token=${to}`,
});

/** Polls until `check` passes or `timeoutMs` is over. */
const waitFor = async (check: () => unknown | Promise<unknown>, timeoutMs = 15_000) => {
  const start = Date.now();
  for (;;) {
    try {
      await check();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
};

/** Lets workers run for a while, to show that nothing else happens. */
const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

const extraInstances: PgBoss[] = [];

describe.skipIf(!url)('email queue (pg-boss)', { timeout: 30_000 }, () => {
  afterEach(async () => {
    await Promise.all(extraInstances.splice(0).map((b) => b.stop({ graceful: false })));
    await stopQueues().catch(() => {});
  });

  afterAll(async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  it('sends a queued email once', async () => {
    send.mockResolvedValue({} as never);
    await startQueues(FAST);

    const id = await enqueueEmail(email('a@test.com'));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.com', subject: 'Reset Your Password' }),
    );
    await waitFor(async () =>
      expect(await getBoss().getJobById(EMAIL_QUEUE, id!)).toMatchObject({ state: 'completed' }),
    );
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

    const id = await enqueueEmail(email('broken@test.com'));

    // the first attempt + 2 retries, and then nothing more
    await waitFor(async () =>
      expect(await getBoss().getJobById(EMAIL_QUEUE, id!)).toMatchObject({ state: 'failed' }),
    );
    await settle();
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('never sends the same email twice, even with several workers', async () => {
    send.mockResolvedValue({} as never);
    await startQueues(FAST);
    const second = newBoss(FAST);
    extraInstances.push(second);
    await second.start();
    await startEmailWorker(second, FAST);

    const recipients = ['1', '2', '3', '4', '5', '6'].map((n) => `${n}@test.com`);
    await Promise.all(recipients.map((to) => enqueueEmail(email(to))));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(recipients.length));
    await settle();
    const sentTo = send.mock.calls.map(([mail]) => mail.to).sort();
    expect(sentTo).toEqual(recipients.sort());
  });

  it('sends the emails that were queued while no worker was running', async () => {
    send.mockResolvedValue({} as never);
    // e.g. the API keeps queueing while the worker process is being deployed
    const producer = newBoss(FAST);
    extraInstances.push(producer);
    await producer.start();
    await createEmailQueue(producer, FAST);
    await producer.send(EMAIL_QUEUE, email('queued@test.com'));
    await settle();
    expect(send).not.toHaveBeenCalled();

    await startQueues(FAST);

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('waits for a running send to finish before shutting down', async () => {
    let finished = false;
    send.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 500));
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
