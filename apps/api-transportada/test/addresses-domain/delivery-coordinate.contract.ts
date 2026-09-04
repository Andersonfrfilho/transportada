/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COORDINATE_STEPS,
  isPaidStep,
  resolveDeliveryCoordinate,
  type DeliveryCoordinateSteps,
  type ResolvedCoordinate,
} from '../../src/addresses/application/resolve-delivery-coordinate.use-case.js'

const COORDENADA: ResolvedCoordinate = {
  latitude: '-21.1775000',
  longitude: '-47.8102800',
  precision: 'rooftop',
  source: 'manual',
}

/** Conta quantas vezes cada degrau foi consultado — é o que o aceite da T03 mede. */
function escada(respostas: Partial<Record<keyof DeliveryCoordinateSteps, ResolvedCoordinate>>) {
  const chamadas: Record<string, number> = {}
  const degrau =
    (nome: keyof DeliveryCoordinateSteps) => async (): Promise<null | ResolvedCoordinate> => {
      chamadas[nome] = (chamadas[nome] ?? 0) + 1
      return respostas[nome] ?? null
    }

  return {
    chamadas,
    steps: {
      centroid: degrau('centroid'),
      clientAddress: degrau('clientAddress'),
      correction: degrau('correction'),
      paidProvider: degrau('paidProvider'),
      postalCode: degrau('postalCode'),
    } satisfies DeliveryCoordinateSteps,
  }
}

describe('a escada da coordenada de entrega (spec 084, P5)', () => {
  test('a ordem é do mais barato ao mais caro, com o pago no penúltimo degrau', () => {
    expect([...COORDINATE_STEPS]).toEqual([
      'correction',
      'client_address',
      'postal_code',
      'paid_provider',
      'centroid',
    ])
  })

  /**
   * ⚠️ **O aceite da T03.** Consultar o provedor pago depois de um degrau grátis ter respondido é
   * dinheiro queimado por endereço, para sempre. Este teste falha se o curto-circuito sumir.
   */
  test('nota de cliente já corrigido não consulta provedor nenhum', async () => {
    const { chamadas, steps } = escada({ correction: COORDENADA })

    const resolvida = await resolveDeliveryCoordinate(steps)

    expect(resolvida?.step).toBe('correction')
    expect(chamadas['paidProvider']).toBeUndefined()
    expect(chamadas['postalCode']).toBeUndefined()
    expect(chamadas['clientAddress']).toBeUndefined()
  })

  /** A agenda vence o CEP: ela já foi confirmada por gente, e o CEP é palpite oficial. */
  test('a agenda do cliente vence o CEP, e o pago nem é tocado', async () => {
    const { chamadas, steps } = escada({
      clientAddress: COORDENADA,
      postalCode: { ...COORDENADA, precision: 'postal_code', source: 'postal_code' },
    })

    const resolvida = await resolveDeliveryCoordinate(steps)

    expect(resolvida?.step).toBe('client_address')
    expect(chamadas['postalCode']).toBeUndefined()
    expect(chamadas['paidProvider']).toBeUndefined()
  })

  /** O CEP é nosso e grátis: enquanto ele responder, nada sai daqui. */
  test('o CEP responde antes do provedor pago', async () => {
    const { chamadas, steps } = escada({
      postalCode: { ...COORDENADA, precision: 'postal_code', source: 'postal_code' },
    })

    const resolvida = await resolveDeliveryCoordinate(steps)

    expect(resolvida?.step).toBe('postal_code')
    expect(chamadas['paidProvider']).toBeUndefined()
    expect(isPaidStep(resolvida)).toBe(false)
  })

  /** ⚠️ O degrau pago só é alcançado quando **todos** os grátis falharam. */
  test('o provedor pago só é consultado depois de todos os grátis falharem', async () => {
    const { chamadas, steps } = escada({ paidProvider: COORDENADA })

    const resolvida = await resolveDeliveryCoordinate(steps)

    expect(resolvida?.step).toBe('paid_provider')
    expect(isPaidStep(resolvida)).toBe(true)
    expect(chamadas['correction']).toBe(1)
    expect(chamadas['clientAddress']).toBe(1)
    expect(chamadas['postalCode']).toBe(1)
    expect(chamadas['centroid']).toBeUndefined()
  })

  /**
   * ⚠️ O centroide **não é resposta** — é a admissão de que ninguém sabe. Ele sai marcado, e é essa
   * marca que faz o solver excluir a parada da otimização (ADR-0044 §5).
   */
  test('o centroide é o último recurso, e vai marcado como palpite', async () => {
    const { steps } = escada({
      centroid: { ...COORDENADA, precision: 'city', source: 'city' },
    })

    const resolvida = await resolveDeliveryCoordinate(steps)

    expect(resolvida?.step).toBe('centroid')
    expect(resolvida?.precision).toBe('city')
  })

  /** Município sem centroide existe: a nota fica sem coordenada, nunca com uma inventada. */
  test('devolve ausência quando nem o centroide responde', async () => {
    const { chamadas, steps } = escada({})

    expect(await resolveDeliveryCoordinate(steps)).toBeNull()
    expect(chamadas['centroid']).toBe(1)
  })

  /**
   * ⚠️ **O degrau não escolhe o rótulo que quiser.** Um `centroid` mal-fiado devolvendo `rooftop`
   * passaria por tipo e por CHECK, e o solver deixaria de excluir da otimização um palpite de ~8 km
   * — exatamente o que a ADR-0044 §5 quer impedir ao fazer a precisão viajar visível. Achado por
   * revisão de segurança.
   */
  test('recusa o degrau que mente a própria precisão', async () => {
    const { steps } = escada({ centroid: { ...COORDENADA, precision: 'rooftop', source: 'city' } })

    await expect(resolveDeliveryCoordinate(steps)).rejects.toThrow(
      'COORDINATE_STEP_PRECISION_MISMATCH:centroid',
    )
  })
})
