/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  DestinationRow,
  DiscoveryCompany,
  DiscoveryCursor,
  HolidayDiscoveryStore,
  SaveDiscoveryBatchParams,
} from '../../src/holiday-provider-pull/application/holiday-discovery.port.js'
import { createDiscoverHolidayCitiesUseCase } from '../../src/holiday-provider-pull/application/discover-holiday-cities.use-case.js'
import {
  HOLIDAY_DISCOVERY_BATCH_SIZE,
  HOLIDAY_DISCOVERY_MAX_BATCHES,
} from '../../src/holiday-provider-pull/domain/holiday-provider-pull.constant.js'
import {
  readDiscoveredCityCode,
  summarizeDocumentDestinations,
} from '../../src/holiday-provider-pull/domain/holiday-city-discovery.policy.js'

const NOW = new Date('2026-10-09T12:00:00.000Z')
const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'
const VALID_POSTAL_CODE = '13010000'

function buildDocument(index: number): DiscoveryCursor {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  return {
    documentId: id,
    issuedAt: '2026-08-20 06:00:00+00',
    updatedAt: `2026-09-01 00:00:${String(index).padStart(2, '0')}+00`,
  }
}

function recipientRow(input: { readonly cityCode: string | null; readonly documentId: string }) {
  return {
    cityCode: input.cityCode,
    documentId: input.documentId,
    number: '10',
    origin: 'recipient',
    postalCode: VALID_POSTAL_CODE,
  } satisfies DestinationRow
}

type FakeStore = HolidayDiscoveryStore & {
  readonly reads: Array<{
    readonly companyId: string
    readonly cursor: DiscoveryCursor | undefined
  }>
  readonly saved: SaveDiscoveryBatchParams[]
}

function buildStore(input: {
  readonly companies: readonly DiscoveryCompany[]
  readonly destinationsOf: (documentId: string) => readonly DestinationRow[]
  readonly documentsOf: Record<string, readonly DiscoveryCursor[]>
  readonly failReadFor?: string
}): FakeStore {
  const reads: FakeStore['reads'] = []
  const saved: SaveDiscoveryBatchParams[] = []

  return {
    async listCompanies() {
      return input.companies
    },
    async readDestinations({ documentIds }) {
      return documentIds.flatMap((documentId) => input.destinationsOf(documentId))
    },
    async readDocumentBatch({ companyId, cursor, limit }) {
      reads.push({ companyId, cursor })
      if (companyId === input.failReadFor) throw new Error('connection reset 12345678909')
      const all = input.documentsOf[companyId] ?? []
      const start =
        cursor === undefined ? 0 : all.findIndex((d) => d.documentId === cursor.documentId) + 1
      return all.slice(start, start + limit)
    },
    reads,
    saved,
    async saveBatch(params) {
      saved.push(params)
    },
  }
}

function buildUseCase(input: {
  readonly batchSize?: number
  readonly logged?: unknown[][]
  readonly maxBatches?: number
  readonly store: HolidayDiscoveryStore
}) {
  const record = (...args: unknown[]) => {
    input.logged?.push(args)
  }
  return createDiscoverHolidayCitiesUseCase({
    batchSize: input.batchSize ?? 2000,
    logger: { debug: record, error: record, info: record, warn: record } as never,
    maxBatches: input.maxBatches ?? 20,
    now: () => NOW,
    store: input.store,
  })
}

describe('o código de cidade que a descoberta aceita (spec 252 T3.2, lote venenoso)', () => {
  test('aceita município de sete dígitos de UF válida, aparando espaços', () => {
    expect(readDiscoveredCityCode('3509502')).toBe('3509502')
    expect(readDiscoveredCityCode(' 3550308 ')).toBe('3550308')
    expect(readDiscoveredCityCode('1100015')).toBe('1100015')
    expect(readDiscoveredCityCode('5300108')).toBe('5300108')
  })

  test('descarta nulo, vazio, lixo e UF que não existe', () => {
    const junk = [
      null,
      undefined,
      '',
      '   ',
      '9999999',
      '3909502',
      '0000000',
      '350950',
      '35095022',
      '35095a2',
      '6100000',
    ]

    for (const value of junk) expect(readDiscoveredCityCode(value)).toBeUndefined()
  })

  test('a UF é a do prefixo: 36 e 39 não existem mesmo passando na forma', () => {
    expect(readDiscoveredCityCode('3600000')).toBeUndefined()
    expect(readDiscoveredCityCode('3900000')).toBeUndefined()
    expect(readDiscoveredCityCode('3500000')).toBe('3500000')
  })
})

