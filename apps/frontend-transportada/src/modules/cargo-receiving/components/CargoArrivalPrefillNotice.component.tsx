/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoArrivalPrefill } from '../shared/cargoPreview.types'
import { CARGO_PREVIEW_DEFAULT_LOCALE } from '../shared/cargoPreview.constant'
import { formatPlannedDate } from '../shared/cargoPreviewFormat.service'
import previewStyles from '../styles/cargoPreview.module.css'

type CargoArrivalPrefillNoticeProps = Readonly<{
  missingCount: number
  prefill: CargoArrivalPrefill
}>

/**
 * A chegada veio de uma prévia: o aviso diz o que foi trazido e que a data e a hora são do operador (o
 * servidor não as assume), com o dia planejado da prévia como referência, e quantas notas propostas já não
 * estão livres.
 */
export function CargoArrivalPrefillNotice({
  missingCount,
  prefill,
}: CargoArrivalPrefillNoticeProps): JSX.Element {
  const { t, i18n } = useTranslation('cargoReceiving')
  const plannedDate = formatPlannedDate({
    locale: i18n.resolvedLanguage ?? CARGO_PREVIEW_DEFAULT_LOCALE,
    value: prefill.plannedDate,
  })

  return (
    <div className={previewStyles.notice} data-prefill-notice="" role="status">
      <p>{t('preview.prefill.notice', { count: prefill.documentIds.length })}</p>
      {prefill.plannedDate === null ? null : (
        <p>{t('preview.prefill.plannedDate', { date: plannedDate })}</p>
      )}
      {missingCount === 0 ? null : <p>{t('preview.prefill.missing', { count: missingCount })}</p>}
    </div>
  )
}
