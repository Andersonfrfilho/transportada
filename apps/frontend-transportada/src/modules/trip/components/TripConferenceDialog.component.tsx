/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { buildTripConference } from '../shared/tripConference.service'
import type { TripConferenceRow } from '../shared/tripConference.service'
import type { TripDocumentDetail, TripStopDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripConferenceDialogProps = Readonly<{
  documents: readonly TripDocumentDetail[]
  isOpen: boolean
  onClose: () => void
  stops: readonly TripStopDetail[]
}>

type TripConferenceRowViewProps = Readonly<{ row: TripConferenceRow }>

const NON_BREAKING_SPACE = /\u00a0/gu

function TripConferenceRowView({ row }: TripConferenceRowViewProps) {
  const { t } = useTranslation('trip')
  const unknown = t('conference.unknown')

  return (
    <tr>
      <td className={styles.conferenceKey} data-label={t('conference.noteColumn')}>
        <span>
          {row.noteNumber === '' ? unknown : row.noteNumber}
          {row.noteSeries === '' ? null : (
            <span className={styles.hint}>
              {' '}
              {t('conference.series', { series: row.noteSeries })}
            </span>
          )}
        </span>
      </td>
      <td className={styles.conferenceKey} data-label={t('conference.clientColumn')}>
        {row.clientName === '' ? unknown : row.clientName}
      </td>
      <td data-label={t('conference.destinationColumn')}>
        {row.destinationLabel === '' ? t('conference.noStop') : row.destinationLabel}
      </td>
      <td className={styles.conferenceKey} data-label={t('conference.valueColumn')}>
        {row.totalValue === null
          ? unknown
          : formatAmount(row.totalValue).replace(NON_BREAKING_SPACE, ' ')}
      </td>
      <td data-label={t('conference.volumesColumn')}>{row.volumeCount ?? unknown}</td>
    </tr>
  )
}

/** Conferência de leitura: nada aqui altera a viagem, só confronta a montagem com o que foi bipado. */
export function TripConferenceDialog({
  documents,
  isOpen,
  onClose,
  stops,
}: TripConferenceDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })

  if (!isOpen) return null

  const { rows, summary } = buildTripConference({ documents, stops })

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-conference-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-conference-title">{t('conference.title')}</h2>
            <p className={styles.mdfeGateSubtitle}>{t('conference.subtitle')}</p>
          </div>
          <button
            aria-label={t('conference.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <dl className={styles.conferenceSummary}>
          <div>
            <dt>{t('conference.notes')}</dt>
            <dd>{summary.noteCount}</dd>
          </div>
          <div>
            <dt>{t('conference.stops')}</dt>
            <dd>{summary.stopCount}</dd>
          </div>
          <div>
            <dt>{t('conference.totalValue')}</dt>
            <dd>{formatAmount(summary.totalValue).replace(NON_BREAKING_SPACE, ' ')}</dd>
          </div>
          <div>
            <dt>{t('conference.volumes')}</dt>
            <dd>{summary.totalVolumes}</dd>
          </div>
        </dl>
        {summary.notesWithoutValue === 0 ? null : (
          <p className={styles.hint} role="status">
            {t('conference.withoutValue', { count: summary.notesWithoutValue })}
          </p>
        )}

        {rows.length === 0 ? (
          <p className={styles.hint}>{t('conference.empty')}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={`${styles.dataTable} ${styles.conferenceTable}`}>
              <thead>
                <tr>
                  <th scope="col">{t('conference.noteColumn')}</th>
                  <th scope="col">{t('conference.clientColumn')}</th>
                  <th scope="col">{t('conference.destinationColumn')}</th>
                  <th scope="col">{t('conference.valueColumn')}</th>
                  <th scope="col">{t('conference.volumesColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <TripConferenceRowView key={row.documentId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
