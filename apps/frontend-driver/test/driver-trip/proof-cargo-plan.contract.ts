/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { DriverDeliveryProofSettings } from '@/modules/driver-trip/shared/driverTrip.types'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import { PROOF_CARGO_PHOTO_LIMIT } from '@/modules/driver-trip/shared/proofCargo.constant'
import {
  countMissingCargoPhotos,
  DEFAULT_PROOF_SETTINGS,
  listMissingProofFields,
  requiresProofBeforeDelivery,
  resolveProofFormPlan,
  type ProofFormPlan,
  type ProofFormValues,
} from '@/modules/driver-trip/shared/proofFormPlan.service'

function cargoSettings(
  overrides: Partial<DriverDeliveryProofSettings> = {},
): DriverDeliveryProofSettings {
  return {
    ...DEFAULT_PROOF_SETTINGS,
    cargo: 'optional',
    cargoMinimumCount: 1,
    ...overrides,
  }
}

function planFor(overrides: Partial<DriverDeliveryProofSettings>): ProofFormPlan {
  return resolveProofFormPlan(cargoSettings(overrides))
}

function valuesWith(cargoCount: number, overrides: Partial<ProofFormValues> = {}): ProofFormValues {
  return {
    hasPhoto: true,
    hasSignature: true,
    receiverDocument: '',
    receiverName: 'Maria',
    ...overrides,
    cargoCount,
  }
}

function missingFor(plan: ProofFormPlan, values: ProofFormValues): readonly string[] {
  return listMissingProofFields({ plan, values })
}

describe('a foto da mercadoria no plano do comprovante (spec 220 RF05)', () => {
  it('"off" não renderiza a foto da mercadoria; "optional" e "required" renderizam', () => {
    expect(planFor({ cargo: 'off' }).rendersCargo).toBe(false)
    expect(planFor({ cargo: 'optional' }).rendersCargo).toBe(true)
    expect(planFor({ cargo: 'required' }).rendersCargo).toBe(true)
  })

  it('a foto da mercadoria não muda o que o canhoto renderiza, e vice-versa', () => {
    const plan = planFor({ cargo: 'off', photo: 'required' })
    expect(plan.rendersCargo).toBe(false)
    expect(plan.rendersPhoto).toBe(true)
    expect(planFor({ cargo: 'required', photo: 'off' }).rendersPhoto).toBe(false)
  })

  it('sem configuração no snapshot, a mercadoria não bloqueia nada', () => {
    const plan = resolveProofFormPlan(null)
    expect(missingFor(plan, valuesWith(0))).not.toContain('cargo')
  })
})

describe('o mínimo de fotos da mercadoria conta só em "required" (spec 220 RF06/RF07)', () => {
  it('"required" com mínimo 1 e nenhuma foto: cargo entra nas faltantes', () => {
    const plan = planFor({ cargo: 'required', cargoMinimumCount: 1 })
    expect(missingFor(plan, valuesWith(0))).toContain('cargo')
  })

  it('"optional" ignora o mínimo: com mínimo 3 e nenhuma foto, nada falta', () => {
    const plan = planFor({ cargo: 'optional', cargoMinimumCount: 3 })
    expect(missingFor(plan, valuesWith(0))).not.toContain('cargo')
    expect(countMissingCargoPhotos({ plan, values: valuesWith(0) })).toBe(0)
  })

  it('"off" ignora o mínimo: com mínimo 3 e nenhuma foto, nada falta', () => {
    const plan = planFor({ cargo: 'off', cargoMinimumCount: 3 })
    expect(missingFor(plan, valuesWith(0))).not.toContain('cargo')
    expect(countMissingCargoPhotos({ plan, values: valuesWith(0) })).toBe(0)
  })

  it('o mínimo da mercadoria não muda a exigência do canhoto', () => {
    const plan = planFor({ cargo: 'required', cargoMinimumCount: 3, photo: 'required' })
    const missing = missingFor(plan, valuesWith(3, { hasPhoto: false }))
    expect(missing).toContain('photo')
    expect(missing).not.toContain('cargo')
    expect(missingFor(plan, valuesWith(0, { hasPhoto: true }))).not.toContain('photo')
  })
})

