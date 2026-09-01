/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'

import type { RouteSuggestionStop } from '../shared/routeSuggestion.types'
import {
  detectWebGlSupport,
  resolveRouteMapTiles,
  type RouteMapUnavailableReason,
} from '../shared/routeMapTiles.service'

export type RouteMapState =
  | Readonly<{ containerRef: React.RefObject<HTMLDivElement | null>; state: 'ready'; url: string }>
  | Readonly<{ reason: RouteMapUnavailableReason; state: 'unavailable' }>
  | Readonly<{ state: 'loading' }>

/**
 * Decide se há mapa a desenhar, e só isso. O desenho em si — MapLibre GL sobre o PMTiles — entra
 * quando o arquivo existir de verdade: hoje ele é gerado offline do mesmo extract do OSRM
 * (`docs/runbooks/osrm-extract.md`), e nenhum ambiente o tem.
 *
 * Carregar a biblioteca de mapa antes disso seria empacotar centenas de quilobytes que nunca
 * desenham nada, e verificar o desenho contra um arquivo inexistente é verificar nada. O caminho
 * degradado — que é o que roda hoje — está inteiro e testado; o `containerRef` é a costura onde o
 * renderizador entra sem mexer no resto.
 */
export function useRouteMap(input: {
  readonly fetchImplementation?: typeof fetch
  readonly stops: readonly RouteSuggestionStop[]
}): RouteMapState {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [availability, setAvailability] = useState<RouteMapState>({ state: 'loading' })
  const plottable = input.stops.some((stop) => stop.latitude !== null && stop.longitude !== null)

  useEffect(() => {
    let cancelled = false

    // Sem coordenada não há o que desenhar, e pedir o arquivo seria tráfego por nada
    if (!plottable) {
      setAvailability({ reason: 'missing', state: 'unavailable' })
      return () => {
        cancelled = true
      }
    }

    async function resolve(): Promise<void> {
      const resolved = await resolveRouteMapTiles({
        apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
        supportsWebGl: detectWebGlSupport(document.createElement('canvas')),
        ...(input.fetchImplementation === undefined
          ? {}
          : { fetchImplementation: input.fetchImplementation }),
      })
      if (cancelled) return

      setAvailability(
        resolved.available
          ? { containerRef, state: 'ready', url: resolved.url }
          : { reason: resolved.reason, state: 'unavailable' },
      )
    }

    void resolve()

    return () => {
      cancelled = true
    }
  }, [input.fetchImplementation, plottable])

  return availability
}