describe('o destino físico da nota na descoberta (spec 252 T3.2)', () => {
  test('a entrega vence o destinatário quando monta a chave da parada', () => {
    const summary = summarizeDocumentDestinations({
      documentIds: ['doc'],
      rows: [
        recipientRow({ cityCode: '3550308', documentId: 'doc' }),
        { ...recipientRow({ cityCode: '3509502', documentId: 'doc' }), origin: 'delivery' },
      ],
    })

    expect([...summary.cityCounts]).toEqual([['3509502', 1]])
  })

  test('a entrega sem CEP utilizável cai para o destinatário, como no roteirizador', () => {
    const summary = summarizeDocumentDestinations({
      documentIds: ['doc'],
      rows: [
        recipientRow({ cityCode: '3550308', documentId: 'doc' }),
        {
          ...recipientRow({ cityCode: '3509502', documentId: 'doc' }),
          origin: 'delivery',
          postalCode: null,
        },
      ],
    })

    expect([...summary.cityCounts]).toEqual([['3550308', 1]])
  })

  test('nota sem endereço conta à parte, e o código lixo da escolha é descartado e contado', () => {
    const summary = summarizeDocumentDestinations({
      documentIds: ['semEndereco', 'lixo', 'boa', 'boaDeNovo'],
      rows: [
        recipientRow({ cityCode: '9999999', documentId: 'lixo' }),
        recipientRow({ cityCode: '3509502', documentId: 'boa' }),
        recipientRow({ cityCode: '3509502', documentId: 'boaDeNovo' }),
      ],
    })

    expect([...summary.cityCounts]).toEqual([['3509502', 2]])
    expect(summary.discardedCityCodes).toBe(1)
    expect(summary.documentsWithoutDestination).toBe(1)
  })
})

