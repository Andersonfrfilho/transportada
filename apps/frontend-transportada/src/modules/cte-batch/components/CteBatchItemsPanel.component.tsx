/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { CteIssuanceStatusPanel } from '@/modules/cte-issuance/components/CteIssuanceStatusPanel.component'

import type { CteBatchItemsController } from '../hooks/useCteBatchItems.hook'
import { canBillBatch } from '../shared/cteBatchBilling.service'
import type { CteBatchSummary } from '../shared/cteBatchClient.service'
import {
  canCancelItem,
  canDownloadItem,
  canRemoveItem,
  canReprocessItem,
  canTransmitBatch,
  describeItemDocuments,
} from '../shared/cteBatchItemActions.service'
import { CTE_BATCH_ITEM_STATUS, type CteBatchItem } from '../shared/cteBatchItem.types'
import styles from '../styles/cteBatch.module.css'

const JUSTIFICATION_MAX_LENGTH = 255
const ITEM_SKELETON_ROW_COUNT = 4
const ITEM_SKELETON_COLUMN_WIDTHS: readonly string[] = [
  '2rem',
  '5rem',
  '9rem',
  '3rem',
  '4rem',
  '5rem',
  '5rem',
  '12rem',
  '6rem',
  '4rem',
  '8rem',
]

const ALERT_ITEM_STATUSES: readonly string[] = [
  CTE_BATCH_ITEM_STATUS.CANCELLED,
  CTE_BATCH_ITEM_STATUS.FAILED,
  CTE_BATCH_ITEM_STATUS.REJECTED,
]

type CteBatchItemsPanelProps = Readonly<{
  batch: CteBatchSummary
  controller: CteBatchItemsController
  onBill: () => void
  permissions: readonly string[]
}>

