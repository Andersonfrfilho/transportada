/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9.4–9.5): a ordem da abertura — trava da chegada, chave de
 * idempotência (o reenvio volta mesmo com a janela vencida), nota, tipo, itens, janela, foto — e a
 * marcação "devolver ao contratante", sempre dentro da transação que travou a chegada.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CargoArrivalOccurrenceReadPort,
  CargoArrivalOccurrenceTransactionPort,
} from '../../src/cargo-receiving/application/cargo-arrival-occurrence.port.js'
import type {
  CargoArrivalOccurrenceView,
  LockedOccurrenceArrival,
  LockedOccurrenceDocument,
  ReceivingOccurrenceType,
} from '../../src/cargo-receiving/application/cargo-arrival-occurrence.types.js'
import { isDiagnosableError } from '../../src/shared/diagnosable.error.js'
import { createRegisterCargoArrivalOccurrenceUseCase } from '../../src/cargo-receiving/application/register-cargo-arrival-occurrence.use-case.js'
import {
  ARRIVAL,
  CONTEXT,
  DOCUMENT,
  JPEG,
  NOW,
  TYPE,
} from '../fixtures/cargo-arrival-occurrence-use-case.fixture.js'

const VIEW = { id: 'occurrence-1' } as CargoArrivalOccurrenceView

const INPUT = {
  arrivalId: 'arrival-1',
  attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
  context: CONTEXT,
  correlationId: 'c-1',
  documentId: 'nfe-1',
  idempotencyKey: 'key-0000000000000001',
  note: 'caixa amassada',
  occurrenceTypeId: 'type-1',
  productCode: '',
  productCodes: ['P1'],
  productQuantities: ['2'],
  productQuantityUnits: ['CX'],
}

type Overrides = Partial<{
  arrival: LockedOccurrenceArrival | null
  attachmentFails: boolean
  document: LockedOccurrenceDocument | null
  readBackMissing: boolean
  earlyReplay: { fingerprint: string; occurrenceId: string } | null
  replay: { fingerprint: string; occurrenceId: string } | null
  type: ReceivingOccurrenceType | null
}>

function setup(overrides: Overrides = {}) {
  const calls: string[] = []
  const stored: string[] = []
  const removed: string[] = []
  const savedIds: string[] = []
  const transaction: CargoArrivalOccurrenceTransactionPort = {
    findOccurrenceType: async () => ('type' in overrides ? (overrides.type ?? null) : TYPE),
    findReplay: async () => overrides.replay ?? null,
    insertAttachment: async () => {
      if (overrides.attachmentFails === true) throw new Error('attachment insert failed')
      calls.push('attachment')
    },
    insertStoredObject: async () => void calls.push('stored-object'),
    listDocumentProducts: async () => [{ code: 'P1', commercialUnit: 'CX', description: 'Caixa' }],
    lockArrival: async () => {
      calls.push('lock-arrival')
      return 'arrival' in overrides ? (overrides.arrival ?? null) : ARRIVAL
    },
    lockDocument: async () => {
      calls.push('lock-document')
      return 'document' in overrides ? (overrides.document ?? null) : DOCUMENT
    },
    saveOccurrence: async (input) => {
      calls.push(`save:${input.items.map((item) => `${item.code}=${item.quantity}`).join(',')}`)
      savedIds.push(input.occurrenceId)
      return { id: input.occurrenceId }
    },
  }
  const reads: CargoArrivalOccurrenceReadPort = {
    findOccurrence: async () => (overrides.readBackMissing === true ? null : VIEW),
    findReplay: async () => {
      calls.push('early-replay')
      return overrides.earlyReplay ?? null
    },
    listOccurrences: async () => null,
    listReceivingTypes: async () => [],
  }
  const useCase = createRegisterCargoArrivalOccurrenceUseCase({
    channel: 'backoffice',
    newObjectId: () => `object-${stored.length + 1}`,
    newOccurrenceId: () => 'occurrence-1',
    now: () => NOW,
    reads,
    storage: {
      remove: async ({ objectKey }) => void removed.push(objectKey),
      store: async ({ objectKey }) => {
        calls.push('upload')
        stored.push(objectKey)
        return { sha256: 'a'.repeat(64) }
      },
    },
    unitOfWork: { execute: ({ operation }) => operation(transaction) },
  })
  return { calls, execute: useCase.execute, removed, savedIds, stored }
}

