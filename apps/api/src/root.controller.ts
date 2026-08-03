import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  /** Railway / browser hits `/` — Nest has no default index route. */
  @Get()
  index() {
    return {
      ok: true,
      service: 'island-ledger-api',
      health: '/health',
      ready: '/health/ready',
    };
  }
}
