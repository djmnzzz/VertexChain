import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    if (service) {
      await service.onModuleDestroy();
    }
  });

  describe('onModuleInit', () => {
    it('should not initialize Redis when REDIS_URL is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      await service.onModuleInit();
      // Service should gracefully degrade without Redis
    });

    it('should handle Redis connection errors gracefully when REDIS_URL is set', async () => {
      mockConfigService.get.mockReturnValue('redis://localhost:6379/0');
      // Since we don't have actual Redis, this will fail but should not throw
      await service.onModuleInit();
      // Service should gracefully degrade
    });
  });

  describe('get', () => {
    it('should return null when Redis is unavailable', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      await service.onModuleInit();

      const result = await service.get('test-key');
      expect(result).toBeNull();
    });

    it('should track cache misses when Redis is unavailable', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      await service.onModuleInit();

      await service.get('test-key');
      const metrics = service.getMetrics();

      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(1);
    });
  });

  describe('set', () => {
    it('should not attempt set when Redis is unavailable', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      await service.onModuleInit();

      await service.set('test-key', { data: 'test' }, 60);
      // Should not throw
    });
  });

  describe('del', () => {
    it('should not attempt delete when Redis is unavailable', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      await service.onModuleInit();

      await service.del('test-key');
      // Should not throw
    });
  });

  describe('delPattern', () => {
    it('should not attempt pattern delete when Redis is unavailable', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      await service.onModuleInit();

      await service.delPattern('gist:nearby:*');
      // Should not throw
    });
  });

  describe('getMetrics', () => {
    it('should return 0 hit rate when no requests', () => {
      const metrics = service.getMetrics();
      expect(metrics.hitRate).toBe(0);
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    it('should reset hit and miss counters', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      await service.onModuleInit();

      await service.get('test-key');
      service.resetMetrics();
      const metrics = service.getMetrics();

      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });
  });
});
