/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useRouteMap } from '../hooks/useRouteMap.hook'
import type { RouteSuggestionStop } from '../shared/routeSuggestion.types'
import styles from '../styles/routing.module.css'

type RouteSuggestionMapProps = Readonly<{
  stops: readonly RouteSuggestionStop[]
}>

/**
 * ADR-0044 §6: o mapa **confere** a sugestão; ele não é a sugestão. Quando o PMTiles não está
 * disponível — e num ambiente novo ele nunca está, porque é gerado offline do mesmo extract do OSRM
 * — o painel cai para a lista ordenada **e diz isso**, com o motivo.
 *
 * Uma degradação que não se explica vira defeito aparente, e manda o operador abrir chamado para o
 * que é comportamento declarado.
 */
export function RouteSuggestionMap({ stops }: RouteSuggestionMapProps): JSX.Element | null {
  const { t } = useTranslation('routing')
  const map = useRouteMap({ stops })

  if (map.state === 'loading') {
    return (
      <SkeletonGroup className={styles.map} label={t('map.loading')}>
        <Skeleton height="100%" variant="block" width="100%" />
      </SkeletonGroup>
    )
  }

  if (map.state === 'unavailable') {
    return (
      <p className={styles.mapNotice} role="status">
        {t(`map.unavailable.${map.reason}`)}
      </p>
    )
  }

  return (
    <div aria-label={t('map.label')} className={styles.map} ref={map.containerRef} role="img" />
  )
}