describe('abrir a ocorrência de recebimento (spec 237 T3.2)', () => {
  test('trava a chegada antes da nota, grava itens e foto, e devolve a ocorrência', async () => {
    const { calls, execute, savedIds, stored } = setup()
    const result = await execute(INPUT)

    expect(result).toEqual({ isReplay: false, occurrence: VIEW })
    expect(calls).toEqual([
      'early-replay',
      'upload',
      'lock-arrival',
      'lock-document',
      'save:P1=2',
      'stored-object',
      'attachment',
    ])
    expect(savedIds).toEqual(['occurrence-1'])
    expect(stored).toHaveLength(1)
    expect(stored[0]).toContain('occurrence-1')
  })

  test('a foto sobe antes de a trava da chegada: o bucket lento nunca segura os outros separadores', async () => {
    const { calls, execute } = setup()
    await execute(INPUT)

    expect(calls.indexOf('upload')).toBeLessThan(calls.indexOf('lock-arrival'))
  })

  test('o reenvio já gravado volta antes de subir a foto e de abrir a transação', async () => {
    const early = setup({
      earlyReplay: { fingerprint: await fingerprintOf(), occurrenceId: 'occurrence-1' },
    })

    expect(await early.execute(INPUT)).toEqual({ isReplay: true, occurrence: VIEW })
    expect(early.calls).toEqual(['early-replay'])
    expect(early.stored).toEqual([])
  })

  test('o reenvio já gravado com outro pedido é 409 sem subir a foto', async () => {
    const early = setup({
      earlyReplay: { fingerprint: 'f'.repeat(64), occurrenceId: 'occurrence-1' },
    })

    await expect(early.execute(INPUT)).rejects.toMatchObject({
      code: 'CARGO_ARRIVAL_OCCURRENCE_KEY_REUSED',
      status: 409,
    })
    expect(early.calls).toEqual(['early-replay'])
    expect(early.stored).toEqual([])
  })

  test('a corrida do reenvio: a chave gravada durante o upload devolve a gravada e apaga a foto subida', async () => {
    const replayed = setup({
      arrival: {
        ...ARRIVAL,
        separationDueAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'closed',
      },
      replay: { fingerprint: await fingerprintOf(), occurrenceId: 'occurrence-1' },
    })

    expect(await replayed.execute(INPUT)).toEqual({ isReplay: true, occurrence: VIEW })
    expect(replayed.calls).toEqual(['early-replay', 'upload', 'lock-arrival'])
    expect(replayed.stored).toHaveLength(1)
    expect(replayed.removed).toEqual(replayed.stored)
  })

  test('a mesma chave com outro pedido é 409, sem gravar', async () => {
    const reused = setup({ replay: { fingerprint: 'f'.repeat(64), occurrenceId: 'occurrence-1' } })

    await expect(reused.execute(INPUT)).rejects.toMatchObject({
      code: 'CARGO_ARRIVAL_OCCURRENCE_KEY_REUSED',
      status: 409,
    })
    expect(reused.calls).toEqual(['early-replay', 'upload', 'lock-arrival'])
    expect(reused.removed).toEqual(reused.stored)
  })

  test.each([
    ['chegada de outra empresa', { arrival: null }, 404, 'CARGO_ARRIVAL_NOT_FOUND'],
    ['nota fora desta chegada', { document: null }, 404, 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND'],
    [
      'tipo inexistente ou de outra empresa',
      { type: null },
      404,
      'CARGO_ARRIVAL_OCCURRENCE_TYPE_NOT_FOUND',
    ],
    [
      'tipo aposentado',
      { type: { ...TYPE, active: false } },
      404,
      'CARGO_ARRIVAL_OCCURRENCE_TYPE_NOT_FOUND',
    ],
    [
      'tipo de separação',
      { type: { ...TYPE, stage: 'separation' } },
      422,
      'OCCURRENCE_TYPE_NOT_RECEIVING',
    ],
    [
      'fora da janela',
      { arrival: { ...ARRIVAL, separationDueAt: new Date('2026-10-06T11:59:59.999Z') } },
      422,
      'CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED',
    ],
    [
      'nota ainda esperada',
      { document: { ...DOCUMENT, separationState: 'expected' } },
      409,
      'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED',
    ],
    [
      'nota devolvida',
      { document: { ...DOCUMENT, returnToContractor: 'returned' } },
      409,
      'CARGO_ARRIVAL_DOCUMENT_RETURNED',
    ],
    ['chegada fechada', { arrival: { ...ARRIVAL, status: 'closed' } }, 409, 'CARGO_ARRIVAL_CLOSED'],
  ] as const)(
    '%s é recusada sem gravar, e a foto subida é apagada',
    async (_label, overrides, status, code) => {
      const { calls, execute, removed, stored } = setup(overrides)

      await expect(execute(INPUT)).rejects.toMatchObject({ code, status })
      expect(removed).toEqual(stored)
      expect(calls.some((call) => call.startsWith('save'))).toBeFalse()
    },
  )

  test('sem item é recusado: com a tratativa bloqueada, ela nunca chegaria ao contratante', async () => {
    const { execute, removed, stored } = setup()

    await expect(
      execute({ ...INPUT, productCodes: [], productQuantities: [], productQuantityUnits: [] }),
    ).rejects.toMatchObject({ code: 'CARGO_ARRIVAL_OCCURRENCE_ITEMS_REQUIRED', status: 422 })
    expect(removed).toEqual(stored)
  })

  test('foto que não é imagem é recusada antes de abrir a transação', async () => {
    const { calls, execute } = setup()

    await expect(
      execute({
        ...INPUT,
        attachment: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
      }),
    ).rejects.toMatchObject({ status: 422 })
    expect(calls).toEqual([])
  })

  test('ocorrência que não volta na leitura é erro diagnosticável, nunca um Error cru', async () => {
    const missing = setup({ readBackMissing: true })

    const error = await missing.execute(INPUT).catch((thrown: unknown) => thrown)

    expect(isDiagnosableError(error)).toBeTrue()
  })

  test('falha depois de subir a foto apaga o objeto do bucket', async () => {
    const broken = setup({ attachmentFails: true })

    await expect(broken.execute(INPUT)).rejects.toThrow('attachment insert failed')
    expect(broken.stored).toHaveLength(1)
    expect(broken.removed).toEqual(broken.stored)
  })
})

async function fingerprintOf(): Promise<string> {
  const { buildCargoArrivalOccurrenceFingerprint } = await import(
    '../../src/cargo-receiving/domain/cargo-arrival-occurrence.policy.js'
  )
  return buildCargoArrivalOccurrenceFingerprint({
    arrivalId: INPUT.arrivalId,
    attachmentSha256: sha256(JPEG),
    documentId: INPUT.documentId,
    note: INPUT.note,
    occurrenceTypeId: INPUT.occurrenceTypeId,
    productCode: INPUT.productCode,
    productCodes: INPUT.productCodes,
    productQuantities: INPUT.productQuantities,
    productQuantityUnits: INPUT.productQuantityUnits,
  })
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
}
