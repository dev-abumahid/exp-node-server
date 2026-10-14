import { type Mock, vi } from 'vitest';

const model = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
});

type ModelMock = ReturnType<typeof model>;

const models = new Map<string, ModelMock>();
const client = { $queryRaw: vi.fn(), $transaction: vi.fn() };

/**
 * Stands in for the Prisma client (see tests/setup.ts), so tests need no database.
 * Any model works without registering it: `prismaMock.order.findMany` is created
 * on first use.
 */
export const prismaMock = new Proxy(client, {
  get(target, prop: string) {
    if (prop in target) return target[prop as keyof typeof target];
    if (!models.has(prop)) models.set(prop, model());
    return models.get(prop);
  },
}) as typeof client & Record<string, ModelMock> & { $queryRaw: Mock };
