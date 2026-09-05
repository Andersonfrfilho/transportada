/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  addProtocol,
  type GeoJSONSource,
  setWorkerUrl,
} from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/**
 * ⚠️ **Sem esta folha o marcador não fica preso ao mapa.** É ela que dá `position: absolute` ao
 * `.maplibregl-marker` e recorta o canvas; sem ela os pinos escapam do quadro e aparecem por cima
 * dos elementos da página ao aproximar. Foi exatamente o defeito relatado.
 */
import 'maplibre-gl/dist/maplibre-gl.css'
/** `?url` faz o Vite resolver o especificador de pacote e servir o arquivo da nossa origem. */
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

import {
  BASEMAP_THEMES,
  buildBasemapStyle,
  resolveBasemapOutline,
  type BasemapTheme,
} from '../shared/vectorBasemap.service'
import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import type { RouteGeometry } from '../shared/routeGeometry.service'
import styles from '../styles/trip.module.css'
import { resolveRouteLegs } from '../shared/routeGeometry.service'
import { resolveStopColor } from '../shared/stopColor.service'

type AssemblyVectorMapProps = Readonly<{
  geometry: RouteGeometry | null
  nearby: readonly AssemblyMapPoint[]
  onBasemapMissing: () => void
  points: readonly AssemblyMapPoint[]
  stopColor: (sequence: number) => string
}>

const ROUTE_SOURCE = 'roteiro'
const ROUTE_LAYER = 'roteiro-linha'

/** O que o efeito monta e o `applyRoute` reaplica — um trecho por parada, com a cor dela. */
type RouteCollection = {
  readonly type: 'FeatureCollection'
  readonly features: readonly {
    readonly type: 'Feature'
    readonly geometry: { readonly type: 'LineString'; readonly coordinates: number[][] }
    readonly properties: { readonly color: string; readonly dashed: boolean }
  }[]
}
const NEARBY_SOURCE = 'fora-da-selecao'
/** Onde o operador deixou o mapa da última vez. Preferência de leitura, não dado de operação. */
const THEME_STORAGE_KEY = 'transportada.trip-assembly-map-theme'

/**
 * A escolha **explícita** do operador, se houver — e `null` quando ele nunca tocou no botão, que é
 * quando o mapa segue o painel.
 */
function readStoredTheme(): BasemapTheme | null {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? ''
    return BASEMAP_THEMES.find((theme) => theme === stored) ?? null
  } catch {
    /** Janela anônima e armazenamento bloqueado lançam aqui — o mapa não pode cair por isso. */
    return null
  }
}

/**
 * ⚠️ O worker sai de um arquivo **empacotado pelo Vite**, nunca de `blob:` — a CSP declara
 * `worker-src 'self'` (ADR-0042), e o padrão do MapLibre é justamente o blob que ela proíbe. É a
 * mesma regra que o leitor de código de barras já segue.
 *
 * ⚠️ **O caminho vem de um `import ?url`, e não de `new URL(…, import.meta.url)`.** Aquela forma
 * resolve URL pura e **não** resolve especificador de pacote: `'maplibre-gl/dist/…'` virava
 * `/src/modules/trip/components/maplibre-gl/dist/…` — 404. Sem worker o MapLibre não decodifica
 * telha nenhuma, cai no `blob:`, a CSP barra, e o mapa fica um retângulo vazio com os controles por
 * cima: nada falha em voz alta, e a tela parece só "não ter mapa". O Vite só reescreve `new URL`
 * para caminho **relativo**; para especificador de pacote quem resolve é o `import`.
 */
let workerConfigured = false
function configureWorker(): void {
  if (workerConfigured) return
  setWorkerUrl(maplibreWorkerUrl)
  addProtocol('pmtiles', new Protocol().tile)
  workerConfigured = true
}

/**
 * O mapa de rua do painel de montagem (ADR-0044 §6). O fundo é o nosso PMTiles; os pinos e a linha
 * são desenho nosso por cima. Pan e zoom vêm do MapLibre — antes eu os tinha escrito à mão sobre
 * telhas raster, e eram cem linhas para reimplementar pior o que a biblioteca já faz.
 */
/**
 * O valor de um token de design, resolvido no documento. O MapLibre pinta em WebGL e não enxerga
 * `var(--color-…)`, então toda cor precisa chegar até ele já resolvida.
 */
function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
}

