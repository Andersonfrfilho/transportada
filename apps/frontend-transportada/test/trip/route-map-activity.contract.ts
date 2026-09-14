/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripRouteMap.component.tsx',
  import.meta.url,
)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

/**
 * Spec 137: a geometria da estrada é consulta própria (OSRM) e pode demorar ou falhar sem derrubar
 * o detalhe — a reta tracejada continua desenhando. O mapa precisa dizer quando está buscando a
 * estrada e quando desistiu, em vez de ficar mudo nos dois casos.
 */
describe('atividade da geometria do roteiro (spec 137)', () => {
  const component = readFileSync(COMPONENT, 'utf8')
  const detail = readFileSync(DETAIL, 'utf8')

  it('recebe o estado da consulta de geometria como propriedade', () => {
    expect(component).toInclude('isGeometryPending')
    expect(component).toInclude('isGeometryError')
  })

  it('avisa que está traçando a estrada, com papel de status', () => {
    expect(component).toMatch(/role=['"]status['"]/u)
    expect(component).toInclude("t('routeMap.loadingGeometry')")
  })

  it('avisa quando não conseguiu traçar a estrada, com nova tentativa', () => {
    expect(component).toInclude("t('routeMap.geometryUnavailable')")
    expect(component).toInclude('onRetryGeometry')
    expect(component).toInclude("t('routeMap.retry')")
  })

  /** A reta tracejada é o retrocesso — some junto com o aviso quebraria o único desenho que resta. */
  it('mantém o traço reto entre as paradas independente do estado da geometria', () => {
    expect(component).toInclude('routeMap.trace.${traceKind}')
  })

  it('liga o estado da geometria à consulta do workspace', () => {
    expect(detail).toInclude('workspace.routeGeometryQuery.isPending')
    expect(detail).toInclude('workspace.routeGeometryQuery.isError')
    expect(detail).toInclude('workspace.routeGeometryQuery.refetch()')
  })

  it('não repete a mensagem genérica de erro da viagem', () => {
    expect(trip.routeMap.geometryUnavailable).not.toEqual(trip.detail.error)
  })
})