describe('a pendência conta as fotos da mercadoria (spec 220 RF09)', () => {
  const plan = planFor({ cargo: 'required', cargoMinimumCount: 3 })

  it('mínimo 3 e duas fotos enviadas: falta 1 e o confirmar segue bloqueado', () => {
    expect(countMissingCargoPhotos({ plan, values: valuesWith(2) })).toBe(1)
    expect(missingFor(plan, valuesWith(2))).toEqual(['cargo'])
  })

  it('mínimo 3 e nenhuma foto: faltam 3', () => {
    expect(countMissingCargoPhotos({ plan, values: valuesWith(0) })).toBe(3)
  })

  it('mínimo atingido: nada falta e cargo sai da lista', () => {
    expect(countMissingCargoPhotos({ plan, values: valuesWith(3) })).toBe(0)
    expect(missingFor(plan, valuesWith(3))).toEqual([])
  })

  it('mais fotos que o mínimo nunca produz falta negativa', () => {
    expect(countMissingCargoPhotos({ plan, values: valuesWith(4) })).toBe(0)
  })

  it('é pendência, não recusa: o plano com foto abaixo do mínimo continua renderizando o campo', () => {
    expect(plan.rendersCargo).toBe(true)
    expect(missingFor(plan, valuesWith(2))).toEqual(['cargo'])
  })
})

describe('o gate antes de "Entreguei" enxerga a mercadoria (spec 218 RF-A1 + spec 220)', () => {
  it('"required" na mercadoria faz o formulário vazio exigir comprovante', () => {
    const plan = planFor({
      cargo: 'required',
      photo: 'optional',
      receiverName: 'optional',
      signature: 'optional',
    })
    expect(requiresProofBeforeDelivery(plan)).toBe(true)
  })

  it('"optional" na mercadoria não exige comprovante antes de entregar', () => {
    const plan = planFor({
      cargo: 'optional',
      photo: 'optional',
      receiverName: 'optional',
      signature: 'optional',
    })
    expect(requiresProofBeforeDelivery(plan)).toBe(false)
  })
})

describe('o recebedor chega ao servidor com só a mercadoria anexada (spec 220, configuração só de cargo)', () => {
  const card = readFileSync(
    new URL(
      '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )

  it('o empurrão tardio dos campos também dispara quando há foto da mercadoria, sem canhoto nem assinatura', () => {
    const start = card.indexOf('function pushLateFieldUpdate(')
    const body = card.slice(start, card.indexOf('\n  }\n', start))
    expect(body).toContain('cargoKeys.length > 0')
    expect(body).toContain('onProofFieldsUpdate?.(')
  })
})

describe('o mínimo de fotos da mercadoria lido da API nunca passa do teto nem do que dá para cumprir', () => {
  function readCargoMinimumCount(value: unknown): number | undefined {
    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        trips: [
          {
            createdAt: '2026-09-18T09:00:00.000Z',
            id: 'trip-1',
            manifest: null,
            status: 'dispatched',
            stops: [
              {
                arrivedAt: null,
                completedAt: null,
                deliveryProof: { cargo: 'required', cargoMinimumCount: value },
                documents: [],
                id: 'stop-1',
                label: 'Rua A, 1',
                sequence: 1,
              },
            ],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })
    return snapshot.trips[0]?.stops[0]?.deliveryProof?.cargoMinimumCount
  }

  it('acima do teto é limitado ao teto', () => {
    expect(readCargoMinimumCount(PROOF_CARGO_PHOTO_LIMIT + 1)).toBe(PROOF_CARGO_PHOTO_LIMIT)
    expect(readCargoMinimumCount(999)).toBe(PROOF_CARGO_PHOTO_LIMIT)
  })

  it('o próprio teto e os valores válidos passam intactos', () => {
    expect(readCargoMinimumCount(PROOF_CARGO_PHOTO_LIMIT)).toBe(PROOF_CARGO_PHOTO_LIMIT)
    expect(readCargoMinimumCount(3)).toBe(3)
  })

  it('zero, negativo e não inteiro caem no padrão', () => {
    expect(readCargoMinimumCount(0)).toBe(DEFAULT_PROOF_SETTINGS.cargoMinimumCount)
    expect(readCargoMinimumCount(-2)).toBe(DEFAULT_PROOF_SETTINGS.cargoMinimumCount)
    expect(readCargoMinimumCount(2.5)).toBe(DEFAULT_PROOF_SETTINGS.cargoMinimumCount)
    expect(readCargoMinimumCount('3')).toBe(DEFAULT_PROOF_SETTINGS.cargoMinimumCount)
  })
})
