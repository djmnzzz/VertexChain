import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { Response } from 'express';
import { HealthController } from './health.controller';

/**
 * Minimal Express Response mock. The controller uses
 * `passthrough: true` and only ever calls `res.status(...)`, so other
 * members of the Response surface are irrelevant for unit tests.
 *
 * The `as unknown as Response` cast happens at the call site, not in the
 * factory, so the cast is local and obvious — easier for a reviewer to
 * trace than piping it through a structural Pick<Response, 'status'>
 * type that still leaves the rest of the Response surface unfilled.
 */
function buildResMock(): { status: jest.Mock } {
  return {
    status: jest.fn().mockReturnThis(),
  };
}

describe('HealthController (unit)', () => {
  let controller: HealthController;
  let queryMock: jest.Mock;
  let res: { status: jest.Mock };

  beforeEach(async () => {
    queryMock = jest.fn();
    res = buildResMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getDataSourceToken(),
          useValue: { query: queryMock },
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  describe('HTTP status ↔ body.status contract', () => {
    it('returns 200 and body.status="ok" when DB + PostGIS both succeed', async () => {
      queryMock.mockResolvedValue([{ version: '3.4.0' }]);

      const body = await controller.check(res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        services: {
          database: { status: 'ok' },
          postgis: { status: 'ok', message: expect.stringMatching(/^PostGIS /) },
        },
      });
    });

    it('returns 503 and body.status="degraded" when the database probe fails', async () => {
      queryMock.mockRejectedValue(new Error('connection terminated'));

      const body = await controller.check(res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(body.status).toBe('degraded');
      expect(body.services.database).toEqual({
        status: 'error',
        message: 'connection terminated',
      });
    });

    it('returns 503 and body.status="degraded" when only PostGIS is missing', async () => {
      queryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('postgis_lib_version')) {
          return Promise.reject(new Error('function postgis_lib_version() does not exist'));
        }
        return Promise.resolve([]);
      });

      const body = await controller.check(res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(body.status).toBe('degraded');
      expect(body.services.database.status).toBe('ok');
      expect(body.services.postgis.status).toBe('error');
    });
  });

  describe('envelope invariants', () => {
    it('emits a parseable ISO-8601 timestamp every call', async () => {
      queryMock.mockResolvedValue([{ version: '3.4.0' }]);

      const body = await controller.check(res as unknown as Response);
      const stamp = Date.parse(body.timestamp);

      expect(Number.isFinite(stamp)).toBe(true);
      expect(Math.abs(Date.now() - stamp)).toBeLessThan(5_000);
    });

    it('returns the full envelope shape on the happy path (no body truncation)', async () => {
      queryMock.mockResolvedValue([{ version: '3.4.0' }]);

      const body = await controller.check(res as unknown as Response);

      expect(body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        services: {
          database: { status: 'ok' },
          postgis: { status: 'ok', message: expect.stringMatching(/^PostGIS /) },
        },
      });
    });

    it('returns the full envelope shape on the degraded path (no body truncation)', async () => {
      // First query (`SELECT 1`) fails imitating a DB outage, second
      // query (`SELECT postgis_lib_version()`) succeeds imitating an
      // outage that took DB pool offline but left postgis_lib_version
      // safely resolvable. We assert BOTH halves of the degraded body
      // (the failing and the still-healthy sub-service) come through.
      queryMock
        .mockRejectedValueOnce(new Error('outage'))
        .mockResolvedValueOnce([{ version: '3.4.0' }]);

      const fresh = buildResMock();
      const body = await controller.check(fresh as unknown as Response);

      expect(fresh.status).toHaveBeenCalledWith(503);
      expect(body).toEqual({
        status: 'degraded',
        timestamp: expect.any(String),
        services: {
          database: { status: 'error', message: 'outage' },
          postgis: { status: 'ok', message: expect.stringMatching(/^PostGIS /) },
        },
      });
    });
  });
});
