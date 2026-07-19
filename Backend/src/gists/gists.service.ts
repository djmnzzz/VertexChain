import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateGistDto } from './dto/create-gist.dto';
import { QueryGistsDto } from './dto/query-gists.dto';
import { UpdateGistDto } from './dto/update-gist.dto';
import { GistRepository } from './gist.repository';
import { GeoService } from '../geo/geo.service';
import { IpfsService } from '../ipfs/ipfs.service';
import { SorobanService } from '../soroban/soroban.service';
import { CacheService } from '../cache/cache.service';
import { Gist } from './entities/gist.entity';
import { PaginatedResponse } from '../common/utils/pagination.helper';
import { stripHtml } from '../common/utils/sanitize';

const EDIT_WINDOW_MS = 60_000;

@Injectable()
export class GistsService {
  private readonly logger = new Logger(GistsService.name);

  constructor(
    private readonly gistRepository: GistRepository,
    private readonly geoService: GeoService,
    private readonly ipfsService: IpfsService,
    private readonly sorobanService: SorobanService,
    private readonly cacheService: CacheService,
  ) {}

  async create(dto: CreateGistDto): Promise<Gist> {
    // Issue 87 — sanitize content before storing
    const content = stripHtml(dto.content);

    const locationCell = this.geoService.encode(dto.lat, dto.lon);

    const { cid } = await this.ipfsService.pinJson({
      content,
      lat: dto.lat,
      lon: dto.lon,
      location_cell: locationCell,
      created_at: new Date().toISOString(),
    });

    const { gistId, txHash } = await this.sorobanService.postGist(locationCell, cid, dto.author);

    this.logger.log(`Gist posted → cell=${locationCell} cid=${cid} gistId=${gistId}`);

    const gist = await this.gistRepository.create({
      content,
      lat: dto.lat,
      lon: dto.lon,
      location_cell: locationCell,
      content_hash: cid,
      stellar_gist_id: gistId,
      tx_hash: txHash,
      author: dto.author,
    });

    // Invalidate nearby cache for the affected area
    await this.invalidateNearbyCache(dto.lat, dto.lon);

    return gist;
  }

  async createBatch(dtos: CreateGistDto[]): Promise<Gist[]> {
    const createdAt = new Date().toISOString();
    const prepared = dtos.map((dto) => {
      const content = stripHtml(dto.content);
      const locationCell = this.geoService.encode(dto.lat, dto.lon);

      return {
        dto,
        content,
        locationCell,
        payload: {
          content,
          lat: dto.lat,
          lon: dto.lon,
          location_cell: locationCell,
          created_at: createdAt,
        },
      };
    });

    const pins = await this.ipfsService.pinJsonBatch(prepared.map(({ payload }) => payload));

    const gists = await Promise.all(
      prepared.map(async ({ dto, content, locationCell }, index) => {
        const { cid } = pins[index];
        const { gistId, txHash } = await this.sorobanService.postGist(
          locationCell,
          cid,
          dto.author,
        );

        this.logger.log(`Batch gist posted → cell=${locationCell} cid=${cid} gistId=${gistId}`);

        return this.gistRepository.create({
          content,
          lat: dto.lat,
          lon: dto.lon,
          location_cell: locationCell,
          content_hash: cid,
          stellar_gist_id: gistId,
          tx_hash: txHash,
        });
      }),
    );

    await Promise.all(
      [...new Map(dtos.map(({ lat, lon }) => [`${lat}:${lon}`, { lat, lon }])).values()].map(
        ({ lat, lon }) => this.invalidateNearbyCache(lat, lon),
      ),
    );

    return gists;
  }

  async findNearby(query: QueryGistsDto): Promise<PaginatedResponse<Gist>> {
    // Don't cache paginated results (when cursor is present)
    if (query.cursor) {
      return this.gistRepository.findNearby({
        lat: query.lat,
        lon: query.lon,
        radiusMeters: query.radius,
        limit: query.limit,
        cursor: query.cursor,
      });
    }

    const cacheKey = `gist:nearby:${query.lat}:${query.lon}:${query.radius || 500}:${query.limit || 20}`;
    const cached = await this.cacheService.get<PaginatedResponse<Gist>>(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for nearby query: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Cache miss for nearby query: ${cacheKey}`);
    const result = await this.gistRepository.findNearby({
      lat: query.lat,
      lon: query.lon,
      radiusMeters: query.radius,
      limit: query.limit,
      cursor: query.cursor,
    });

    // Cache for 60 seconds
    await this.cacheService.set(cacheKey, result, 60);

    return result;
  }

  async findOne(id: string): Promise<Gist | null> {
    const cacheKey = `gist:one:${id}`;
    const cached = await this.cacheService.get<Gist>(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for gist: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Cache miss for gist: ${cacheKey}`);
    const result = await this.gistRepository.findByGistId(id);

    if (result) {
      // Cache for 300 seconds (5 minutes)
      await this.cacheService.set(cacheKey, result, 300);
    }

    return result;
  }

  async update(id: string, dto: UpdateGistDto): Promise<Gist> {
    const gist = await this.gistRepository.findByGistId(id);

    if (!gist) {
      throw new NotFoundException(`Gist ${id} not found`);
    }

    const elapsedMs = Date.now() - new Date(gist.created_at).getTime();
    if (elapsedMs > EDIT_WINDOW_MS) {
      throw new HttpException('Edit window has closed for this gist', HttpStatus.GONE);
    }

    if (!gist.author || gist.author !== dto.author) {
      throw new ForbiddenException('Only the original author may edit this gist');
    }

    const content = stripHtml(dto.content);

    const { cid } = await this.ipfsService.pinJson({
      content,
      lat: gist.lat,
      lon: gist.lon,
      location_cell: gist.location_cell,
      created_at: new Date().toISOString(),
    });

    const updated = await this.gistRepository.update(id, {
      content,
      content_hash: cid,
      previous_cid: gist.content_hash,
      edited_at: new Date(),
    });

    this.logger.log(`Gist edited → id=${id} previous_cid=${gist.content_hash} new_cid=${cid}`);

    await this.cacheService.del(`gist:one:${id}`);
    await this.invalidateNearbyCache(gist.lat, gist.lon);

    return updated as Gist;
  }

  private async invalidateNearbyCache(lat: number, lon: number): Promise<void> {
    // Invalidate all nearby cache keys for this area
    // We use a pattern to match all nearby queries
    const pattern = `gist:nearby:${lat.toFixed(4)}:${lon.toFixed(4)}:*`;
    await this.cacheService.delPattern(pattern);
    this.logger.debug(`Invalidated nearby cache pattern: ${pattern}`);
  }
}
