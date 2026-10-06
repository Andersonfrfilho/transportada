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
  replay: { fingerprint: string; occurrenceId: string } | null
  type: ReceivingOccurrenceType | null
}>

function setup(overrides: Overrides = {}) {
  const calls: string[] = []
  const stored: string[] = []
  const removed: string[] = []
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
      return { id: 'occurrence-1' }
    },
  }
  const reads: CargoArrivalOccurrenceReadPort = {
    findOccurrence: async () => VIEW,
    listOccurrences: async () => null,
    listReceivingTypes: async () => [],
  }
  const useCase = createRegisterCargoArrivalOccurrenceUseCase({
    channel: 'backoffice',
    newObjectId: () => `object-${stored.length + 1}`,
    now: () => NOW,
    reads,
    storage: {
      remove: async ({ objectKey }) => void removed.push(objectKey),
      store: async ({ objectKey }) => {
        stored.push(objectKey)
        return { sha256: 'a'.repeat(64) }
      },
    },
    unitOfWork: { execute: ({ operation }) => operation(transaction) },
  })
  return { calls, execute: useCase.execute, removed, stored }
}

describe('abrir a ocorrência de recebimento (spec 237 T3.2)', () => {
  test('trava a chegada antes da nota, grava itens e foto, e devolve a ocorrência', async () => {
    const { calls, execute, stored } = setup()
    const result = await execute(INPUT)

    expect(result).toEqual({ isReplay: false, occurrence: VIEW })
    expect(calls).toEqual([
      'lock-arrival',
      'lock-document',
      'save:P1=2',
      'stored-object',
      'attachment',
    ])
    expect(stored).toHaveLength(1)
  })

  test('o reenvio com a mesma chave devolve a gravada, mesmo com a chegada fechada, sem tocar a nota', async () => {
    const replayed = setup({
      arrival: {
        ...ARRIVAL,
        separationDueAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'closed',
      },
      replay: { fingerprint: await fingerprintOf(), occurrenceId: 'occurrence-1' },
    })

    expect(await replayed.execute(INPUT)).toEqual({ isReplay: true, occurrence: VIEW })
    expect(replayed.calls).toEqual(['lock-arrival'])
    expect(replayed.stored).toEqual([])
  })

  test('a mesma chave com outro pedido é 409, sem gravar', async () => {
    const reused = setup({ replay: { fingerprint: 'f'.repeat(64), occurrenceId: 'occurrence-1' } })

    await expect(reused.execute(INPUT)).rejects.toMatchObject({
      code: 'CARGO_ARRIVAL_OCCURRENCE_KEY_REUSED',
      status: 409,
    })
    expect(reused.calls).toEqual(['lock-arrival'])
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
    '%s é recusada sem subir foto nem gravar',
    async (_label, overrides, status, code) => {
      const { calls, execute, stored } = setup(overrides)

      await expect(execute(INPUT)).rejects.toMatchObject({ code, status })
      expect(stored).toEqual([])
      expect(calls.some((call) => call.startsWith('save'))).toBeFalse()
    },
  )

  test('sem item é recusado: com a tratativa bloqueada, ela nunca chegaria ao contratante', async () => {
    const { execute, stored } = setup()

    await expect(
      execute({ ...INPUT, productCodes: [], productQuantities: [], productQuantityUnits: [] }),
    ).rejects.toMatchObject({ code: 'CARGO_ARRIVAL_OCCURRENCE_ITEMS_REQUIRED', status: 422 })
    expect(stored).toEqual([])
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
