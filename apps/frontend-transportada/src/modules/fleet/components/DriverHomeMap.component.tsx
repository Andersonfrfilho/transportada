/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ICON_PATHS, Icon } from '@/components/ui/icon'
import {
  basemapThemeForApp,
  buildBasemapStyle,
  configureVectorBasemap,
} from '@/modules/shared/vectorBasemap.service'

import type { DriverHomeReport } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'

/**
 * ⚠️ **14 é o teto do arquivo, não uma preferência.** O `area.pmtiles` desta instalação declara
 * `max_zoom: 14` — medido no cabeçalho —, e pedir 15 devolve o papel do basemap sem nenhuma feição:
 * um retângulo liso que parece defeito de carregamento e não é. Aproximar mais exige gerar o extrato
 * com mais um nível, não mudar este número.
 */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

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
  /** Chamado quando o operador move o alfinete — a ficha grava no `Salvar` que já existe. */
  onMove?: (coordinate: null | Readonly<{ latitude: string; longitude: string }>) => void
}>

/**
 * O passo das setas: ~11 metros por clique, no zoom em que o mapa abre.
 *
 * ⚠️ Ele é **fino de propósito.** O alfinete já está na rua certa — o que se corrige aqui é o lado
 * da via, o número vizinho, o fundo de lote. Um passo grosso transformaria a correção em outra
 * busca, e para mudar de bairro existe o campo de endereço.
 */
const MOVE_STEP_DEGREES = 0.0001

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
export function DriverHomeMap({ home, labelOf, latitude, longitude, onMove }: DriverHomeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const resizeRef = useRef<ResizeObserver | null>(null)
  const markerRef = useRef<Marker | null>(null)
  /**
   * ⚠️ A coordenada **da montagem**, congelada: o mapa é construído uma vez. Reconstruí-lo a cada
   * clique de seta piscaria a tela e jogaria fora o zoom que o operador escolheu.
   */
  const initialRef = useRef<null | [number, number]>(null)
  if (initialRef.current === null && latitude !== null && longitude !== null) {
    initialRef.current = [Number(longitude), Number(latitude)]
  }
  const initial = initialRef.current
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (container === null || initial === null) return

    /** ⚠️ Sem isto o `pmtiles://` vira esquema próprio e a CSP bloqueia: canvas preto, sem erro na tela. */
    configureVectorBasemap()
    const center = initial
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

      /**
       * O alfinete de mapa, na forma que se espera dele. ⚠️ O glifo vem de `ICON_PATHS` — emoji não
       * entra em produto (`web.md` §9): renderiza diferente em cada sistema, não herda `currentColor`
       * e não escala com o token. Montado por `createElementNS` porque o marcador do MapLibre é
       * `HTMLElement`, fora da árvore do React — imperativa é a montagem, não o desenho.
       */
      const pin = document.createElement('span')
      pin.className = styles.homePin ?? ''
      pin.style.color = readToken('--color-copper')
      const glyph = document.createElementNS(SVG_NAMESPACE, 'svg')
      glyph.setAttribute('viewBox', '0 0 24 24')
      glyph.setAttribute('fill', 'none')
      glyph.setAttribute('stroke', 'currentColor')
      glyph.setAttribute('stroke-width', '2')
      glyph.setAttribute('stroke-linecap', 'round')
      glyph.setAttribute('stroke-linejoin', 'round')
      glyph.setAttribute('aria-hidden', 'true')
      for (const definition of ICON_PATHS['map-pin']) {
        const path = document.createElementNS(SVG_NAMESPACE, 'path')
        path.setAttribute('d', definition)
        glyph.append(path)
      }
      pin.append(glyph)
      /** ⚠️ `anchor: 'bottom'`: a ponta do alfinete é o lugar, não o meio dele. */
      const marker = new Marker({ anchor: 'bottom', draggable: onMove !== undefined, element: pin })
        .setLngLat(center)
        .addTo(map)
      markerRef.current = marker
      marker.on('dragend', () => {
        const moved = marker.getLngLat()
        onMove?.({ latitude: moved.lat.toFixed(7), longitude: moved.lng.toFixed(7) })
      })
    } catch {
      setFailed(true)
    }

    return () => {
      resizeRef.current?.disconnect()
      resizeRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
    /**
     * ⚠️ As dependências **não** incluem a coordenada movida de propósito: remontar o mapa a cada
     * clique de seta piscaria a tela inteira e perderia o zoom que o operador escolheu. Quem move o
     * alfinete depois da montagem é o efeito abaixo.
     */
  }, [initial, onMove])

  /** Move o alfinete e acompanha com a câmera, sem refazer o mapa. */
  useEffect(() => {
    if (latitude === null || longitude === null) return
    const next: [number, number] = [Number(longitude), Number(latitude)]
    markerRef.current?.setLngLat(next)
    mapRef.current?.easeTo({ center: next, duration: 200 })
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

  /**
   * As setas movem o alfinete em passo fino. ⚠️ Elas existem **além** do arraste porque arrastar com
   * precisão exige mouse e pulso firme: no toque, e para quem ajusta um lote de fichas, o clique
   * repetível é o que funciona. Mesmo motivo do `dnd-kit` no lugar do `draggable` nativo na viagem.
   */
  function nudge(deltaLatitude: number, deltaLongitude: number): void {
    if (onMove === undefined || latitude === null || longitude === null) return
    onMove({
      latitude: (Number(latitude) + deltaLatitude).toFixed(7),
      longitude: (Number(longitude) + deltaLongitude).toFixed(7),
    })
  }

  return (
    <div className={styles.homeMap}>
      <div className={styles.homeMapCanvas} ref={containerRef} />
      <p className={styles.homeNotice}>
        <Icon name="alert" />
        <span>{labelOf('driverHome.confirm')}</span>
      </p>
      {onMove === undefined ? null : (
        <div className={styles.homeMove}>
          <p className={styles.hint}>{labelOf('driverHome.move.hint')}</p>
          <div className={styles.homeMoveButtons}>
            <Button
              aria-label={labelOf('driverHome.move.north')}
              onClick={() => {
                nudge(MOVE_STEP_DEGREES, 0)
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="arrow-up" />
            </Button>
            <Button
              aria-label={labelOf('driverHome.move.west')}
              onClick={() => {
                nudge(0, -MOVE_STEP_DEGREES)
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="chevron-left" />
            </Button>
            <Button
              aria-label={labelOf('driverHome.move.east')}
              onClick={() => {
                nudge(0, MOVE_STEP_DEGREES)
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="chevron-right" />
            </Button>
            <Button
              aria-label={labelOf('driverHome.move.south')}
              onClick={() => {
                nudge(-MOVE_STEP_DEGREES, 0)
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="arrow-down" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
