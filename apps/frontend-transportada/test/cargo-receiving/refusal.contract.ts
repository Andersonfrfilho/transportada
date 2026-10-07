/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9, `web.md` §11): o servidor recusa NOMEANDO — a chegada lista todas as notas
 * recusadas de uma vez com o motivo de cada uma, o lote mostra o resultado por nota e o fechamento
 * mostra as pendentes. Os três casos do §11: lista com 2+ itens, silêncio quando a falha não aponta
 * nada, e item desconhecido chegando com o nome cru.
 */
import { describe, expect, test } from 'bun:test'

import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'
import {
  describeBatchOutcomes,
  describePendingDocuments,
  describeRegistrationRefusal,
} from '@/modules/cargo-receiving/shared/cargoReceivingRefusal.service'

const DOCUMENTS = [
  { id: 'id-1001', number: '1001' },
  { id: 'id-1002', number: '1002' },
  { id: 'id-1003', number: '1003' },
  { id: 'id-1004', number: '1004' },
] as const

describe('a recusa da chegada nomeia todas as notas (spec 237 T2.4)', () => {
  test('lista cada nota recusada, na posição do pedido, com o motivo de cada uma', () => {
    const error = new CargoReceivingRequestError('CARGO_ARRIVAL_DOCUMENTS_REFUSED', [
      { field: 'documentIds.1', message: 'DOCUMENT_ALREADY_IN_ARRIVAL' },
      { field: 'documentIds.3', message: 'DOCUMENT_IN_LIVE_TRIP' },
    ])

    const refusal = describeRegistrationRefusal({
      error,
      requestedDocuments: DOCUMENTS,
    })

    expect(refusal.documents).toEqual([
      { documentId: 'id-1002', number: '1002', reason: 'DOCUMENT_ALREADY_IN_ARRIVAL' },
      { documentId: 'id-1004', number: '1004', reason: 'DOCUMENT_IN_LIVE_TRIP' },
    ])
    expect(refusal.fields).toEqual([])
  })

  test('a mesma nota recusada duas vezes aparece uma vez só', () => {
    const error = new CargoReceivingRequestError('CARGO_ARRIVAL_DOCUMENTS_REFUSED', [
      { field: 'documentIds.0', message: 'DOCUMENT_NOT_AUTHORIZED' },
      { field: 'documentIds.0', message: 'DOCUMENT_NOT_AUTHORIZED' },
    ])

    expect(
      describeRegistrationRefusal({ error, requestedDocuments: DOCUMENTS }).documents,
    ).toHaveLength(1)
  })

  test('os campos do formulário recusados saem pelo rótulo, sem repetir', () => {
    const error = new CargoReceivingRequestError('INVALID_REQUEST', [
      { field: 'arrivedAt', message: 'Invalid' },
      { field: 'reference', message: 'Too long' },
      { field: 'arrivedAt', message: 'Other' },
    ])

    const { fields, documents } = describeRegistrationRefusal({
      error,
      requestedDocuments: DOCUMENTS,
    })

    expect(fields).toEqual([
      { field: 'arrivedAt', labelKey: 'fields.arrivedAt' },
      { field: 'reference', labelKey: 'fields.reference' },
    ])
    expect(documents).toEqual([])
  })

  test('campo que a tela não conhece não some: sai com o nome que a API usou', () => {
    const error = new CargoReceivingRequestError('INVALID_REQUEST', [
      { field: 'Idempotency-Key', message: 'Use 16 to 256' },
      { field: 'campoNovo', message: 'x' },
    ])

    expect(describeRegistrationRefusal({ error, requestedDocuments: DOCUMENTS }).fields).toEqual([
      { field: 'Idempotency-Key', labelKey: undefined },
      { field: 'campoNovo', labelKey: undefined },
    ])
  })

  test('posição que não existe no pedido sai com o rótulo genérico das notas, não some', () => {
    const error = new CargoReceivingRequestError('INVALID_REQUEST', [
      { field: 'documentIds.77', message: 'Invalid UUID' },
    ])

    const refusal = describeRegistrationRefusal({ error, requestedDocuments: DOCUMENTS })

    expect(refusal.documents).toEqual([])
    expect(refusal.fields).toEqual([{ field: 'documentIds.77', labelKey: undefined }])
  })

  test('falha que não aponta campo nem nota fica em silêncio: só o código', () => {
    const error = new CargoReceivingRequestError('CARGO_RECEIVING_NOT_ENABLED')

    expect(describeRegistrationRefusal({ error, requestedDocuments: DOCUMENTS })).toEqual({
      code: 'CARGO_RECEIVING_NOT_ENABLED',
      documents: [],
      fields: [],
    })
  })

  test('erro que não é do cliente da chegada não vira lista', () => {
    expect(
      describeRegistrationRefusal({ error: new Error('x'), requestedDocuments: DOCUMENTS }),
    ).toEqual({ code: undefined, documents: [], fields: [] })
  })
})

