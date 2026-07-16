import { Test, TestingModule } from '@nestjs/testing';
import { GistsService } from './gists.service';
import { GistRepository } from './gist.repository';
import { GeoService } from '../geo/geo.service';
import { IpfsService } from '../ipfs/ipfs.service';
import { SorobanService } from '../soroban/soroban.service';
import { CacheService } from '../cache/cache.service';
import { Gist } from './entities/gist.entity';
import { CreateGistDto } from './dto/create-gist.dto';
import { QueryGistsDto } from './dto/query-gists.dto';

jest.mock('../common/utils/sanitize', () => ({
  stripHtml: jest.fn((text: string) => text),
}));

const mockGist = (): Gist => ({
  id: 'uuid-1',
  content: 'Test gist',
  location_cell: 's1t7d8c',
  content_hash: 'mock_Qmabc123',
  stellar_gist_id: '1000',
  tx_hash: 'mock_tx_abc',
  location: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
});

describe('GistsService', () => {
  let service: GistsService;
  let gistRepository: jest.Mocked<GistRepository>;
  let geoService: jest.Mocked<GeoService>;
  let ipfsService: jest.Mocked<IpfsService>;
  let sorobanService: jest.Mocked<SorobanService>;
  let cacheService: jest.Mocked<CacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GistsService,
        {
          provide: GistRepository,
          useValue: {
            create: jest.fn(),
            findNearby: jest.fn(),
            findByGistId: jest.fn(),
          },
        },
        {
          provide: GeoService,
          useValue: { encode: jest.fn() },
        },
        {
          provide: IpfsService,
          useValue: { pinJson: jest.fn(), pinJsonBatch: jest.fn() },
        },
        {
          provide: SorobanService,
          useValue: { postGist: jest.fn() },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            delPattern: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GistsService>(GistsService);
    gistRepository = module.get(GistRepository);
    geoService = module.get(GeoService);
    ipfsService = module.get(IpfsService);
    sorobanService = module.get(SorobanService);
    cacheService = module.get(CacheService);
  });

  describe('createBatch()', () => {
    it('pins the batch once, publishes concurrently, and returns all gists in order', async () => {
      const dtos: CreateGistDto[] = [
        { content: 'First', lat: 9.0579, lon: 7.4951 },
        { content: 'Second', lat: 9.058, lon: 7.4952, author: 'GABC' },
      ];
      geoService.encode.mockReturnValueOnce('cell-1').mockReturnValueOnce('cell-2');
      ipfsService.pinJsonBatch.mockResolvedValue([
        { cid: 'cid-1', mock: true },
        { cid: 'cid-2', mock: true },
      ]);
      sorobanService.postGist
        .mockResolvedValueOnce({ gistId: '1', txHash: 'tx-1', mock: true })
        .mockResolvedValueOnce({ gistId: '2', txHash: 'tx-2', mock: true });
      const stored = [mockGist(), { ...mockGist(), id: 'uuid-2', content: 'Second' }];
      gistRepository.create.mockResolvedValueOnce(stored[0]).mockResolvedValueOnce(stored[1]);
      cacheService.delPattern.mockResolvedValue();

      await expect(service.createBatch(dtos)).resolves.toEqual(stored);
      expect(ipfsService.pinJsonBatch).toHaveBeenCalledTimes(1);
      expect(ipfsService.pinJsonBatch).toHaveBeenCalledWith([
        expect.objectContaining({ content: 'First', location_cell: 'cell-1' }),
        expect.objectContaining({ content: 'Second', location_cell: 'cell-2' }),
      ]);
      expect(sorobanService.postGist).toHaveBeenNthCalledWith(1, 'cell-1', 'cid-1', undefined);
      expect(sorobanService.postGist).toHaveBeenNthCalledWith(2, 'cell-2', 'cid-2', 'GABC');
    });
  });

  describe('create()', () => {
    it('calls GeoService.encode with lat/lon', async () => {
      const dto: CreateGistDto = { content: 'Test', lat: 9.0579, lon: 7.4951 };
      geoService.encode.mockReturnValue('s1t7d8c');
      ipfsService.pinJson.mockResolvedValue({ cid: 'mock_Qmabc', mock: true });
      sorobanService.postGist.mockResolvedValue({ gistId: '1', txHash: 'tx1', mock: true });
      gistRepository.create.mockResolvedValue(mockGist());
      cacheService.delPattern.mockResolvedValue();

      await service.create(dto);

      expect(geoService.encode).toHaveBeenCalledWith(9.0579, 7.4951);
    });

    it('calls IpfsService.pinJson with content and location metadata', async () => {
      const dto: CreateGistDto = { content: 'Test', lat: 9.0579, lon: 7.4951 };
      geoService.encode.mockReturnValue('s1t7d8c');
      ipfsService.pinJson.mockResolvedValue({ cid: 'mock_Qmabc', mock: true });
      sorobanService.postGist.mockResolvedValue({ gistId: '1', txHash: 'tx1', mock: true });
      gistRepository.create.mockResolvedValue(mockGist());
      cacheService.delPattern.mockResolvedValue();

      await service.create(dto);

      expect(ipfsService.pinJson).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Test',
          lat: 9.0579,
          lon: 7.4951,
          location_cell: 's1t7d8c',
        }),
      );
    });

    it('calls SorobanService.postGist with locationCell, cid, and author', async () => {
      const dto: CreateGistDto = { content: 'Test', lat: 9.0579, lon: 7.4951, author: 'GABC' };
      geoService.encode.mockReturnValue('s1t7d8c');
      ipfsService.pinJson.mockResolvedValue({ cid: 'mock_Qmabc', mock: true });
      sorobanService.postGist.mockResolvedValue({ gistId: '1', txHash: 'tx1', mock: true });
      gistRepository.create.mockResolvedValue(mockGist());
      cacheService.delPattern.mockResolvedValue();

      await service.create(dto);

      expect(sorobanService.postGist).toHaveBeenCalledWith('s1t7d8c', 'mock_Qmabc', 'GABC');
    });

    it('calls GistRepository.create with all required fields', async () => {
      const dto: CreateGistDto = { content: 'Test', lat: 9.0579, lon: 7.4951 };
      geoService.encode.mockReturnValue('s1t7d8c');
      ipfsService.pinJson.mockResolvedValue({ cid: 'mock_Qmabc', mock: true });
      sorobanService.postGist.mockResolvedValue({ gistId: '42', txHash: 'tx42', mock: true });
      gistRepository.create.mockResolvedValue(mockGist());
      cacheService.delPattern.mockResolvedValue();

      await service.create(dto);

      expect(gistRepository.create).toHaveBeenCalledWith({
        content: 'Test',
        lat: 9.0579,
        lon: 7.4951,
        location_cell: 's1t7d8c',
        content_hash: 'mock_Qmabc',
        stellar_gist_id: '42',
        tx_hash: 'tx42',
      });
    });

    it('returns the gist created by the repository', async () => {
      const dto: CreateGistDto = { content: 'Test', lat: 9.0579, lon: 7.4951 };
      const gist = mockGist();
      geoService.encode.mockReturnValue('s1t7d8c');
      ipfsService.pinJson.mockResolvedValue({ cid: 'cid1', mock: true });
      sorobanService.postGist.mockResolvedValue({ gistId: '1', txHash: 'tx', mock: true });
      gistRepository.create.mockResolvedValue(gist);
      cacheService.delPattern.mockResolvedValue();

      const result = await service.create(dto);

      expect(result).toBe(gist);
    });
  });

  describe('findNearby()', () => {
    const query: QueryGistsDto = { lat: 9.0579, lon: 7.4951, radius: 500, limit: 20 };
    const paginatedResult = {
      data: [mockGist()],
      pagination: { count: 1, cursor: null, hasMore: false },
    };

    it('returns cached result when cache hit occurs', async () => {
      cacheService.get.mockResolvedValue(paginatedResult);

      const result = await service.findNearby(query);

      expect(result).toBe(paginatedResult);
      expect(gistRepository.findNearby).not.toHaveBeenCalled();
    });

    it('calls GistRepository.findNearby on cache miss', async () => {
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue();
      gistRepository.findNearby.mockResolvedValue(paginatedResult);

      await service.findNearby(query);

      expect(gistRepository.findNearby).toHaveBeenCalledWith({
        lat: 9.0579,
        lon: 7.4951,
        radiusMeters: 500,
        limit: 20,
        cursor: undefined,
      });
    });

    it('skips cache and calls repository directly when cursor is present', async () => {
      const queryWithCursor = { ...query, cursor: '2026-01-01T00:00:00.000Z' };
      gistRepository.findNearby.mockResolvedValue(paginatedResult);

      await service.findNearby(queryWithCursor);

      expect(cacheService.get).not.toHaveBeenCalled();
      expect(gistRepository.findNearby).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: '2026-01-01T00:00:00.000Z' }),
      );
    });
  });

  describe('findOne()', () => {
    it('returns cached gist on cache hit', async () => {
      const gist = mockGist();
      cacheService.get.mockResolvedValue(gist);

      const result = await service.findOne('uuid-1');

      expect(result).toBe(gist);
      expect(gistRepository.findByGistId).not.toHaveBeenCalled();
    });

    it('calls GistRepository.findByGistId on cache miss', async () => {
      const gist = mockGist();
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue();
      gistRepository.findByGistId.mockResolvedValue(gist);

      const result = await service.findOne('uuid-1');

      expect(gistRepository.findByGistId).toHaveBeenCalledWith('uuid-1');
      expect(result).toBe(gist);
    });

    it('returns null when gist not found', async () => {
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue();
      gistRepository.findByGistId.mockResolvedValue(null);

      const result = await service.findOne('nonexistent');

      expect(result).toBeNull();
    });
  });
});
