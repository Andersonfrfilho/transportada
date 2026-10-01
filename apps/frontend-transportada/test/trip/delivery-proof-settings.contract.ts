/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  isCompanyDeliveryProofSettings,
  isDeliveryProofFieldSettings,
  mergeDeliveryProofSettings,
  normalizeDeliveryProofFieldSettings,
  resolveDeliveryProofSettings,
  type DeliveryProofFieldSettings,
} from '../../src/modules/trip/shared/deliveryProofSettings.service'

import { SYNTHETIC_ACCESS_TOKEN } from './trip.fixture'

const GENERAL: DeliveryProofFieldSettings = {
  cargo: 'optional',
  cargoMinimumCount: 2,
  photo: 'required',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}
const CONTRACTOR: DeliveryProofFieldSettings = {
  cargo: 'required',
  cargoMinimumCount: 3,
  photo: 'off',
  receiverDocument: 'required',
  receiverName: 'off',
  signature: 'off',
}
const RECIPIENT: DeliveryProofFieldSettings = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'optional',
  receiverDocument: 'optional',
  receiverName: 'required',
  signature: 'required',
}

/** Spec 220 RF01/RF06 + spec 218 RF-C3: o painel espelha a API — a exceção vence por inteiro. */
describe('cascata do comprovante com a foto da mercadoria (spec 220)', () => {
  it('a fábrica traz cargo desligado e mínimo 1', () => {
    expect(DEFAULT_DELIVERY_PROOF_SETTINGS.cargo).toBe('off')
    expect(DEFAULT_DELIVERY_PROOF_SETTINGS.cargoMinimumCount).toBe(1)
  })

  it('sem nenhuma linha vale a fábrica', () => {
    expect(
      resolveDeliveryProofSettings({
        contractorOverride: undefined,
        general: undefined,
        recipientOverride: undefined,
      }),
    ).toEqual(DEFAULT_DELIVERY_PROOF_SETTINGS)
  })

  it('a geral vence a fábrica', () => {
    expect(
      resolveDeliveryProofSettings({
        contractorOverride: undefined,
        general: GENERAL,
        recipientOverride: undefined,
      }),
    ).toEqual(GENERAL)
  })

  it('o contratante vence a geral por inteiro, cargo e mínimo juntos', () => {
    const resolved = resolveDeliveryProofSettings({
      contractorOverride: CONTRACTOR,
      general: GENERAL,
      recipientOverride: undefined,
    })
    expect(resolved).toEqual(CONTRACTOR)
    expect(resolved.cargoMinimumCount).toBe(3)
  })

  it('o destinatário vence o contratante e a geral por inteiro', () => {
    const resolved = resolveDeliveryProofSettings({
      contractorOverride: CONTRACTOR,
      general: GENERAL,
      recipientOverride: RECIPIENT,
    })
    expect(resolved).toEqual(RECIPIENT)
    expect(resolved.cargo).toBe('off')
    expect(resolved.cargoMinimumCount).toBe(1)
  })

  it('o mínimo nunca vem de outra fonte que não a do modo', () => {
    const resolved = resolveDeliveryProofSettings({
      contractorOverride: { ...CONTRACTOR, cargo: 'optional', cargoMinimumCount: 1 },
      general: { ...GENERAL, cargo: 'required', cargoMinimumCount: 5 },
      recipientOverride: undefined,
    })
    expect(resolved.cargo).toBe('optional')
    expect(resolved.cargoMinimumCount).toBe(1)
  })

  it('o rascunho da exceção parte da geral, inclusive cargo e mínimo', () => {
    expect(mergeDeliveryProofSettings({ base: GENERAL, override: {} })).toEqual(GENERAL)
    expect(
      mergeDeliveryProofSettings({
        base: GENERAL,
        override: { cargo: 'required', cargoMinimumCount: 4 },
      }),
    ).toEqual({ ...GENERAL, cargo: 'required', cargoMinimumCount: 4 })
  })

  it('a guarda recusa cargo inválido e mínimo fora de 1 a 5, quando presentes', () => {
    expect(isDeliveryProofFieldSettings(GENERAL)).toBe(true)
    expect(isDeliveryProofFieldSettings({ ...GENERAL, cargo: 'always' })).toBe(false)
    expect(isDeliveryProofFieldSettings({ ...GENERAL, cargoMinimumCount: 0 })).toBe(false)
    expect(isDeliveryProofFieldSettings({ ...GENERAL, cargoMinimumCount: 6 })).toBe(false)
    expect(isDeliveryProofFieldSettings({ ...GENERAL, cargoMinimumCount: 1.5 })).toBe(false)
  })

  it('a resposta da API anterior, sem cargo nem mínimo, é aceita e vira off/1', () => {
    expect(isDeliveryProofFieldSettings(LEGACY)).toBe(true)
    expect(normalizeDeliveryProofFieldSettings(LEGACY)).toEqual({
      ...LEGACY,
      cargo: 'off',
      cargoMinimumCount: 1,
    })
    expect(normalizeDeliveryProofFieldSettings(GENERAL)).toEqual(GENERAL)
  })
})

