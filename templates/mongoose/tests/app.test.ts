import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { createAccount } from './helpers/fixtures.js';

describe('app', () => {
  it('GET / responds with security headers', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('unknown routes are 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON body');
  });

  it('rejects bodies over 1mb', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'a@b.c', password: 'x'.repeat(1_100_000) });

    expect(res.status).toBe(413);
  });

  it('only allows the configured CORS origin', async () => {
    const allowed = await request(app).get('/').set('Origin', 'http://localhost:5173');
    const other = await request(app).get('/').set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never sends error internals to the client', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage');

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('err');
  });
});

describe('rate limiting (counters stored in MongoDB)', () => {
  it('limits sign-in attempts per email', async () => {
    await createAccount({ email: 'target@example.com' });
    const attempt = (email = 'target@example.com') =>
      request(app).post('/api/auth/sign-in').send({ email, password: 'guess-guess' });

    for (let i = 0; i < 10; i++) {
      expect((await attempt()).status).toBe(401);
    }
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.headers['ratelimit-policy']).toBeDefined();

    // another account from the same client is still allowed
    expect((await attempt('someone-else@example.com')).status).toBe(401);
  });

  it('limits emails sent to one address, whatever the endpoint', async () => {
    const email = 'victim@example.com';

    await request(app).put('/api/auth/forget-password').send({ email }).expect(200);
    await request(app).put('/api/auth/resend-otp').send({ email }).expect(200);
    await request(app)
      .put('/api/auth/forget-password')
      .send({ email: email.toUpperCase() })
      .expect(200);

    const blocked = await request(app).put('/api/auth/forget-password').send({ email });
    expect(blocked.status).toBe(429);
  });

  it('counts parallel requests exactly', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app).put('/api/auth/forget-password').send({ email: 'burst@example.com' }),
      ),
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
  });
});
