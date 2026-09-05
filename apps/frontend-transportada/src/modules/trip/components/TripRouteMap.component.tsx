/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { VectorMap } from '@/components/ui/vector-map'

import {
  IBGE_MESH_STALE_TIME_MS,
  loadStateMeshFeatures,
  type MeshFeature,
} from '@/modules/shared/ibgeMesh.service'

import { buildTripBasemapPaths } from '../shared/tripBasemap.service'
import { resolveRouteTraceSegments, type RouteGeometry } from '../shared/routeGeometry.service'
import { stopColorOf } from '../shared/stopColor.service'
import { MAP_VIEWBOX_SIZE, resolveTripRouteMap } from '../shared/tripRouteMap.service'
import type { TripStopDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripRouteMapProps = Readonly<{
  geometry: RouteGeometry | null
  /** Corrigir é escrita: sem `trip.manage` a tela mostra o mapa e não oferece o pino. */
  canCorrect: boolean
  isCorrecting: boolean
  onCorrect: (input: Readonly<{ addressKey: string; latitude: string; longitude: string }>) => void
  stops: readonly TripStopDetail[]
}>

/** Raio do pino no sistema do `viewBox` — não é pixel, e por isso não sai da escala de espaçamento. */
const PIN_RADIUS = 2.5

/**
 * Spec 079 T013: o roteiro desenhado.
 *
 * O desenho é nosso, como o da aba Regiões — nada de terceiro renderiza dentro da nossa tela
 * (ADR-0037), e por isso o desenho vetorial vem do primitivo `VectorMap`, que já existia para a
 * malha do IBGE e recebe geometria como **dado**.
 *
 * ⚠️ **Parada sem coordenada é nomeada abaixo do mapa, nunca some.** O serviço já as separa; o que
 * a tela não pode é descartar a lista que ele devolve — que é onde a regra se perde entre o serviço
 * e o JSX.
 */
export function TripRouteMap({
  canCorrect,
  geometry,
  isCorrecting,
  onCorrect,
  stops,
}: TripRouteMapProps) {
  const { t } = useTranslation('trip')
  /**
   * ⚠️ O `useQuery` fica **antes** do `if (map === null)`: hook depois de retorno condicional muda
   * a ordem entre renders, e o React quebra. Sem UF a consulta não liga.
   */
  const states = useMemo(
    () =>
      [...new Set(stops.map((stop) => stop.state ?? '').filter((state) => state !== ''))].sort(),
    [stops],
  )
  const meshQuery = useQuery({
    enabled: states.length > 0,
    queryFn: async ({ signal }) => {
      const meshes = await Promise.all(
        states.map((state) =>
          loadStateMeshFeatures({ fetch: globalThis.fetch.bind(globalThis), signal, state }),
        ),
      )
      return meshes.flat()
    },
    /** Divisa de município muda por lei, não por semana — o mesmo tempo da aba Regiões. */
    queryKey: ['trip-route-mesh', states] as const,
    staleTime: IBGE_MESH_STALE_TIME_MS,
  })

  const map = resolveTripRouteMap({
    stops: stops.map((stop) => ({
      label: stop.label,
      latitude: stop.latitude ?? null,
      longitude: stop.longitude ?? null,
      sequence: stop.sequence,
    })),
  })

  if (map === null) return null

  /**
   * ⚠️ O traço **diz qual dos dois é**: sólido quando é a estrada que o OSRM devolveu, tracejado
   * quando é a reta que liga as paradas. Desenhar os dois igual faria o operador ler caminho onde
   * não há — uma reta entre duas paradas atravessa rio e ferrovia sem pedir licença.
   */
  const segments = resolveRouteTraceSegments({
    geometry,
    project: map.project,
    stops: map.points,
  })
  const trace = segments.map((segment) => ({
    color: stopColorOf(segment.toSequence),
    dashed: segment.dashed,
    fill: 'none',
    id: `route-${segment.toSequence}`,
    label: t(`routeMap.trace.${segment.kind}`),
    line: true,
    path: segment.path,
  }))
  /** A legenda continua falando do traço inteiro: os trechos só mudam de cor, não de natureza. */
  const traceKind = segments[0]?.kind ?? 'straight'

  /**
   * O contorno do município entra **primeiro**, para ficar atrás da linha e dos pinos: o fundo é
   * referência, e cobrir o roteiro com ele inverteria a leitura. Malha fora do ar devolve lista
   * vazia — o mapa continua com pinos e linha, sem fundo, e nada quebra.
   */
  const basemap = buildTripBasemapPaths({
    cityCodes: stops.map((stop) => stop.cityCode ?? ''),
    features: meshQuery.data ?? ([] as readonly MeshFeature[]),
    project: map.project,
  }).map((path, index) => ({
    /*
      ⚠️ **Sem `line: true` de propósito.** `.line` declara `stroke: var(--color-fog)`, que é quase
      branco no tema claro do painel: o contorno do município saía como um risco branco por cima do
      mapa, mais forte que o próprio roteiro. O contorno é referência de fundo, então ele fica com
      `.shape` — grafite a 70%, que inverte junto com o documento e sempre lê como fundo.
    */
    fill: 'none',
    id: `city-${index}`,
    label: t('routeMap.basemapLabel'),
    path,
  }))

  const pins = map.points.map((point) => ({
    fill: 'currentColor',
    id: `stop-${point.sequence}`,
    label: t('routeMap.stopLabel', { label: point.label, sequence: point.sequence }),
    // Um círculo escrito como caminho: o primitivo desenha `path`, e o pino é geometria de dado.
    path: `M${point.x - PIN_RADIUS} ${point.y}a${PIN_RADIUS} ${PIN_RADIUS} 0 1 0 ${PIN_RADIUS * 2} 0a${PIN_RADIUS} ${PIN_RADIUS} 0 1 0 ${-PIN_RADIUS * 2} 0`,
  }))

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('routeMap.title')}</h3>
      <VectorMap
        ariaLabel={t('routeMap.title')}
        className={styles.routeMap}
        shapes={[...basemap, ...trace, ...pins]}
        viewBox={`0 0 ${MAP_VIEWBOX_SIZE} ${MAP_VIEWBOX_SIZE}`}
      />
      {canCorrect ? (
        <TripStopPointCorrection isCorrecting={isCorrecting} onCorrect={onCorrect} stops={stops} />
      ) : null}
      <p className={styles.hint}>{t(`routeMap.trace.${traceKind}`)}</p>
      {map.stopsWithoutLocation.length === 0 ? null : (
        <p className={styles.hint}>
          {t('routeMap.withoutLocation', { stops: map.stopsWithoutLocation.join(', ') })}
        </p>
      )}
    </section>
  )
}

