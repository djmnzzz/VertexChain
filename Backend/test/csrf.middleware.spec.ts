import * as express from 'express';
import * as request from 'supertest';
import {
  csrfCookieParser,
  csrfErrorHandler,
  csrfProtection,
} from 'src/common/middleware/csrf.middleware';

describe('CSRF middleware', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(csrfCookieParser);
    app.use(csrfProtection);
    app.use(csrfErrorHandler);

    app.get('/csrf-token', (req, res) => {
      res.json({ csrfToken: (req as any).csrfToken?.() });
    });

    app.post('/test', (req, res) => {
      res.status(201).json({ success: true });
    });
  });

  it('should return a fresh CSRF token on GET /csrf-token', async () => {
    const res = await request(app).get('/csrf-token').expect(200);

    expect(res.body).toEqual({ csrfToken: expect.any(String) });
    expect(res.headers['set-cookie']?.[0]).toEqual(expect.stringContaining('csrfToken='));
  });

  it('should reject POST requests without CSRF token', async () => {
    await request(app).post('/test').send({}).expect(403);
  });

  it('should accept POST requests with valid CSRF token and cookie', async () => {
    const csrfRes = await request(app).get('/csrf-token');
    const cookie = csrfRes.headers['set-cookie']?.[0];
    const token = csrfRes.body.csrfToken;

    await request(app)
      .post('/test')
      .set('Cookie', cookie)
      .set('x-csrf-token', token)
      .send({})
      .expect(201)
      .expect({ success: true });
  });
});
