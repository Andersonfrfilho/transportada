/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import { useTripOccurrenceAttachmentsQuery } from '../queries/tripOccurrenceFeed.query'
import type { TripOccurrenceTableController } from '../hooks/useTripOccurrenceTable.hook'
import {
  formatOccurrenceInvoice,
  resolveOccurrenceTypeLabel,
  type TripOccurrenceColumnKey,
  type TripOccurrenceFeedItem,
} from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : momentFormatter.format(moment)
}

type TripOccurrenceTableProps = Readonly<{ table: TripOccurrenceTableController }>

function OccurrenceCell({
  column,
  item,
}: Readonly<{ column: TripOccurrenceColumnKey; item: TripOccurrenceFeedItem }>) {
  const { t } = useTranslation('trip')

  if (column === 'createdAt') return <td>{formatMoment(item.createdAt)}</td>
  if (column === 'stage') {
    const stageKey = item.stage ?? 'stop'
    return (
      <td>
        <span className={styles.statusBadge}>{t(`occurrenceFeed.stage.${stageKey}`)}</span>
      </td>
    )
  }
  if (column === 'typeName') {
    const label = resolveOccurrenceTypeLabel(item)
    return <td>{label.labelKey === null ? label.value : t(label.labelKey)}</td>
  }
  if (column === 'vehiclePlate') return <td>{item.vehiclePlate}</td>
  if (column === 'driverName') return <td>{item.driverName}</td>
  if (column === 'stopLabel') return <td>{item.stopLabel ?? ''}</td>
  if (column === 'invoice') {
    return <td>{formatOccurrenceInvoice(item.invoiceNumber, item.invoiceSeries)}</td>
  }
  /** A marca de aviso enviado: o tipo cadastrado que notifica o embarcador. */
  return (
    <td>
      {item.notifies ? (
        <span className={styles.statusBadge}>{t('occurrenceFeed.notified')}</span>
      ) : null}
    </td>
  )
}

/** As fotos abrem em tela cheia ao tocar — fechar volta ao detalhe, nunca a outra tela. */
function OccurrenceAttachments({ item }: Readonly<{ item: TripOccurrenceFeedItem }>) {
  const { t } = useTranslation('trip')
  const [fullscreenUrl, setFullscreenUrl] = useState<null | string>(null)
  const attachmentsQuery = useTripOccurrenceAttachmentsQuery({
    enabled: item.hasAttachment,
    occurrenceId: item.id,
  })

  if (!item.hasAttachment) return null
  if (attachmentsQuery.isLoading) return <Skeleton height="8rem" width="8rem" />
  const attachments = attachmentsQuery.data ?? []
  if (attachments.length === 0) return null

  return (
    <div className={styles.occurrencePhotoGrid}>
      {attachments.map((attachment) => (
        <button
          className={styles.occurrencePhotoButton}
          key={attachment.id}
          onClick={() => setFullscreenUrl(attachment.downloadUrl)}
          type="button"
        >
          <img
            alt={t('occurrenceFeed.detail.photoAlt')}
            className={styles.occurrencePhotoThumb}
            src={attachment.downloadUrl}
          />
        </button>
      ))}
      {fullscreenUrl === null ? null : (
        <button
          aria-label={t('occurrenceFeed.detail.closePhoto')}
          className={styles.occurrencePhotoOverlay}
          onClick={() => setFullscreenUrl(null)}
          type="button"
        >
          <img
            alt={t('occurrenceFeed.detail.photoAlt')}
            className={styles.occurrencePhotoFull}
            src={fullscreenUrl}
          />
        </button>
      )}
    </div>
  )
}

function OccurrenceDetailRow({
  columnCount,
  item,
}: Readonly<{ columnCount: number; item: TripOccurrenceFeedItem }>) {
  const { t } = useTranslation('trip')

  return (
    <tr className={styles.occurrenceDetailRow}>
      <td colSpan={columnCount}>
        <p className={styles.occurrenceDescription}>
          {item.description.length === 0
            ? t('occurrenceFeed.detail.noDescription')
            : item.description}
        </p>
        <OccurrenceAttachments item={item} />
      </td>
    </tr>
  )
}

export function TripOccurrenceTableSkeleton() {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th scope="col">{t('occurrenceFeed.columns.createdAt')}</th>
            <th scope="col">{t('occurrenceFeed.columns.typeName')}</th>
            <th scope="col">{t('occurrenceFeed.columns.vehiclePlate')}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, index) => (
            <tr key={index}>
              <td>
                <Skeleton variant="text" width="65%" />
              </td>
              <td>
                <Skeleton variant="text" width="75%" />
              </td>
              <td>
                <Skeleton variant="text" width="50%" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TripOccurrenceTable({ table }: TripOccurrenceTableProps) {
  const { t } = useTranslation('trip')

  if (table.isLoading) return <TripOccurrenceTableSkeleton />

  const columnCount = table.visibleColumns.length + 1

  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            {table.visibleColumns.map((column) =>
              column === 'createdAt' ? (
                <th
                  aria-sort={table.order === 'desc' ? 'descending' : 'ascending'}
                  key={column}
                  scope="col"
                >
                  <button className={styles.sortButton} onClick={table.toggleOrder} type="button">
                    {t('occurrenceFeed.columns.createdAt')}
                    <span aria-hidden="true" className={styles.sortIndicator}>
                      {table.order === 'desc' ? '▼' : '▲'}
                    </span>
                  </button>
                </th>
              ) : (
                <th key={column} scope="col">
                  {t(`occurrenceFeed.columns.${column}`)}
                </th>
              ),
            )}
            <th scope="col">
              <span className={styles.srOnly}>{t('occurrenceFeed.detail.title')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.items.length === 0 ? (
            <tr>
              <td colSpan={columnCount}>{t('occurrenceFeed.empty')}</td>
            </tr>
          ) : (
            table.items.flatMap((item) => {
              const rows = [
                <tr key={item.id}>
                  {table.visibleColumns.map((column) => (
                    <OccurrenceCell column={column} item={item} key={column} />
                  ))}
                  <td>
                    <Button
                      onClick={() => table.toggleExpanded(item.id)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Icon name={table.expandedId === item.id ? 'close' : 'eye'} />
                      {table.expandedId === item.id
                        ? t('occurrenceFeed.detail.close')
                        : t('occurrenceFeed.detail.open')}
                    </Button>
                  </td>
                </tr>,
              ]
              if (table.expandedId === item.id) {
                rows.push(
                  <OccurrenceDetailRow
                    columnCount={columnCount}
                    item={item}
                    key={`${item.id}-detail`}
                  />,
                )
              }
              return rows
            })
          )}
        </tbody>
      </table>

      {table.hasNextPage ? (
        <div className={styles.occurrenceLoadMore}>
          <Button
            disabled={table.isFetchingNextPage}
            onClick={table.fetchNextPage}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name={table.isFetchingNextPage ? 'spinner' : 'chevron-down'} />
            {table.isFetchingNextPage
              ? t('occurrenceFeed.loadingMore')
              : t('occurrenceFeed.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
