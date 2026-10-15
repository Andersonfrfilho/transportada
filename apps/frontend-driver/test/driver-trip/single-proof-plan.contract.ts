/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  isSingleProofPlan,
  resolveProofFormPlan,
} from '@/modules/driver-trip/shared/proofFormPlan.service'

const NOTHING = {
  cargo: 'off',
  cargoMinimumCount: 2,
  photo: 'off',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
} as const

const GATING_FIELDS = ['photo', 'signature', 'receiverName', 'receiverDocument', 'cargo'] as const

describe('um único comprovante: "Confirmar entrega" já conclui (pedido do usuário, 15/10)', () => {
  it('qualquer comprovante obrigatório sozinho, não só o canhoto, conclui sem "Concluir"', () => {
    for (const field of GATING_FIELDS) {
      const plan = resolveProofFormPlan({ ...NOTHING, [field]: 'required' })
      expect(isSingleProofPlan(plan)).toBe(true)
    }
  })

  it('um segundo campo, obrigatório ou opcional, mantém o "Concluir"', () => {
    for (const first of GATING_FIELDS) {
      for (const second of [...GATING_FIELDS, 'receivedBy'] as const) {
        if (first === second) continue
        for (const requirement of ['optional', 'required'] as const) {
          const plan = resolveProofFormPlan({
            ...NOTHING,
            [first]: 'required',
            [second]: requirement,
          })
          expect(isSingleProofPlan(plan)).toBe(false)
        }
      }
    }
  })

  it('comprovante opcional sozinho não segura a entrega, então não é o caso', () => {
    for (const field of GATING_FIELDS) {
      expect(isSingleProofPlan(resolveProofFormPlan({ ...NOTHING, [field]: 'optional' }))).toBe(
        false,
      )
    }
  })

  it('"Quem recebeu" sozinho nunca segura a entrega (spec 193), então mantém o "Concluir"', () => {
    expect(isSingleProofPlan(resolveProofFormPlan({ ...NOTHING, receivedBy: 'required' }))).toBe(
      false,
    )
  })

  it('nenhum comprovante pedido não é o caso', () => {
    expect(isSingleProofPlan(resolveProofFormPlan(NOTHING))).toBe(false)
  })
})