const LEGACY = {
  photo: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
} as const

const COMPANY_LEGACY = {
  ...LEGACY,
  canhotoOcrEnabled: false,
  latePenaltyPoints: 5,
  missingAfterHours: 24,
  missingPenaltyPoints: 10,
  proofRadiusMeters: 300,
  proofWindowMinutes: 60,
}

function clientRespondingWith(data: unknown): ReturnType<typeof createTripClient> {
  return createTripClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(Response.json({ data })),
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

/** ⚠️ Bundle novo contra API anterior (janela de deploy, reversão): não pode virar tela quebrada. */
describe('o cliente aceita a API anterior à foto da mercadoria (spec 220)', () => {
  it('a guarda da empresa aceita a resposta sem cargo', () => {
    expect(isCompanyDeliveryProofSettings(COMPANY_LEGACY)).toBe(true)
    expect(isCompanyDeliveryProofSettings({ ...COMPANY_LEGACY, cargo: 'always' })).toBe(false)
  })

  it('readDeliveryProofSettings e os dois PUT devolvem off/1', async () => {
    const client = clientRespondingWith(COMPANY_LEGACY)
    const input = { ...COMPANY_LEGACY, cargo: 'required', cargoMinimumCount: 2 } as const
    for (const settings of [
      await client.readDeliveryProofSettings(),
      await client.saveDeliveryProofSettings(input),
      await client.saveCanhotoOcrEnabled(input),
    ]) {
      expect(settings.cargo).toBe('off')
      expect(settings.cargoMinimumCount).toBe(1)
    }
  })

  it('readSettingsResolution normaliza o comprovante resolvido', async () => {
    const client = clientRespondingWith({ deliveryProof: LEGACY, occurrenceTypes: [] })
    const view = await client.readSettingsResolution({ contractorId: null, recipientTaxId: null })
    expect(view.deliveryProof.cargo).toBe('off')
    expect(view.deliveryProof.cargoMinimumCount).toBe(1)
  })

  it('as listas de exceção normalizam cada linha', async () => {
    const byTaxId = await clientRespondingWith({
      overrides: [{ ...LEGACY, taxId: '12345678000190' }],
    }).listDeliveryProofOverrides()
    expect(byTaxId[0]?.cargo).toBe('off')
    const byContractor = await clientRespondingWith({
      overrides: [{ ...LEGACY, contractorId: 'contractor-1' }],
    }).listDeliveryProofContractorOverrides()
    expect(byContractor[0]?.cargoMinimumCount).toBe(1)
  })

  it('cargo presente e inválido continua sendo RESPONSE_INVALID', () => {
    const client = clientRespondingWith({ ...COMPANY_LEGACY, cargoMinimumCount: 9 })
    return expect(client.readDeliveryProofSettings()).rejects.toThrow('TRIP_RESPONSE_INVALID')
  })
})
