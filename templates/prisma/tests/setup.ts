import { vi } from 'vitest';

// external boundaries only: everything between the route and these runs for real
vi.mock('../src/app/lib/prisma.js', async () => ({
  prisma: (await import('./helpers/prisma.js')).prismaMock,
}));

vi.mock('../src/app/queues/email.queue.js', () => ({
  enqueueEmail: vi.fn(),
}));
