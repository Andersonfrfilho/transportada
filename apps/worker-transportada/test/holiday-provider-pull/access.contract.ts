/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T4.2 (CA7): a etapa de busca lê a chave e o orçamento da instalação a cada ciclo. Sem chave ou com a
 * chave ilegível nenhuma busca é montada (0 requisições) e a descoberta e a aplicação, que só tocam o banco,
 * rodam do mesmo jeito; com a chave, a busca é montada com a chave e o orçamento que o leitor devolveu NAQUELE
 * ciclo (trocar entre dois ciclos vale no segundo).
 */
import { describe, expect, test } from 'bun:test'

import type { ApplyHolidayProviderUseCase } from '../../src/holiday-provider-pull/application/apply-holiday-provider.use-case.js'
import type { DiscoverHolidayCitiesUseCase } from '../../src/holiday-provider-pull/application/discover-holiday-cities.use-case.js'
import { createFetchHolidayProviderWithAccessUseCase } from '../../src/holiday-provider-pull/application/fetch-holiday-provider-with-access.use-case.js'
import type { FetchTally } from '../../src/holiday-provider-pull/application/fetch-holiday-provider.use-case.js'
import type {
  HolidayProviderAccess,
  HolidayProviderAccessReader,
} from '../../src/holiday-provider-pull/application/holiday-provider-access.port.js'
import { createHolidayProviderPullRoutine } from '../../src/holiday-provider-pull/application/holiday-provider-pull.routine.js'

const TOKEN = 'FAKE-feriados-key-Q7zK-0123456789'
const RENEWED_TOKEN = 'FAKE-renewed-key-Q7zK-9876543210'
const STOP_NEVER = () => false

function buildReader(...answers: Array<HolidayProviderAccess | Error>): {
  readonly reader: HolidayProviderAccessReader
  readonly reads: () => number
} {
  let reads = 0
  return {
    reader: {
      readAccess: async () => {
        const answer = answers[Math.min(reads, answers.length - 1)]
        reads += 1
        if (answer instanceof Error) throw answer
        if (answer === undefined) throw new Error('no scripted answer')
        return answer
      },
    },
    reads: () => reads,
  }
}

function buildFetchFactory() {
  const built: Array<{ readonly budget: number; readonly token: string }> = []
  const tally = { requests: 3 } as FetchTally
  return {
    built,
    createFetch: (input: { readonly budget: number; readonly token: string }) => {
      built.push(input)
      return { execute: async () => tally }
    },
    tally,
  }
}

describe('a etapa de busca lê a chave e o orçamento da instalação a cada ciclo (spec 262 T4.2, CA7)', () => {
  test('com chave: monta a busca com a chave e o orçamento do leitor e devolve o resultado dela', async () => {
    const { built, createFetch, tally } = buildFetchFactory()
    const { reader } = buildReader({ budget: 300, kind: 'ready', token: TOKEN })
    const useCase = createFetchHolidayProviderWithAccessUseCase({ access: reader, createFetch })

    const result = await useCase.execute({ isStopRequested: STOP_NEVER })

    expect(built).toEqual([{ budget: 300, token: TOKEN }])
    expect(result).toBe(tally)
  })

  test('trocar a chave entre dois ciclos vale no segundo, não no primeiro', async () => {
    const { built, createFetch } = buildFetchFactory()
    const { reader, reads } = buildReader(
      { budget: 4500, kind: 'ready', token: TOKEN },
      { budget: 100, kind: 'ready', token: RENEWED_TOKEN },
    )
    const useCase = createFetchHolidayProviderWithAccessUseCase({ access: reader, createFetch })

    await useCase.execute({ isStopRequested: STOP_NEVER })
    await useCase.execute({ isStopRequested: STOP_NEVER })

    expect(reads()).toBe(2)
    expect(built).toEqual([
      { budget: 4500, token: TOKEN },
      { budget: 100, token: RENEWED_TOKEN },
    ])
  })

  test('sem chave: nada é montado, o resultado diz `tokenMissing` e zera as requisições', async () => {
    const { built, createFetch } = buildFetchFactory()
    const { reader } = buildReader({ budget: 4500, kind: 'token_missing' })
    const useCase = createFetchHolidayProviderWithAccessUseCase({ access: reader, createFetch })

    const result = await useCase.execute({ isStopRequested: STOP_NEVER })

    expect(built).toEqual([])
    expect(result).toMatchObject({ requests: 0, tokenMissing: true, tokenUnreadable: false })
  })

  test('chave ilegível: nada é montado, o resultado diz `tokenUnreadable`', async () => {
    const { built, createFetch } = buildFetchFactory()
    const { reader } = buildReader({ kind: 'token_unreadable' })
    const useCase = createFetchHolidayProviderWithAccessUseCase({ access: reader, createFetch })

    const result = await useCase.execute({ isStopRequested: STOP_NEVER })

    expect(built).toEqual([])
    expect(result).toMatchObject({ requests: 0, tokenMissing: false, tokenUnreadable: true })
  })

  test('erro do banco na leitura propaga: é falha da etapa, não "sem chave"', async () => {
    const { built, createFetch } = buildFetchFactory()
    const { reader } = buildReader(new Error('connection reset'))
    const useCase = createFetchHolidayProviderWithAccessUseCase({ access: reader, createFetch })

    await expect(useCase.execute({ isStopRequested: STOP_NEVER })).rejects.toThrow(
      'connection reset',
    )
    expect(built).toEqual([])
  })
})

