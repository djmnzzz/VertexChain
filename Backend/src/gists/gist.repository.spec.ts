import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { GistRepository } from './gist.repository';
import { Gist } from './entities/gist.entity';
import { DatabaseModule } from '../database/database.module';

type GistWithCoords = Gist & { lat: number; lon: number; distance_meters?: number };

// The GitHub Actions CI runner does not provide a Postgres container.
// Skip the integration suite in CI; run it locally with a real DB or via `npm run test:e2e`.
const describeIntegration = process.env.CI ? describe.skip : describe;

describeIntegration('GistRepository (integration)', () => {
  let repository: GistRepository;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        TypeOrmModule.forFeature([Gist]),
      ],
      providers: [GistRepository],
    }).compile();

    repository = module.get<GistRepository>(GistRepository);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('create', () => {
    it('should persist a gist and return it with lat/lon', async () => {
      const gist = (await repository.create({
        content: 'integration test gist',
        lat: 9.0579,
        lon: 7.4951,
        location_cell: 's1t7d8c',
        content_hash: 'mock_test_cid',
      })) as GistWithCoords;

      expect(gist.id).toBeDefined();
      expect(gist.content).toBe('integration test gist');
      expect(gist.location_cell).toBe('s1t7d8c');
      expect(Number(gist.lat)).toBeCloseTo(9.0579, 3);
      expect(Number(gist.lon)).toBeCloseTo(7.4951, 3);
      expect(gist.created_at).toBeDefined();
    });

    it('should persist the author', async () => {
      const gist = await repository.create({
        content: 'authored gist',
        lat: 9.0579,
        lon: 7.4951,
        content_hash: 'mock_test_cid',
        author: 'GABC...XYZ',
      });

      expect(gist.author).toBe('GABC...XYZ');
    });
  });

  describe('findNearby', () => {
    it('should find gists within radius using ST_DWithin', async () => {
      await repository.create({
        content: 'nearby test',
        lat: 9.058,
        lon: 7.495,
        location_cell: 's1t7d8c',
      });

      const result = await repository.findNearby({
        lat: 9.0579,
        lon: 7.4951,
        radiusMeters: 500,
        limit: 10,
      });

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.count).toBeGreaterThan(0);

      for (const gist of result.data as GistWithCoords[]) {
        expect(gist.distance_meters).toBeDefined();
      }
    });

    it('should not find gists outside the radius', async () => {
      const result = await repository.findNearby({
        lat: 51.5074,
        lon: -0.1278,
        radiusMeters: 100,
        limit: 10,
      });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should respect the limit parameter', async () => {
      const result = await repository.findNearby({
        lat: 9.0579,
        lon: 7.4951,
        radiusMeters: 5000,
        limit: 2,
      });

      expect(result.data.length).toBeLessThanOrEqual(2);
    });

    it('should support cursor pagination', async () => {
      const page1 = await repository.findNearby({
        lat: 9.0579,
        lon: 7.4951,
        radiusMeters: 5000,
        limit: 2,
      });

      if (page1.pagination.hasMore && page1.pagination.cursor) {
        const page2 = await repository.findNearby({
          lat: 9.0579,
          lon: 7.4951,
          radiusMeters: 5000,
          limit: 2,
          cursor: page1.pagination.cursor,
        });

        const page1Ids = new Set(page1.data.map((g) => g.id));
        for (const gist of page2.data) {
          expect(page1Ids.has(gist.id)).toBe(false);
        }
      }
    });
  });

  describe('findByGistId', () => {
    it('should retrieve a gist by its UUID', async () => {
      const created = await repository.create({
        content: 'findById test',
        lat: 9.0579,
        lon: 7.4951,
      });

      const found = await repository.findByGistId(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.content).toBe('findById test');
    });

    it('should return null for a non-existent ID', async () => {
      const result = await repository.findByGistId('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update content and record CID lineage', async () => {
      const created = await repository.create({
        content: 'before edit',
        lat: 9.0579,
        lon: 7.4951,
        content_hash: 'cid_before',
        author: 'GABC...XYZ',
      });

      const editedAt = new Date();
      const updated = await repository.update(created.id, {
        content: 'after edit',
        content_hash: 'cid_after',
        previous_cid: 'cid_before',
        edited_at: editedAt,
      });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('after edit');
      expect(updated!.content_hash).toBe('cid_after');
      expect(updated!.previous_cid).toBe('cid_before');
      expect(updated!.edited_at).toBeDefined();
    });

    it('should return null for a non-existent ID', async () => {
      const result = await repository.update('00000000-0000-0000-0000-000000000000', {
        content: 'no-op',
        content_hash: 'cid',
        previous_cid: null,
        edited_at: new Date(),
      });
      expect(result).toBeNull();
    });
  });
});
