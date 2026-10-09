/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { useInstallationBrandView } from '@/modules/identity/hooks/useInstallationBrandView.hook'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useTripCreatorName } from '../hooks/useTripCreatorName.hook'
import { useTripConferencePdf } from '../hooks/useTripConferencePdf.hook'
import { buildTripConference } from '../shared/tripConference.service'
import { buildTripConferenceSheetLabels } from '../shared/tripConferenceLabels.service'
import { buildTripConferenceSheet, ROUTE_SEPARATOR } from '../shared/tripConferenceSheet.service'
import type { TripConferenceRow } from '../shared/tripConference.service'
import { TripConferencePrintSheet } from './TripConferencePrintSheet.component'
import type { TripDocumentDetail, TripDriverLine, TripStopDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripConferenceDialogProps = Readonly<{
  canReadCreator: boolean
  documents: readonly TripDocumentDetail[]
  drivers: readonly TripDriverLine[]
  isOpen: boolean
  onClose: () => void
  stops: readonly TripStopDetail[]
  tripCode: string
  tripId: string
  vehiclePlate: null | string
}>

type TripConferenceRowViewProps = Readonly<{ row: TripConferenceRow }>

type TripConferenceStopGroup = Readonly<{
  city: string
  destinationLabel: string
  rows: readonly TripConferenceRow[]
  volumes: number
}>

const NON_BREAKING_SPACE = /\u00a0/gu

function groupRowsByStop(rows: readonly TripConferenceRow[]): readonly TripConferenceStopGroup[] {
  const groups = new Map<string, TripConferenceRow[]>()
  for (const row of rows) {
    const group = groups.get(row.destinationLabel) ?? []
    group.push(row)
    groups.set(row.destinationLabel, group)
  }
  return [...groups.entries()].map(([destinationLabel, groupRows]) => ({
    city: groupRows[0]?.city ?? '',
    destinationLabel,
    rows: groupRows,
    volumes: groupRows.reduce((total, row) => total + (row.volumeCount ?? 0), 0),
  }))
}

function TripConferenceRowView({ row }: TripConferenceRowViewProps) {
  const { t } = useTranslation('trip')
  const unknown = t('conference.unknown')

  return (
    <li className={styles.conferenceNote}>
      <span className={styles.conferenceNoteNumber}>
        {row.noteNumber === '' ? unknown : row.noteNumber}
        {row.noteSeries === '' ? null : (
          <span className={styles.hint}> {t('conference.series', { series: row.noteSeries })}</span>
        )}
      </span>
      <span className={styles.conferenceNoteClient}>
        {row.clientName === '' ? unknown : row.clientName}
      </span>
      <span className={styles.conferenceNoteAddress}>
        <Icon name="map-pin" />
        {row.destinationLabel === '' ? t('conference.noStop') : row.destinationLabel}
      </span>
      <span className={styles.conferenceNoteMeta}>
        <Icon name="package" />
        {row.volumeCount ?? unknown}
      </span>
      <span className={styles.conferenceNoteValue}>
        {row.totalValue === null
          ? unknown
          : formatAmount(row.totalValue).replace(NON_BREAKING_SPACE, ' ')}
      </span>
    </li>
  )
}

type TripConferenceContentProps = Omit<TripConferenceDialogProps, 'isOpen'>

function TripConferenceContent({
  canReadCreator,
  documents,
  drivers,
  onClose,
  stops,
  tripCode,
  tripId,
  vehiclePlate,
}: TripConferenceContentProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const brand = useInstallationBrandView()
  const creatorName = useTripCreatorName({ canRead: canReadCreator, tripId })
  const conference = buildTripConference({ documents, stops })
  const { rows, summary } = conference
  const labels = buildTripConferenceSheetLabels(t)
  const sheet = buildTripConferenceSheet({
    conference,
    creatorName,
    drivers,
    labels,
    printedOn: new Date(),
    tripCode,
    vehiclePlate,
  })
  const pdf = useTripConferencePdf({
    brand,
    labels,
    sheet,
    tripCode,
  })

  const dialog = createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-conference-title"
        aria-modal="true"
        className={`${styles.mdfeGateDialog} ${styles.conferenceDialog}`}
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

        <div className={styles.conferenceIdentity}>
          <span className={styles.conferenceChip}>
            <Icon name="document" />
            <code>{tripCode}</code>
          </span>
          {vehiclePlate === null ? null : (
            <span className={styles.conferenceChip}>
              <Icon name="truck" />
              {vehiclePlate}
            </span>
          )}
          {drivers.map((driver) => (
            <span className={styles.conferenceChip} key={driver.driverId}>
              {driver.driverName}
            </span>
          ))}
        </div>

        <dl className={styles.conferenceSummary}>
          <div>
            <Icon name="invoice" />
            <dt>{t('conference.notes')}</dt>
            <dd>{summary.noteCount}</dd>
          </div>
          <div>
            <Icon name="map-pin" />
            <dt>{t('conference.stops')}</dt>
            <dd>{summary.stopCount}</dd>
          </div>
          <div>
            <Icon name="money" />
            <dt>{t('conference.totalValue')}</dt>
            <dd>{formatAmount(summary.totalValue).replace(NON_BREAKING_SPACE, ' ')}</dd>
          </div>
          <div>
            <Icon name="package" />
            <dt>{t('conference.volumes')}</dt>
            <dd>{summary.totalVolumes}</dd>
          </div>
        </dl>
        {summary.cities.length === 0 ? null : (
          <p className={styles.conferenceRoute}>
            <strong>{t('conference.routeCities')}</strong> {summary.cities.join(ROUTE_SEPARATOR)}
          </p>
        )}
        {typeof creatorName === 'string' ? (
          <p className={styles.hint}>{t('conference.createdBy', { name: creatorName })}</p>
        ) : null}
        <div className={styles.conferenceActions}>
          <Button
            disabled={pdf.isGenerating}
            onClick={() => void pdf.handleDownload()}
            size="sm"
            type="button"
          >
            <Icon name="download" />
            {t('conference.downloadPdf')}
          </Button>
          <Button onClick={() => globalThis.print()} size="sm" type="button" variant="secondary">
            <Icon name="document" />
            {t('conference.print')}
          </Button>
        </div>
        {pdf.hasFailed ? (
          <p className={styles.alert} role="alert">
            {t('conference.pdfFailed')}
          </p>
        ) : null}
        {summary.notesWithoutValue === 0 ? null : (
          <p className={styles.hint} role="status">
            {t('conference.withoutValue', { count: summary.notesWithoutValue })}
          </p>
        )}

        {rows.length === 0 ? (
          <p className={styles.hint}>{t('conference.empty')}</p>
        ) : (
          <ol className={styles.conferenceStops}>
            {groupRowsByStop(rows).map((group, index) => (
              <li className={styles.conferenceStop} key={group.destinationLabel}>
                <header className={styles.conferenceStopHeader}>
                  <span className={styles.conferenceStopIndex}>{index + 1}</span>
                  <span className={styles.conferenceStopLabel}>
                    {group.city === '' ? t('conference.noStop') : group.city}
                  </span>
                  <span className={styles.conferenceStopNotes}>
                    {group.rows.map((row) => (
                      <span className={styles.conferenceChip} key={row.documentId}>
                        <Icon name="invoice" />
                        {row.noteNumber === '' ? t('conference.unknown') : row.noteNumber}
                      </span>
                    ))}
                  </span>
                  <span className={styles.conferenceStopTotals}>
                    {t('conference.stopTotals', {
                      notes: group.rows.length,
                      volumes: group.volumes,
                    })}
                  </span>
                </header>
                <ul className={styles.conferenceNotes}>
                  {group.rows.map((row) => (
                    <TripConferenceRowView key={row.documentId} row={row} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>,
    document.body,
  )

  return (
    <>
      {dialog}
      <TripConferencePrintSheet brand={brand} labels={labels} sheet={sheet} />
    </>
  )
}

/** Conferência de leitura: nada aqui altera a viagem, só confronta a montagem com o que foi bipado. */
export function TripConferenceDialog({ isOpen, ...content }: TripConferenceDialogProps) {
  if (!isOpen) return null

  return <TripConferenceContent {...content} />
}
