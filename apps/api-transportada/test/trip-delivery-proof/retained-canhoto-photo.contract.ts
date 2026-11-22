/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 (21/11/2026): a nota com canhoto retido aberto só se entrega com a foto do canhoto, qualquer que seja a
 * configuração do comprovante. A UNICA em staging (foto opcional) baixou a NF 170572 sem foto e a ocorrência resolveu.
 */
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  isProofRequiredBySettings,
  requirePhotoForRetainedCanhoto,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'

describe('requirePhotoForRetainedCanhoto', () => {
  it('foto opcional vira obrigatória quando o canhoto está retido, e a nota passa a contar como pendente', () => {
    const resolved = requirePhotoForRetainedCanhoto(DEFAULT_DELIVERY_PROOF_SETTINGS, true)
    expect(resolved.photo).toBe('required')
    expect(isProofRequiredBySettings(resolved)).toBe(true)
    expect(resolved.signature).toBe(DEFAULT_DELIVERY_PROOF_SETTINGS.signature)
  })

  it('foto desligada também vira obrigatória: o canhoto é o que a ocorrência cobra', () => {
    const off: DeliveryProofFieldSettings = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, photo: 'off' }
    expect(requirePhotoForRetainedCanhoto(off, true).photo).toBe('required')
  })

  it('sem canhoto retido a configuração segue como está', () => {
    expect(requirePhotoForRetainedCanhoto(DEFAULT_DELIVERY_PROOF_SETTINGS, false)).toBe(
      DEFAULT_DELIVERY_PROOF_SETTINGS,
    )
  })
})
