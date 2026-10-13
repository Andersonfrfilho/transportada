/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const MODULE = '../../src/modules/trip/'

function read(path: string): string {
  return readFileSync(new URL(`${MODULE}${path}`, import.meta.url), 'utf8')
}

const MAP_FILES = [
  'components/OccurrenceTripMap.component.tsx',
  'components/OccurrenceTripMapCanvas.component.tsx',
  'components/OccurrenceTripMapLegend.component.tsx',
  'hooks/useOccurrenceTripMapData.hook.ts',
  'shared/occurrenceTripMap.constant.ts',
  'shared/occurrenceTripMap.service.ts',
  'shared/occurrenceTripMapStops.service.ts',
] as const

function ruleOf(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect([selector, start > -1]).toEqual([selector, true])
  return css.slice(start, css.indexOf('}', start))
}

describe('o mapa da viagem na ocorrência: texto de fonte (spec 196)', () => {
  it('desenha pelo mesmo mapa MapLibre, lazy, e por nenhum outro', () => {
    const canvas = read('components/OccurrenceTripMapCanvas.component.tsx')

    expect(canvas).toContain("import('./AssemblyVectorMap.component')")
    expect(canvas).toContain('<AssemblyVectorMap')
    expect(canvas).not.toMatch(
      /from 'maplibre-gl'|from 'leaflet'|from 'mapbox|from 'ol\/|google\.maps/,
    )
    for (const file of MAP_FILES) {
      expect([
        file,
        /leaflet|mapbox|openlayers|google\.maps|tile\.openstreetmap/i.test(read(file)),
      ]).toEqual([file, false])
    }
  })

  it('não faz chamada de rota: o traço não vem no detalhe da viagem', () => {
    for (const file of MAP_FILES) {
      const source = read(file)
      expect([file, source.includes('readPointsRouteGeometry')]).toEqual([file, false])
      expect([file, source.includes('route-geometry')]).toEqual([file, false])
      expect([file, source.includes('createTimelineRouteGeometryQueryOptions')]).toEqual([
        file,
        false,
      ])
    }
    expect(read('components/OccurrenceTripMapCanvas.component.tsx')).toContain('hideRoute')
  })

  it('a coordenada nunca vai a URL, armazenamento, console nem janela nova', () => {
    const forbidden = [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'console.',
      'pushState',
      'replaceState',
      'URLSearchParams',
      'location.search',
      'location.href',
      'window.open',
      'navigator.clipboard',
    ]
    for (const file of MAP_FILES) {
      const source = read(file)
      for (const term of forbidden)
        expect([file, term, source.includes(term)]).toEqual([file, term, false])
    }
  })

  it('a leitura é a da viagem e a da linha do tempo que já existem', () => {
    const hook = read('hooks/useOccurrenceTripMapData.hook.ts')

    expect(hook).toContain('getTripClient().getTrip')
    expect(hook).toContain('useTripTimeline')
  })

  it('a dica do pino é texto puro: nada de HTML vindo do servidor', () => {
    const map = read('components/AssemblyVectorMap.component.tsx')
    const start = map.indexOf('function buildPinPopup')
    const popup = map.slice(start, map.indexOf('\n}\n', start))

    expect(popup).toContain('textContent')
    expect(popup).not.toMatch(/innerHTML|setHTML|insertAdjacentHTML/)
  })

  it('a permissão é a que a API cobra, e a seção entra logo abaixo do resumo', async () => {
    const { OCCURRENCE_TRIP_MAP_EVENT_LOCATION_PERMISSION } = await import(
      '../../src/modules/trip/shared/occurrenceTripMap.constant'
    )
    const { occurrenceDetailSectionsFor } = await import(
      '../../src/modules/trip/shared/tripOccurrenceDetail.service'
    )

    expect(OCCURRENCE_TRIP_MAP_EVENT_LOCATION_PERMISSION).toBe('trip.event-location')
    expect(occurrenceDetailSectionsFor(null).slice(0, 2)).toEqual(['summary', 'tripMap'])
    expect(occurrenceDetailSectionsFor('summary').slice(0, 2)).toEqual(['summary', 'tripMap'])
  })

  it('a entrada dos pinos é opacidade e escala, curta, por token e com prefers-reduced-motion', () => {
    const css = read('styles/trip.module.css')
    const enter = ruleOf(css, '.tilePinEnter')

    expect(enter).toContain('var(--motion-fast)')
    expect(enter).toContain('var(--motion-ease-out)')
    expect(enter).not.toMatch(/[1-9]\d*ms/)
    const keyframes = css.slice(
      css.indexOf('@keyframes pin-enter'),
      css.indexOf('@media', css.indexOf('@keyframes pin-enter')),
    )
    expect(keyframes).not.toContain('transform')
    const reduced = css.slice(
      css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('@keyframes pin-enter')),
    )
    expect(reduced.slice(0, reduced.indexOf('}\n}'))).toContain('.tilePinEnter')
    expect(reduced.slice(0, 200)).toContain('animation: none')
  })

  it('o pino de destaque tem forma própria (halo), não só cor', () => {
    expect(ruleOf(read('styles/trip.module.css'), '.tilePinHighlight')).toContain('box-shadow')
  })

  it('a altura do mapa é token e o alvo de toque da legenda é o token de 44 px', () => {
    const css = read('styles/occurrenceTripMap.module.css')

    expect(ruleOf(css, '.canvas')).toContain(
      '--vector-map-height: var(--occurrence-trip-map-height)',
    )
    expect(ruleOf(css, '.entryButton')).toContain('min-height: var(--touch-target)')
    expect(ruleOf(css, '.summary')).toContain('min-height: var(--touch-target)')
    expect(ruleOf(css, '.entryRow')).toContain('min-height: var(--touch-target)')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('os textos existem nos dois idiomas, com as mesmas chaves', () => {
    const pt = JSON.parse(read('locales/trip.locale.json')) as Record<string, unknown>
    const en = JSON.parse(read('locales/trip.en.locale.json')) as Record<string, unknown>

    function leaves(value: unknown, prefix = ''): readonly string[] {
      if (typeof value !== 'object' || value === null) return [prefix]
      return Object.entries(value).flatMap(([key, child]) => leaves(child, `${prefix}.${key}`))
    }

    expect(leaves(en.occurrenceTripMap).sort()).toEqual(leaves(pt.occurrenceTripMap).sort())
    expect(leaves(pt.occurrenceTripMap).length).toBeGreaterThan(30)
  })
})
