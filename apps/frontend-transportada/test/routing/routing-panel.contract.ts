/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import englishLocale from '../../src/modules/routing/locales/routing.en.locale.json'
import locale from '../../src/modules/routing/locales/routing.locale.json'
import {
  GEOCODING_PRECISION,
  ROUTE_SUGGESTION_STATUS,
} from '../../src/modules/routing/shared/routeSuggestion.types'
import { ROUTE_SUGGESTION_WARNING_KIND } from '../../src/modules/routing/shared/routeSuggestionWarnings.service'

const PANEL_PATH = 'src/modules/routing/components/RouteSuggestionPanel.component.tsx'
const MAP_PATH = 'src/modules/routing/components/RouteSuggestionMap.component.tsx'
const MODULE_ROOT = new URL('../../', import.meta.url).pathname

async function readSource(relativePath: string): Promise<string> {
  return Bun.file(`${MODULE_ROOT}${relativePath}`).text()
}

function keysOf(value: object): readonly string[] {
  return Object.keys(value).toSorted()
}

describe('routing locale (spec 058 P1)', () => {
  /** Estado sem texto é estado que aparece como a própria chave na tela do operador. */
  test('names every suggestion status the API can return', () => {
    for (const status of ROUTE_SUGGESTION_STATUS) {
      expect(locale.status).toHaveProperty(status)
      expect(englishLocale.status).toHaveProperty(status)
    }
  })

  /** Precisão sem texto vira código cru ao lado da parada, que é pior que não mostrar nada. */
  test('names every geocoding precision, since it is shown per stop', () => {
    for (const precision of GEOCODING_PRECISION) {
      expect(locale.precision).toHaveProperty(precision)
      expect(englishLocale.precision).toHaveProperty(precision)
    }
  })

  /**
   * Aviso sem texto é aviso que não avisa. Cada tipo tem singular e plural porque a contagem muda a
   * frase — "1 parada" e "3 paradas" não são a mesma coisa em português.
   */
  test('writes every warning in both singular and plural', () => {
    for (const kind of ROUTE_SUGGESTION_WARNING_KIND) {
      expect(locale.warning).toHaveProperty(`${kind}_one`)
      expect(locale.warning).toHaveProperty(`${kind}_other`)
      expect(englishLocale.warning).toHaveProperty(`${kind}_one`)
      expect(englishLocale.warning).toHaveProperty(`${kind}_other`)
    }
  })

  /** Chave que existe num idioma e não no outro é texto que some quando alguém troca a língua. */
  test('keeps both languages carrying the same keys', () => {
    expect(keysOf(locale)).toEqual(keysOf(englishLocale))
    expect(keysOf(locale.warning)).toEqual(keysOf(englishLocale.warning))
    expect(keysOf(locale.map.unavailable)).toEqual(keysOf(englishLocale.map.unavailable))
  })

  /**
   * ADR-0044 §1: a queda do serviço de rotas **não** vira linha reta, e o texto tem de dizer por
   * quê. Um "tente de novo" ali convidaria alguém a implementar o fallback que a decisão proíbe.
   */
  test('explains why a routing outage produces no route at all', () => {
    expect(locale.failure.ROUTING_MATRIX_UNAVAILABLE).toContain('linha reta')
    expect(englishLocale.failure.ROUTING_MATRIX_UNAVAILABLE).toContain('straight line')
  })

  /**
   * A degradação do mapa diz que a lista **não depende dele**. Sem essa frase o operador lê a
   * ausência do mapa como roteiro incompleto, e é o oposto: o mapa confere, ele não é a sugestão.
   */
  test('tells the operator the list stands on its own when the map is missing', () => {
    expect(locale.map.unavailable.missing).toContain('não depende do mapa')
    expect(locale.map.unavailable.unsupported).toContain('não depende do mapa')
    expect(englishLocale.map.unavailable.missing).toContain('does not depend on the map')
  })
})

describe('routing panel source (ADR-0044 §5 e §6)', () => {
  /**
   * Os avisos são derivados pela política, não montados na tela. Um painel que os monta sozinho pode
   * esquecer um — e a garantia de que a violação aparece explícita deixa de ser garantia.
   */
  test('derives its warnings from the policy instead of assembling them inline', async () => {
    const source = await readSource(PANEL_PATH)

    expect(source).toContain('collectRouteSuggestionWarnings')
    expect(source).toContain('orderStopsForReview')
  })

  /** Só uma sugestão pronta se decide — e o botão sabe disso, não só o servidor. */
  test('disables the decision until the suggestion is ready', async () => {
    const source = await readSource(PANEL_PATH)

    expect(source).toContain('canDecideSuggestion')
    expect(source).toContain('disabled={!decidable')
  })

  /**
   * Contrato de CSP da spec 058: **nenhum host de tile externo**. O contrato geral de CSP já varre o
   * `src/` inteiro por `https://` não declarado; este é o lembrete no lugar onde a tentação mora.
   */
  test('never names an external tile host, which is the whole point of PMTiles', async () => {
    const map = await readSource(MAP_PATH)
    const tiles = await readSource('src/modules/routing/shared/routeMapTiles.service.ts')

    for (const source of [map, tiles]) {
      expect(source).not.toContain('https://api.maptiler.com')
      expect(source).not.toContain('https://tile.openstreetmap.org')
      expect(source).not.toContain('mapbox')
    }
  })

  /** A ausência do mapa é dita, não silenciosa — e com o motivo, não um "algo deu errado". */
  test('renders the reason for a missing map instead of failing quietly', async () => {
    const source = await readSource(MAP_PATH)

    expect(source).toContain('map.unavailable.')
    expect(source).toContain("map.state === 'unavailable'")
  })
})
