/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 240 RF6: a **única** conta de "esta ocorrência está cancelada, e o que dizer disso". Detalhe,
 * feed, lista da nota e as duas linhas do tempo leem por aqui — texto de cancelamento montado em
 * outro lugar diverge calado.
 */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { OccurrenceCancellation } from './trip.types'

export type OccurrenceCancellationMark = Readonly<{
  authorship: string
  label: string
  reason: string
  summary: string
}>

export type ResolveOccurrenceCancellationMarkParams = Readonly<{
  formatMoment: (value: string) => string
  translate: Translate
}>

/** `null` é a ocorrência ativa; ausente é API anterior ao campo e lê igual. */
export function resolveOccurrenceCancellationMark(
  cancellation: null | OccurrenceCancellation | undefined,
  { formatMoment, translate }: ResolveOccurrenceCancellationMarkParams,
): null | OccurrenceCancellationMark {
  if (cancellation === null || cancellation === undefined) return null
  const moment = formatMoment(cancellation.cancelledAt)
  const authorship =
    cancellation.cancelledByName === null
      ? translate('occurrenceCancellation.authorshipUnknown', { moment })
      : translate('occurrenceCancellation.authorship', {
          moment,
          name: cancellation.cancelledByName,
        })
  const reason = translate('occurrenceCancellation.reason', { reason: cancellation.reason })
  return {
    authorship,
    label: translate('occurrenceCancellation.label'),
    reason,
    summary: translate('occurrenceCancellation.summary', { authorship, reason }),
  }
}
