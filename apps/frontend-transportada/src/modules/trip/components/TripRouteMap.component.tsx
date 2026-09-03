/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { VectorMap } from '@/components/ui/vector-map'

import { resolveRouteTrace, type RouteGeometry } from '../shared/routeGeometry.service'
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
  const route = resolveRouteTrace({ geometry, project: map.project, stops: map.points })
  const trace =
    route.path === ''
      ? []
      : [
          {
            dashed: route.dashed,
            fill: 'none',
            id: 'route',
            label: t(`routeMap.trace.${route.kind}`),
            path: route.path,
          },
        ]

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
        shapes={[...trace, ...pins]}
        viewBox={`0 0 ${MAP_VIEWBOX_SIZE} ${MAP_VIEWBOX_SIZE}`}
      />
      {canCorrect ? (
        <TripStopPointCorrection isCorrecting={isCorrecting} onCorrect={onCorrect} stops={stops} />
      ) : null}
      <p className={styles.hint}>{t(`routeMap.trace.${route.kind}`)}</p>
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
        {t('routeMap.save')}
      </Button>
      <Button onClick={() => setIsOpen(false)} size="sm" type="button" variant="ghost">
        {t('routeMap.cancel')}
      </Button>
    </div>
  )
}
