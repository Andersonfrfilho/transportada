/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createGetNfeDistributionStatusUseCase } from '../../src/nfe-imports/application/get-nfe-distribution-status.use-case.js'
import type {
  NfeDistributionCursorSnapshot,
  NfeDistributionStatusReaderPort,
} from '../../src/nfe-imports/application/nfe-import.types.js'
import { COMPANY_CONTEXT, COMPANY_ID } from '../fixtures/nfe-import-application.fixture'
import { captureApiError } from '../fixtures/nfe-import-use-case.fixture'

const NOW = new Date('2026-07-24T12:00:00.000Z')
const DEFAULT_NSU = '000000000000000'

describe('nfe distribution status application contract', () => {
  test('reports pullable state with defaults when the tenant never pulled', async () => {
    const reader = new StatusReaderFixture({ cursor: null, environment: 'homologation' })
    const useCase = createGetNfeDistributionStatusUseCase({ clock: fixedClock(), reader })

    const status = await useCase.execute({ context: COMPANY_CONTEXT })

    expect(reader.readCompanyIds).toEqual([COMPANY_ID])
    expect(status).toEqual({
      canPull: true,
      environment: 'homologation',
      lastPulledAt: null,
      maxNsu: DEFAULT_NSU,
      nextAllowedAt: null,
      pullInProgress: false,
      ultNsu: DEFAULT_NSU,
    })
  })

  test('blocks pulling while the SEFAZ cooldown has not elapsed', async () => {
    const reader = new StatusReaderFixture({
      cursor: {
        leaseExpiresAt: null,
        maxNsu: '000000000000200',
        nextAllowedAt: '2026-07-24T12:45:00.000Z',
        ultNsu: '000000000000180',
        updatedAt: '2026-07-24T11:45:00.000Z',
      },
      environment: 'production',
    })
    const useCase = createGetNfeDistributionStatusUseCase({ clock: fixedClock(), reader })

    const status = await useCase.execute({ context: COMPANY_CONTEXT })

    expect(status).toEqual({
      canPull: false,
      environment: 'production',
      lastPulledAt: '2026-07-24T11:45:00.000Z',
      maxNsu: '000000000000200',
      nextAllowedAt: '2026-07-24T12:45:00.000Z',
      pullInProgress: false,
      ultNsu: '000000000000180',
    })
  })

  test('allows pulling once the cooldown deadline is in the past', async () => {
    const reader = new StatusReaderFixture({
      cursor: {
        leaseExpiresAt: null,
        maxNsu: '000000000000200',
        nextAllowedAt: '2026-07-24T11:15:00.000Z',
        ultNsu: '000000000000200',
        updatedAt: '2026-07-24T11:00:00.000Z',
      },
      environment: 'homologation',
    })
    const useCase = createGetNfeDistributionStatusUseCase({ clock: fixedClock(), reader })

    const status = await useCase.execute({ context: COMPANY_CONTEXT })

    expect(status.canPull).toBe(true)
    expect(status.pullInProgress).toBe(false)
    expect(status.nextAllowedAt).toBe('2026-07-24T11:15:00.000Z')
  })

  test('reports an in-progress pull while a lease is held and blocks re-pulling', async () => {
    const reader = new StatusReaderFixture({
      cursor: {
        leaseExpiresAt: '2026-07-24T12:00:30.000Z',
        maxNsu: '000000000000200',
        nextAllowedAt: null,
        ultNsu: '000000000000180',
        updatedAt: '2026-07-24T12:00:00.000Z',
      },
      environment: 'homologation',
    })
    const useCase = createGetNfeDistributionStatusUseCase({ clock: fixedClock(), reader })

    const status = await useCase.execute({ context: COMPANY_CONTEXT })

    expect(status.pullInProgress).toBe(true)
    expect(status.canPull).toBe(false)
  })

  test('rejects reading status without leaking the tenant when distribution is not configured', async () => {
    const reader = new StatusReaderFixture(null)
    const useCase = createGetNfeDistributionStatusUseCase({ clock: fixedClock(), reader })

    const error = await captureApiError(() => useCase.execute({ context: COMPANY_CONTEXT }))

    expect(error).toMatchObject({
      code: 'NFE_DISTRIBUTION_NOT_CONFIGURED',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_ID)
  })
})

function fixedClock(): { now(): Date } {
  return { now: () => NOW }
}

type StatusReaderResult = {
  readonly cursor: NfeDistributionCursorSnapshot
  readonly environment: 'homologation' | 'production'
} | null

class StatusReaderFixture implements NfeDistributionStatusReaderPort {
  public readonly readCompanyIds: string[] = []
  readonly #result: StatusReaderResult

  constructor(result: StatusReaderResult) {
    this.#result = result
  }

  async read(input: { readonly companyId: string }): Promise<StatusReaderResult> {
    this.readCompanyIds.push(input.companyId)
    return this.#result
  }
}
