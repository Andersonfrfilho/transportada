/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF29 / CA12: canhoto recusado **volta como trabalho**. A nota reaparece na fila de fotos
 * pendentes do motorista, com o motivo visível, e só sai de lá quando a recaptura substitui a foto.
 *
 * A regra vive numa política pura porque a fila do motorista a consulta dentro de um `flatMap` sobre
 * o resultado de uma consulta com sete junções: provar ali exigiria Postgres para cada caso de
 * borda, e o caso de borda é justamente o que ninguém escreve.
 */
import { describe, expect, it } from 'bun:test'

import { TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_REASONS } from '../../src/database/trip.schema.js'
import {
  type CanhotoRecaptureState,
  isDeliveryProofSettled,
  resolveCanhotoRejection,
} from '../../src/trips/domain/canhoto-recapture.policy.js'

const NO_PROOF: CanhotoRecaptureState = { hasProof: false, note: null, reason: null, review: null }

function buildState(overrides: Partial<CanhotoRecaptureState>): CanhotoRecaptureState {
  return { ...NO_PROOF, hasProof: true, review: 'pending', ...overrides }
}

describe('a foto fecha a pendência, a recusa reabre (RF29)', () => {
  it('sem comprovante nenhum a nota continua pendente', () => {
    expect(isDeliveryProofSettled(NO_PROOF)).toBe(false)
  })

  it('canhoto pendente de conferência já fecha a pendência do motorista', () => {
    expect(isDeliveryProofSettled(buildState({ review: 'pending' }))).toBe(true)
  })

  it('canhoto aprovado fecha a pendência', () => {
    expect(isDeliveryProofSettled(buildState({ review: 'approved' }))).toBe(true)
  })

  /** O coração da RF29: a foto existe, e mesmo assim a nota volta para a fila. */
  it('canhoto recusado NÃO fecha a pendência', () => {
    expect(isDeliveryProofSettled(buildState({ reason: 'illegible', review: 'rejected' }))).toBe(
      false,
    )
  })

  /**
   * A conferência não se aplica a assinatura nem a foto da mercadoria; `not_applicable` com foto no
   * lugar é comprovante entregue, não pendência.
   */
  it('comprovante sem conferência aplicável fecha a pendência', () => {
    expect(isDeliveryProofSettled(buildState({ review: 'not_applicable' }))).toBe(true)
  })
})

describe('o motivo viaja com a pendência, o resto não (RF29)', () => {
  it('sem recusa não há motivo a mostrar', () => {
    expect(resolveCanhotoRejection(NO_PROOF)).toBeUndefined()
    expect(resolveCanhotoRejection(buildState({ review: 'pending' }))).toBeUndefined()
    expect(resolveCanhotoRejection(buildState({ review: 'approved' }))).toBeUndefined()
  })

  it('recusa da lista fechada devolve o motivo', () => {
    expect(
      resolveCanhotoRejection(buildState({ reason: 'illegible', review: 'rejected' })),
    ).toEqual({ reason: 'illegible' })
  })

  /** `other` sozinho não diz nada ao motorista — o texto livre é o motivo, e a RF28 já o limpou. */
  it('`other` leva junto o texto livre', () => {
    expect(
      resolveCanhotoRejection(
        buildState({
          note: 'o canhoto ficou fora do enquadramento, refazer com a nota inteira',
          reason: 'other',
          review: 'rejected',
        }),
      ),
    ).toEqual({
      note: 'o canhoto ficou fora do enquadramento, refazer com a nota inteira',
      reason: 'other',
    })
  })

  /** `exactOptionalPropertyTypes`: a nota ausente some do objeto, em vez de virar `undefined`. */
  it('motivo sem texto livre não carrega a chave da nota', () => {
    const rejection = resolveCanhotoRejection(
      buildState({ reason: 'missing_signature', review: 'rejected' }),
    )

    expect(rejection === undefined ? [] : Object.keys(rejection)).toEqual(['reason'])
  })

  it('todo motivo da lista fechada chega ao motorista', () => {
    for (const reason of TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_REASONS) {
      expect(resolveCanhotoRejection(buildState({ reason, review: 'rejected' }))?.reason).toBe(
        reason,
      )
    }
  })

  /**
   * A CHECK do banco casa `reason is not null` com `review = 'rejected'`, mas uma linha antiga de um
   * `UPDATE` manual passaria aqui sem motivo — a pendência vale mesmo assim, só sem a explicação.
   */
  it('recusa sem motivo ainda reabre a pendência, só não explica', () => {
    const state = buildState({ review: 'rejected' })

    expect(isDeliveryProofSettled(state)).toBe(false)
    expect(resolveCanhotoRejection(state)).toBeUndefined()
  })
})
