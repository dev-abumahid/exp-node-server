import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import uploadCloud from '../../src/app/utils/cloudinary.js';
import { bearer, makeAccount } from '../helpers/fixtures.js';
import { prismaMock } from '../helpers/prisma.js';

vi.mock('../../src/app/utils/cloudinary.js', () => ({ default: vi.fn() }));

const account = makeAccount();
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

describe('PATCH /api/profile', () => {
  beforeEach(() => {
    prismaMock.account.findUnique.mockResolvedValue(account); // auth middleware
    prismaMock.profile.update.mockImplementation(async ({ data }) => ({ id: 'p-1', ...data }));
  });

  it('requires a token', async () => {
    const res = await request(app).patch('/api/profile').field('data', '{}');
    expect(res.status).toBe(401);
  });

  it('updates the signed-in user profile', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', bearer(account))
      .field('data', JSON.stringify({ fullName: '  Jane Doe  ' }));

    expect(res.status).toBe(200);
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      data: { fullName: 'Jane Doe', profilePhoto: undefined },
    });
    expect(uploadCloud).not.toHaveBeenCalled();
  });

  it('ignores fields that are not in the schema', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', bearer(account))
      .field('data', JSON.stringify({ fullName: 'Jane', accountId: 'someone-else' }));

    expect(res.status).toBe(200);
    expect(prismaMock.profile.update.mock.calls[0]![0].data).not.toHaveProperty('accountId');
  });

  it('uploads the photo and stores its url', async () => {
    vi.mocked(uploadCloud).mockResolvedValue({ secure_url: 'https://cdn.test/p.png' } as never);

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', bearer(account))
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(vi.mocked(uploadCloud).mock.calls[0]![0].buffer).toEqual(PNG);
    expect(res.body.data.profilePhoto).toBe('https://cdn.test/p.png');
  });

  it('rejects files that are not images', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', bearer(account))
      .attach('file', Buffer.from('#!/bin/sh'), { filename: 'x.sh', contentType: 'text/x-sh' });

    expect(res.status).toBe(400);
    expect(uploadCloud).not.toHaveBeenCalled();
  });

  it('rejects invalid data without uploading anything', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', bearer(account))
      .field('data', JSON.stringify({ fullName: '' }))
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(uploadCloud).not.toHaveBeenCalled();
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON in `data`', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', bearer(account))
      .field('data', '{not json');

    expect(res.status).toBe(400);
  });
});
