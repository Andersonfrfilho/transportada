/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DELIVERY_PROOF_PUNCTUALITY_FIELDS,
  DELIVERY_PROOF_PUNCTUALITY_RANGES,
  isCompanyDeliveryProofSettings,
  isDeliveryProofPunctualityValue,
  resolvePunctualityFieldValue,
} from '../../src/modules/trip/shared/deliveryProofSettings.service'

const PANEL = new URL(
  '../../src/modules/trip/components/TripDeliveryProofSettingsPanel.component.tsx',
  import.meta.url,
)

const VALID_MODES = {
  photo: 'required',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
} as const

function validSettings(overrides: Partial<Record<string, number>> = {}) {
  return {
    ...VALID_MODES,
    ...DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
    ...overrides,
  }
}

/**
 * Spec 159 RF7, ADR-0070 §7: os cinco parâmetros da nota do motorista, junto do comprovante —
 * `proofWindowMinutes` (5-1440), `proofRadiusMeters` (50-5000), `latePenaltyPoints` (0-100),
 * `missingPenaltyPoints` (0-100), `missingAfterHours` (1-168).
 */
describe('os cinco parâmetros da nota do motorista no painel de comprovante (RF7)', () => {
  it('padrão de fábrica: 60 min, 300 m, 5 e 10 pontos, 24 h', () => {
    expect(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS).toEqual({
      latePenaltyPoints: 5,
      missingAfterHours: 24,
      missingPenaltyPoints: 10,
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
    })
  })

  it('as faixas batem com as da API (delivery-proof-settings.schema.ts)', () => {
    expect(DELIVERY_PROOF_PUNCTUALITY_RANGES).toEqual({
      latePenaltyPoints: { max: 100, min: 0 },
      missingAfterHours: { max: 168, min: 1 },
      missingPenaltyPoints: { max: 100, min: 0 },
      proofRadiusMeters: { max: 5000, min: 50 },
      proofWindowMinutes: { max: 1440, min: 5 },
    })
  })

  it('valida dentro e fora da faixa, e recusa não inteiro', () => {
    expect(isDeliveryProofPunctualityValue('proofWindowMinutes', 60)).toBe(true)
    expect(isDeliveryProofPunctualityValue('proofWindowMinutes', 4)).toBe(false)
    expect(isDeliveryProofPunctualityValue('proofWindowMinutes', 1441)).toBe(false)
    expect(isDeliveryProofPunctualityValue('proofWindowMinutes', 60.5)).toBe(false)
  })

  it('a configuração da empresa exige os quatro modos e os cinco parâmetros', () => {
    expect(isCompanyDeliveryProofSettings(validSettings())).toBe(true)
    expect(isCompanyDeliveryProofSettings({ ...VALID_MODES })).toBe(false)
    expect(isCompanyDeliveryProofSettings(validSettings({ proofWindowMinutes: 4 }))).toBe(false)
  })

  /**
   * Spec 159 (T11, item 7): `Number('')` é `0`, e `latePenaltyPoints`/`missingPenaltyPoints`
   * aceitam `0` como valor válido — o campo vazio não pode virar "zero pontos" silenciosamente.
   */
  it('campo vazio nunca vira 0 silencioso — fica inválido até alguém digitar', () => {
    expect(Number.isNaN(resolvePunctualityFieldValue({ draftValue: '', fallback: 5 }))).toBe(true)
    expect(
      isDeliveryProofPunctualityValue(
        'latePenaltyPoints',
        resolvePunctualityFieldValue({ draftValue: '', fallback: 5 }),
      ),
    ).toBe(false)
  })

  it('campo não tocado usa o valor gravado; texto não numérico também fica inválido', () => {
    expect(resolvePunctualityFieldValue({ draftValue: undefined, fallback: 5 })).toBe(5)
    expect(Number.isNaN(resolvePunctualityFieldValue({ draftValue: 'abc', fallback: 5 }))).toBe(
      true,
    )
    expect(resolvePunctualityFieldValue({ draftValue: '7', fallback: 5 })).toBe(7)
  })

  it('o painel tem um campo por parâmetro, com rótulo no locale', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toInclude('resolvePunctualityFieldValue')
    expect(panel).toInclude('DELIVERY_PROOF_PUNCTUALITY_FIELDS')
    for (const field of DELIVERY_PROOF_PUNCTUALITY_FIELDS) {
      expect(trip.deliveryProofSettings.punctuality[field]).toBeString()
    }
  })
})
