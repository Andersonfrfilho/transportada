/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.2 (RF0b): cada caso de uso confere o momento **do registro**, fixo — separador
 * `separation`, motorista `document`, escritório `office` — contra o conjunto do tipo, e nunca pelo
 * `stage`. Os dublês carregam `stage` em desacordo com `moments` de propósito: a guarda que lê o
 * par em vez do conjunto reprova aqui.
 */
import { describe, expect, test } from 'bun:test'

import { resolveFieldOccurrenceTypes } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import { performBatch } from '../../src/trips/application/office-occurrence-batch.service.js'
import type { BatchContext } from '../../src/trips/application/office-occurrence-batch.types.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  registerTripOccurrence,
  type OccurrenceTypeRecord,
} from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  OccurrenceTypeNotFieldError,
  OccurrenceTypeNotSeparationError,
  TripDocumentNotReachableError,
} from '../../src/trips/domain/trip.error.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const ACTOR = '00000000-0000-4000-8000-00000000000f'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const GUARD_PASSED = 'GUARD_PASSED'

function buildType(overrides: Partial<OccurrenceTypeRecord>): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TYPE_ID,
    name: 'Avaria',
    notifies: false,
    stage: 'delivery',
    ...overrides,
  }
}

/** O caso de uso chama `listDocumentProducts` logo depois da guarda: chegar lá é ter passado. */
async function outcome(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => GUARD_PASSED,
    (reason: unknown) =>
      reason instanceof Error && reason.message === GUARD_PASSED ? GUARD_PASSED : reason,
  )
}

function passedGuard(): never {
  throw new Error(GUARD_PASSED)
}

function registerAsSeparator(type: OccurrenceTypeRecord): Promise<unknown> {
  return outcome(
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
        findOccurrenceType: async () => type,
        listDocumentProducts: async () => passedGuard(),
        listOccurrences: async () => [],
        readTemplateValues: async () => passedGuard(),
        saveOccurrence: async () => passedGuard(),
      },
      tripId: TRIP,
    }),
  )
}

function registerAsDriver(type: OccurrenceTypeRecord): Promise<unknown> {
  return outcome(
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
        findOccurrenceType: async () => type,
        findOccurrenceTypeOverrides: async () => ({
          contractorOverrides: [],
          recipientOverrides: [],
        }),
        findReachableDocument: async () => passedGuard(),
        listDocumentProducts: async () => passedGuard(),
      },
      unitOfWork: createFieldReportUnitOfWork(createFieldReportState()),
    }),
  )
}

function registerAsOffice(type: OccurrenceTypeRecord): Promise<unknown> {
  const context = {
    companyId: COMPANY,
    documentIds: [DOCUMENT],
    occurrenceTypeId: TYPE_ID,
    target: { kind: 'trip', onBehalfOfDriverId: DRIVER, tripId: TRIP, tripStatus: 'in_transit' },
    transaction: {
      findOccurrenceType: async () => type,
      findReachableDocumentIds: async () => passedGuard(),
    },
  } as unknown as BatchContext
  return outcome(performBatch(context))
}

describe('o separador registra só no momento separation (spec 246 T1b.2)', () => {
  test('tipo só de nota é recusado, mesmo com stage separation gravado', async () => {
    const type = buildType({ moments: ['document', 'office'], stage: 'separation' })
    expect(await registerAsSeparator(type)).toBeInstanceOf(OccurrenceTypeNotSeparationError)
  })

  test('tipo separation + document passa', async () => {
    const type = buildType({ moments: ['separation', 'document'], stage: 'separation' })
    expect(await registerAsSeparator(type)).toBe(GUARD_PASSED)
  })
})

describe('o motorista registra só no momento document (spec 246 T1b.2)', () => {
  test('tipo separation + document passa, embora o stage gravado seja separation', async () => {
    const type = buildType({ moments: ['separation', 'document'], stage: 'separation' })
    expect(await registerAsDriver(type)).toBe(GUARD_PASSED)
  })

  test('tipo só de galpão é inalcançável, mesmo com stage delivery gravado', async () => {
    const type = buildType({ moments: ['separation'], stage: 'delivery' })
    expect(await registerAsDriver(type)).toBeInstanceOf(TripDocumentNotReachableError)
  })

  test('tipo de parada é inalcançável na rota de nota', async () => {
    const type = buildType({ flow: 'document', moments: ['stop', 'office'] })
    expect(await registerAsDriver(type)).toBeInstanceOf(TripDocumentNotReachableError)
  })
})

describe('o escritório registra só no momento office (spec 246 T1b.2)', () => {
  test('tipo de nota sem office é recusado, mesmo com stage delivery', async () => {
    const type = buildType({ moments: ['document'], stage: 'delivery' })
    expect(await registerAsOffice(type)).toBeInstanceOf(OccurrenceTypeNotFieldError)
  })

  test('tipo com office passa, mesmo com stage separation gravado', async () => {
    const type = buildType({ moments: ['separation', 'office'], stage: 'separation' })
    expect(await registerAsOffice(type)).toBe(GUARD_PASSED)
  })
})

describe('as listas de rua seguem o momento, não o stage (spec 246 T1b.2)', () => {
  const types = [
    buildType({ id: 'both', moments: ['separation', 'document'], stage: 'separation' }),
    buildType({ id: 'note', moments: ['document', 'office'] }),
    buildType({ flow: 'stop', id: 'stop', moments: ['stop', 'office'] }),
    buildType({ id: 'warehouse', moments: ['separation'], stage: 'separation' }),
    buildType({ id: 'office-only', moments: ['office'] }),
  ]
  const idsOf = (list: readonly { readonly id: string }[]) => list.map((type) => type.id)

  test('o motorista (sem moment) vê nota e parada, inclusive o tipo de galpão + nota', () => {
    expect(idsOf(resolveFieldOccurrenceTypes({ types }))).toEqual(['both', 'note', 'stop'])
  })

  test('com moment, só os tipos daquele momento', () => {
    expect(idsOf(resolveFieldOccurrenceTypes({ moment: 'document', types }))).toEqual([
      'both',
      'note',
    ])
    expect(idsOf(resolveFieldOccurrenceTypes({ moment: 'office', types }))).toEqual([
      'note',
      'stop',
      'office-only',
    ])
  })
})
