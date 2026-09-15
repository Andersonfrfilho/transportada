/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Catálogo de praças vazio (`toll_booths` sem seed) não é "sem pedágio na rota" — é ausência de
 * dado, e a tela que confunde as duas coisas mente para o operador. Este contrato guarda que a
 * validação aceita/recusa `catalog`, que a tela troca a mensagem quando o catálogo está vazio, e
 * que os avisos existem nas duas línguas.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

const adapters = createTripResponseAdapters()
const routeGeometryFromApi = (input: unknown) => adapters.routeGeometryFromApi(input)

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripAssemblyMap.component.tsx',
  import.meta.url,
)

const PONTO = { latitude: '-21.17670', longitude: '-47.81030' }

function tollBruto(catalog: unknown) {
  return {
    axles: { count: 2, source: 'declared' },
    booths: [],
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: 0,
    catalog,
    chargePerAxle: '0.0000',
    multiplierLabel: '2',
    paymentMode: 'manual',
    tariffObservedOn: null,
    total: '0.0000',
  }
}

describe('validação do status do catálogo (route-geometry)', () => {
  it('lê o catálogo vazio', () => {
    const view = routeGeometryFromApi({
      legs: [],
      points: [PONTO, PONTO],
      source: 'road',
      toll: tollBruto({ observedOn: null, status: 'empty' }),
    })

    expect(view.toll?.catalog).toEqual({ observedOn: null, status: 'empty' })
  })

  it('lê o catálogo velho, com a data', () => {
    const view = routeGeometryFromApi({
      legs: [],
      points: [PONTO, PONTO],
      source: 'road',
      toll: tollBruto({ observedOn: '2024-01-01', status: 'stale' }),
    })

    expect(view.toll?.catalog).toEqual({ observedOn: '2024-01-01', status: 'stale' })
  })

  /** ⚠️ `catalog` ausente ou malformado zera **o pedágio inteiro** — a mesma trava dos outros campos
   *  do extrato: um total sem saber se o catálogo é confiável é pior que nenhum total. */
  it('pedágio sem `catalog`, ou com status desconhecido, não é lido', () => {
    const semCatalogo: Record<string, unknown> = tollBruto(undefined)
    delete semCatalogo.catalog
    const semCampo = routeGeometryFromApi({
      legs: [],
      points: [PONTO, PONTO],
      source: 'road',
      toll: semCatalogo,
    })
    const comStatusEstranho = routeGeometryFromApi({
      legs: [],
      points: [PONTO, PONTO],
      source: 'road',
      toll: tollBruto({ observedOn: null, status: 'desconhecido' }),
    })

    expect(semCampo.toll).toBeNull()
    expect(comStatusEstranho.toll).toBeNull()
  })
})

describe('a tela distingue catálogo vazio de rota sem pedágio', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('troca a mensagem quando o catálogo está vazio', () => {
    expect(source).toInclude("toll.catalog.status === 'empty'")
    expect(source).toInclude("t('assemblyMap.toll.catalogEmpty')")
  })

  it('avisa quando o catálogo está velho', () => {
    expect(source).toInclude("toll.catalog.status !== 'stale'")
    expect(source).toInclude("t('assemblyMap.toll.catalogStale'")
  })

  it('as duas chaves existem nas duas línguas, com o mês interpolado onde precisa', () => {
    expect(trip.assemblyMap.toll.catalogEmpty).toBeString()
    expect(tripEn.assemblyMap.toll.catalogEmpty).toBeString()
    expect(trip.assemblyMap.toll.catalogStale).toInclude('{{month}}')
    expect(tripEn.assemblyMap.toll.catalogStale).toInclude('{{month}}')
  })
})
