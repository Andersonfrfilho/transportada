import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { HealthController } from '../src/health.controller.js'
import { HealthService } from '../src/health.service.js'

describe('HealthController', () => {
  it('reports the process as live without checking dependencies', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            live: () => ({
              status: 'ok',
              service: 'api',
              timestamp: '2026-07-18T00:00:00.000Z',
            }),
          },
        },
      ],
    }).compile()

    expect(module.get(HealthController).live()).toMatchObject({
      status: 'ok',
      service: 'api',
    })
  })
})
