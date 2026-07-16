jest.mock('../common/utils/sanitize', () => ({
  stripHtml: jest.fn((text: string) => text.replace(/<[^>]*>/g, '')),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { GistsController } from './gists.controller';
import { GistsService } from './gists.service';
import { CreateGistDto } from './dto/create-gist.dto';
import { QueryGistsDto } from './dto/query-gists.dto';
import { Gist } from './entities/gist.entity';
import { PaginatedResponse } from '../common/utils/pagination.helper';
describe('GistsController', () => {
  let controller: GistsController;
  let service: GistsService;

  beforeEach(async () => {
    const mockGistsService = {
      create: jest.fn(),
      createBatch: jest.fn(),
      findNearby: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GistsController],
      providers: [
        {
          provide: GistsService,
          useValue: mockGistsService,
        },
      ],
    }).compile();

    controller = module.get<GistsController>(GistsController);
    service = module.get<GistsService>(GistsService);
  });

  describe('createBatch()', () => {
    it('should pass the gist list to gistsService.createBatch', async () => {
      const gists: CreateGistDto[] = [
        { content: 'First', lat: 9.0579, lon: 7.4951 },
        { content: 'Second', lat: 9.058, lon: 7.4952 },
      ];
      const result = gists.map((gist, index) =>
        createMockGist({ id: `gist-${index}`, content: gist.content }),
      );
      jest.spyOn(service, 'createBatch').mockResolvedValueOnce(result);

      await expect(controller.createBatch(gists)).resolves.toEqual(result);
      expect(service.createBatch).toHaveBeenCalledWith(gists);
    });
  });

  // Helper to create mock Gist objects
  const createMockGist = (overrides?: Partial<Gist>): Gist => {
    return {
      id: '123e4567-e89b-12d3-a456-426614174000',
      content: 'Great coffee spot here!',
      location_cell: 's0y21',
      content_hash: 'abc123hash',
      stellar_gist_id: null,
      tx_hash: null,
      location: 'POINT(7.4951 9.0579)',
      created_at: new Date('2026-03-25T04:34:31.334Z'),
      ...overrides,
    };
  };

  describe('create()', () => {
    it('should call gistsService.create with the provided DTO', async () => {
      const dto: CreateGistDto = {
        content: 'Great coffee spot here!',
        lat: 9.0579,
        lon: 7.4951,
        author: 'GABC...XYZ',
      };
      const result = createMockGist({ content: dto.content });

      jest.spyOn(service, 'create').mockResolvedValueOnce(result);

      const response = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(response).toEqual(result);
    });

    it('should call gistsService.create without optional author field', async () => {
      const dto: CreateGistDto = {
        content: 'Another gist',
        lat: 9.0579,
        lon: 7.4951,
      };
      const result = createMockGist({ content: dto.content });

      jest.spyOn(service, 'create').mockResolvedValueOnce(result);

      const response = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(response).toEqual(result);
    });

    it('should propagate errors from the service', async () => {
      const dto: CreateGistDto = {
        content: 'test gist',
        lat: 9.0579,
        lon: 7.4951,
      };
      const error = new Error('Database error');

      jest.spyOn(service, 'create').mockRejectedValueOnce(error);

      await expect(controller.create(dto)).rejects.toThrow('Database error');
    });
  });

  describe('findNearby()', () => {
    it('should call gistsService.findNearby with the provided query', async () => {
      const query: QueryGistsDto = {
        lat: 9.0579,
        lon: 7.4951,
        radius: 500,
        limit: 20,
      };
      const mockGist = createMockGist();
      const result: PaginatedResponse<Gist> = {
        data: [mockGist],
        pagination: {
          count: 1,
          cursor: 'MjAyNi0wMy0yNVQwNDozNDozMS4zMzRa',
          hasMore: false,
        },
      };

      jest.spyOn(service, 'findNearby').mockResolvedValueOnce(result);

      const response = await controller.findNearby(query);

      expect(service.findNearby).toHaveBeenCalledWith(query);
      expect(response).toEqual(result);
    });

    it('should handle empty results', async () => {
      const query: QueryGistsDto = {
        lat: 9.0579,
        lon: 7.4951,
        radius: 500,
      };
      const result: PaginatedResponse<Gist> = {
        data: [],
        pagination: {
          count: 0,
          cursor: null,
          hasMore: false,
        },
      };

      jest.spyOn(service, 'findNearby').mockResolvedValueOnce(result);

      const response = await controller.findNearby(query);

      expect(response).toEqual(result);
      expect(response.data).toHaveLength(0);
    });

    it('should pass cursor parameter for pagination', async () => {
      const query: QueryGistsDto = {
        lat: 9.0579,
        lon: 7.4951,
        cursor: '2026-03-25T04:34:31.334Z',
      };
      const mockGist = createMockGist({
        id: '223e4567-e89b-12d3-a456-426614174000',
      });
      const result: PaginatedResponse<Gist> = {
        data: [mockGist],
        pagination: {
          count: 1,
          cursor: null,
          hasMore: false,
        },
      };

      jest.spyOn(service, 'findNearby').mockResolvedValueOnce(result);

      const response = await controller.findNearby(query);

      expect(service.findNearby).toHaveBeenCalledWith(query);
      expect(response.pagination.hasMore).toBe(false);
    });
  });

  describe('findOne()', () => {
    it('should call gistsService.findOne with the provided ID', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const result = createMockGist({ id });

      jest.spyOn(service, 'findOne').mockResolvedValueOnce(result);

      const response = await controller.findOne(id);

      expect(service.findOne).toHaveBeenCalledWith(id);
      expect(response).toEqual(result);
      expect(response.id).toBe(id);
    });

    it('should propagate not found errors', async () => {
      const id = '999e4567-e89b-12d3-a456-426614174000';
      const error = new Error('Gist not found');

      jest.spyOn(service, 'findOne').mockRejectedValueOnce(error);

      await expect(controller.findOne(id)).rejects.toThrow('Gist not found');
    });
  });
});
