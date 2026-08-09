/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ProgressBar } from '@/components/ui/progress'

import { useCteBatchExport } from '../hooks/useCteBatchExport.hook'
import type { CteBatchSubmissionController } from '../hooks/useCteBatchSubmission.hook'
import type { CteBatchTableController } from '../hooks/useCteBatchTable.hook'
import { collectBillableBatches } from '../shared/cteBatchBilling.service'
import type { CteBatchSummary } from '../shared/cteBatchClient.service'
import { canCancelBatch, canTransmitBatch } from '../shared/cteBatchItemActions.service'
import { resolveCteBatchTransmissionSummary } from '../shared/cteBatchProgress.service'
import {
  CTE_BATCH_SUBMIT_UNKNOWN_ERROR_CODE,
  type CteBatchSubmissionOutcome,
  resolveCteBatchSubmissionReasonKey,
} from '../shared/cteBatchSubmissionQueue.service'
import styles from '../styles/cteBatch.module.css'
import { CteExportFormatPicker } from './CteExportFormatPicker.component'

type CteBatchSelectionBarProps = Readonly<{
  onBill: (batches: readonly CteBatchSummary[]) => void
  onCancel: (batch: CteBatchSummary) => void
  permissions: readonly string[]
  submission: CteBatchSubmissionController
  table: CteBatchTableController
}>

export function CteBatchSelectionBar({
  onBill,
  onCancel,
  permissions,
  submission,
  table,
}: CteBatchSelectionBarProps) {
  const { t } = useTranslation('cteBatch')
  // Antes do retorno vazio: hook não pode ficar atrás de condicional.
  const exportControl = useCteBatchExport({
    permissions,
    selectedBatchIds: table.selectedBatches.map((batch) => batch.id),
  })

  if (table.selectedBatches.length === 0) return null

  const transmittable = table.selectedBatches.filter((batch) =>
    canTransmitBatch({ batch, permissions }),
  )
  const cancellable = table.selectedBatches.filter((batch) =>
    canCancelBatch({ batch, permissions }),
  )
  const billable = collectBillableBatches({ batches: table.selectedBatches, permissions })
  const failed = submission.outcomes.filter((outcome) => outcome.errorCode !== undefined)
  const hasProgress = submission.isSubmitting || submission.outcomes.length > 0
  const transmission = resolveCteBatchTransmissionSummary({
    batchIds: submission.submittedBatchIds,
    batches: table.batches,
  })

  function renderFailure(outcome: CteBatchSubmissionOutcome) {
    const code = outcome.errorCode ?? CTE_BATCH_SUBMIT_UNKNOWN_ERROR_CODE

    return (
      <li className={styles.billingOutcomeFailed} key={outcome.batchId}>
        {t('transmission.progress.failed', {
          name: outcome.batchName,
          reason: t(resolveCteBatchSubmissionReasonKey(code), { code }),
        })}
      </li>
    )
  }

  return (
    <div className={styles.bulkBar}>
      <p className={styles.counter}>
        {t('selection.summary', { count: table.selectedBatches.length })}
      </p>
      <div className={styles.bulkActions}>
        <Button
          aria-label={t('transmission.bulkTransmit')}
          disabled={transmittable.length === 0 || submission.isSubmitting}
          onClick={() => submission.submit(transmittable)}
          size="sm"
          type="button"
        >
          <Icon name="upload" />
          {submission.isSubmitting ? t('transmission.transmitting') : t('actions.transmit')}
        </Button>
        <Button
          disabled={billable.length === 0}
          onClick={() => onBill(billable)}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="invoice" />
          {t('actions.bill')}
        </Button>
        <Button
          disabled={cancellable.length === 0}
          onClick={() => cancellable.forEach(onCancel)}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="alert" />
          {t('actions.cancel')}
        </Button>
        <CteExportFormatPicker
          disabled={exportControl.isExporting}
          onChange={exportControl.setExportFormat}
          value={exportControl.exportFormat}
        />
        <Button
          disabled={!exportControl.canExportSelection || exportControl.isExporting}
          onClick={() => exportControl.exportSelection()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="export" />
          {exportControl.isExporting
            ? t('cteItems.export.pending')
            : t('actions.exportSelection', { count: table.selectedBatches.length })}
        </Button>
        <Button onClick={table.clearSelection} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('selection.clear')}
        </Button>
      </div>
      {exportControl.exportErrorKey === null ? null : (
        <p className={styles.hint} role="alert">
          {t(exportControl.exportErrorKey)}
        </p>
      )}
      {hasProgress ? (
        <div className={styles.bulkProgress}>
          <ProgressBar
            completed={submission.outcomes.length}
            label={t('transmission.progress.label')}
            total={submission.total}
            valueText={t('transmission.progress.value', {
              completed: submission.outcomes.length,
              percent: submission.progress.percent,
              total: submission.total,
            })}
          />
          <p className={styles.summaryLine} role="status">
            {t('transmission.progress.summary', {
              errorCount: submission.progress.errorCount,
              successCount: submission.progress.successCount,
            })}
          </p>
          {transmission.total === 0 ? null : (
            <>
              <ProgressBar
                completed={transmission.settled}
                label={t('transmission.awaiting.label')}
                total={transmission.total}
                valueText={t('transmission.awaiting.value', {
                  percent: transmission.percent,
                  settled: transmission.settled,
                  total: transmission.total,
                })}
              />
              <p className={styles.summaryLine} role="status">
                {transmission.isComplete
                  ? t('transmission.awaiting.complete')
                  : t('transmission.awaiting.pending', { count: transmission.transmitting })}
              </p>
            </>
          )}
          {failed.length === 0 ? null : (
            <ul aria-live="polite" className={styles.billingList}>
              {failed.map(renderFailure)}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
