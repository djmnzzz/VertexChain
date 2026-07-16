import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IpfsService } from './ipfs.service';

describe('IpfsService', () => {
  let service: IpfsService;

  const buildService = async (
    apiKey?: string,
    secretKey?: string,
    retries = 3,
  ): Promise<IpfsService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpfsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: unknown) => {
              if (key === 'PINATA_API_KEY') return apiKey;
              if (key === 'PINATA_SECRET_KEY') return secretKey;
              if (key === 'IPFS_RETRY_ATTEMPTS') return retries;
              return def;
            }),
          },
        },
      ],
    }).compile();

    return module.get<IpfsService>(IpfsService);
  };

  describe('dev mode (no Pinata credentials)', () => {
    beforeEach(async () => {
      service = await buildService(undefined, undefined);
    });

    describe('pinJson()', () => {
      it('returns a mock CID in dev mode', async () => {
        const result = await service.pinJson({ content: 'hello', lat: 9, lon: 7 });
        expect(result.mock).toBe(true);
        expect(result.cid).toMatch(/^mock_Qm/);
      });

      it('generates different CIDs for different content', async () => {
        const r1 = await service.pinJson({ content: 'A' });
        const r2 = await service.pinJson({ content: 'B' });
        expect(r1.cid).not.toBe(r2.cid);
      });

      it('returns synchronously (no network call)', async () => {
        const start = Date.now();
        await service.pinJson({ content: 'test' });
        // dev mock must complete well under 100 ms (no retry delays)
        expect(Date.now() - start).toBeLessThan(100);
      });
    });

    describe('pinJsonBatch()', () => {
      it('pins identical payloads once and preserves input order', async () => {
        const pinSpy = jest.spyOn(service, 'pinJson');
        const repeated = { content: 'same', lat: 9, lon: 7 };

        const results = await service.pinJsonBatch([repeated, { content: 'other' }, repeated]);

        expect(pinSpy).toHaveBeenCalledTimes(2);
        expect(results[0]).toEqual(results[2]);
        expect(results[0].cid).not.toEqual(results[1].cid);
      });
    });

    describe('getJson()', () => {
      it('returns a mock response for mock CIDs', async () => {
        const result = await service.getJson('mock_Qmabc123');
        expect(result).toMatchObject({ mock: true });
      });

      it('returns a mock response in dev mode for any CID', async () => {
        const result = await service.getJson('QmRealLookingCid');
        expect(result).toMatchObject({ mock: true });
      });
    });
  });

  describe('real mode (Pinata credentials provided)', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(async () => {
      // Prevent the real require('@pinata/sdk') from failing in test env
      jest.mock(
        '@pinata/sdk',
        () => {
          return jest.fn().mockImplementation(() => ({
            pinJSONToIPFS: jest.fn().mockRejectedValue(new Error('Pinata network error')),
          }));
        },
        { virtual: true },
      );

      // We won't call pinJson in real mode for getJson tests — just test getJson path
      // Service built with credentials but getJson for mock_* CIDs still returns mock
      service = await buildService('test-api-key', 'test-secret-key');
    });

    afterEach(() => {
      if (fetchSpy) fetchSpy.mockRestore();
      jest.resetModules();
    });

    describe('getJson()', () => {
      it('returns mock response for mock_ prefixed CIDs even in real mode', async () => {
        const result = await service.getJson('mock_Qmabcdef');
        expect(result).toMatchObject({ mock: true });
      });

      it('retries on fetch failure and throws after exhausting retries', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network failure'));

        await expect(service.getJson('QmRealCid123')).rejects.toThrow('Network failure');

        // Should have been called 3 times (maxRetries=3)
        expect(fetchSpy).toHaveBeenCalledTimes(3);
      });

      it('throws on non-OK HTTP response after retries', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
          ok: false,
          status: 404,
          json: jest.fn(),
        } as unknown as Response);

        await expect(service.getJson('QmNotFound')).rejects.toThrow('IPFS fetch failed: 404');

        expect(fetchSpy).toHaveBeenCalledTimes(3);
      });

      it('returns parsed JSON on successful fetch', async () => {
        const mockData = { content: 'test content', lat: 9.0579, lon: 7.4951 };
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue(mockData),
        } as unknown as Response);

        const result = await service.getJson('QmSuccess123');
        expect(result).toEqual(mockData);
      });
    });
  });
});
