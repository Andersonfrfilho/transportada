/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  Map as MapLibreMap,
  Popup,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import { useEffect, useRef } from 'react'

import {
  basemapThemeForApp,
  buildBasemapStyle,
  configureVectorBasemap,
} from '@/modules/shared/vectorBasemap.service'

import {
  FREIGHT_REGION_ZONE_FILL,
  FREIGHT_REGION_ZONE_SOURCE,
  isFatalBasemapError,
  resolveFreightRegionBounds,
  toFreightRegionFeatureCollection,
  type FreightRegionFeatureCollection,
  type FreightRegionMapShape,
} from '../shared/freightRegionMap.service'
import styles from '../styles/fleet.module.css'

const ZONE_SOURCE = FREIGHT_REGION_ZONE_SOURCE
const ZONE_FILL_LAYER = 'zona-de-frete-preenchimento'
const ZONE_LINE_LAYER = 'zona-de-frete-linha'

type FreightRegionVectorMapProps = Readonly<{
  ariaLabel: string
  onBasemapMissing: () => void
  onSelect?: ((code: string) => void) | undefined
  selectedCodes: ReadonlySet<string>
  shapes: readonly FreightRegionMapShape[]
}>

/** O MapLibre pinta em WebGL e não enxerga `var(--color-…)`: a cor tem de chegar já resolvida. */
function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
}

const UNASSIGNED_FILL_TOKEN = '--color-asphalt'

/** `var(--color-zone-0)` → `--color-zone-0`, para `readToken` resolver o valor de verdade. */
function tokenNameOf(cssVarExpression: string): string {
  return cssVarExpression.slice(4, -1)
}

/**
 * M5 — quando o basemap não sobe (arquivo ausente ou inalcançável), as zonas não dependem dele
 * para existir: este estilo não declara fonte nenhuma (logo não gera erro nenhum) e vira o novo
 * chão do mapa, mantendo `applyZones`/clique/legenda de pé em vez de apagar a aba inteira.
 */
function buildEmptyBasemapStyle(): StyleSpecification {
  return {
    layers: [
      {
        id: 'fundo-sem-basemap',
        paint: { 'background-color': readToken(UNASSIGNED_FILL_TOKEN) },
        type: 'background',
      },
    ],
    sources: {},
    version: 8,
  }
}

/**
 * O mapa de zonas da aba Regiões (spec 153 RF11/D11), sobre o mesmo basemap vetorial da viagem —
 * um mapa só no produto. Localiza, não arbitra: ver o comentário do mesmo teor em
 * `FreightRegionMap.component.tsx`.
 */
