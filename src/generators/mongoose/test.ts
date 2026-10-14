/** Supertest suite for a generated mongoose module, run against the in-memory MongoDB. */
export const mongooseTestGenerator = (name: string): string => `import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { ${name}_model } from '../../src/app/modules/${name}/${name}.schema.js';

const BASE = '/api/${name}';

// Valid request bodies. Fill them in as you add fields to ${name}.schema.ts and
// ${name}.validation.ts (and protect the routes with auth() once they need it).
const createPayload = {};
const updatePayload = {};

/** Inserts a ${name} directly in the database, for the read / update / delete tests. */
const insert = () => ${name}_model.create(createPayload);

describe(BASE, () => {
  it('POST / creates one', async () => {
    const res = await request(app).post(BASE).send(createPayload);

    expect(res.status).toBe(201);
    expect(await ${name}_model.countDocuments()).toBe(1);
  });

  it('GET / lists them', async () => {
    await insert();

    const res = await request(app).get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /:id returns one', async () => {
    const doc = await insert();

    const res = await request(app).get(\`\${BASE}/\${doc._id}\`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(String(doc._id));
  });

  it('GET /:id is 404 when it does not exist', async () => {
    const res = await request(app).get(\`\${BASE}/\${new Types.ObjectId()}\`);

    expect(res.status).toBe(404);
  });

  it('GET /:id is 400 for a malformed id', async () => {
    const res = await request(app).get(\`\${BASE}/not-an-id\`);

    expect(res.status).toBe(400);
  });

  it('PATCH /:id updates it', async () => {
    const doc = await insert();

    const res = await request(app).patch(\`\${BASE}/\${doc._id}\`).send(updatePayload);

    expect(res.status).toBe(200);
    const stored = await ${name}_model.findById(doc._id).lean();
    expect(stored).toMatchObject(updatePayload);
  });

  it('PATCH /:id is 404 when it does not exist', async () => {
    const res = await request(app).patch(\`\${BASE}/\${new Types.ObjectId()}\`).send(updatePayload);

    expect(res.status).toBe(404);
  });

  it('DELETE /:id deletes it', async () => {
    const doc = await insert();

    const res = await request(app).delete(\`\${BASE}/\${doc._id}\`);

    expect(res.status).toBe(200);
    const stillThere = await ${name}_model.exists({ _id: doc._id });
    expect(stillThere).toBeNull();
  });

  it('DELETE /:id is 404 when it does not exist', async () => {
    const res = await request(app).delete(\`\${BASE}/\${new Types.ObjectId()}\`);

    expect(res.status).toBe(404);
  });
});
`;
