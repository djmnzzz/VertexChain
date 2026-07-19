import {
  ArgumentMetadata,
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseArrayPipe,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiTags, ApiParam, ApiResponse } from '@nestjs/swagger';
import { GistsService } from './gists.service';
import { CreateGistDto } from './dto/create-gist.dto';
import { QueryGistsDto } from './dto/query-gists.dto';
import { UpdateGistDto } from './dto/update-gist.dto';

const MAX_GISTS_PER_BATCH = 10;

class ParseGistsBatchPipe extends ParseArrayPipe {
  constructor() {
    super({ items: CreateGistDto });
  }

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<CreateGistDto[]> {
    const dtos = (await super.transform(value, metadata)) as CreateGistDto[];
    if (dtos.length === 0 || dtos.length > MAX_GISTS_PER_BATCH) {
      throw new BadRequestException(
        `Batch must contain between 1 and ${MAX_GISTS_PER_BATCH} gists`,
      );
    }
    return dtos;
  }
}

@ApiTags('gists')
@Controller('gists')
export class GistsController {
  constructor(private readonly gistsService: GistsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Post a new anonymous gist at a location' })
  create(@Body() dto: CreateGistDto) {
    return this.gistsService.create(dto);
  }

  @Post('batch')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Post several anonymous gists in one burst' })
  @ApiBody({ type: [CreateGistDto] })
  createBatch(
    @Body(new ParseGistsBatchPipe())
    dtos: CreateGistDto[],
  ) {
    return this.gistsService.createBatch(dtos);
  }

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Find gists near a location' })
  findNearby(@Query() query: QueryGistsDto) {
    return this.gistsService.findNearby(query);
  }

  @Get(':id')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get a single gist by ID' })
  @ApiParam({ name: 'id', description: 'Gist UUID' })
  findOne(@Param('id') id: string) {
    return this.gistsService.findOne(id);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Correct a gist within its 60s edit window (same author only)',
  })
  @ApiParam({ name: 'id', description: 'Gist UUID' })
  @ApiResponse({ status: 403, description: 'Caller is not the original author' })
  @ApiResponse({ status: 410, description: 'Edit window has closed' })
  update(@Param('id') id: string, @Body() dto: UpdateGistDto) {
    return this.gistsService.update(id, dto);
  }
}
