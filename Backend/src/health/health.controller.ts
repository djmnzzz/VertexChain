import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Response } from 'express';

interface ServiceStatus {
  status: 'ok' | 'error';
  message?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    database: ServiceStatus;
    postgis: ServiceStatus;
  };
}

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Liveness + readiness in one shot.
   *
   * Contract:
   *   - HTTP 200 + body `status: "ok"`         when both DB and PostGIS probes pass.
   *   - HTTP 503 + body `status: "degraded"`   when either probe fails.
   *
   * The HTTP status code is intentionally coupled to the body's `status`
   * field so that Docker HEALTHCHECK (`wget --spider`) and Kubernetes
   * liveness probes flip to failing the moment a backing service errors
   * out, instead of silently reporting green for an unreachable system.
   * 503 still keeps a JSON body so consumers can inspect which service
   * degraded without needing a separate debug endpoint.
   *
   * Body shape is preserved exactly so existing scrapers (frontend,
   * analytics, monitoring) keep parsing the JSON unchanged.
   */
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const database = await this.checkDatabase();
    const postgis = await this.checkPostGIS();
    const allOk = database.status === 'ok' && postgis.status === 'ok';

    res.status(allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { database, postgis },
    };
  }

  private async checkDatabase(): Promise<ServiceStatus> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private async checkPostGIS(): Promise<ServiceStatus> {
    try {
      const result = await this.dataSource.query<{ version: string }[]>(
        `SELECT postgis_lib_version() AS version`,
      );
      return { status: 'ok', message: `PostGIS ${result[0].version}` };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }
}
