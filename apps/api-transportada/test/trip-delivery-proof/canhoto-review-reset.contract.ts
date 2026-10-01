/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF24 (T6.2): o canhoto nasce na fila de conferência e a recaptura **zera** o veredito —
 * a foto recusada saiu, e o "recusado" era dela.
 *
 * ⚠️ O `DO UPDATE SET` desta tabela é denotativo: coluna ausente do objeto não é tocada, e o valor
 * antigo sobrevive. Foi escolha deliberada para `receiver_document_envelope` e `late_registration`.
 * A conferência é a primeira coluna cujo padrão correto na recaptura é **apagar** — esquecê-la no
 * set faria o canhoto novo herdar o veredito do anterior sem nada falhar.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { describe, expect, it } from 'bun:test'
import { getTableColumns } from 'drizzle-orm'

import { tripDeliveryProofs, type TripDeliveryProofKind } from '../../src/database/trip.schema.js'
import {
  buildCanhotoReviewReset,
  resolveInitialCanhotoReview,
} from '../../src/trips/domain/canhoto-review.policy.js'
import {
  buildProofInsertValues,
  buildProofUpsertSet,
} from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const EVENT_ID = '00000000-0000-4000-8000-000000000004'
const OBJECT_ID = '00000000-0000-4000-8000-000000000005'
const PROOF_ID = '00000000-0000-4000-8000-000000000006'
const ENVELOPE: SecretEnvelopeV1 = {
  algorithm: 'A256GCM',
  ciphertext: 'ciphertext',
  keyId: 'key-1',
  nonce: 'nonce',
  version: 1,
}

const CANHOTO_COLUMN_PREFIX = 'canhoto'
const RESET_TO_NULL = [
  'canhotoReadDocumentId',
  'canhotoReadNumber',
  'canhotoReadSeries',
  'canhotoReadSource',
  'canhotoReviewAt',
  'canhotoReviewByUserId',
  'canhotoReviewNote',
  'canhotoReviewOrigin',
  'canhotoReviewReason',
] as const

function proofInput(overrides: Partial<Parameters<typeof buildProofUpsertSet>[0]> = {}) {
  return {
    accuracyMeters: null,
    actorUserId: ACTOR_USER_ID,
    attachmentKey: 'chave-nova',
    authorship: { channel: 'driver_app' as const, onBehalfOfDriverId: DRIVER_ID },
    capturedAt: null,
    companyId: COMPANY_ID,
    eventId: EVENT_ID,
    id: PROOF_ID,
    kind: 'photo' as TripDeliveryProofKind,
    lateRegistration: false,
    latitude: null,
    longitude: null,
    mimeType: 'image/jpeg',
    objectId: OBJECT_ID,
    objectKey: 'object-key',
    punctuality: 'not_required' as const,
    receivedBy: null,
    receivedByDetail: null,
    receiverDocumentEnvelope: null,
    receiverDocumentMasked: '',
    receiverName: '',
    sha256: 'a'.repeat(64),
    sizeBytes: 1024,
    ...overrides,
  }
}

describe('o estado inicial da conferência por tipo de comprovante (spec 220 RF24)', () => {
  it('o canhoto nasce pendente: é o único tipo que se confere', () => {
    expect(resolveInitialCanhotoReview('photo')).toBe('pending')
  })

  it('assinatura e foto da mercadoria nascem fora da fila', () => {
    expect(resolveInitialCanhotoReview('signature')).toBe('not_applicable')
    expect(resolveInitialCanhotoReview('cargo')).toBe('not_applicable')
  })

  it('o zeramento apaga tudo o que a conferência anterior escreveu', () => {
    const reset = buildCanhotoReviewReset('photo')

    expect(reset.canhotoReview).toBe('pending')
    for (const column of RESET_TO_NULL) expect(reset[column]).toBeNull()
  })

  it('nenhuma coluna da família canhoto fica de fora do zeramento', () => {
    const schemaColumns = Object.keys(getTableColumns(tripDeliveryProofs)).filter((column) =>
      column.startsWith(CANHOTO_COLUMN_PREFIX),
    )

    expect(Object.keys(buildCanhotoReviewReset('photo')).sort()).toEqual(schemaColumns.sort())
  })
})

describe('o INSERT escreve o estado de propósito, sem confiar no default (spec 220 RF24)', () => {
  it('canhoto novo entra pendente — o default da coluna descreve o passado', () => {
    expect(buildProofInsertValues(proofInput())).toMatchObject({ canhotoReview: 'pending' })
  })

  it('foto da mercadoria entra fora da fila', () => {
    expect(buildProofInsertValues(proofInput({ kind: 'cargo' }))).toMatchObject({
      canhotoReview: 'not_applicable',
    })
  })

  it('o registro tardio continua vindo da entrada, não de um padrão do construtor', () => {
    expect(buildProofInsertValues(proofInput({ lateRegistration: true }))).toMatchObject({
      lateRegistration: true,
      stopEventId: EVENT_ID,
    })
  })
})

describe('a recaptura zera a conferência no ON CONFLICT (spec 220 RF24)', () => {
  it('canhoto recapturado volta para pendente e perde ator, motivo, nota e leitura', () => {
    const set = buildProofUpsertSet(proofInput())

    expect(set).toMatchObject({ canhotoReview: 'pending', objectId: OBJECT_ID })
    for (const column of RESET_TO_NULL) expect(set).toHaveProperty(column, null)
  })

  it('o zeramento também vale no ramo que preserva o envelope do documento', () => {
    const set = buildProofUpsertSet(
      proofInput({ receiverDocumentEnvelope: ENVELOPE, receiverDocumentMasked: '***.456.***' }),
    )

    expect(set).toMatchObject({
      canhotoReview: 'pending',
      receiverDocumentMasked: '***.456.***',
    })
    for (const column of RESET_TO_NULL) expect(set).toHaveProperty(column, null)
  })

  it('assinatura recapturada permanece fora da fila', () => {
    expect(buildProofUpsertSet(proofInput({ kind: 'signature' }))).toMatchObject({
      canhotoReview: 'not_applicable',
    })
  })
})
