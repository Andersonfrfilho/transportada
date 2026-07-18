import { describe, expect, it } from 'vitest'
import { WorkerHealthService } from '../src/health.service.js'

describe('WorkerHealthService', () => {
  it('reports liveness independently from external dependencies', () => {
    const service = Object.create(WorkerHealthService.prototype) as WorkerHealthService
    expect(service.live()).toMatchObject({ status: 'ok', service: 'worker' })
  })
})
