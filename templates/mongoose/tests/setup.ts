import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, inject, vi } from 'vitest';

// external boundaries only: everything between the route and MongoDB runs for real
vi.mock('../src/app/queues/email.queue.js', () => ({
  enqueueEmail: vi.fn(),
}));

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { dbName: `test-${randomUUID()}` });
  // unique and TTL indexes are part of the behaviour under test
  await mongoose.connection.syncIndexes();
});

beforeEach(async () => {
  // a clean database, and clean rate limit counters, for every test
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
