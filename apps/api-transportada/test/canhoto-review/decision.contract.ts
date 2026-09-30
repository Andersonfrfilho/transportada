/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF27/RF28/RF31: quem decide o veredito do canhoto e o que fica gravado. As CHECK de
 * `trip_delivery_proofs` (`trip.schema.ts:1855-1930`) são a régua: violar qualquer uma daria 23514
 * na escrita, e o defeito só apareceria em produção.
 */
import { describe, expect, test } from 'bun:test'

import type { TripDeliveryProofCanhotoReadSource } from '../../src/database/trip.schema.js'
import {
  resolveAutomaticCanhotoReview,
  resolveManualCanhotoReview,
  type CanhotoReviewState,
} from '../../src/trips/domain/canhoto-review-decision.policy.js'
import {
  CanhotoAutomaticReviewInvalidError,
  CanhotoNotReviewableError,
  CanhotoReviewAlreadyResolvedError,
  CanhotoReviewNoteLengthError,
  CanhotoReviewNoteNotAllowedError,
  CanhotoReviewNotePersonalDataError,
  CanhotoReviewNoteRequiredError,
} from '../../src/trips/domain/canhoto-review.error.js'

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000a1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'
const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d2'
const DOCUMENT_NUMBER = '12345'
const DOCUMENT_SERIES = '1'
const OTHER_NUMBER = '67890'
const REVIEWED_AT = new Date('2026-09-30T12:00:00.000Z')
const LEGITIMATE_NOTE = 'canhoto rasgado no meio, assinatura cortada ao meio'

const PENDING: CanhotoReviewState = { review: 'pending', reviewOrigin: null }
const AUTO_APPROVED: CanhotoReviewState = { review: 'approved', reviewOrigin: 'automatic' }
const MANUALLY_APPROVED: CanhotoReviewState = { review: 'approved', reviewOrigin: 'manual' }
const MANUALLY_REJECTED: CanhotoReviewState = { review: 'rejected', reviewOrigin: 'manual' }
const NOT_APPLICABLE: CanhotoReviewState = { review: 'not_applicable', reviewOrigin: null }

function approve(state: CanhotoReviewState) {
  return resolveManualCanhotoReview({
    actorUserId: ACTOR_USER_ID,
    command: { action: 'approve' },
    reviewedAt: REVIEWED_AT,
    state,
  })
}

/**
 * A leitura que casa por completo é o caso padrão; cada teste troca **um** eixo para provar que a
 * derivação depende dele. `documentId` e `documentNumber` vêm do servidor, não do corpo.
 */
function automatic(
  overrides: Readonly<{
    documentNumber?: null | string
    readDocumentId?: null | string
    readNumber?: null | string
    readSeries?: null | string
    readSource?: TripDeliveryProofCanhotoReadSource | null
    state: CanhotoReviewState
  }>,
) {
  const { documentNumber, state, ...reading } = overrides
  return resolveAutomaticCanhotoReview({
    command: {
      readDocumentId: DOCUMENT_ID,
      readNumber: DOCUMENT_NUMBER,
      readSeries: DOCUMENT_SERIES,
      readSource: 'barcode',
      ...reading,
    },
    documentId: DOCUMENT_ID,
    documentNumber: documentNumber === undefined ? DOCUMENT_NUMBER : documentNumber,
    reviewedAt: REVIEWED_AT,
    state,
  })
}

function reject(state: CanhotoReviewState, note?: string) {
  return resolveManualCanhotoReview({
    actorUserId: ACTOR_USER_ID,
    command: {
      action: 'reject',
      ...(note === undefined ? {} : { note }),
      reason: note === undefined ? 'illegible' : 'other',
    },
    reviewedAt: REVIEWED_AT,
    state,
  })
}

describe('aprovação e recusa manuais gravam quem e quando (RF27)', () => {
  test('aprovar pendente grava ator, instante e origem manual', () => {
    expect(approve(PENDING)).toEqual({
      kind: 'apply',
      update: {
        canhotoReview: 'approved',
        canhotoReviewAt: REVIEWED_AT,
        canhotoReviewByUserId: ACTOR_USER_ID,
        canhotoReviewNote: null,
        canhotoReviewOrigin: 'manual',
        canhotoReviewReason: null,
      },
    })
  })

  test('recusar grava o motivo, e o motivo fechado não leva nota', () => {
    expect(reject(PENDING)).toEqual({
      kind: 'apply',
      update: {
        canhotoReview: 'rejected',
        canhotoReviewAt: REVIEWED_AT,
        canhotoReviewByUserId: ACTOR_USER_ID,
        canhotoReviewNote: null,
        canhotoReviewOrigin: 'manual',
        canhotoReviewReason: 'illegible',
      },
    })
  })

  test('a mão decide sobre o que a máquina aprovou — aprovação automática não é fim de linha', () => {
    const decision = reject(AUTO_APPROVED)
    expect(decision.kind).toBe('apply')
  })
})