/**
 * O degrau 3 da escada da ADR-0044: o pino manual, quando a cascata e o refino não acertaram.
 *
 * ⚠️ **A correção é do endereço, não da viagem.** Ela vale para toda viagem que passe por aquele
 * portão, presente e futura — e o texto diz isso, senão quem corrige acha que ajustou só o roteiro
 * que está olhando. `correção humana sempre vence a cascata` (ADR-0044 §3, degrau 1) é regra do
 * servidor; aqui a tela só a aciona.
 */
function TripStopPointCorrection({
  isCorrecting,
  onCorrect,
  stops,
}: Readonly<{
  isCorrecting: boolean
  onCorrect: (input: Readonly<{ addressKey: string; latitude: string; longitude: string }>) => void
  stops: readonly TripStopDetail[]
}>) {
  const { t } = useTranslation('trip')
  const [addressKey, setAddressKey] = useState(stops[0]?.addressKey ?? '')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  if (stops.length === 0) return null

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="ghost">
        <Icon name="edit" />
        {t('routeMap.correct')}
      </Button>
    )
  }

  return (
    <div className={styles.occurrenceForm}>
      <p className={styles.hint}>{t('routeMap.correctionScope')}</p>
      <Select
        ariaLabel={t('routeMap.correct')}
        onChange={setAddressKey}
        options={stops.map((stop) => ({ label: stop.label, value: stop.addressKey }))}
        value={addressKey}
      />
      <input
        aria-label={t('routeMap.latitude')}
        onChange={(event) => setLatitude(event.target.value)}
        placeholder={t('routeMap.latitude')}
        type="text"
        value={latitude}
      />
      <input
        aria-label={t('routeMap.longitude')}
        onChange={(event) => setLongitude(event.target.value)}
        placeholder={t('routeMap.longitude')}
        type="text"
        value={longitude}
      />
      <Button
        disabled={isCorrecting}
        onClick={() => {
          onCorrect({ addressKey, latitude, longitude })
          setIsOpen(false)
        }}
        size="sm"
        type="button"
      >
        <Icon name="save" />
        {t('routeMap.save')}
      </Button>
      <Button onClick={() => setIsOpen(false)} size="sm" type="button" variant="ghost">
        <Icon name="close" />
        {t('routeMap.cancel')}
      </Button>
    </div>
  )
}