describe('a rotina inteira sem chave (spec 262 T4.2, CA7)', () => {
  function buildRoutine(access: HolidayProviderAccess) {
    const order: string[] = []
    const { createFetch } = buildFetchFactory()
    const { reader } = buildReader(access)
    const stage = <TTally extends object>(name: string, tally: TTally) => ({
      execute: async () => {
        order.push(name)
        return tally
      },
    })
    const fetch = createFetchHolidayProviderWithAccessUseCase({ access: reader, createFetch })
    const routine = createHolidayProviderPullRoutine({
      apply: stage('apply', {
        companies: 0,
        failedCompanies: 0,
        municipalInserted: 2,
        nationalMismatch: 0,
        stateInserted: 0,
        unexpectedFailures: 0,
      }) as ApplyHolidayProviderUseCase,
      discover: stage('discover', {
        batches: 1,
        companies: 1,
        discardedCityCodes: 0,
        documentsRead: 9,
        documentsWithoutDestination: 0,
        failedCompanies: 0,
      }) as DiscoverHolidayCitiesUseCase,
      fetch: {
        execute: async (input) => {
          order.push('fetch')
          return fetch.execute(input)
        },
      },
      logger: {
        debug: () => undefined,
        error: () => undefined,
        info: () => undefined,
        warn: () => undefined,
      } as never,
    })
    return { order, routine }
  }

  const context = {
    correlationId: 'access-contract',
    executionId: 'execution-1',
    isStopRequested: STOP_NEVER,
    job: 'holiday.provider.pull',
    origin: 'schedule',
  } as const

  test('sem linha: a descoberta e a aplicação rodam, `token_missing = 1`, 0 requisições e `succeeded`', async () => {
    const { order, routine } = buildRoutine({ budget: 4500, kind: 'token_missing' })

    const result = await routine.run(context)

    expect(order).toEqual(['discover', 'fetch', 'apply'])
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({
      discovery_documents: 9,
      municipal_inserted: 2,
      requests: 0,
      token_missing: 1,
    })
    expect(result.counters).not.toHaveProperty('token_unreadable')
  })

  test('chave ilegível: a descoberta e a aplicação rodam, `token_unreadable = 1` e `credential_unreadable`', async () => {
    const { order, routine } = buildRoutine({ kind: 'token_unreadable' })

    const result = await routine.run(context)

    expect(order).toEqual(['discover', 'fetch', 'apply'])
    expect(result.outcome).toBe('credential_unreadable')
    expect(result.counters).toMatchObject({ requests: 0, token_unreadable: 1 })
    expect(result.counters).not.toHaveProperty('token_missing')
  })
})
