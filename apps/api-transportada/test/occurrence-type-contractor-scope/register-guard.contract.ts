/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.5 (ADR-0107, D6, R4): todo caso de uso que registra ocorrência com nota confere o escopo
 * de contratantes **depois** do momento e da nota alcançável e **antes** da exigência da 246 e de qualquer
 * escrita ou upload. A recusa é 422 `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR` e nada é gravado.
 */
import { describe, expect, test } from 'bun:test'

import { performBatch } from '../../src/trips/application/office-occurrence-batch.service.js'
import type { BatchContext } from '../../src/trips/application/office-occurrence-batch.types.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  registerTripOccurrence,
  type OccurrenceTypeRecord,
} from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { OccurrenceTypeNotAvailableForContractorError } from '../../src/trips/domain/occurrence-type-contractor-scope.error.js'
import {
  OccurrenceTypeNotFieldError,
  TripDocumentNotFoundError,
  TripDocumentNotReachableError,
  TripOccurrenceAttachmentRequiredError,
} from '../../src/trips/domain/trip.error.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const ACTOR = '00000000-0000-4000-8000-00000000000f'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const SECOND_DOCUMENT = '00000000-0000-4000-8000-000000000018'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const ZARAGOZA = '11111111-1111-4111-8111-111111111111'
const RIBER = '22222222-2222-4222-8222-222222222222'
const GUARD_PASSED = 'GUARD_PASSED'

function buildType(overrides: Partial<OccurrenceTypeRecord> = {}): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    contractorIds: [ZARAGOZA],
    contractorScope: 'listed',
    emailTemplateKey: null,
    id: TYPE_ID,
    moments: ['separation', 'document', 'office'],
    name: 'Procedimento da contratante',
    notifies: false,
    stage: 'delivery',
    ...overrides,
  }
}

function passedGuard(): never {
  throw new Error(GUARD_PASSED)
}

async function outcome(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => GUARD_PASSED,
    (reason: unknown) =>
      reason instanceof Error && reason.message === GUARD_PASSED ? GUARD_PASSED : reason,
  )
}

type DriverParams = {
  readonly contractorId: null | string
  readonly isReachable?: boolean
  readonly type: OccurrenceTypeRecord
}

function registerAsDriver(params: DriverParams) {
  const state = createFieldReportState()
  const result = outcome(
    registerDriverOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      idempotencyKey: '00000000-0000-4000-8000-0000000000aa',
      note: '',
      occurrenceTypeId: TYPE_ID,
      productCode: '',
      repository: {
        findConfirmedUpload: async () => null,
        findOccurrenceType: async () => params.type,
        findOccurrenceTypeOverrides: async () => ({
          contractorOverrides: [],
          recipientOverrides: [],
        }),
        findReachableDocument: async () =>
          params.isReachable === false ? null : { contractorId: params.contractorId, tripId: TRIP },
        listDocumentProducts: async () => passedGuard(),
      },
      unitOfWork: createFieldReportUnitOfWork(state),
    }),
  )
  return { result, state }
}

