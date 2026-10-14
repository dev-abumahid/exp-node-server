import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import { profile_model } from '../../src/app/modules/profile/profile.schema.js';
import uploadCloud from '../../src/app/utils/cloudinary.js';
import { bearer, createAccount } from '../helpers/fixtures.js';

vi.mock('../../src/app/utils/cloudinary.js', () => ({ default: vi.fn() }));

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

describe('PATCH /api/profile', () => {
  let auth: string;
  let accountId: string;

  beforeEach(async () => {
    const account = await createAccount();
    auth = bearer(account);
    accountId = String(account._id);
  });

  const storedProfile = () => profile_model.findOne({ accountId }).lean();

  it('requires a token', async () => {
    const res = await request(app).patch('/api/profile').field('data', '{}');
    expect(res.status).toBe(401);
  });

  it('updates the signed-in user profile', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', auth)
      .field('data', JSON.stringify({ fullName: '  Jane Doe  ' }));

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Jane Doe');
    expect((await storedProfile())!.fullName).toBe('Jane Doe');
    expect(uploadCloud).not.toHaveBeenCalled();
  });

  it('ignores fields that are not in the schema', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', auth)
      .field('data', JSON.stringify({ fullName: 'Jane', accountId: '507f1f77bcf86cd799439011' }));

    expect(res.status).toBe(200);
    expect(String((await storedProfile())!.accountId)).toBe(accountId);
  });

  it('uploads the photo and stores its url', async () => {
    vi.mocked(uploadCloud).mockResolvedValue({ secure_url: 'https://cdn.test/p.png' } as never);

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', auth)
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(vi.mocked(uploadCloud).mock.calls[0]![0].buffer).toEqual(PNG);
    expect((await storedProfile())!.profilePhoto).toBe('https://cdn.test/p.png');
    expect((await storedProfile())!.fullName).toBe('Test User'); // untouched
  });

  it('rejects files that are not images', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', auth)
      .attach('file', Buffer.from('#!/bin/sh'), { filename: 'x.sh', contentType: 'text/x-sh' });

    expect(res.status).toBe(400);
    expect(uploadCloud).not.toHaveBeenCalled();
  });

  it('rejects invalid data without uploading anything', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', auth)
      .field('data', JSON.stringify({ fullName: '' }))
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(uploadCloud).not.toHaveBeenCalled();
    expect((await storedProfile())!.fullName).toBe('Test User');
  });

  it('rejects malformed JSON in `data`', async () => {
    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', auth)
      .field('data', '{not json');

    expect(res.status).toBe(400);
  });
});
