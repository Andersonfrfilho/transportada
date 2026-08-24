/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_STATUS,
  SYNTHETIC_ACCESS_TOKEN,
  loadFutureModule,
} from './nfe-workspace.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_MODULE = '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
const CATALOG_MODULE = '../../src/modules/shared/jobCatalog.constant'

/**
 * A janela e o botão contam a mesma história: os dois fecham uma linha de `job_executions`, e é
 * essa linha que a aba Remota mostra. Sem ela, o ciclo agendado seria invisível para quem só vê a
 * tela — a puxada manual aparecia, a automática não.
 */
const MANUAL_RUN = {
  counters: { enqueuedImports: 1 },
  finishedAt: '2026-08-23T13:40:02.000Z',
  origin: 'manual',
  outcome: 'succeeded',
  startedAt: '2026-08-23T13:40:00.000Z',
} as const

const SCHEDULED_REFUSAL = {
  counters: {},
  finishedAt: '2026-08-23T14:00:01.000Z',
  origin: 'schedule',
  outcome: 'cooldown_active',
  startedAt: '2026-08-23T14:00:00.000Z',
} as const

type NfeWorkspaceClientModule = {
  readonly createNfeWorkspaceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => { readonly getDistributionStatus: () => Promise<Record<string, unknown>> }
}

type JobCatalogModule = {
  readonly JOB_OUTCOMES: Readonly<Record<string, readonly string[]>>
}

async function statusClient(body: unknown) {
  const { createNfeWorkspaceClient } =
    await loadFutureModule<NfeWorkspaceClientModule>(CLIENT_MODULE)
  return createNfeWorkspaceClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(Response.json({ data: body })),
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Bun.file(new URL(filePath, APPLICATION_ROOT)).text()) as Record<
    string,
    unknown
  >
}

describe('nfe distribution last job run contract', () => {
  test('carrega a última execução da rotina ao lado do cursor', async () => {
    const client = await statusClient({ ...DISTRIBUTION_STATUS, lastRun: MANUAL_RUN })

    expect((await client.getDistributionStatus()).lastRun).toEqual(MANUAL_RUN)
  })

  test('a execução agendada recusada chega com o código estável da rotina', async () => {
    const client = await statusClient({ ...DISTRIBUTION_STATUS, lastRun: SCHEDULED_REFUSAL })

    expect((await client.getDistributionStatus()).lastRun).toEqual(SCHEDULED_REFUSAL)
  })

  test('instalação que nunca rodou a rotina chega com nulo, não com execução inventada', async () => {
    const client = await statusClient({ ...DISTRIBUTION_STATUS, lastRun: null })

    expect((await client.getDistributionStatus()).lastRun).toBeNull()
  })

  test('recusa uma execução cujo desfecho não é do vocabulário da rotina', async () => {
    const client = await statusClient({
      ...DISTRIBUTION_STATUS,
      lastRun: { ...MANUAL_RUN, outcome: 'anp_unreachable' },
    })

    expect(client.getDistributionStatus()).rejects.toThrow('NFE_WORKSPACE_RESPONSE_INVALID')
  })

  test('recusa um contador que não é número', async () => {
    const client = await statusClient({
      ...DISTRIBUTION_STATUS,
      lastRun: { ...MANUAL_RUN, counters: { enqueuedImports: 'um' } },
    })

    expect(client.getDistributionStatus()).rejects.toThrow('NFE_WORKSPACE_RESPONSE_INVALID')
  })

  test('cada desfecho da rotina tem rótulo nos dois catálogos', async () => {
    const { JOB_OUTCOMES } = await loadFutureModule<JobCatalogModule>(CATALOG_MODULE)
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'),
      readLocale('src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'),
    ])

    for (const catalog of [portuguese, english]) {
      const distribution = catalog.distribution as Record<string, unknown>
      const outcomes = distribution.jobOutcome as Record<string, unknown>
      expect(distribution.lastJobRun).toBeString()
      expect(distribution.lastJobRunNever).toBeString()
      expect(distribution.lastJobRunRunning).toBeString()
      for (const outcome of JOB_OUTCOMES['nfe.distribution.pull'] ?? []) {
        expect(outcomes[outcome]).toBeString()
      }
    }
  })
})