describe('repetir a decisão não gera trilha nova; trocá-la é 409', () => {
  test('aprovar o que já está aprovado à mão não muda nada', () => {
    expect(approve(MANUALLY_APPROVED)).toEqual({ kind: 'unchanged' })
  })

  test('recusar o que já está recusado não muda nada', () => {
    expect(reject(MANUALLY_REJECTED)).toEqual({ kind: 'unchanged' })
  })

  test('aprovar o que foi recusado à mão é 409 — quem decide é gente, não o último clique', () => {
    expect(() => approve(MANUALLY_REJECTED)).toThrow(CanhotoReviewAlreadyResolvedError)
  })

  test('o que não se confere não recebe veredito', () => {
    expect(() => approve(NOT_APPLICABLE)).toThrow(CanhotoNotReviewableError)
    expect(() => reject(NOT_APPLICABLE)).toThrow(CanhotoNotReviewableError)
  })
})

describe('o motivo livre é guardado contra dado pessoal (RF28)', () => {
  test('motivo `other` sem nota é recusado', () => {
    expect(() =>
      resolveManualCanhotoReview({
        actorUserId: ACTOR_USER_ID,
        command: { action: 'reject', reason: 'other' },
        reviewedAt: REVIEWED_AT,
        state: PENDING,
      }),
    ).toThrow(CanhotoReviewNoteRequiredError)
  })

  test('motivo de lista fechada com nota é recusado — a nota é só do `other`', () => {
    expect(() =>
      resolveManualCanhotoReview({
        actorUserId: ACTOR_USER_ID,
        command: { action: 'reject', note: LEGITIMATE_NOTE, reason: 'illegible' },
        reviewedAt: REVIEWED_AT,
        state: PENDING,
      }),
    ).toThrow(CanhotoReviewNoteNotAllowedError)
  })

  test('a nota respeita as bordas da CHECK: 20 a 500 caracteres', () => {
    expect(() => reject(PENDING, 'a'.repeat(19))).toThrow(CanhotoReviewNoteLengthError)
    expect(() => reject(PENDING, 'a'.repeat(501))).toThrow(CanhotoReviewNoteLengthError)
    expect(reject(PENDING, 'a'.repeat(20)).kind).toBe('apply')
    expect(reject(PENDING, 'a'.repeat(500)).kind).toBe('apply')
  })

  test('CPF, CNPJ, telefone, e-mail e CEP na nota são recusados', () => {
    const NOTES_WITH_PERSONAL_DATA = [
      'recebedor informou o CPF 123.456.789-09 na entrega',
      'emitente 12.345.678/0001-99 recusou a mercadoria toda',
      'combinar retorno pelo telefone (11) 98888-7777 amanha',
      'enviar copia para contato@transportadora.com.br depois',
      'entregar no CEP 01310-100, na portaria dos fundos',
    ] as const
    for (const note of NOTES_WITH_PERSONAL_DATA) {
      expect(() => reject(PENDING, note)).toThrow(CanhotoReviewNotePersonalDataError)
    }
  })

  test('motivo legítimo passa — guarda que barra o certo é guarda que se aprende a driblar', () => {
    expect(reject(PENDING, LEGITIMATE_NOTE).kind).toBe('apply')
  })
})

describe('o resultado automático nunca sobrescreve decisão humana (T6.6)', () => {
  test('sobre canhoto já aprovado à mão, nada muda — nem a leitura', () => {
    expect(automatic({ state: MANUALLY_APPROVED })).toEqual({ kind: 'unchanged' })
  })

  test('sobre canhoto já recusado à mão, nada muda', () => {
    expect(automatic({ state: MANUALLY_REJECTED })).toEqual({ kind: 'unchanged' })
  })

  test('o que não se confere não recebe veredito automático', () => {
    expect(() => automatic({ state: NOT_APPLICABLE })).toThrow(CanhotoNotReviewableError)
  })
})

