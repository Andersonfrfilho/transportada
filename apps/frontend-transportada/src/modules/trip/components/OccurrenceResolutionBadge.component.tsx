/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type { TripOccurrenceResolution } from '../shared/tripOccurrenceFeed.service'

type OccurrenceResolutionBadgeProps = Readonly<{
  resolution: null | TripOccurrenceResolution
}>

const BADGE_VARIANT_BY_STATE = {
  reopened: 'warning',
  resolved: 'success',
} as const

/**
 * Spec 266 T3.2: o selo do andamento na lista e no detalhe. Em aberto não tem selo; cancelada fica com o
 * que o painel de resolução já mostra para ela.
 */
export function OccurrenceResolutionBadge({ resolution }: OccurrenceResolutionBadgeProps) {
  const { t } = useTranslation('trip')
  if (resolution === null || resolution.state === 'cancelled') return null
  return (
    <Badge variant={BADGE_VARIANT_BY_STATE[resolution.state]}>
      {t(`occurrenceResolution.state.${resolution.state}`)}
    </Badge>
  )
}