export function FreightRegionVectorMap({
  ariaLabel,
  onBasemapMissing,
  onSelect,
  selectedCodes,
  shapes,
}: FreightRegionVectorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const basemapLoaded = useRef(false)
  /** O que o efeito de dados reaplica a cada `styledata` — a troca de tema descarta a camada. */
  const collectionRef = useRef<FreightRegionFeatureCollection>({
    features: [],
    type: 'FeatureCollection',
  })
  const shapesRef = useRef<readonly FreightRegionMapShape[]>([])
  const selectedRef = useRef<ReadonlySet<string>>(selectedCodes)
  const onSelectRef = useRef(onSelect)
  const hoveredCodeRef = useRef<string | null>(null)

  useEffect(() => {
    shapesRef.current = shapes
    collectionRef.current = toFreightRegionFeatureCollection(shapes)
  }, [shapes])
  useEffect(() => {
    selectedRef.current = selectedCodes
  }, [selectedCodes])
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  /** Aplica seleção como `feature-state` — trocar a lista de cidades não refaz a fonte GeoJSON. */
  const applySelection = (map: MapLibreMap): void => {
    if (map.getSource(ZONE_SOURCE) === undefined) return
    for (const shape of shapesRef.current) {
      map.setFeatureState(
        { id: shape.code, source: ZONE_SOURCE },
        { selected: selectedRef.current.has(shape.code) },
      )
    }
  }

  /** Fonte e camadas de zona, idempotente: reaplicada a cada `styledata` (troca de tema apaga tudo). */
  const applyZones = (map: MapLibreMap): void => {
    try {
      const existing: GeoJSONSource | undefined = map.getSource(ZONE_SOURCE)
      if (existing === undefined) {
        map.addSource(ZONE_SOURCE, {
          data: collectionRef.current,
          promoteId: 'code',
          type: 'geojson',
        })
      } else {
        void existing.setData(collectionRef.current)
      }

      if (map.getLayer(ZONE_FILL_LAYER) === undefined) {
        const [zone0, zone1, zone2, zone3, zone4] = FREIGHT_REGION_ZONE_FILL.map((token) =>
          readToken(tokenNameOf(token)),
        )
        map.addLayer({
          id: ZONE_FILL_LAYER,
          paint: {
            'fill-color': [
              'match',
              ['get', 'zone'],
              0,
              zone0 ?? '',
              1,
              zone1 ?? '',
              2,
              zone2 ?? '',
              3,
              zone3 ?? '',
              4,
              zone4 ?? '',
              readToken(UNASSIGNED_FILL_TOKEN),
            ],
            'fill-opacity': 0.85,
          },
          source: ZONE_SOURCE,
          type: 'fill',
        })
      }
      if (map.getLayer(ZONE_LINE_LAYER) === undefined) {
        const fog = readToken('--color-fog')
        const graphite = readToken('--color-graphite')
        map.addLayer({
          id: ZONE_LINE_LAYER,
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              fog,
              ['boolean', ['feature-state', 'hover'], false],
              fog,
              graphite,
            ],
            'line-opacity': [
              'case',
              [
                'any',
                ['boolean', ['feature-state', 'selected'], false],
                ['boolean', ['feature-state', 'hover'], false],
              ],
              1,
              0.7,
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              1.8,
              ['boolean', ['feature-state', 'hover'], false],
              1.4,
              0.6,
            ],
          },
          source: ZONE_SOURCE,
          type: 'line',
        })
      }
      applySelection(map)
    } catch (error) {
      if (import.meta.env.DEV) console.error('[freight-region-zones]', error)
    }
  }

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    configureVectorBasemap()
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        attributionControl: false,
        center: [-51.9, -14.2],
        container,
        fadeDuration: 0,
        style: buildBasemapStyle(readToken, basemapThemeForApp('dark')),
        zoom: 4,
      })
    } catch (error) {
      if (import.meta.env.DEV) console.error('[basemap]', error)
      onBasemapMissing()
      return
    }
    mapRef.current = map

    const popup = new Popup({ closeButton: false, closeOnClick: false })

    map.on('load', () => {
      basemapLoaded.current = true
      applyZones(map)
      const bounds = resolveFreightRegionBounds(shapesRef.current)
      if (bounds !== null) {
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { duration: 0, padding: 24 },
        )
      }
    })
    map.on('styledata', () => applyZones(map))

    map.on('mousemove', ZONE_FILL_LAYER, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const code = feature?.properties?.['code'] as string | undefined
      map.getCanvas().style.cursor = onSelectRef.current === undefined ? '' : 'pointer'
      if (code === undefined || code === hoveredCodeRef.current) {
        if (code !== undefined) popup.setLngLat(event.lngLat)
        return
      }
      if (hoveredCodeRef.current !== null) {
        map.setFeatureState({ id: hoveredCodeRef.current, source: ZONE_SOURCE }, { hover: false })
      }
      hoveredCodeRef.current = code
      map.setFeatureState({ id: code, source: ZONE_SOURCE }, { hover: true })
      const shape = shapesRef.current.find((candidate) => candidate.code === code)
      const label =
        shape === undefined
          ? ''
          : shape.claims.length === 0
            ? shape.city
            : `${shape.city} — ${shape.claims.map((claim) => claim.name).join(' · ')}`
      popup.setLngLat(event.lngLat).setText(label).addTo(map)
    })
    map.on('mouseleave', ZONE_FILL_LAYER, () => {
      map.getCanvas().style.cursor = ''
      if (hoveredCodeRef.current !== null) {
        map.setFeatureState({ id: hoveredCodeRef.current, source: ZONE_SOURCE }, { hover: false })
        hoveredCodeRef.current = null
      }
      popup.remove()
    })
    map.on('click', ZONE_FILL_LAYER, (event: MapLayerMouseEvent) => {
      const code = event.features?.[0]?.properties?.['code'] as string | undefined
      if (code !== undefined) onSelectRef.current?.(code)
    })

    map.on('error', (event) => {
      if (import.meta.env.DEV) console.error('[basemap]', event.error?.message ?? event.error)

      /**
       * ⚠️ M5 — `sourceId` e `tile` não estão no tipo do evento: o MapLibre os injeta em runtime
       * (mesma constatação já registrada em `AssemblyVectorMap.component.tsx` para `sourceId`).
       */
      const context = {
        basemapLoaded: basemapLoaded.current,
        sourceId: (event as unknown as { sourceId?: string }).sourceId,
        tile: (event as unknown as { tile?: unknown }).tile,
      }
      if (!isFatalBasemapError(context)) return

      /**
       * O basemap não sobe, mas as zonas não dependem dele: troca para um estilo sem fonte nenhuma
       * (não gera novo erro) em vez de chamar `onBasemapMissing` e apagar o desenho inteiro. O
       * `styledata` já ouvido abaixo reaplica fonte e camadas de zona de forma idempotente — o
       * mesmo mecanismo que já lida com a troca de tema.
       */
      basemapLoaded.current = true
      map.setStyle(buildEmptyBasemapStyle())
      const bounds = resolveFreightRegionBounds(shapesRef.current)
      if (bounds !== null) {
        map.once('styledata', () =>
          map.fitBounds(
            [
              [bounds[0], bounds[1]],
              [bounds[2], bounds[3]],
            ],
            { duration: 0, padding: 24 },
          ),
        )
      }
    })

    return () => {
      popup.remove()
      map.remove()
      mapRef.current = null
    }
    /** Montagem única, de propósito: dados novos entram pelos efeitos abaixo, via ref. */
  }, [])

  /** Dados novos (troca de UF, tabela editada) reaplicam sem remontar o mapa. */
  useEffect(() => {
    const map = mapRef.current
    if (map === null || !basemapLoaded.current) return
    applyZones(map)
    const bounds = resolveFreightRegionBounds(shapes)
    if (bounds !== null) {
      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { duration: 200, padding: 24 },
      )
    }
  }, [shapes])

  /** Seleção muda (clicar, digitar na tabela) sem refazer a fonte: só o `feature-state`. */
  useEffect(() => {
    const map = mapRef.current
    if (map === null || !basemapLoaded.current) return
    applySelection(map)
  }, [selectedCodes])

  return (
    <div aria-label={ariaLabel} className={styles.regionMapCanvas} ref={containerRef} role="img" />
  )
}