describe('spec 270 T2.5: o motorista (e o escritório em nome dele) — momento document', () => {
  test('nota de outra contratante: 422, nada gravado', async () => {
    const { result, state } = registerAsDriver({ contractorId: RIBER, type: buildType() })

    expect(await result).toBeInstanceOf(OccurrenceTypeNotAvailableForContractorError)
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('nota sem contratante identificada: 422 (D4)', async () => {
    const { result } = registerAsDriver({ contractorId: null, type: buildType() })

    expect(await result).toBeInstanceOf(OccurrenceTypeNotAvailableForContractorError)
  })

  test('nota da contratante da lista passa a guarda', async () => {
    const { result } = registerAsDriver({ contractorId: ZARAGOZA, type: buildType() })

    expect(await result).toBe(GUARD_PASSED)
  })

  test('tipo geral passa em qualquer nota, inclusive a sem contratante', async () => {
    const general = buildType({ contractorIds: [], contractorScope: 'all' })

    expect(await registerAsDriver({ contractorId: RIBER, type: general }).result).toBe(GUARD_PASSED)
    expect(await registerAsDriver({ contractorId: null, type: general }).result).toBe(GUARD_PASSED)
  })

  test('ordem: o momento vence o escopo', async () => {
    const { result } = registerAsDriver({
      contractorId: RIBER,
      type: buildType({ moments: ['separation'] }),
    })

    expect(await result).toBeInstanceOf(TripDocumentNotReachableError)
  })

  test('ordem: a nota inalcançável vence o escopo', async () => {
    const { result } = registerAsDriver({
      contractorId: RIBER,
      isReachable: false,
      type: buildType(),
    })

    expect(await result).toBeInstanceOf(TripDocumentNotReachableError)
  })

  test('ordem: o escopo vence a exigência da 246 (foto obrigatória sem foto)', async () => {
    const { result } = registerAsDriver({
      contractorId: RIBER,
      type: buildType({ attachmentMode: 'required' }),
    })

    expect(await result).toBeInstanceOf(OccurrenceTypeNotAvailableForContractorError)
  })

  test('a recusa não leva a lista de contratantes do tipo', async () => {
    const { result } = registerAsDriver({ contractorId: RIBER, type: buildType() })
    const error = (await result) as OccurrenceTypeNotAvailableForContractorError

    expect(JSON.stringify([error.message, error.details])).not.toContain(ZARAGOZA)
    expect(JSON.stringify([error.message, error.details])).not.toContain(RIBER)
  })
})

function buildBatchContext(documents: readonly { id: string; contractorId: null | string }[]) {
  const calls: string[] = []
  const context = {
    attachment: {
      newObjectId: () => crypto.randomUUID(),
      storage: {
        store: async () => {
          calls.push('store')
          return { sha256: 'x' }
        },
      },
      upload: { bytes: new Uint8Array([1]), mimeType: 'image/jpeg' },
    },
    companyId: COMPANY,
    documentIds: documents.map((document) => document.id),
    occurrenceTypeId: TYPE_ID,
    storage: {
      store: async () => {
        calls.push('store')
        return { sha256: 'x' }
      },
    },
    target: { kind: 'trip', onBehalfOfDriverId: DRIVER, tripId: TRIP, tripStatus: 'in_transit' },
    transaction: {
      findOccurrenceType: async () => buildType(),
      findReachableDocumentIds: async () => documents,
      recordOfficeAudit: async () => {
        calls.push('audit')
      },
      saveAttachmentObject: async () => {
        calls.push('saveAttachmentObject')
      },
      saveDocumentOccurrence: async () => {
        calls.push('saveDocumentOccurrence')
        return passedGuard()
      },
    },
  } as unknown as BatchContext
  return { calls, context }
}

describe('spec 270 T2.5: o lote do escritório — momento office', () => {
  test('uma nota fora do escopo recusa o lote inteiro, com os ids das notas recusadas, antes de gravar ou subir a foto', async () => {
    const { calls, context } = buildBatchContext([
      { contractorId: ZARAGOZA, id: DOCUMENT },
      { contractorId: RIBER, id: SECOND_DOCUMENT },
    ])

    const error = await outcome(performBatch(context))

    expect(error).toBeInstanceOf(OccurrenceTypeNotAvailableForContractorError)
    expect((error as OccurrenceTypeNotAvailableForContractorError).details).toEqual([
      { field: 'documentIds', message: SECOND_DOCUMENT },
    ])
    expect(calls).toEqual([])
  })

  test('a nota sem contratante também recusa o lote com tipo restrito', async () => {
    const { calls, context } = buildBatchContext([{ contractorId: null, id: DOCUMENT }])

    expect(await outcome(performBatch(context))).toBeInstanceOf(
      OccurrenceTypeNotAvailableForContractorError,
    )
    expect(calls).toEqual([])
  })

  test('todas as notas da contratante da lista: a guarda passa e o lote segue a gravar', async () => {
    const { calls, context } = buildBatchContext([
      { contractorId: ZARAGOZA, id: DOCUMENT },
      { contractorId: ZARAGOZA, id: SECOND_DOCUMENT },
    ])

    expect(await outcome(performBatch(context))).not.toBeInstanceOf(
      OccurrenceTypeNotAvailableForContractorError,
    )
    expect(calls).toContain('store')
  })

  test('ordem: o momento vence o escopo', async () => {
    const { context } = buildBatchContext([{ contractorId: RIBER, id: DOCUMENT }])
    const withoutOffice = {
      ...context,
      transaction: {
        ...context.transaction,
        findOccurrenceType: async () => buildType({ moments: ['document'] }),
      },
    } as BatchContext

    expect(await outcome(performBatch(withoutOffice))).toBeInstanceOf(OccurrenceTypeNotFieldError)
  })
})

type SeparationParams = {
  readonly findDocumentContractor?:
    | (() => Promise<null | { contractorId: null | string }>)
    | undefined
  readonly type: OccurrenceTypeRecord
}

function registerAsSeparator(params: SeparationParams) {
  const calls: string[] = []
  const result = outcome(
    registerTripOccurrence({
      actorUserId: ACTOR,
      attachment: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
      companyId: COMPANY,
      documentId: DOCUMENT,
      note: '',
      occurredOn: '06/10/2026',
      occurrenceTypeId: TYPE_ID,
      productCode: '',
      repository: {
        ...(params.findDocumentContractor === undefined
          ? {}
          : {
              findDocumentContractor: async () => {
                calls.push('findDocumentContractor')
                return params.findDocumentContractor?.() ?? null
              },
            }),
        findOccurrenceType: async () => params.type,
        listDocumentProducts: async () => {
          calls.push('listDocumentProducts')
          return passedGuard()
        },
        listOccurrences: async () => [],
        saveOccurrence: async () => {
          calls.push('saveOccurrence')
          return passedGuard()
        },
      },
      tripId: TRIP,
    }),
  )
  return { calls, result }
}

describe('spec 270 T2.5: o galpão — momento separation', () => {
  test('nota de outra contratante: 422 antes de ler produto ou gravar', async () => {
    const { calls, result } = registerAsSeparator({
      findDocumentContractor: async () => ({ contractorId: RIBER }),
      type: buildType(),
    })

    expect(await result).toBeInstanceOf(OccurrenceTypeNotAvailableForContractorError)
    expect(calls).toEqual(['findDocumentContractor'])
  })

  test('nota fora da viagem ou da empresa: 404 como hoje, não 422', async () => {
    const { result } = registerAsSeparator({
      findDocumentContractor: async () => null,
      type: buildType(),
    })

    expect(await result).toBeInstanceOf(TripDocumentNotFoundError)
  })

  test('nota da contratante da lista passa a guarda', async () => {
    const { calls, result } = registerAsSeparator({
      findDocumentContractor: async () => ({ contractorId: ZARAGOZA }),
      type: buildType(),
    })

    expect(await result).toBe(GUARD_PASSED)
    expect(calls).toEqual(['findDocumentContractor', 'listDocumentProducts'])
  })

  test('tipo geral não lê a contratante: zero consulta a mais', async () => {
    const { calls, result } = registerAsSeparator({
      findDocumentContractor: async () => ({ contractorId: RIBER }),
      type: buildType({ contractorIds: [], contractorScope: 'all' }),
    })

    expect(await result).toBe(GUARD_PASSED)
    expect(calls).toEqual(['listDocumentProducts'])
  })

  test('sem como ler a contratante (dublê), o tipo restrito é recusado', async () => {
    const { result } = registerAsSeparator({ type: buildType() })

    expect(await result).toBeInstanceOf(OccurrenceTypeNotAvailableForContractorError)
  })

  test('ordem: o escopo vem antes da foto obrigatória', async () => {
    const result = await outcome(
      registerTripOccurrence({
        actorUserId: ACTOR,
        companyId: COMPANY,
        documentId: DOCUMENT,
        note: '',
        occurredOn: '06/10/2026',
        occurrenceTypeId: TYPE_ID,
        productCode: '',
        repository: {
          findDocumentContractor: async () => ({ contractorId: RIBER }),
          findOccurrenceType: async () => buildType(),
          listDocumentProducts: async () => passedGuard(),
          listOccurrences: async () => [],
          saveOccurrence: async () => passedGuard(),
        },
        tripId: TRIP,
      }),
    )

    expect(result).toBeInstanceOf(OccurrenceTypeNotAvailableForContractorError)
    expect(result).not.toBeInstanceOf(TripOccurrenceAttachmentRequiredError)
  })
})
