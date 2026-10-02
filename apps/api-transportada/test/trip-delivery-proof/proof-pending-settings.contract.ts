/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 RF3/RF4: "canhoto exigido pela configuração" é uma regra só — a escrita
 * (`resolveProofPendingFlag`) e a leitura do detalhe compartilham a mesma função.
 */
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  isProofRequiredBySettings,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'

const withModes = (
  modes: Pick<DeliveryProofFieldSettings, 'photo' | 'signature'>,
): DeliveryProofFieldSettings => ({ ...DEFAULT_DELIVERY_PROOF_SETTINGS, ...modes })

describe('isProofRequiredBySettings (spec 223 RF3)', () => {
  it('photo required exige canhoto', () => {
    expect(isProofRequiredBySettings(withModes({ photo: 'required', signature: 'off' }))).toBe(true)
  })

  it('signature required exige canhoto, mesmo sem foto exigida', () => {
    expect(isProofRequiredBySettings(withModes({ photo: 'optional', signature: 'required' }))).toBe(
      true,
    )
  })

  it('optional e off nunca exigem', () => {
    expect(isProofRequiredBySettings(withModes({ photo: 'optional', signature: 'optional' }))).toBe(
      false,
    )
    expect(isProofRequiredBySettings(withModes({ photo: 'off', signature: 'off' }))).toBe(false)
  })

  it('sem configuração resolvida não exige', () => {
    expect(isProofRequiredBySettings(undefined)).toBe(false)
  })
})
