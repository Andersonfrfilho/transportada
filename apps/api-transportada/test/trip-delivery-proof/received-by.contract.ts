/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 D2/D5/D6 (ADR-0079 §A3): quem recebeu tem duas formas de entrada. A do motorista é
 * tolerante e **nunca** recusa — um 400 viraria `rejectionCause` na fila do aparelho e a foto seria
 * descartada em 7 dias. A do escritório é síncrona e estrita: 400 com `details`. A configuração
 * (`off | optional | required`) é aplicada por canal, e `required` só recusa no escritório.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS,
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  resolveProofSettingsForRecipient,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { applyReceivedBySettings } from '../../src/trips/domain/received-by.policy.js'
import { TripDeliveryProofReceivedByRequiredError } from '../../src/trips/domain/trip-field-office.error.js'
import {
  companyDeliveryProofSettingsSchema,
  deliveryProofOverridesSchema,
} from '../../src/trips/presentation/delivery-proof-settings.schema.js'
import {
  normalizeReceivedBy,
  parseReceivedByStrict,
} from '../../src/trips/presentation/received-by.schema.js'

const EMPTY = { receivedBy: null, receivedByDetail: null } as const

function captureError(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe('normalizeReceivedBy: a forma do motorista nunca recusa (spec 193 D2)', () => {
  it('ausente é nulo nos dois campos', () => {
    expect(normalizeReceivedBy({})).toEqual(EMPTY)
  })

  it('aplica trim, tira caracteres de controle e guarda relação e detalhe', () => {
    expect(
      normalizeReceivedBy({
        receivedBy: ' neighbor ',
        receivedByDetail: '  casa\u0000 12\u0007  ',
      }),
    ).toEqual({ receivedBy: 'neighbor', receivedByDetail: 'casa 12' })
  })

  it('corta o detalhe em 120 caracteres', () => {
    const detail = normalizeReceivedBy({ receivedBy: 'other', receivedByDetail: 'x'.repeat(200) })

    expect(detail.receivedByDetail).toHaveLength(120)
  })

  it('código fora da lista vira nulo, e o detalhe sem relação vai junto', () => {
    expect(normalizeReceivedBy({ receivedBy: 'cousin', receivedByDetail: 'casa 12' })).toEqual(
      EMPTY,
    )
    expect(normalizeReceivedBy({ receivedByDetail: 'casa 12' })).toEqual(EMPTY)
  })

  it('a relação que pede detalhe e veio sem ele é gravada assim mesmo (a tela marca a pendência)', () => {
    expect(normalizeReceivedBy({ receivedBy: 'other' })).toEqual({
      receivedBy: 'other',
      receivedByDetail: null,
    })
    expect(normalizeReceivedBy({ receivedBy: 'other_relative', receivedByDetail: '   ' })).toEqual({
      receivedBy: 'other_relative',
      receivedByDetail: null,
    })
  })

  it.each([
    [null, null],
    [42, { nested: true }],
    [['neighbor'], 12],
    ['', ''],
  ])('nunca lança, qualquer que seja o valor (%p, %p)', (receivedBy, receivedByDetail) => {
    expect(() => normalizeReceivedBy({ receivedBy, receivedByDetail })).not.toThrow()
    expect(normalizeReceivedBy({ receivedBy, receivedByDetail })).toEqual(EMPTY)
  })
})

describe('parseReceivedByStrict: a forma do escritório responde 400 com details (spec 193 D2)', () => {
  it('forma válida devolve o mesmo que a tolerante', () => {
    expect(
      parseReceivedByStrict({ receivedBy: 'neighbor', receivedByDetail: ' casa 12 ' }),
    ).toEqual({ receivedBy: 'neighbor', receivedByDetail: 'casa 12' })
    expect(parseReceivedByStrict({})).toEqual(EMPTY)
  })

  it.each([
    ['código fora da lista', { receivedBy: 'cousin' }, 'receivedBy'],
    ['detalhe sem relação', { receivedByDetail: 'casa 12' }, 'receivedByDetail'],
    [
      'detalhe longo demais',
      { receivedBy: 'other', receivedByDetail: 'x'.repeat(121) },
      'receivedByDetail',
    ],
    ['"outro" sem detalhe', { receivedBy: 'other' }, 'receivedByDetail'],
    ['"outro familiar" sem detalhe', { receivedBy: 'other_relative' }, 'receivedByDetail'],
  ])('%s → 400 INVALID_REQUEST no campo', (_label, input, field) => {
    const error = captureError(() => parseReceivedByStrict(input))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).code).toBe('INVALID_REQUEST')
    expect((error as ApiError).details?.map((detail) => detail.field)).toEqual([field])
  })
})