export function AssemblyVectorMap({
  geometry,
  nearby,
  onBasemapMissing,
  points,
  stopColor,
}: AssemblyVectorMapProps) {
  const { t } = useTranslation('trip')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const [isReady, setIsReady] = useState(false)
  /** O estilo do tema já veio pelo construtor; o efeito abaixo só vale da segunda vez em diante. */
  const themeApplied = useRef(false)
  /** O mapa já abriu ao menos uma vez — depois disso, erro é rede, não ausência do arquivo. */
  const basemapLoaded = useRef(false)
  /**
   * O último roteiro calculado. Ele vive fora do React porque quem o recoloca não é um render — é o
   * próprio MapLibre, avisando que o estilo mudou.
   */
  const routeRef = useRef<{
    readonly dashArray: readonly number[]
    readonly data: RouteCollection
  } | null>(null)

  /**
   * ⚠️ **A camada do roteiro se recoloca sozinha, e é isso que finalmente conserta o traço que
   * sumia ao trocar de tema.** Três tentativas anteriores falharam por apostar num evento:
   *
   * - `styledata` sozinho remontava cedo demais, e o estilo terminando de carregar descartava tudo;
   * - `style.load` **não é emitido** quando o `setStyle` resolve por diff, que é o caso da troca de
   *   tema — a espera nunca terminava e o traço não voltava;
   * - conferir `isStyleLoaded()` uma vez acertava a primeira troca e errava as seguintes, porque na
   *   segunda o estilo ainda estava carregando quando o efeito passou por ali.
   *
   * O que todas tinham em comum era tratar "o estilo mudou" como um instante. Não é: é um estado
   * que pode mudar de novo a qualquer momento, e a camada acrescentada em tempo de execução é
   * apagada pelo diff toda vez. Então a resposta é **idempotente e repetida** — reaplicar sempre que
   * o MapLibre disser que mexeu no estilo, adicionando só o que não existe.
   */
  const applyRoute = useCallback((map: MapLibreMap): void => {
    const route = routeRef.current
    if (route === null || route.data.features.length === 0) return

    /**
     * ⚠️ **Não se pergunta `isStyleLoaded()` aqui.** Medido: ele responde `false` em **toda** a
     * janela em que este código roda, porque significa "todas as fontes e telhas terminaram de
     * carregar" — e não "dá para acrescentar camada", que é a pergunta de verdade. Usá-lo como
     * portão fazia o traço nunca entrar.
     *
     * A camada pode ser acrescentada desde que o estilo exista, e quem chama aqui só chama depois
     * disso. O `try` cobre a janela estreita em que o estilo está sendo trocado: falhar em pôr o
     * traço é motivo para tentar de novo no próximo `styledata`, nunca para derrubar a tela.
     */
    try {
      const existing: GeoJSONSource | undefined = map.getSource(ROUTE_SOURCE)
      if (existing === undefined) {
        map.addSource(ROUTE_SOURCE, { data: route.data, type: 'geojson' })
      } else {
        void existing.setData(route.data)
      }

      if (map.getLayer(ROUTE_LAYER) === undefined) {
        map.addLayer({
          id: ROUTE_LAYER,
          paint: {
            'line-color': ['get', 'color'],
            /** Tracejado só quando o trecho é reta: sólido diria que o caminhão faz o caminho. */
            'line-dasharray': [...route.dashArray],
            'line-width': 3,
          },
          source: ROUTE_SOURCE,
          type: 'line',
        })
        return
      }
      map.setPaintProperty(ROUTE_LAYER, 'line-dasharray', [...route.dashArray])
    } catch {
      /** Estilo em troca: o `styledata` seguinte reaplica. */
    }
  }, [])
  const [chosenTheme, setChosenTheme] = useState<BasemapTheme | null>(readStoredTheme)
  /** Segue o painel enquanto ninguém escolher; a escolha explícita vence e fica guardada. */
  /**
   * ⚠️ **O padrão é o papel bege, não o tema do painel.** Seguir o documento deixava o mapa nascer
   * quase preto para quem usa o painel escuro, e cartografia escura é para quem a escolhe — não o
   * ponto de partida de quem só quer ver onde a carga vai. A escolha explícita continua mandando e
   * continua persistindo; o seletor de tema continua com os três.
   */
  const theme = chosenTheme ?? 'claro'

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    configureWorker()
    const map = new MapLibreMap({
      /** Sem atribuição automática: ela é nossa, e já está impressa ao lado do mapa. */
      attributionControl: false,
      center: [-47.81, -21.17],
      container,
      /**
       * ⚠️ **Zero, e não o padrão de 300 ms.** O cross-fade do MapLibre redesenha o quadro inteiro
       * enquanto o tile novo entra, e arrastar o mapa vira um piscar contínuo da tela toda.
       */
      fadeDuration: 0,
      style: buildBasemapStyle(readToken, theme),
      zoom: 8,
    })
    mapRef.current = map
    map.on('load', () => {
      basemapLoaded.current = true
      setIsReady(true)
    })
    /**
     * ⚠️ **A rede de segurança do traço, e ela é para a vida inteira do mapa.** Toda troca de tema
     * passa por `setStyle`, o diff apaga a camada acrescentada em tempo de execução, e nenhum
     * evento de "carreguei" vem depois quando a troca resolve por diff. Reagir a `styledata` — que
     * é emitido em toda mexida no estilo — e reaplicar de forma idempotente é o que faz o roteiro
     * sobreviver à segunda, à terceira e à enésima troca, e não só à primeira.
     */
    map.on('styledata', () => applyRoute(map))
    /**
     * ⚠️ Arquivo ausente é o caso **esperado** enquanto o `.pmtiles` não é gerado, e a ADR-0044 §6
     * manda cair para a lista dizendo isso — não deixar o erro subir como falha da tela.
     */
    map.on('error', (event) => {
      /**
       * ⚠️ **Não engula o erro em silêncio.** Este tratador só chamava `onBasemapMissing()` e
       * descartava o objeto — e um dia inteiro de diagnóstico foi gasto às cegas porque a causa
       * era impressa pelo MapLibre e apagada aqui. Fora de produção ela vai para o console; a
       * degradação para a lista continua a mesma.
       */
      if (import.meta.env.DEV) console.error('[basemap]', event.error?.message ?? event.error)

      /**
       * ⚠️ **Só o mapa que nunca abriu cai para a lista.** Antes qualquer erro desmontava o mapa —
       * e o MapLibre emite `error` por **tile**, o tempo todo, enquanto se arrasta: um tile que
       * falha derrubava o mapa inteiro, o pai remontava, o mapa buscava tudo de novo e falhava de
       * novo. O sintoma não era "sumiu", era a tela **piscando** e o mapa lento, porque o laço
       * rodava a cada arrasto.
       *
       * Depois do `load` o mapa já provou que o arquivo existe: erro dali em diante é rede, e rede
       * se resolve sozinha no próximo quadro. Só a falha **antes** de abrir é a ausência que a
       * ADR-0044 §6 manda degradar.
       */
      if (basemapLoaded.current) return
      onBasemapMissing()
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // O mapa nasce uma vez; ponto e linha entram pelos efeitos abaixo. `theme` é lido só no
    // construtor, e trocar de tema é `setStyle` no efeito abaixo — nunca remontar o mapa.
  }, [])

  /**
   * Trocar o tema é **substituir o estilo**, e o MapLibre descarta fonte e camada junto. O traço tem
   * rede própria (`applyRoute` no `styledata`); `isReady` aqui é o que remonta pino e pontos cinza.
   */
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return
    try {
      if (chosenTheme !== null) globalThis.localStorage?.setItem(THEME_STORAGE_KEY, chosenTheme)
    } catch {
      /** Preferência que não persiste não é motivo para o mapa não trocar de cor. */
    }
    /**
     * ⚠️ **Na montagem este efeito não pode trocar o estilo.** O construtor acabou de receber o
     * estilo deste mesmo tema, e o `setStyle` do MapLibre faz diff: estilo idêntico é no-op, e o
     * `once('styledata')` abaixo **nunca dispara** — `isReady` ficava `false` para sempre, então
     * pino, rota e pontos cinza nunca entravam e o mapa ficava um retângulo vazio com os controles
     * por cima. Só troca de tema de verdade remonta o estilo.
     */
    if (!themeApplied.current) {
      themeApplied.current = true
      return
    }

    setIsReady(false)
    map.setStyle(buildBasemapStyle(readToken, theme))
    /**
     * ⚠️ **`setStyle` faz diff, e diff não emite `style.load`.** Quando o estilo novo é alcançável
     * a partir do atual, o MapLibre aplica as diferenças em vez de recarregar — e o evento de
     * carga **nunca vem**. Como a fonte e a camada do roteiro são acrescentadas em tempo de
     * execução, elas não existem no estilo novo e o próprio diff as remove: o traço some, e o
     * efeito que o recriaria espera para sempre por um `style.load` que não virá.
     *
     * ⚠️ E o fallback **não pode ser `once('styledata')`**: esse evento é emitido várias vezes
     * durante a troca, e a primeira chega com `isStyleLoaded()` ainda `false`. O `once` gastava a
     * única inscrição justamente nela e nunca mais era chamado — que é a razão de o traço sumir ao
     * trocar de tema mesmo depois de a espera por `style.load` ter sido escrita.
     *
     * Então: escuta contínua, com o desligamento na mão quando o estilo termina.
     */
    const aoTerminar = () => {
      if (!map.isStyleLoaded()) return
      map.off('styledata', aoTerminar)
      basemapLoaded.current = true
      setIsReady(true)
    }

    /**
     * ⚠️ **Com diff o estilo já está pronto aqui, e nenhum evento virá depois.** Medido: logo após
     * o `setStyle`, `isStyleLoaded()` responde `true` — a troca foi aplicada em linha. Ficar
     * esperando evento nesse caminho é esperar para sempre, e era isso que deixava `isReady` em
     * `false` e o traço fora do mapa.
     *
     * O caminho por evento continua para o `setStyle` que **recarrega** de verdade (estilo que o
     * diff não alcança), onde a carga é assíncrona.
     */
    if (map.isStyleLoaded()) {
      aoTerminar()
      return
    }
    map.on('styledata', aoTerminar)
    map.once('style.load', aoTerminar)
  }, [chosenTheme, theme])

  /** A parada é marcador de DOM: são poucas, e assim herdam o mesmo CSS da bolinha da lista. */
  useEffect(() => {
    const map = mapRef.current
    if (map === null || !isReady) return

    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    for (const point of points) {
      markersRef.current.push(
        new Marker({
          element: stopElement({
            approximate: point.isApproximate,
            color: stopColor(point.sequence ?? 1),
            outline: resolveBasemapOutline(readToken, theme),
            sequence: point.sequence ?? 1,
          }),
        })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map),
      )
    }

    /**
     * ⚠️ O que ficou **fora da seleção** é camada, não marcador. Com o filtro aberto são centenas de
     * notas: medido em 261 nós de DOM, que pesavam e escapavam do quadro. Em camada eles são
     * desenhados pelo WebGL junto com o mapa — recortados pelo canvas por construção.
     */
    const nearbyData = {
      type: 'FeatureCollection' as const,
      features: nearby.map((point) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
        properties: {},
      })),
    }
    const nearbySource: GeoJSONSource | undefined = map.getSource(NEARBY_SOURCE)
    if (nearbySource === undefined) {
      map.addSource(NEARBY_SOURCE, { data: nearbyData, type: 'geojson' })
      map.addLayer({
        id: 'fora-da-selecao-ponto',
        paint: {
          'circle-color': getComputedStyle(document.documentElement)
            .getPropertyValue('--color-slate')
            .trim(),
          'circle-opacity': 0.5,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5],
        },
        source: NEARBY_SOURCE,
        type: 'circle',
      })
    } else {
      void nearbySource.setData(nearbyData)
    }

    fitToStops(map, points)
  }, [isReady, nearby, points, stopColor, theme])

  /**
   * A linha da estrada. Ela é **fonte de dado**, atualizada no lugar: recriar a camada a cada
   * resposta faria o mapa piscar a cada reordenação.
   */
  useEffect(() => {
    const map = mapRef.current
    if (map === null || !isReady) return

    /**
     * ⚠️ **Um traço por trecho, com a cor da parada a que ele leva.** Antes era uma linha só em
     * `--color-copper`, e o laranja do tema já é usado por outros traços do mapa: o roteiro se
     * perdia no meio deles. A cor vem da mesma paleta da listagem, que é o que a pessoa está lendo
     * ao lado do mapa.
     */
    const legs = resolveRouteLegs({
      geometry,
      /** Aqui não há projeção: o MapLibre recebe grau, e o corte por proximidade é no próprio grau. */
      project: (point: { readonly latitude: number; readonly longitude: number }) => ({
        x: point.longitude,
        y: point.latitude,
      }),
      stops: points.map((point) => ({ x: point.longitude, y: point.latitude })),
    })
    const data = {
      type: 'FeatureCollection' as const,
      features: legs.map((leg) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: leg.points.map((point) => [point.x, point.y]),
        },
        properties: {
          color: resolveStopColor(leg.toSequence, document.documentElement),
          dashed: leg.dashed,
        },
      })),
    }

    /**
     * ⚠️ **`line-dasharray` não é data-driven no MapLibre**, e é por isso que o tracejado é constante
     * aqui em vez de sair do `dashed` de cada trecho. Uma expressão nessa chave faz o `addLayer`
     * recusar a camada **inteira** — e o sintoma não é erro na tela, é o roteiro sumir do mapa com
     * as cores e os pinos continuando no lugar. Foi exatamente o que aconteceu.
     *
     * A constante é honesta porque os trechos são homogêneos por construção: `resolveRouteLegs`
     * devolve todos de estrada quando a polilinha veio, e todos retas quando não veio.
     */
    const dashArray = legs[0]?.dashed === true ? [2, 2] : [1]

    routeRef.current = { dashArray, data }
    applyRoute(map)
  }, [applyRoute, geometry, isReady, points, theme])

  return (
    <div className={styles.vectorMap}>
      <div className={styles.vectorMapCanvas} ref={containerRef} />
      <div className={styles.vectorMapControls}>
        <Button
          aria-label={t('assemblyMap.zoomIn')}
          onClick={() => mapRef.current?.zoomIn()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="add" />
        </Button>
        <Button
          aria-label={t('assemblyMap.zoomOut')}
          onClick={() => mapRef.current?.zoomOut()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="minus" />
        </Button>
        {/* Recentrar é a saída de quem se perdeu arrastando — devolve o enquadramento das paradas. */}
        <Button
          aria-label={t('assemblyMap.recenter')}
          onClick={() => {
            const map = mapRef.current
            if (map !== null) fitToStops(map, points)
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="target" />
        </Button>
        {/*
          O tema é preferência de leitura, e por isso ele cicla num botão só em vez de ocupar três:
          o rótulo diz para onde o próximo clique vai, e a escolha fica guardada no navegador.
        */}
        <Button
          aria-label={t('assemblyMap.theme', {
            theme: t(`assemblyMap.themes.${nextTheme(theme)}`),
          })}
          onClick={() => setChosenTheme(nextTheme(theme))}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="contrast" />
        </Button>
      </div>
    </div>
  )
}

/**
 * ⚠️ **O MapLibre é dono do `transform` e do `position` deste elemento.** Ele escreve os dois inline
 * no marcador para posicioná-lo, e o inline vence a classe — então `position`/`transform` no CSS do
 * pino são letra morta, e quem tentar corrigir o ancoramento por lá não muda nada. O ancoramento
 * pelo centro já é o padrão do `Marker`.
 *
 * O que **precisa** vir daqui é a cor: o tom da parada casa o pino com a bolinha da lista, e o anel
 * casa o pino com o papel do tema do mapa. Nenhum dos dois é conhecido pela folha de estilo.
 */
function stopElement(input: {
  readonly approximate: boolean
  readonly color: string
  readonly outline: string
  readonly sequence: number
}): HTMLElement {
  const element = document.createElement('span')
  /**
   * ⚠️ **O palpite não pode ser desenhado igual ao endereço conhecido.** Metade desta base tem
   * precisão `city`, e aí o ponto é o **centroide do município** — cai no meio do mato, e lido como
   * entrega de verdade manda alguém procurar porta que não existe ali. ADR-0044 §1.
   */
  element.className = input.approximate
    ? `${styles.tilePin ?? ''} ${styles.tilePinApproximate ?? ''}`
    : (styles.tilePin ?? '')
  element.style.background = input.color
  element.style.borderColor = input.outline
  element.textContent = String(input.sequence)
  return element
}

/** Cicla claro → escuro → contraste → claro. Um botão diz mais que três disputando o mesmo canto. */
function nextTheme(current: BasemapTheme): BasemapTheme {
  const index = BASEMAP_THEMES.indexOf(current)
  return BASEMAP_THEMES[(index + 1) % BASEMAP_THEMES.length] ?? 'claro'
}

/** O enquadramento das paradas, usado na montagem e no botão de recentrar — a mesma conta. */
function fitToStops(map: MapLibreMap, points: readonly AssemblyMapPoint[]): void {
  if (points.length === 0) return
  const bounds = new LngLatBounds()
  for (const point of points) bounds.extend([point.longitude, point.latitude])
  map.fitBounds(bounds, { duration: 0, maxZoom: 14, padding: 48 })
}
