/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { VectorMap } from '@/components/ui/vector-map'

import { MAP_VIEWBOX_SIZE, resolveTripRouteMap } from '../shared/tripRouteMap.service'
import type { TripStopDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripRouteMapProps = Readonly<{ stops: readonly TripStopDetail[] }>

/** Raio do pino no sistema do `viewBox` — não é pixel, e por isso não sai da escala de espaçamento. */
const PIN_RADIUS = 2.5

/**
 * Spec 079 T013: o roteiro desenhado.
 *
 * O desenho é nosso, como o da aba Regiões — nada de terceiro renderiza dentro da nossa tela
 * (ADR-0037), e por isso o `<svg>` vem do primitivo `VectorMap`, que já existia para a malha do
 * IBGE e recebe geometria como **dado**.
 *
 * ⚠️ **Parada sem coordenada é nomeada abaixo do mapa, nunca some.** O serviço já as separa; o que
 * a tela não pode é descartar a lista que ele devolve — que é onde a regra se perde entre o serviço
 * e o JSX.
 */
export function TripRouteMap({ stops }: TripRouteMapProps) {
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

  const trace =
    map.points.length < 2
      ? []
      : [
          {
            fill: 'none',
            id: 'route',
            label: t('routeMap.title'),
            path: map.points
              .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
              .join(' '),
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
      {map.stopsWithoutLocation.length === 0 ? null : (
        <p className={styles.hint}>
          {t('routeMap.withoutLocation', { stops: map.stopsWithoutLocation.join(', ') })}
        </p>
      )}
    </section>
  )
}
