/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_STATUS,
  DISTRIBUTION_STATUS_COOLDOWN,
  DISTRIBUTION_STATUS_RUNNING,
  SYNTHETIC_ACCESS_TOKEN,
  loadFutureModule,
} from './nfe-workspace.fixture'

const STATUS_PATH = '/nfe-imports/distribution'

describe('nfe distribution status client contract', () => {
  test('reads the distribution status with an authenticated no-store GET request', async () => {
    const requests: Request[] = []
    const { createNfeWorkspaceClient } = await loadFutureModule<NfeWorkspaceClientModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(Response.json({ data: DISTRIBUTION_STATUS }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(await client.getDistributionStatus()).toEqual(DISTRIBUTION_STATUS)

    const [statusRequest] = requests
    if (statusRequest === undefined) {
      throw new Error('NFE_DISTRIBUTION_STATUS_REQUEST_MISSING')
    }
    expect(statusRequest.url).toBe(`https://api.example.test${STATUS_PATH}`)
    expect(statusRequest.method).toBe('GET')
    expect(statusRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(statusRequest.cache).toBe('no-store')
  })

  test('rejects a distribution status payload missing required fields', async () => {
    const { createNfeWorkspaceClient } = await loadFutureModule<NfeWorkspaceClientModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )
    const withoutCanPull: Record<string, unknown> = { ...DISTRIBUTION_STATUS }
    delete withoutCanPull.canPull
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(Response.json({ data: withoutCanPull })),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const failure = await client.getDistributionStatus().catch((caught: unknown) => caught)
    expect(failure).toEqual(expect.objectContaining({ message: 'NFE_WORKSPACE_RESPONSE_INVALID' }))
  })
})

describe('nfe distribution pull control contract', () => {
  test('allows an emergency pull when the cursor is idle and outside the cooldown', async () => {
    const { createNfeDistributionPullControl } =
      await loadFutureModule<NfeDistributionPullControlModule>(
        '../../src/modules/nfe-workspace/shared/nfeDistributionPull.service',
      )

    expect(
      createNfeDistributionPullControl({
        now: new Date('2026-07-22T14:00:00.000Z'),
        status: DISTRIBUTION_STATUS,
      }),
    ).toEqual({
      canTrigger: true,
      environment: 'homologation',
      lastPulledAt: '2026-07-22T13:40:00.000Z',
      tone: 'ready',
    })
  })

  test('blocks a pull while a distribution run is already in progress', async () => {
    const { createNfeDistributionPullControl } =
      await loadFutureModule<NfeDistributionPullControlModule>(
        '../../src/modules/nfe-workspace/shared/nfeDistributionPull.service',
      )

    expect(
      createNfeDistributionPullControl({
        now: new Date('2026-07-22T14:00:00.000Z'),
        status: DISTRIBUTION_STATUS_RUNNING,
      }),
    ).toEqual({
      canTrigger: false,
      environment: 'homologation',
      lastPulledAt: '2026-07-22T13:40:00.000Z',
      reason: 'in-progress',
      tone: 'busy',
    })
  })

  test('blocks a pull inside the SEFAZ cooldown window and reports the retry delay', async () => {
    const { createNfeDistributionPullControl } =
      await loadFutureModule<NfeDistributionPullControlModule>(
        '../../src/modules/nfe-workspace/shared/nfeDistributionPull.service',
      )

    expect(
      createNfeDistributionPullControl({
        now: new Date('2026-07-22T14:00:00.000Z'),
        status: DISTRIBUTION_STATUS_COOLDOWN,
      }),
    ).toEqual({
      canTrigger: false,
      environment: 'homologation',
      lastPulledAt: '2026-07-22T13:40:00.000Z',
      nextAllowedAt: '2026-07-22T14:30:00.000Z',
      reason: 'cooldown',
      retryAfterSeconds: 1_800,
      tone: 'cooldown',
    })
  })

  test('formats the remaining cooldown seconds as a mm:ss countdown', async () => {
    const { formatCountdown } = await loadFutureModule<NfeDistributionPullControlModule>(
      '../../src/modules/nfe-workspace/shared/nfeDistributionPull.service',
    )

    expect(formatCountdown(1_800)).toBe('30:00')
    expect(formatCountdown(65)).toBe('01:05')
    expect(formatCountdown(5)).toBe('00:05')
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(-30)).toBe('00:00')
    expect(formatCountdown(Number.NaN)).toBe('00:00')
  })

  test('reports an unavailable control before the status is known', async () => {
    const { createNfeDistributionPullControl } =
      await loadFutureModule<NfeDistributionPullControlModule>(
        '../../src/modules/nfe-workspace/shared/nfeDistributionPull.service',
      )

    expect(
      createNfeDistributionPullControl({
        now: new Date('2026-07-22T14:00:00.000Z'),
        status: undefined,
      }),
    ).toEqual({
      canTrigger: false,
      environment: null,
      lastPulledAt: null,
      reason: 'unavailable',
      tone: 'unavailable',
    })
  })
})

type NfeDistributionStatus = {
  readonly canPull: boolean
  readonly environment: 'homologation' | 'production'
  readonly lastPulledAt: null | string
  readonly maxNsu: string
  readonly nextAllowedAt: null | string
  readonly pullInProgress: boolean
  readonly ultNsu: string
}

type NfeWorkspaceClientModule = {
  readonly createNfeWorkspaceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    readonly getDistributionStatus: () => Promise<NfeDistributionStatus>
  }
}

type NfeDistributionPullControlModule = {
  readonly createNfeDistributionPullControl: (input: {
    readonly now: Date
    readonly status: NfeDistributionStatus | undefined
  }) => {
    readonly canTrigger: boolean
    readonly environment: 'homologation' | 'production' | null
    readonly lastPulledAt: null | string
    readonly nextAllowedAt?: null | string
    readonly reason?: 'cooldown' | 'in-progress' | 'unavailable'
    readonly retryAfterSeconds?: number
    readonly tone: 'busy' | 'cooldown' | 'ready' | 'unavailable'
  }
  readonly formatCountdown: (totalSeconds: number) => string
}
