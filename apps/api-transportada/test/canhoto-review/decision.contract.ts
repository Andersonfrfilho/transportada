/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF27/RF28/RF31: quem decide o veredito do canhoto e o que fica gravado. As CHECK de
 * `trip_delivery_proofs` (`trip.schema.ts:1855-1930`) são a régua: violar qualquer uma daria 23514
 * na escrita, e o defeito só apareceria em produção.
 */
import { describe, expect, test } from 'bun:test'

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
  function automatic(state: CanhotoReviewState, review: 'approved' | 'pending' = 'approved') {
    return resolveAutomaticCanhotoReview({
      command: {
        readDocumentId: DOCUMENT_ID,
        readNumber: '000012345',
        readSeries: '1',
        readSource: review === 'approved' ? 'barcode' : 'ocr',
        review,
      },
      reviewedAt: REVIEWED_AT,
      state,
    })
  }

  test('sobre canhoto já aprovado à mão, nada muda — nem a leitura', () => {
    expect(automatic(MANUALLY_APPROVED)).toEqual({ kind: 'unchanged' })
  })

  test('sobre canhoto já recusado à mão, nada muda', () => {
    expect(automatic(MANUALLY_REJECTED)).toEqual({ kind: 'unchanged' })
  })

  test('sobre pendente, o código de barras aprova e grava a leitura sem ator', () => {
    expect(automatic(PENDING)).toEqual({
      kind: 'apply',
      update: {
        canhotoReadDocumentId: DOCUMENT_ID,
        canhotoReadNumber: '000012345',
        canhotoReadSeries: '1',
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

  test('sugestão do OCR fica pendente: sem origem e sem instante, como a CHECK exige', () => {
    const decision = automatic(PENDING, 'pending')
    expect(decision).toEqual({
      kind: 'apply',
      update: {
        canhotoReadDocumentId: DOCUMENT_ID,
        canhotoReadNumber: '000012345',
        canhotoReadSeries: '1',
        canhotoReadSource: 'ocr',
        canhotoReview: 'pending',
        canhotoReviewAt: null,
        canhotoReviewByUserId: null,
        canhotoReviewNote: null,
        canhotoReviewOrigin: null,
        canhotoReviewReason: null,
      },
    })
  })

  test('o que não se confere não recebe veredito automático', () => {
    expect(() => automatic(NOT_APPLICABLE)).toThrow(CanhotoNotReviewableError)
  })
})

describe('o painel não pode pedir o que o banco recusaria', () => {
  function attempt(command: {
    readDocumentId: null | string
    readNumber: null | string
    readSeries: null | string
    readSource: 'barcode' | 'ocr' | null
    review: 'approved' | 'pending'
  }) {
    return () => resolveAutomaticCanhotoReview({ command, reviewedAt: REVIEWED_AT, state: PENDING })
  }

  test('RF26: aprovação automática sem código de barras é recusada', () => {
    expect(
      attempt({
        readDocumentId: DOCUMENT_ID,
        readNumber: '000012345',
        readSeries: null,
        readSource: 'ocr',
        review: 'approved',
      }),
    ).toThrow(CanhotoAutomaticReviewInvalidError)
  })

  test('número e origem da leitura andam juntos ou não andam', () => {
    expect(
      attempt({
        readDocumentId: DOCUMENT_ID,
        readNumber: null,
        readSeries: null,
        readSource: 'barcode',
        review: 'approved',
      }),
    ).toThrow(CanhotoAutomaticReviewInvalidError)
    expect(
      attempt({
        readDocumentId: DOCUMENT_ID,
        readNumber: '000012345',
        readSeries: null,
        readSource: null,
        review: 'pending',
      }),
    ).toThrow(CanhotoAutomaticReviewInvalidError)
  })

  test('série sem número não existe', () => {
    expect(
      attempt({
        readDocumentId: null,
        readNumber: null,
        readSeries: '1',
        readSource: null,
        review: 'pending',
      }),
    ).toThrow(CanhotoAutomaticReviewInvalidError)
  })

  test('leitura vazia é o estado legítimo de quem não leu nada', () => {
    expect(
      resolveAutomaticCanhotoReview({
        command: {
          readDocumentId: null,
          readNumber: null,
          readSeries: null,
          readSource: null,
          review: 'pending',
        },
        reviewedAt: REVIEWED_AT,
        state: PENDING,
      }).kind,
    ).toBe('apply')
  })
})
