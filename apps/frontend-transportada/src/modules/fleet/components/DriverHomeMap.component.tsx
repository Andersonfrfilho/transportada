/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/ui/icon'
import {
  basemapThemeForApp,
  buildBasemapStyle,
  configureVectorBasemap,
  resolveBasemapOutline,
} from '@/modules/shared/vectorBasemap.service'

import type { DriverHomeReport } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'

/**
 * ⚠️ **14 é o teto do arquivo, não uma preferência.** O `area.pmtiles` desta instalação declara
 * `max_zoom: 14` — medido no cabeçalho —, e pedir 15 devolve o papel do basemap sem nenhuma feição:
 * um retângulo liso que parece defeito de carregamento e não é. Aproximar mais exige gerar o extrato
 * com mais um nível, não mudar este número.
 */
const HOME_ZOOM = 14

/** O MapLibre pinta em canvas e não resolve `var()`: ele precisa do valor já calculado. */
function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
}

export type DriverHomeMapProps = Readonly<{
  home: DriverHomeReport
  labelOf: (key: string, values?: Record<string, string>) => string
  latitude: null | string
  longitude: null | string
}>

/**
 * Onde a casa do motorista fica, desenhada por nós.
 *
 * ⚠️ **A ADR-0037 tirou o mapa desta tela, e isto não a contradiz.** O que ela removeu foi uma
 * moldura embutida de terceiro, renderizando dentro da nossa página, e a CSP a proíbe desde então. Aqui o mapa é o **nosso** basemap vetorial, o mesmo PMTiles da
 * montagem da viagem, servido da nossa origem. Ver o adendo de 2026-09-08 na ADR.
 *
 * ⚠️ **O mapa existe para tornar a coordenada errada visível.** Medido nesta base: o provedor casou
 * "Rua Sete de Setembro, 990, Pontal" em Guarulhos, a 250 km — número plausível, cidade errada. O
 * portão de cidade recusa o caso óbvio; o mapa é o que deixa o operador ver o resto.
 */
export function DriverHomeMap({ home, labelOf, latitude, longitude }: DriverHomeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const resizeRef = useRef<ResizeObserver | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (container === null || latitude === null || longitude === null) return

    /** ⚠️ Sem isto o `pmtiles://` vira esquema próprio e a CSP bloqueia: canvas preto, sem erro na tela. */
    configureVectorBasemap()
    const center: [number, number] = [Number(longitude), Number(latitude)]
    /**
     * ⚠️ O `try` existe porque o WebGL2 falta em ambiente sem GPU — inclusive no navegador de teste.
     * Sem ele, o construtor derruba a ficha inteira do motorista por causa de um mapa.
     */
    try {
      const map = new MapLibreMap({
        attributionControl: false,
        center,
        container,
        style: buildBasemapStyle(readToken, basemapThemeForApp('dark')),
        zoom: HOME_ZOOM,
      })
      mapRef.current = map

      /**
       * ⚠️ **O contêiner pode nascer sem altura.** O formulário do motorista é revelado por clique e
       * rolado até a vista, e o mapa monta no meio disso: com 0×0 na construção, o MapLibre calcula
       * que nenhuma telha é necessária e **nunca as pede** — o canvas fica no papel do tema, sem erro
       * nenhum no console. O observador devolve o tamanho quando ele existe, e o `resize` refaz o
       * cálculo.
       */
      const observer = new ResizeObserver(() => {
        map.resize()
        /**
         * ⚠️ **Recentrar depois do `resize` não é redundante.** O marcador é projetado com o tamanho
         * que o mapa tinha quando ele entrou — com 0×0, ele foi parar a 19.482px da tela. O `resize`
         * conserta o canvas; é o `setCenter` que reprojeta o que está em cima dele.
         */
        map.setCenter(center)
      })
      observer.observe(container)
      resizeRef.current = observer

      const pin = document.createElement('span')
      pin.className = styles.homePin ?? ''
      pin.style.borderColor = resolveBasemapOutline(readToken, basemapThemeForApp('dark'))
      new Marker({ element: pin }).setLngLat(center).addTo(map)
    } catch {
      setFailed(true)
    }

    return () => {
      resizeRef.current?.disconnect()
      resizeRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [latitude, longitude])

  /**
   * ⚠️ **Sem coordenada, o lugar do mapa vira o aviso** — nunca um quadrado cinza vazio, que parece
   * defeito de carregamento e não diz o que fazer. O texto muda com o motivo, porque o remédio muda:
   * `incomplete` nomeia os campos a preencher, `not_found` pede conferência do endereço já
   * preenchido, e `pending` só espera o próximo salvamento.
   */
  if (latitude === null || longitude === null || failed) {
    return (
      <p className={`${styles.homeNotice} ${home.status === 'resolved' ? '' : styles.homeWarning}`}>
        <Icon name="alert" />
        <span>
          {labelOf(`driverHome.${failed ? 'unavailable' : home.status}`)}
          {home.missing.length === 0
            ? null
            : ` ${labelOf('driverHome.missingFields', {
                fields: home.missing
                  .map((field) => labelOf(`driverHome.field.${field}`))
                  .join(', '),
              })}`}
        </span>
      </p>
    )
  }

  return (
    <div className={styles.homeMap}>
      <div className={styles.homeMapCanvas} ref={containerRef} />
      <p className={styles.homeNotice}>
        <Icon name="alert" />
        <span>{labelOf('driverHome.confirm')}</span>
      </p>
    </div>
  )
}
