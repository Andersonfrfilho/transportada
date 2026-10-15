/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  resolveProofFocusTargets,
  type ProofFocusState,
} from '@/modules/driver-trip/shared/proofFocusTargets.service'
import type { DriverDeliveryProofSettings } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  resolveProofFormPlan,
  type ProofFormPlan,
} from '@/modules/driver-trip/shared/proofFormPlan.service'

const NOTHING: DriverDeliveryProofSettings = {
  cargo: 'off',
  cargoMinimumCount: 2,
  photo: 'off',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
}

const EMPTY: ProofFocusState = {
  cargoCount: 0,
  hasPhoto: false,
  hasSignature: false,
  receivedBy: '',
  receiverDocument: '',
  receiverName: '',
}

function planWith(overrides: Partial<DriverDeliveryProofSettings>): ProofFormPlan {
  return resolveProofFormPlan({ ...NOTHING, ...overrides })
}

const FIELDS = [
  { field: 'photo', filled: { hasPhoto: true }, target: 'proof-photo' },
  { field: 'signature', filled: { hasSignature: true }, target: 'proof-signature' },
  { field: 'receivedBy', filled: { receivedBy: 'recipient' }, target: 'proof-received-by' },
  { field: 'receiverName', filled: { receiverName: 'Maria' }, target: 'proof-receiver-name' },
  {
    field: 'receiverDocument',
    filled: { receiverDocument: '12345678909' },
    target: 'proof-receiver-document',
  },
  { field: 'cargo', filled: { cargoCount: 2 }, target: 'proof-cargo' },
] as const

describe('qual comprovante recebe o foco (pedido do usuário, 15/10)', () => {
  for (const { field, filled, target } of FIELDS) {
    it(`${field} obrigatório e vazio é alvo; preenchido, não é`, () => {
      const plan = planWith({ [field]: 'required' })
      expect(resolveProofFocusTargets({ plan, state: EMPTY })[field]).toBe(target)
      expect(
        resolveProofFocusTargets({ plan, state: { ...EMPTY, ...filled } })[field],
      ).toBeUndefined()
    })

    it(`${field} opcional ou desligado nunca é alvo`, () => {
      for (const requirement of ['optional', 'off'] as const) {
        const plan = planWith({ [field]: requirement })
        expect(resolveProofFocusTargets({ plan, state: EMPTY })[field]).toBeUndefined()
      }
    })
  }

  it('cargo só é alvo enquanto faltam fotos para o mínimo', () => {
    const plan = planWith({ cargo: 'required' })
    expect(resolveProofFocusTargets({ plan, state: { ...EMPTY, cargoCount: 1 } }).cargo).toBe(
      'proof-cargo',
    )
    expect(
      resolveProofFocusTargets({ plan, state: { ...EMPTY, cargoCount: 2 } }).cargo,
    ).toBeUndefined()
  })

  it('o nome só com espaços ainda está vazio', () => {
    const plan = planWith({ receiverName: 'required' })
    expect(
      resolveProofFocusTargets({ plan, state: { ...EMPTY, receiverName: '   ' } }).receiverName,
    ).toBe('proof-receiver-name')
  })

  it('vários obrigatórios: todos os vazios são alvos, e preencher um tira só o dele', () => {
    const plan = planWith({ photo: 'required', receiverName: 'required', signature: 'required' })
    const targets = resolveProofFocusTargets({ plan, state: EMPTY })
    expect(Object.values(targets).filter((value) => value !== undefined)).toEqual([
      'proof-photo',
      'proof-receiver-name',
      'proof-signature',
    ])
    const withPhoto = resolveProofFocusTargets({ plan, state: { ...EMPTY, hasPhoto: true } })
    expect(withPhoto.photo).toBeUndefined()
    expect(withPhoto.receiverName).toBe('proof-receiver-name')
    expect(withPhoto.signature).toBe('proof-signature')
  })

  it('nada pedido ou tudo preenchido: ninguém é alvo e o foco vai ao botão de concluir', () => {
    const none = resolveProofFocusTargets({ plan: planWith({}), state: EMPTY })
    expect(Object.values(none).every((value) => value === undefined)).toBe(true)
    const all = planWith({
      cargo: 'required',
      photo: 'required',
      receivedBy: 'required',
      receiverDocument: 'required',
      receiverName: 'required',
      signature: 'required',
    })
    const done = resolveProofFocusTargets({
      plan: all,
      state: {
        cargoCount: 2,
        hasPhoto: true,
        hasSignature: true,
        receivedBy: 'recipient',
        receiverDocument: '12345678909',
        receiverName: 'Maria',
      },
    })
    expect(Object.values(done).every((value) => value === undefined)).toBe(true)
  })
})
