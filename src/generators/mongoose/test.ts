export interface TestOptions {
    /** The routes require a signed-in user (generated with --auth). */
    auth?: boolean;
}

/** Supertest suite for a generated mongoose module, run against the in-memory MongoDB. */
export const mongooseTestGenerator = (name: string, { auth = false }: TestOptions = {}): string => {
    const vitestImports = auth ? "beforeEach, describe, expect, it" : "describe, expect, it";
    const fixtures = auth ? `import { bearer, createAccount } from '../helpers/fixtures.js';\n` : "";
    const client = auth
        ? `let token = '';

beforeEach(async () => {
  token = bearer(await createAccount());
});

/** Requests as a signed-in user. */
const api = () => request.agent(app).set('Authorization', token);`
        : `const api = () => request(app);`;
    const authTest = auth
        ? `
  it.each([
    ['get', BASE],
    ['post', BASE],
    ['get', \`\${BASE}/\${missingId}\`],
    ['patch', \`\${BASE}/\${missingId}\`],
    ['delete', \`\${BASE}/\${missingId}\`],
  ] as const)('%s %s needs a signed-in user', async (method, url) => {
    const res = await request(app)[method](url);

    expect(res.status).toBe(401);
  });
`
        : "";

    return `import { Types } from 'mongoose';
import request from 'supertest';
import { ${vitestImports} } from 'vitest';
import app from '../../src/app.js';
import { ${name}_model } from '../../src/app/modules/${name}/${name}.schema.js';
${fixtures}
// Starter tests for the generated CRUD routes: extend them with your own rules.
const BASE = '/api/${name}';
const missingId = new Types.ObjectId().toString();

// Valid request bodies, matching ${name}.validation.ts. Update them with your fields.
const createPayload = { name: 'Example ${name}' };
const updatePayload = { name: 'Updated ${name}' };

${client}

/** Inserts one directly in the database, for the read / update / delete tests. */
const insert = () => ${name}_model.create(createPayload);

describe(BASE, () => {${authTest}
  it('POST / creates one', async () => {
    const res = await api().post(BASE).send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject(createPayload);
    expect(await ${name}_model.countDocuments()).toBe(1);
  });

  it('POST / rejects an invalid body', async () => {
    const res = await api().post(BASE).send({});

    expect(res.status).toBe(400);
    expect(await ${name}_model.countDocuments()).toBe(0);
  });

  it('GET / lists them', async () => {
    await insert();

    const res = await api().get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /:id returns one', async () => {
    const doc = await insert();

    const res = await api().get(\`\${BASE}/\${doc._id}\`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ _id: String(doc._id), ...createPayload });
  });

  it('GET /:id is 404 when it does not exist', async () => {
    const res = await api().get(\`\${BASE}/\${missingId}\`);

    expect(res.status).toBe(404);
  });

  it('GET /:id is 400 for a malformed id', async () => {
    const res = await api().get(\`\${BASE}/not-an-id\`);

    expect(res.status).toBe(400);
  });

  it('PATCH /:id updates it', async () => {
    const doc = await insert();

    const res = await api().patch(\`\${BASE}/\${doc._id}\`).send(updatePayload);

    expect(res.status).toBe(200);
    const stored = await ${name}_model.findById(doc._id).lean();
    expect(stored).toMatchObject(updatePayload);
  });

  it('PATCH /:id is 404 when it does not exist', async () => {
    const res = await api().patch(\`\${BASE}/\${missingId}\`).send(updatePayload);

    expect(res.status).toBe(404);
  });

  it('DELETE /:id deletes it', async () => {
    const doc = await insert();

    const res = await api().delete(\`\${BASE}/\${doc._id}\`);

    expect(res.status).toBe(200);
    const stillThere = await ${name}_model.exists({ _id: doc._id });
    expect(stillThere).toBeNull();
  });

  it('DELETE /:id is 404 when it does not exist', async () => {
    const res = await api().delete(\`\${BASE}/\${missingId}\`);

    expect(res.status).toBe(404);
  });
});
`;
};