describe('applyReceivedBySettings: o modo por canal (spec 193 D5)', () => {
  const VALUE = { receivedBy: 'neighbor', receivedByDetail: 'casa 12' } as const

  it.each(['driver_app', 'office'] as const)('off descarta no canal %s', (channel) => {
    expect(applyReceivedBySettings({ channel, mode: 'off', value: VALUE })).toEqual(EMPTY)
  })

  it.each(['driver_app', 'office'] as const)('optional guarda no canal %s', (channel) => {
    expect(applyReceivedBySettings({ channel, mode: 'optional', value: VALUE })).toEqual(VALUE)
    expect(applyReceivedBySettings({ channel, mode: 'optional', value: EMPTY })).toEqual(EMPTY)
  })

  it('required sem relação no motorista grava nulo — pendência, nunca recusa', () => {
    expect(
      applyReceivedBySettings({ channel: 'driver_app', mode: 'required', value: EMPTY }),
    ).toEqual(EMPTY)
  })

  it('required sem relação no escritório é 422 TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED', () => {
    const error = captureError(() =>
      applyReceivedBySettings({ channel: 'office', mode: 'required', value: EMPTY }),
    )

    expect(error).toBeInstanceOf(TripDeliveryProofReceivedByRequiredError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).code).toBe('TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED')
    expect(applyReceivedBySettings({ channel: 'office', mode: 'required', value: VALUE })).toEqual(
      VALUE,
    )
  })
})

describe('quem recebeu na configuração (spec 193 D6, CA01, CA02)', () => {
  const MODES = {
    photo: 'optional',
    receiverDocument: 'off',
    receiverName: 'optional',
    signature: 'optional',
  } as const

  it('o padrão de fábrica é optional, na geral e no resolvido por nota', () => {
    expect(DEFAULT_DELIVERY_PROOF_SETTINGS.receivedBy).toBe('optional')
    expect(DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS.receivedBy).toBe('optional')
    expect(
      resolveProofSettingsForRecipient({
        lookup: { general: null, overridesByTaxId: new Map() },
        recipientTaxId: '12345678000199',
      }).receivedBy,
    ).toBe('optional')
  })

  it('o PUT geral aceita o campo ausente (o painel antigo) e presente, e recusa modo inválido', () => {
    expect(companyDeliveryProofSettingsSchema.safeParse(MODES).success).toBe(true)
    expect(
      companyDeliveryProofSettingsSchema.safeParse({ ...MODES, receivedBy: 'required' }).success,
    ).toBe(true)
    expect(
      companyDeliveryProofSettingsSchema.safeParse({ ...MODES, receivedBy: 'always' }).success,
    ).toBe(false)
  })

  it('a exceção aceita o campo ausente e presente', () => {
    const override = { ...MODES, taxId: '12345678000199' }

    expect(deliveryProofOverridesSchema.safeParse({ overrides: [override] }).success).toBe(true)
    expect(
      deliveryProofOverridesSchema.safeParse({ overrides: [{ ...override, receivedBy: 'off' }] })
        .success,
    ).toBe(true)
  })

  it('a exceção vence a geral por inteiro, inclusive neste campo', () => {
    const general = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, receivedBy: 'required' } as const
    const override = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, receivedBy: 'off' } as const

    expect(
      resolveProofSettingsForRecipient({
        lookup: { general, overridesByTaxId: new Map([['12345678000199', override]]) },
        recipientTaxId: '12345678000199',
      }).receivedBy,
    ).toBe('off')
  })
})
