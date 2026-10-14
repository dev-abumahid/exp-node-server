import type { TestOptions } from "../mongoose/test.js";

/** Supertest suite for a generated prisma module, run against the Prisma mock. */
export const prismaTestGenerator = (name: string, { auth = false }: TestOptions = {}): string => {
    const vitestImports = auth ? "beforeEach, describe, expect, it" : "describe, expect, it";
    const fixtures = auth ? `import { bearer, makeAccount } from '../helpers/fixtures.js';\n` : "";
    const client = auth
        ? `const account = makeAccount();

beforeEach(() => {
  // the auth middleware looks the signed-in account up
  prismaMock.account.findUnique.mockResolvedValue(account);
});

/** Requests as a signed-in user. */
const api = () => request.agent(app).set('Authorization', bearer(account));`
        : `const api = () => request(app);`;
    const authTest = auth
        ? `
  it.each([
    ['get', BASE],
    ['post', BASE],
    ['get', \`\${BASE}/\${row.id}\`],
    ['patch', \`\${BASE}/\${row.id}\`],
    ['delete', \`\${BASE}/\${row.id}\`],
  ] as const)('%s %s needs a signed-in user', async (method, url) => {
    const res = await request(app)[method](url);

    expect(res.status).toBe(401);
  });
`
        : "";

    return `import { Prisma } from '@prisma/client';
import request from 'supertest';
import { ${vitestImports} } from 'vitest';
import app from '../../src/app.js';
${fixtures}import { prismaMock } from '../helpers/prisma.js';

// Starter tests for the generated CRUD routes: extend them with your own rules.
const BASE = '/api/${name}';
const db = prismaMock.${name};

// Valid request bodies, matching ${name}.validation.ts. Update them with your fields.
const createPayload = { name: 'Example ${name}' };
const updatePayload = { name: 'Updated ${name}' };

// a row as the database would return it
const row = {
  id: '9b2f3c1e-7a41-4c8e-9d6b-2f4e8a1c5b70',
  ...createPayload,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};
// ...and as it looks in a JSON response
const json = JSON.parse(JSON.stringify(row));

const recordNotFound = () =>
  new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: 'test',
  });

${client}

describe(BASE, () => {${authTest}
  it('POST / creates one', async () => {
    db.create.mockResolvedValue(row);

    const res = await api().post(BASE).send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(json);
    expect(db.create).toHaveBeenCalledWith({ data: createPayload });
  });

  it('POST / rejects an invalid body', async () => {
    const res = await api().post(BASE).send({});

    expect(res.status).toBe(400);
    expect(db.create).not.toHaveBeenCalled();
  });

  it('GET / lists them', async () => {
    db.findMany.mockResolvedValue([row]);

    const res = await api().get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([json]);
  });

  it('GET /:id returns one', async () => {
    db.findUnique.mockResolvedValue(row);

    const res = await api().get(\`\${BASE}/\${row.id}\`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(json);
    expect(db.findUnique).toHaveBeenCalledWith({ where: { id: row.id } });
  });

  it('GET /:id is 404 when it does not exist', async () => {
    db.findUnique.mockResolvedValue(null);

    const res = await api().get(\`\${BASE}/\${row.id}\`);

    expect(res.status).toBe(404);
  });

  it('PATCH /:id updates it', async () => {
    db.update.mockResolvedValue({ ...row, ...updatePayload });

    const res = await api().patch(\`\${BASE}/\${row.id}\`).send(updatePayload);

    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledWith({ where: { id: row.id }, data: updatePayload });
  });

  it('PATCH /:id is 404 when it does not exist', async () => {
    db.update.mockRejectedValue(recordNotFound());

    const res = await api().patch(\`\${BASE}/\${row.id}\`).send(updatePayload);

    expect(res.status).toBe(404);
  });

  it('DELETE /:id deletes it', async () => {
    db.delete.mockResolvedValue(row);

    const res = await api().delete(\`\${BASE}/\${row.id}\`);

    expect(res.status).toBe(200);
    expect(db.delete).toHaveBeenCalledWith({ where: { id: row.id } });
  });

  it('DELETE /:id is 404 when it does not exist', async () => {
    db.delete.mockRejectedValue(recordNotFound());

    const res = await api().delete(\`\${BASE}/\${row.id}\`);

    expect(res.status).toBe(404);
  });
});
`;
};
