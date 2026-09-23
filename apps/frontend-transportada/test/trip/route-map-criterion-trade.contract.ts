/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 178: o detalhe mostra o critério congelado e, em rascunho (e nos estados que ainda aceitam
 * replanejar), deixa o operador trocar. Contrato por inspeção de fonte — o mesmo estilo de
 * `route-map-panel.contract.ts` — porque o componente é grande demais para montar em DOM só para
 * provar presença de texto e reuso de serviço.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import en from '../../src/modules/trip/locales/trip.en.locale.json'
import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripRouteMap.component.tsx',
  import.meta.url,
)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const PLAN_TRIP_ROUTE_USE_CASE = new URL(
  '../../../api-transportada/src/trips/application/plan-trip-route.use-case.ts',
  import.meta.url,
)

describe('o critério da rota, no detalhe (spec 178 RF1/RF4)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('mostra o critério congelado junto da distância', () => {
    expect(source).toInclude('geometry?.criterion')
    expect(source).toInclude('t(`routeMap.criterion.${toCriterionKey(geometry.criterion)}`)')
  })

  it('deriva a etiqueta de sem pedágio do critério, não mais um `false` fixo', () => {
    expect(source).toInclude("geometry?.criterion === 'no_toll'")
    expect(source).not.toInclude('isNoTollRoute={false}')
  })

  it('tem texto em pt-BR e en para os quatro critérios', () => {
    for (const criterion of ['cheapest', 'fastest', 'noToll', 'alternative'] as const) {
      expect(trip.routeMap.criterion[criterion].length).toBeGreaterThan(0)
      expect(en.routeMap.criterion[criterion].length).toBeGreaterThan(0)
    }
  })
})

describe('a troca de critério, em rascunho e nos estados que ainda replanejam (spec 178 RF2/RF5)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('só oferece a troca nos estados que `checkPlanRoute` também libera', () => {
    expect(source).toInclude(
      "const REPLANNABLE_TRIP_STATUSES = ['draft', 'loading', 'route_planned', 'separating'] as const",
    )
    expect(source).toInclude('canManage && (REPLANNABLE_TRIP_STATUSES as readonly string[])')
  })

  it('reaproveita o rotulador da montagem — nenhum segundo cálculo de "mais barata" (RF3)', () => {
    expect(source).toInclude('resolveRouteOptionSummaries')
    expect(source).toInclude('resolveAssemblyRouteChoice')
    expect(source).toInclude("from '../shared/assemblyRouteOptions.service'")
  })

  it('busca as alternativas numa leitura só, aberta pelo operador — não a cada render', () => {
    expect(source).toInclude('readPointsRouteGeometry')
    expect(source).toInclude('enabled: isOpen && points.length >= 2')
  })

  it('rota única não é escolha: avisa em vez de oferecer seletor de um item só', () => {
    expect(source).toInclude('routeMap.trade.singleOption')
  })

  it('está montado no detalhe, com o status e o veículo da viagem', () => {
    const detail = readFileSync(DETAIL, 'utf8')
    expect(detail).toMatch(/<TripRouteMap[\s/>]/u)
    expect(detail).toInclude('tripStatus={trip.status}')
    expect(detail).toInclude('onPlanRoute=')
  })

  it('tem texto em pt-BR e en para o painel de troca', () => {
    for (const key of ['open', 'title', 'confirm', 'cancel', 'singleOption'] as const) {
      expect(trip.routeMap.trade[key].length).toBeGreaterThan(0)
      expect(en.routeMap.trade[key].length).toBeGreaterThan(0)
    }
  })
})

/**
 * Spec 178 RF6: a troca explícita (`routeChoice` no corpo) recusa quando o roteirizador não
 * devolve rota — mesmo numa repetição idempotente (viagem já `route_planned`/`separating`/
 * `loading`) — sem reabrir o buraco que `c603b45c9` fechou só para a transição real.
 */
describe('a troca de critério não pode virar rota nula em silêncio (spec 178 RF6)', () => {
  it('a recusa não fica presa à transição `applied`', () => {
    const source = readFileSync(PLAN_TRIP_ROUTE_USE_CASE, 'utf8')
    expect(source).toInclude(
      "if (!freezeResult.routeFrozen && (transition.outcome === 'applied' || input.routeChoice !== undefined)) {",
    )
  })
})
