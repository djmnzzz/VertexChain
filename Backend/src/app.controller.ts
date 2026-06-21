import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return this.appService.health();
  }

  @Get('csrf-token')
  csrfToken(@Req() req: Request) {
    return { csrfToken: (req as any).csrfToken?.() };
  }
}