function itemStatusClassName(status: string): string {
  if (status === CTE_BATCH_ITEM_STATUS.AUTHORIZED) {
    return `${styles.statusBadge} ${styles.statusReady}`
  }
  if (ALERT_ITEM_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusAlert}`
  return `${styles.statusBadge}`
}

function itemStatusLabel(status: string, translate: (key: string) => string): string {
  const label = translate(`itemStatus.${status}`)
  return label === `itemStatus.${status}` ? status : label
}

export function CteBatchItemsPanel({
  batch,
  controller,
  onBill,
  permissions,
}: CteBatchItemsPanelProps) {
  const { t } = useTranslation('cteBatch')
  const { cancellationItem, justificationError, summary, trackedItem } = controller

  function renderItemColumnHeaders() {
    return (
      <tr>
        <th scope="col">{t('items.position')}</th>
        <th scope="col">{t('items.status')}</th>
        <th scope="col">{t('items.documents')}</th>
        <th scope="col">{t('items.fiscalSeries')}</th>
        <th scope="col">{t('items.fiscalNumber')}</th>
        <th scope="col">{t('items.baseAmount')}</th>
        <th scope="col">{t('items.fiscalAmount')}</th>
        <th scope="col">{t('items.accessKey')}</th>
        <th scope="col">{t('items.protocol')}</th>
        <th scope="col">{t('items.lastError')}</th>
        <th scope="col">{t('items.actions')}</th>
      </tr>
    )
  }

  function renderItemSkeletonRow(rowIndex: number) {
    return (
      <tr key={rowIndex}>
        {ITEM_SKELETON_COLUMN_WIDTHS.map((width, columnIndex) => (
          <td key={columnIndex}>
            <Skeleton variant="text" width={width} />
          </td>
        ))}
      </tr>
    )
  }

  function renderItemRow(item: CteBatchItem) {
    return (
      <tr key={item.id}>
        <td>{item.position}</td>
        <td>
          <span className={itemStatusClassName(item.status)}>
            {itemStatusLabel(item.status, t)}
          </span>
        </td>
        <td>
          <div className={styles.documentList}>
            {describeItemDocuments(item).map((document) => (
              <span className={styles.documentTag} key={document.id} title={document.accessKey}>
                {document.label}
              </span>
            ))}
          </div>
        </td>
        <td>{item.fiscalSeries ?? '—'}</td>
        <td>{item.fiscalNumber ?? '—'}</td>
        <td>{item.baseAmount}</td>
        <td>{item.fiscalAmount}</td>
        <td>{item.accessKey ?? '—'}</td>
        <td>{item.authorizationProtocol ?? '—'}</td>
        <td>{item.lastErrorCode ?? '—'}</td>
        <td>
          <div className={styles.rowActions}>
            <Button
              onClick={() => controller.selectItem(item)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="search" />
              {trackedItem?.id === item.id ? t('actions.closeTrack') : t('actions.track')}
            </Button>
            {canReprocessItem({ item, permissions }) ? (
              <Button
                disabled={controller.reprocessMutation.isPending}
                onClick={() => controller.reprocessItem(item)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Icon name="refresh" />
                {t('actions.reprocess')}
              </Button>
            ) : null}
            {canRemoveItem({ batch, permissions }) ? (
              <Button
                disabled={controller.removeItemMutation.isPending}
                onClick={() => controller.removeItem(item)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="trash" />
                {t('actions.remove')}
              </Button>
            ) : null}
            {canCancelItem({ item, permissions }) ? (
              <Button
                disabled={controller.cancelMutation.isPending}
                onClick={() => controller.openCancellation(item)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Icon name="alert" />
                {t('actions.cancelItem')}
              </Button>
            ) : null}
            {canDownloadItem({ item, permissions }) ? (
              <Button
                onClick={() => void controller.downloadItemXml(item)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="download" />
                {t('actions.download')}
              </Button>
            ) : null}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="cte-batch-items-title">
      <div className={styles.panelHead}>
        <h2 id="cte-batch-items-title">{t('items.title', { name: batch.name })}</h2>
        <div className={styles.rowActions}>
          {canBillBatch({ batch, permissions }) ? (
            <Button onClick={onBill} size="sm" type="button" variant="ghost">
              <Icon name="invoice" />
              {t('actions.billBatch')}
            </Button>
          ) : null}
          {canTransmitBatch({ batch, permissions }) ? (
            <Button
              disabled={controller.issueMutation.isPending}
              onClick={controller.transmitBatch}
              size="sm"
              type="button"
            >
              <Icon name="upload" />
              {t('actions.transmit')}
            </Button>
          ) : null}
        </div>
      </div>

      <p className={styles.summaryLine}>
        {t('items.summary', {
          authorized: summary.authorizedCount,
          documents: summary.documentCount,
          pending: summary.pendingCount,
          rejected: summary.rejectedCount,
          total: summary.totalAmount,
        })}
      </p>

      {controller.itemsQuery.isLoading ? (
        <SkeletonGroup className={styles.tableScroll} label={t('items.loading')}>
          <table className={styles.dataTable}>
            <thead>{renderItemColumnHeaders()}</thead>
            <tbody>
              {Array.from({ length: ITEM_SKELETON_ROW_COUNT }, (_, rowIndex) =>
                renderItemSkeletonRow(rowIndex),
              )}
            </tbody>
          </table>
        </SkeletonGroup>
      ) : null}
      {controller.itemsQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('items.error')}
        </p>
      ) : null}

      {controller.itemsQuery.isLoading ? null : controller.items.length === 0 ? (
        <p className={styles.hint}>{t('items.empty')}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>{renderItemColumnHeaders()}</thead>
            <tbody>{controller.items.map(renderItemRow)}</tbody>
          </table>
        </div>
      )}

      {controller.removeItemMutation.isError ? (
        <p className={styles.hint} role="alert">
          {t('removal.error')}
        </p>
      ) : null}

      {cancellationItem === undefined ? null : (
        <form
          aria-labelledby="cte-batch-cancellation-title"
          className={styles.cancellationForm}
          onSubmit={(event) => {
            event.preventDefault()
            controller.confirmCancellation()
          }}
        >
          <h3 id="cte-batch-cancellation-title">
            {t('cancellation.title', {
              fiscal:
                cancellationItem.fiscalSeries === null || cancellationItem.fiscalNumber === null
                  ? cancellationItem.position
                  : `${cancellationItem.fiscalSeries}/${cancellationItem.fiscalNumber}`,
            })}
          </h3>
          <p className={styles.hint}>{t('cancellation.warning')}</p>
          <label htmlFor="cte-batch-cancellation-justification">
            {t('cancellation.justification')}
            <textarea
              aria-describedby={
                justificationError === undefined ? undefined : 'cte-batch-cancellation-error'
              }
              aria-invalid={justificationError !== undefined}
              id="cte-batch-cancellation-justification"
              maxLength={JUSTIFICATION_MAX_LENGTH}
              onChange={(event) => controller.changeJustification(event.target.value)}
              placeholder={t('cancellation.placeholder')}
              required
              value={controller.justification}
            />
          </label>
          {justificationError === undefined ? null : (
            <p className={styles.hint} id="cte-batch-cancellation-error" role="alert">
              {t(`cancellation.${justificationError}`)}
            </p>
          )}
          {controller.cancelMutation.isError ? (
            <p className={styles.hint} role="alert">
              {t('cancellation.error')}
            </p>
          ) : null}
          <div className={styles.cancellationActions}>
            <Button disabled={controller.cancelMutation.isPending} size="sm" type="submit">
              <Icon name="check" />
              {controller.cancelMutation.isPending
                ? t('cancellation.pending')
                : t('actions.confirmCancelItem')}
            </Button>
            <Button onClick={controller.closeCancellation} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('actions.closeCancelItem')}
            </Button>
          </div>
        </form>
      )}

      {trackedItem === undefined ? null : (
        <CteIssuanceStatusPanel
          onClose={controller.closeTracking}
          onDownload={() => controller.downloadItemXml(trackedItem)}
          onReprocess={() => controller.reprocessItem(trackedItem)}
          tracking={controller.issuanceTracking}
        />
      )}
    </section>
  )
}
