import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { AllExceptionsFilter } from 'src/common/filters/all-exceptions.filter';

describe('Gists (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;

  async function getCsrfToken(server: any) {
    const res = await request(server).get('/csrf-token');
    const cookie = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie'].find((header: string) => header.startsWith('csrfToken='))
      : undefined;

    return {
      token: res.body.csrfToken,
      cookie,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /gists', () => {
    it('should reject POST /gists without CSRF token', async () => {
      await request(app.getHttpServer())
        .post('/gists')
        .send({ content: 'e2e test gist', lat: 9.0579, lon: 7.4951 })
        .expect(403);
    });

    it('should create a gist and return 201 with full shape', async () => {
      const csrf = await getCsrfToken(app.getHttpServer());

      const res = await request(app.getHttpServer())
        .post('/gists')
        .set('Cookie', csrf.cookie)
        .set('x-csrf-token', csrf.token)
        .send({ content: 'e2e test gist', lat: 9.0579, lon: 7.4951 })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        content: 'e2e test gist',
        location_cell: expect.any(String),
        content_hash: expect.stringContaining('mock_'),
        stellar_gist_id: expect.any(String),
        tx_hash: expect.stringContaining('mock_'),
        created_at: expect.any(String),
        lat: 9.0579,
        lon: 7.4951,
      });
    });

    it('should return 400 when lat is out of range', async () => {
      const csrf = await getCsrfToken(app.getHttpServer());

      const res = await request(app.getHttpServer())
        .post('/gists')
        .set('Cookie', csrf.cookie)
        .set('x-csrf-token', csrf.token)
        .send({ content: 'bad lat', lat: 999, lon: 7.4951 })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('lat')]));
    });

    it('should return 400 when content exceeds 280 characters', async () => {
      const csrf = await getCsrfToken(app.getHttpServer());

      const res = await request(app.getHttpServer())
        .post('/gists')
        .set('Cookie', csrf.cookie)
        .set('x-csrf-token', csrf.token)
        .send({ content: 'x'.repeat(281), lat: 9.0579, lon: 7.4951 })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('should return 400 when required fields are missing', async () => {
      const csrf = await getCsrfToken(app.getHttpServer());

      await request(app.getHttpServer())
        .post('/gists')
        .set('Cookie', csrf.cookie)
        .set('x-csrf-token', csrf.token)
        .send({ content: 'missing coords' })
        .expect(400);
    });

    it('should reject unknown fields (whitelist)', async () => {
      const csrf = await getCsrfToken(app.getHttpServer());

      await request(app.getHttpServer())
        .post('/gists')
        .set('Cookie', csrf.cookie)
        .set('x-csrf-token', csrf.token)
        .send({ content: 'whitelist test', lat: 9.0579, lon: 7.4951, hack: 'injected' })
        .expect(400);
    });
  });

  describe('GET /gists', () => {
    it('should return a fresh CSRF token cookie and token', async () => {
      const res = await request(app.getHttpServer()).get('/csrf-token').expect(200);

      expect(res.body).toMatchObject({ csrfToken: expect.any(String) });
      expect(res.headers['set-cookie']?.[0]).toEqual(expect.stringContaining('csrfToken='));
      expect(res.headers['set-cookie']?.[0]).toEqual(expect.stringContaining('Max-Age=3600'));
    });
    it('should return paginated response with data and pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/gists')
        .query({ lat: 9.0579, lon: 7.4951, radius: 1000 })
        .expect(200);

      expect(res.body).toMatchObject({
        data: expect.any(Array),
        pagination: {
          count: expect.any(Number),
          hasMore: expect.any(Boolean),
        },
      });
    });

    it('should return 400 when lat/lon are missing', async () => {
      await request(app.getHttpServer()).get('/gists').expect(400);
    });

    it('should respect the limit parameter', async () => {
      const res = await request(app.getHttpServer())
        .get('/gists')
        .query({ lat: 9.0579, lon: 7.4951, limit: 2 })
        .expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.services.database.status).toBe('ok');
      expect(res.body.services.postgis.status).toBe('ok');
    });
  });

  describe('Cache behavior (graceful degradation)', () => {
    it('should handle gist queries when Redis is unavailable', async () => {
      // This test verifies that the application works even without Redis configured
      // First query should work (cache miss, hits DB)
      const res1 = await request(app.getHttpServer())
        .get('/gists')
        .query({ lat: 9.0579, lon: 7.4951, radius: 1000 })
        .expect(200);

      expect(res1.body).toMatchObject({
        data: expect.any(Array),
        pagination: {
          count: expect.any(Number),
          hasMore: expect.any(Boolean),
        },
      });

      // Second identical query should also work (graceful degradation)
      const res2 = await request(app.getHttpServer())
        .get('/gists')
        .query({ lat: 9.0579, lon: 7.4951, radius: 1000 })
        .expect(200);

      expect(res2.body).toMatchObject({
        data: expect.any(Array),
        pagination: {
          count: expect.any(Number),
          hasMore: expect.any(Boolean),
        },
      });
    });

    it('should handle findOne queries when Redis is unavailable', async () => {
      // Create a gist first
      const csrf = await getCsrfToken(app.getHttpServer());
      const createRes = await request(app.getHttpServer())
        .post('/gists')
        .set('Cookie', csrf.cookie)
        .set('x-csrf-token', csrf.token)
        .send({ content: 'cache test gist', lat: 9.0579, lon: 7.4951 })
        .expect(201);

      const gistId = createRes.body.id;

      // Query by ID should work without Redis
      const res = await request(app.getHttpServer()).get(`/gists/${gistId}`).expect(200);

      expect(res.body).toMatchObject({
        id: gistId,
        content: 'cache test gist',
      });
    });
  });
});
