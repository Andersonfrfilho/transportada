/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_STATUS,
  SYNTHETIC_ACCESS_TOKEN,
  loadFutureModule,
} from './nfe-workspace.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_MODULE = '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

const SCHEDULED_LABEL_KEYS = [
  'scheduled.title',
  'scheduled.on',
  'scheduled.off',
  'scheduled.ready',
  'scheduled.blocked',
  'scheduled.nextWindow',
  'scheduled.nextRun',
  'scheduled.lastRun',
  'scheduled.lastRunFailed',
  'scheduled.neverRan',
] as const

type ScheduledDistributionContract = Readonly<{
  certificateExpiresAt: string | null
  eligible: boolean
  enabled: boolean
  ineligibilityReason: string | null
  lastAutomationImport: Readonly<{
    finishedAt: string | null
    receivedCount: number
    startedAt: string
    status: string
  }> | null
  nextAllowedAt: string | null
  nextScheduledRunAt: string
}>

type NfeWorkspaceClientModule = {
  readonly createNfeWorkspaceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    readonly getDistributionStatus: () => Promise<{
      readonly scheduled: ScheduledDistributionContract
    }>
  }
}

const SCHEDULED_ENABLED = {
  certificateExpiresAt: '2030-01-01T00:00:00.000Z',
  eligible: true,
  enabled: true,
  ineligibilityReason: null,
  lastAutomationImport: {
    finishedAt: '2026-08-01T04:31:00.000Z',
    receivedCount: 7,
    startedAt: '2026-08-01T04:30:00.000Z',
    status: 'completed',
  },
  nextAllowedAt: null,
  nextScheduledRunAt: '2026-08-01T05:00:00.000Z',
} as const satisfies ScheduledDistributionContract

function statusPayload(scheduled: unknown): Record<string, unknown> {
  return { ...DISTRIBUTION_STATUS, scheduled }
}

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readModule(filePath)) as Record<string, unknown>
}

function readLabel(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    return typeof current === 'object' && current !== null
      ? (current as Record<string, unknown>)[segment]
      : undefined
  }, locale)
}

async function distributionClient(body: unknown) {
  const { createNfeWorkspaceClient } =
    await loadFutureModule<NfeWorkspaceClientModule>(CLIENT_MODULE)
  return createNfeWorkspaceClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(Response.json({ data: body })),
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

describe('nfe scheduled distribution client contract', () => {
  test('o cursor de distribuição carrega o estado agendado servido pela API', async () => {
    const client = await distributionClient(statusPayload(SCHEDULED_ENABLED))

    expect((await client.getDistributionStatus()).scheduled).toEqual(SCHEDULED_ENABLED)
  })

  test('recusa um cursor sem o estado agendado', async () => {
    const withoutScheduled: Record<string, unknown> = { ...DISTRIBUTION_STATUS }
    delete withoutScheduled.scheduled
    const client = await distributionClient(withoutScheduled)

    const failure = await client.getDistributionStatus().catch((caught: unknown) => caught)
    expect(failure).toEqual(expect.objectContaining({ message: 'NFE_WORKSPACE_RESPONSE_INVALID' }))
  })

  test('recusa um estado agendado incompleto', async () => {
    const client = await distributionClient(statusPayload({ enabled: true, eligible: true }))

    const failure = await client.getDistributionStatus().catch((caught: unknown) => caught)
    expect(failure).toEqual(expect.objectContaining({ message: 'NFE_WORKSPACE_RESPONSE_INVALID' }))
  })
})

describe('nfe scheduled distribution presentation contract', () => {
  test('traduz cada rótulo do cartão nos dois catálogos', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'),
      readLocale('src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'),
    ])

    for (const key of SCHEDULED_LABEL_KEYS) {
      expect(readLabel(portuguese, key)).toBeString()
      expect(readLabel(english, key)).toBeString()
    }
  })

  test('a aba Remota mostra o cartão agendado sem reescrever o vocabulário de bloqueio', async () => {
    const [card, page] = await Promise.all([
      readModule('src/modules/nfe-workspace/components/NfeScheduledDistribution.component.tsx'),
      readModule('src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx'),
    ])

    expect(page).toContain('<NfeScheduledDistribution')
    expect(card).toContain('nextScheduledRunAt')
    expect(card).toContain('resolveIneligibilityLabelKey')
    expect(card).not.toContain("ns: 'companySettings'")
    expect(card).not.toContain('<svg')
    expect(card).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