describe('o resultado do lote mostra uma linha por nota', () => {
  test('conta alteradas, sem mudança e recusadas, e nomeia todas as recusadas', () => {
    const summary = describeBatchOutcomes({
      documents: DOCUMENTS,
      results: [
        { documentId: 'id-1001', outcome: 'changed' },
        { documentId: 'id-1002', outcome: 'unchanged' },
        {
          documentId: 'id-1003',
          outcome: 'refused',
          reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED',
        },
        { documentId: 'id-1004', outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' },
      ],
    })

    expect(summary.changedCount).toBe(1)
    expect(summary.unchangedCount).toBe(1)
    expect(summary.entries).toEqual([
      { documentId: 'id-1001', number: '1001', outcome: 'changed', reason: undefined },
      { documentId: 'id-1002', number: '1002', outcome: 'unchanged', reason: undefined },
      {
        documentId: 'id-1003',
        number: '1003',
        outcome: 'refused',
        reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED',
      },
      { documentId: 'id-1004', number: '1004', outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' },
    ])
    expect(summary.refused).toEqual([
      { documentId: 'id-1003', number: '1003', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED' },
      { documentId: 'id-1004', number: '1004', reason: 'CARGO_ARRIVAL_CLOSED' },
    ])
  })

  test('nota fora da lista conhecida aparece com o id no lugar do número', () => {
    const summary = describeBatchOutcomes({
      documents: [],
      results: [
        { documentId: 'id-x', outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND' },
      ],
    })

    expect(summary.refused).toEqual([
      { documentId: 'id-x', number: 'id-x', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND' },
    ])
  })
})

describe('o fechamento com pendência mostra as notas que faltam', () => {
  const pending = (index: number, documentId: string) => ({
    documentId,
    field: `pendingDocumentIds.${String(index)}`,
    message: 'The document is not separated yet',
  })

  test('o servidor devolve o id de cada pendente em documentId; a tela mostra o número', () => {
    const error = new CargoReceivingRequestError('CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS', [
      pending(0, 'id-1002'),
      pending(1, 'id-1004'),
      pending(2, 'id-1002'),
    ])

    expect(describePendingDocuments({ documents: DOCUMENTS, error })).toEqual([
      { documentId: 'id-1002', number: '1002' },
      { documentId: 'id-1004', number: '1004' },
    ])
  })

  test('o texto da mensagem nunca é lido como id, nem o campo antigo documentIds.<n>', () => {
    const error = new CargoReceivingRequestError('CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS', [
      { field: 'pendingDocumentIds.0', message: 'id-1002' },
      { field: 'documentIds.1', message: 'id-1004' },
    ])

    expect(describePendingDocuments({ documents: DOCUMENTS, error })).toEqual([])
  })

  test('outro erro não lista pendência', () => {
    expect(
      describePendingDocuments({
        documents: DOCUMENTS,
        error: new CargoReceivingRequestError('CARGO_ARRIVAL_NOT_FOUND'),
      }),
    ).toEqual([])
  })
})
