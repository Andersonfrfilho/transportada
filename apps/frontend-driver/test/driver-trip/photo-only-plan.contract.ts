/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  isPhotoOnlyPlan,
  resolveProofFormPlan,
} from '@/modules/driver-trip/shared/proofFormPlan.service'

const PHOTO_ONLY = {
  cargo: 'off',
  cargoMinimumCount: 0,
  photo: 'required',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
} as const

describe('canhoto como único comprovante (pedido do usuário, 15/10)', () => {
  it('só a foto pedida: o "Confirmar entrega" já conclui, sem "Concluir"', () => {
    expect(isPhotoOnlyPlan(resolveProofFormPlan(PHOTO_ONLY))).toBe(true)
  })

  it('qualquer outro comprovante, obrigatório ou opcional, mantém o "Concluir"', () => {
    for (const field of ['cargo', 'receivedBy', 'receiverDocument', 'receiverName', 'signature']) {
      for (const requirement of ['optional', 'required'] as const) {
        const plan = resolveProofFormPlan({ ...PHOTO_ONLY, [field]: requirement })
        expect(isPhotoOnlyPlan(plan)).toBe(false)
      }
    }
  })

  it('sem foto na configuração não é o caso do canhoto único', () => {
    expect(isPhotoOnlyPlan(resolveProofFormPlan({ ...PHOTO_ONLY, photo: 'off' }))).toBe(false)
  })
})
