/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import {
  CARGO_PREVIEW_ITEM_STATES,
  CARGO_PREVIEW_DEFAULT_LOCALE,
} from '../shared/cargoPreview.constant'
import type { CargoPreviewDetail } from '../shared/cargoPreview.types'
import { formatPlannedDate } from '../shared/cargoPreviewFormat.service'
import detailStyles from '../styles/cargoDetail.module.css'
import previewDetailStyles from '../styles/cargoPreviewDetail.module.css'
import previewStyles from '../styles/cargoPreview.module.css'
import styles from '../styles/cargoReceiving.module.css'
import { CargoPreviewItemStateBadge, CargoPreviewStatusBadge } from './CargoPreviewBadges.component'

type CargoPreviewDetailHeaderProps = Readonly<{ header: CargoPreviewDetail }>

/** Quando o worker não leu a planilha, o motivo sai em português — nunca o código cru. */
function FailureNotice({ errorCode }: Readonly<{ errorCode: string | null }>): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (errorCode === null) return null
  return (
    <p className={styles.error} role="alert">
      {t([`preview.failure.${errorCode}`, 'preview.failure.unknown'])}
    </p>
  )
}

/** Arquivo, quando chegou, dia planejado, linhas, situação da leitura e a contagem por situação do item. */
export function CargoPreviewDetailHeader({ header }: CargoPreviewDetailHeaderProps): JSX.Element {
  const { t, i18n } = useTranslation('cargoReceiving')
  const formatMoment = useMomentFormatter()
  const locale = i18n.resolvedLanguage ?? CARGO_PREVIEW_DEFAULT_LOCALE
  const hasAwaiting = header.status === 'ready' && header.counts.awaiting_xml > 0

  return (
    <section className={styles.fieldGroup}>
      <ul className={detailStyles.facts}>
        <li className={previewStyles.fileName}>
          {t('preview.facts.file', { name: header.fileName })}
        </li>
        <li>{t('preview.facts.receivedAt', { date: formatMoment(header.receivedAt) })}</li>
        <li>
          {t('preview.facts.plannedDate', {
            date: formatPlannedDate({ locale, value: header.plannedDate }),
          })}
        </li>
        <li>{t('preview.facts.rows', { count: header.rowCount ?? 0 })}</li>
        <li>
          <CargoPreviewStatusBadge status={header.status} />
        </li>
      </ul>
      {header.status === 'failed' ? <FailureNotice errorCode={header.errorCode} /> : null}
      <ul aria-label={t('preview.summary.label')} className={previewDetailStyles.summary}>
        {CARGO_PREVIEW_ITEM_STATES.map((state) => (
          <li className={previewDetailStyles.summaryItem} data-count-state={state} key={state}>
            <CargoPreviewItemStateBadge state={state} />
            {header.counts[state]}
          </li>
        ))}
      </ul>
      {hasAwaiting ? (
        <p className={previewDetailStyles.awaitingNote} data-awaiting-note="">
          {t('preview.detail.awaitingNote')}
        </p>
      ) : null}
    </section>
  )
}