/**
 * T7.1: o cliente entrega o que **leu**, e quem decide é o servidor. As três condições da RF26 —
 * código de barras, a nota da rota e o número daquela nota — valem juntas ou não valem.
 */
describe('o veredito automático é derivado no servidor, nunca pedido pelo cliente (T7.1)', () => {
  test('código de barras na nota da rota, com o número dela, aprova e grava a leitura sem ator', () => {
    expect(automatic({ state: PENDING })).toEqual({
      kind: 'apply',
      update: {
        canhotoReadDocumentId: DOCUMENT_ID,
        canhotoReadNumber: DOCUMENT_NUMBER,
        canhotoReadSeries: DOCUMENT_SERIES,
        canhotoReadSource: 'barcode',
        canhotoReview: 'approved',
        canhotoReviewAt: REVIEWED_AT,
        canhotoReviewByUserId: null,
        canhotoReviewNote: null,
        canhotoReviewOrigin: 'automatic',
        canhotoReviewReason: null,
      },
    })
  })

  test('número lido diferente do número da nota não aprova — a leitura fica como sugestão', () => {
    expect(automatic({ readNumber: OTHER_NUMBER, state: PENDING })).toEqual({
      kind: 'apply',
      update: {
        canhotoReadDocumentId: DOCUMENT_ID,
        canhotoReadNumber: OTHER_NUMBER,
        canhotoReadSeries: DOCUMENT_SERIES,
        canhotoReadSource: 'barcode',
        canhotoReview: 'pending',
        canhotoReviewAt: null,
        canhotoReviewByUserId: null,
        canhotoReviewNote: null,
        canhotoReviewOrigin: null,
        canhotoReviewReason: null,
      },
    })
  })

  test('leitura que aponta outra nota não aprova a nota da rota', () => {
    const decision = automatic({ readDocumentId: OTHER_DOCUMENT_ID, state: PENDING })
    expect(decision).toMatchObject({
      kind: 'apply',
      update: { canhotoReadDocumentId: OTHER_DOCUMENT_ID, canhotoReview: 'pending' },
    })
  })

  test('RF26: OCR com a nota e o número certos continua pendente — OCR nunca aprova sozinho', () => {
    expect(automatic({ readSource: 'ocr', state: PENDING })).toMatchObject({
      kind: 'apply',
      update: {
        canhotoReadSource: 'ocr',
        canhotoReview: 'pending',
        canhotoReviewAt: null,
        canhotoReviewOrigin: null,
      },
    })
  })

  test('nota sem número conhecido não aprova: não há contra o que conferir', () => {
    expect(automatic({ documentNumber: null, state: PENDING })).toMatchObject({
      kind: 'apply',
      update: { canhotoReview: 'pending' },
    })
  })

  test('máquina nunca recusa: nenhuma combinação de leitura produz `rejected`', () => {
    const readings = [
      {},
      { readDocumentId: OTHER_DOCUMENT_ID },
      { readNumber: OTHER_NUMBER },
      { readSource: 'ocr' as const },
      { documentNumber: null },
      { readDocumentId: null, readNumber: null, readSeries: null, readSource: null },
    ] as const
    for (const reading of readings) {
      const decision = automatic({ ...reading, state: PENDING })
      expect(decision.kind === 'apply' && decision.update.canhotoReview).not.toBe('rejected')
    }
  })
})

describe('o painel não pode pedir o que o banco recusaria', () => {
  test('número e origem da leitura andam juntos ou não andam', () => {
    expect(() => automatic({ readNumber: null, state: PENDING })).toThrow(
      CanhotoAutomaticReviewInvalidError,
    )
    expect(() => automatic({ readSource: null, state: PENDING })).toThrow(
      CanhotoAutomaticReviewInvalidError,
    )
  })

  test('série sem número não existe', () => {
    expect(() =>
      automatic({ readDocumentId: null, readNumber: null, readSource: null, state: PENDING }),
    ).toThrow(CanhotoAutomaticReviewInvalidError)
  })

  test('leitura vazia é o estado legítimo de quem não leu nada', () => {
    expect(
      automatic({
        readDocumentId: null,
        readNumber: null,
        readSeries: null,
        readSource: null,
        state: PENDING,
      }).kind,
    ).toBe('apply')
  })
})
