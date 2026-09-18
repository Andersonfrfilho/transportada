import { describe, expect, it } from 'bun:test'

import {
  resolveTripArrivedAtIso,
  toDatetimeLocalValue,
  validateTripArrivedAt,
} from '../../src/modules/trip/shared/tripArrivalValidation.service'

/**
 * Spec 156 T15 A1: `arrivedAt` opcional em `POST .../arrive` — mesma janela de relógio de
 * "Entregue em" (`field-delivery-validation.contract.ts`), códigos próprios (`ARRIVED_AT_*`).
 */
describe('validação de "Chegou em" (spec 156 T15 A1)', () => {
  const now = new Date('2026-09-18T12:00:00.000Z')
  const dispatchedAt = '2026-09-18T08:00:00.000Z'

  it('agora, depois do despacho, é aceito', () => {
    expect(
      validateTripArrivedAt({ arrivedAt: now.toISOString(), dispatchedAt, now }),
    ).toBeUndefined()
  })

  it('hora futura é recusada', () => {
    const future = new Date(now.getTime() + 60_000).toISOString()
    expect(validateTripArrivedAt({ arrivedAt: future, dispatchedAt, now })).toBe(
      'ARRIVED_AT_IN_FUTURE',
    )
  })

  it('antes do despacho é recusado', () => {
    const before = new Date(new Date(dispatchedAt).getTime() - 60_000).toISOString()
    expect(validateTripArrivedAt({ arrivedAt: before, dispatchedAt, now })).toBe(
      'ARRIVED_AT_BEFORE_DISPATCH',
    )
  })

  it('sem despacho conhecido, só a régua do futuro vale', () => {
    expect(
      validateTripArrivedAt({ arrivedAt: now.toISOString(), dispatchedAt: null, now }),
    ).toBeUndefined()
  })
})

describe('resolveTripArrivedAtIso / toDatetimeLocalValue (spec 156 T15 A1)', () => {
  it('data válida vira ISO', () => {
    const value = '2026-09-18T09:00'
    expect(resolveTripArrivedAtIso(value)).toBe(new Date(value).toISOString())
  })

  it('campo vazio nunca lança — devolve o texto cru', () => {
    expect(() => resolveTripArrivedAtIso('')).not.toThrow()
    expect(resolveTripArrivedAtIso('')).toBe('')
  })

  it('toDatetimeLocalValue formata sem fuso, no formato do input', () => {
    const date = new Date(2026, 8, 18, 9, 5)
    expect(toDatetimeLocalValue(date)).toBe('2026-09-18T09:05')
  })
})
