/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T401: os campos novos da rota escolhida (D2/D3) e o dinheiro condicionalmente ausente
 * (D10). Sem `trip.financials` a **chave** do valor sai da resposta inteira — nunca `null`, nunca
 * zero — e o tipo precisa recusar quem ler o campo sem checar a ausência primeiro. Distância,
 * duração e a volta ao barracão não são dinheiro e continuam sempre presentes (D9).
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import type {
  RouteGeometryOption,
  RouteGeometryToll,
  RouteGeometryTollBooth,
} from '../../src/modules/trip/shared/routeGeometry.service'

const adapters = createTripResponseAdapters()
const routeGeometryFromApi = (input: unknown) => adapters.routeGeometryFromApi(input)

const PONTO = { latitude: '-21.17670', longitude: '-47.81030' }

function opcaoBruta(overrides: Record<string, unknown> = {}) {
  return {
    distanceMeters: 106_600,
    durationSeconds: 5_160,
    fuelTotal: '80.00',
    isNoToll: false,
    legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
    points: [PONTO, PONTO],
    signature: 'abc123',
    toll: null,
    totalCost: '500.00',
    ...overrides,
  }
}

describe('rota escolhida — campos novos e dinheiro opcional (spec 153 T401)', () => {
  it('lê isNoToll e signature da opção (D2)', () => {
    const view = routeGeometryFromApi({
      legs: [],
      options: [opcaoBruta()],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    expect(view.options?.[0]?.isNoToll).toBe(false)
    expect(view.options?.[0]?.signature).toBe('abc123')
  })

  it('lê choiceReproduced e selectedIndex da rota (D1/D3)', () => {
    const view = routeGeometryFromApi({
      choiceReproduced: false,
      legs: [],
      options: [opcaoBruta()],
      points: [PONTO, PONTO],
      selectedIndex: 0,
      source: 'road',
      toll: null,
    })

    expect(view.choiceReproduced).toBe(false)
    expect(view.selectedIndex).toBe(0)
  })

  it('lê a rota congelada da viagem: criterion, frozen e a volta ao barracão (T203)', () => {
    const view = routeGeometryFromApi({
      choiceReproduced: false,
      criterion: 'fastest',
      distanceMeters: 128_450,
      durationSeconds: 9_360,
      frozen: true,
      legs: [],
      options: [opcaoBruta()],
      points: [PONTO, PONTO],
      returnDistanceMeters: 15_000,
      selectedIndex: 0,
      signature: 'frozen-signature-abc',
      source: 'road',
      toll: null,
    })

    expect(view.criterion).toBe('fastest')
    expect(view.frozen).toBe(true)
    expect(view.distanceMeters).toBe(128_450)
    expect(view.durationSeconds).toBe(9_360)
    expect(view.returnDistanceMeters).toBe(15_000)
    expect(view.signature).toBe('frozen-signature-abc')
  })

  it('resposta de /route-geometry (sem os campos por viagem) cai em valores neutros, não erro', () => {
    const view = routeGeometryFromApi({
      legs: [],
      options: [opcaoBruta()],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    /**
     * ⚠️ Spec 153 D3: ausente é diferente de `false`. `/route-geometry` avulso não tem viagem para
     * reproduzir, então o campo nem se aplica — nunca um `false` que diria "tentei e não bati".
     */
    expect(view.choiceReproduced).toBeUndefined()
    expect(view.selectedIndex).toBeNull()
    expect(view.criterion).toBeNull()
    expect(view.frozen).toBe(false)
  })

  /** D3, os dois lados juntos: ausente vira `undefined`, presente e `false` continua `false`. */
  it('choiceReproduced distingue ausência (undefined) de assinatura não reproduzida (false)', () => {
    const ausente = routeGeometryFromApi({
      legs: [],
      options: [opcaoBruta()],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })
    const naoReproduzida = routeGeometryFromApi({
      choiceReproduced: false,
      legs: [],
      options: [opcaoBruta()],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    expect(ausente.choiceReproduced).toBeUndefined()
    expect(naoReproduzida.choiceReproduced).toBe(false)
    expect(ausente.choiceReproduced).not.toBe(naoReproduzida.choiceReproduced)
  })

  /** D5: OSRM fora do ar na leitura ao vivo é rota ausente — número `null`, nunca zero. */
  it('OSRM fora do ar: a rota ausente publica null nos números, nunca zero', () => {
    const view = routeGeometryFromApi({
      criterion: null,
      distanceMeters: null,
      durationSeconds: null,
      frozen: false,
      legs: [],
      options: [],
      points: [],
      returnDistanceMeters: null,
      source: 'unavailable',
      toll: null,
    })

    expect(view.source).toBe('unavailable')
    expect(view.distanceMeters).toBeNull()
    expect(view.durationSeconds).toBeNull()
    expect(view.returnDistanceMeters).toBeNull()
  })

  describe('dinheiro condicionalmente ausente (D10) — a chave sai, nunca vira null nem zero', () => {
    it('opção sem trip.financials perde fuelTotal e totalCost por completo', () => {
      const { fuelTotal, totalCost, ...semDinheiro } = opcaoBruta()
      expect(fuelTotal).toBe('80.00')
      expect(totalCost).toBe('500.00')

      const view = routeGeometryFromApi({
        legs: [],
        options: [semDinheiro],
        points: [PONTO, PONTO],
        source: 'road',
        toll: null,
      })

      const option = view.options?.[0]
      expect(option).toBeDefined()
      expect(Object.hasOwn(option as object, 'fuelTotal')).toBe(false)
      expect(Object.hasOwn(option as object, 'totalCost')).toBe(false)
      /** A rota continua válida — só o dinheiro saiu, D9 protege o resto. */
      expect(option?.distanceMeters).toBe(106_600)
    })

    it('pedágio sem trip.financials perde chargePerAxle e total, mas mantém as praças (RF9)', () => {
      const view = routeGeometryFromApi({
        legs: [],
        options: [],
        points: [PONTO, PONTO],
        source: 'road',
        toll: {
          axles: { count: 2, source: 'declared' },
          booths: [
            {
              fellBackToManual: false,
              latitude: '-21.1',
              longitude: '-47.8',
              name: 'Praça 1',
              operator: 'CCR',
              osmNodeId: 42,
            },
          ],
          boothsFallenBackToManual: 0,
          boothsWithoutCharge: 0,
          catalog: { observedOn: '2026-01-01', status: 'current' },
          multiplierLabel: '1',
          paymentMode: 'manual',
          tariffObservedOn: '2026-01-01',
        },
      })

      const toll = view.toll
      expect(toll).not.toBeNull()
      expect(Object.hasOwn(toll as object, 'chargePerAxle')).toBe(false)
      expect(Object.hasOwn(toll as object, 'total')).toBe(false)
      expect(toll?.booths).toHaveLength(1)
      const [booth] = toll?.booths ?? []
      expect(Object.hasOwn(booth as object, 'chargeCar')).toBe(false)
      expect(Object.hasOwn(booth as object, 'chargePerAxle')).toBe(false)
      expect(Object.hasOwn(booth as object, 'effectiveChargePerAxle')).toBe(false)
      expect(Object.hasOwn(booth as object, 'total')).toBe(false)
      expect(booth?.name).toBe('Praça 1')
    })

    it('com trip.financials os valores continuam presentes e numéricos', () => {
      const view = routeGeometryFromApi({
        legs: [],
        options: [opcaoBruta()],
        points: [PONTO, PONTO],
        source: 'road',
        toll: null,
      })

      expect(view.options?.[0]?.fuelTotal).toBe('80.00')
      expect(view.options?.[0]?.totalCost).toBe('500.00')
    })
  })

  describe('o tipo torna a ausência visível (exactOptionalPropertyTypes)', () => {
    it('RouteGeometryOption aceita fuelTotal e totalCost completamente ausentes', () => {
      const semDinheiro: RouteGeometryOption = {
        distanceMeters: 106_600,
        durationSeconds: 5_160,
        isNoToll: false,
        legs: [],
        points: [PONTO, PONTO],
        signature: null,
        toll: null,
      }

      expect(Object.hasOwn(semDinheiro, 'totalCost')).toBe(false)
      expect(Object.hasOwn(semDinheiro, 'fuelTotal')).toBe(false)
    })

    it('RouteGeometryToll aceita chargePerAxle e total completamente ausentes', () => {
      const semDinheiro: RouteGeometryToll = {
        axles: { count: 2, source: 'declared' },
        booths: [],
        boothsFallenBackToManual: 0,
        boothsWithoutCharge: 0,
        catalog: { observedOn: null, status: 'empty' },
        multiplierLabel: '1',
        paymentMode: 'manual',
        tariffObservedOn: null,
      }

      expect(Object.hasOwn(semDinheiro, 'total')).toBe(false)
      expect(Object.hasOwn(semDinheiro, 'chargePerAxle')).toBe(false)
    })

    it('RouteGeometryTollBooth aceita as quatro chaves de dinheiro completamente ausentes', () => {
      const semDinheiro: RouteGeometryTollBooth = {
        fellBackToManual: false,
        latitude: '-21.1',
        longitude: '-47.8',
        name: null,
        operator: null,
        osmNodeId: 42,
      }

      expect(Object.hasOwn(semDinheiro, 'chargeCar')).toBe(false)
      expect(Object.hasOwn(semDinheiro, 'chargePerAxle')).toBe(false)
      expect(Object.hasOwn(semDinheiro, 'effectiveChargePerAxle')).toBe(false)
      expect(Object.hasOwn(semDinheiro, 'total')).toBe(false)
    })

    /**
     * ⚠️ `exactOptionalPropertyTypes` é o que distingue as três coisas: chave ausente (D10),
     * `undefined` explícito e `null`. Sem a flag, atribuir `undefined` a um campo opcional compila
     * calado — e um call site que "normaliza" a ausência com `?? undefined` voltaria a passar.
     */
    it('undefined explícito não é a mesma coisa que a chave ausente', () => {
      // @ts-expect-error com exactOptionalPropertyTypes, undefined explícito é recusado — só a
      // ausência da própria chave conta como D10, nunca o valor `undefined`.
      const comUndefinedExplicito: RouteGeometryOption = {
        distanceMeters: 106_600,
        durationSeconds: 5_160,
        fuelTotal: undefined,
        isNoToll: false,
        legs: [],
        points: [],
        signature: null,
        toll: null,
      }

      expect(comUndefinedExplicito).toBeDefined()
    })
  })
})