describe('a descoberta de cidades por cursor (spec 252 T3.2)', () => {
  test('os tetos são os do ADR-0100: 2.000 notas por lote e 20 lotes por empresa', () => {
    expect(HOLIDAY_DISCOVERY_BATCH_SIZE).toBe(2000)
    expect(HOLIDAY_DISCOVERY_MAX_BATCHES).toBe(20)
  })

  test('lote misto: só os códigos válidos entram, o contador diz quantos saíram, o cursor andou', async () => {
    const documents = Array.from({ length: 7 }, (_, index) => buildDocument(index + 1))
    const cityCodes = ['3509502', null, '', '9999999', '3909502', '3509502', '3550308'] as const
    const store = buildStore({
      companies: [{ companyId: COMPANY_A, cursor: undefined }],
      destinationsOf: (documentId) => {
        const index = documents.findIndex((document) => document.documentId === documentId)
        return [recipientRow({ cityCode: cityCodes[index] ?? null, documentId })]
      },
      documentsOf: { [COMPANY_A]: documents },
    })

    const tally = await buildUseCase({ store }).execute({ isStopRequested: () => false })

    expect(store.saved).toHaveLength(1)
    const [saved] = store.saved
    expect(saved?.companyId).toBe(COMPANY_A)
    expect([...(saved?.cityCounts ?? [])].toSorted()).toEqual([
      ['3509502', 2],
      ['3550308', 1],
    ])
    expect(saved?.cursor).toEqual(documents[6] as DiscoveryCursor)
    expect(saved?.seenAt).toEqual(NOW)
    expect(tally.discardedCityCodes).toBe(4)
    expect(tally.documentsRead).toBe(7)
    expect(tally.batches).toBe(1)
  })

  test('lote só de lixo não grava cidade nenhuma e ainda assim avança o cursor', async () => {
    const documents = [buildDocument(1), buildDocument(2)]
    const store = buildStore({
      companies: [{ companyId: COMPANY_A, cursor: undefined }],
      destinationsOf: (documentId) => [recipientRow({ cityCode: '9999999', documentId })],
      documentsOf: { [COMPANY_A]: documents },
    })

    await buildUseCase({ store }).execute({ isStopRequested: () => false })

    expect(store.saved).toHaveLength(1)
    expect([...(store.saved[0]?.cityCounts ?? [])]).toEqual([])
    expect(store.saved[0]?.cursor).toEqual(documents[1] as DiscoveryCursor)
  })

  test('continua do cursor gravado e para quando o lote vem menor que o tamanho', async () => {
    const documents = Array.from({ length: 5 }, (_, index) => buildDocument(index + 1))
    const store = buildStore({
      companies: [{ companyId: COMPANY_A, cursor: documents[1] }],
      destinationsOf: (documentId) => [recipientRow({ cityCode: '3509502', documentId })],
      documentsOf: { [COMPANY_A]: documents },
    })

    const tally = await buildUseCase({ batchSize: 2, store }).execute({
      isStopRequested: () => false,
    })

    expect(store.reads.map((read) => read.cursor?.documentId)).toEqual([
      documents[1]?.documentId,
      documents[3]?.documentId,
    ])
    expect(store.saved.map((batch) => [...batch.cityCounts])).toEqual([
      [['3509502', 2]],
      [['3509502', 1]],
    ])
    expect(tally.batches).toBe(2)
    expect(tally.documentsRead).toBe(3)
  })

  test('para em 20 lotes por empresa e retoma do cursor no ciclo seguinte', async () => {
    const documents = Array.from({ length: 50 }, (_, index) => buildDocument(index + 1))
    const store = buildStore({
      companies: [{ companyId: COMPANY_A, cursor: undefined }],
      destinationsOf: (documentId) => [recipientRow({ cityCode: '3509502', documentId })],
      documentsOf: { [COMPANY_A]: documents },
    })

    const tally = await buildUseCase({ batchSize: 2, maxBatches: 20, store }).execute({
      isStopRequested: () => false,
    })

    expect(tally.batches).toBe(20)
    expect(tally.documentsRead).toBe(40)
    expect(store.saved.at(-1)?.cursor).toEqual(documents[39] as DiscoveryCursor)
  })

  test('empresa sem nota nova não grava nada', async () => {
    const store = buildStore({
      companies: [{ companyId: COMPANY_A, cursor: undefined }],
      destinationsOf: () => [],
      documentsOf: {},
    })

    const tally = await buildUseCase({ store }).execute({ isStopRequested: () => false })

    expect(store.saved).toHaveLength(0)
    expect(tally.batches).toBe(0)
  })

  test('a parada pedida é lida entre os lotes e entre as empresas', async () => {
    const documents = Array.from({ length: 6 }, (_, index) => buildDocument(index + 1))
    const store = buildStore({
      companies: [
        { companyId: COMPANY_A, cursor: undefined },
        { companyId: COMPANY_B, cursor: undefined },
      ],
      destinationsOf: (documentId) => [recipientRow({ cityCode: '3509502', documentId })],
      documentsOf: { [COMPANY_A]: documents, [COMPANY_B]: documents },
    })
    let reads = 0

    await buildUseCase({ batchSize: 2, store }).execute({
      isStopRequested: () => {
        reads += 1
        return store.saved.length >= 1
      },
    })

    expect(store.saved).toHaveLength(1)
    expect(store.reads.every((read) => read.companyId === COMPANY_A)).toBeTrue()
    expect(reads).toBeGreaterThan(0)
  })

  test('uma empresa que falha não derruba as outras, e o log não carrega o texto do erro', async () => {
    const documents = [buildDocument(1)]
    const logged: unknown[][] = []
    const store = buildStore({
      companies: [
        { companyId: COMPANY_A, cursor: undefined },
        { companyId: COMPANY_B, cursor: undefined },
      ],
      destinationsOf: (documentId) => [recipientRow({ cityCode: '3509502', documentId })],
      documentsOf: { [COMPANY_B]: documents },
      failReadFor: COMPANY_A,
    })

    const tally = await buildUseCase({ logged, store }).execute({ isStopRequested: () => false })

    expect(tally.failedCompanies).toBe(1)
    expect(store.saved.map((batch) => batch.companyId)).toEqual([COMPANY_B])
    expect(JSON.stringify(logged)).not.toContain('12345678909')
  })
})
