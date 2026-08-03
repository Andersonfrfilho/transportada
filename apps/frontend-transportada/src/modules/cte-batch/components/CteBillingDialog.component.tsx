/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ProgressBar } from '@/components/ui/progress'
import { DueDateField } from '@/modules/billing/components/DueDateField.component'
import {
  groupBillingBlocksByReason,
  type BillingGroupOutcome,
} from '@/modules/billing/shared/billingFromSelection.service'
import { formatAmount, sumScaledAmounts } from '@/modules/shared/decimalAmount.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CteBillingDialogController, CteBillingGroup } from '../hooks/useCteBillingDialog.hook'
import styles from '../styles/cteBatch.module.css'

type CteBillingDialogProps = Readonly<{
  dialog: CteBillingDialogController
}>

/** Um mesmo tomador pode render várias faturas quando passa do teto de CT-es por fatura. */
function groupKey(group: CteBillingGroup, index: number): string {
  return `${group.customerDocument}:${index}`
}

function outcomeKey(outcome: BillingGroupOutcome, index: number): string {
  return `${outcome.customerDocument}:${index}`
}

export function CteBillingDialog({ dialog }: CteBillingDialogProps) {
  const { t } = useTranslation('cteBatch')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: dialog.isOpen,
    onClose: dialog.close,
  })

  if (!dialog.isOpen) return null

  const blockGroups = groupBillingBlocksByReason(dialog.blocked)
  const totalAmount = sumScaledAmounts(dialog.groups.map((group) => group.totalAmount))
  const hasResult = dialog.outcomes.length > 0
  const isFinished = dialog.progress.isComplete && !dialog.isSubmitting

  function renderOutcome(outcome: BillingGroupOutcome, index: number) {
    const isIssued = outcome.invoiceNumber !== undefined
    return (
      <li
        className={isIssued ? styles.billingOutcomeIssued : styles.billingOutcomeFailed}
        key={outcomeKey(outcome, index)}
      >
        {isIssued
          ? t('billing.outcomeIssued', {
              customer: outcome.customerDocument,
              number: outcome.invoiceNumber,
            })
          : t('billing.outcomeFailed', {
              code: outcome.errorCode,
              customer: outcome.customerDocument,
            })}
      </li>
    )
  }

  // Fora de `document.body` o overlay herdaria o `transform` da transição de página como bloco
  // de contenção, e o `position: fixed` deixaria de se referir à viewport.
  return createPortal(
    <div className={styles.billingOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="cte-billing-title"
        aria-modal="true"
        className={styles.billingDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.billingHeader}>
          <div>
            <h2 id="cte-billing-title">{t('billing.title')}</h2>
            <p className={styles.billingSubtitle}>{t('billing.subtitle')}</p>
          </div>
          <button
            aria-label={t('billing.close')}
            className={styles.iconAction}
            onClick={dialog.close}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {dialog.isLoading ? <p className={styles.hint}>{t('billing.loading')}</p> : null}
        {dialog.loadErrorCode === null ? null : (
          <p className={styles.hint} role="alert">
            {t('billing.previewError', { code: dialog.loadErrorCode })}
          </p>
        )}

        {dialog.groups.length === 0 && !dialog.isLoading ? (
          <p className={styles.hint}>{t('billing.empty')}</p>
        ) : null}

        {dialog.truncated ? (
          <p className={styles.hint} role="alert">
            {t('billing.truncated')}
          </p>
        ) : null}

        {dialog.groups.length === 0 ? null : (
          <section className={styles.billingSection}>
            <h3>{t('billing.groups')}</h3>
            <div className={styles.tableScroll}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th scope="col">{t('billing.columns.customer')}</th>
                    <th scope="col">{t('billing.columns.document')}</th>
                    <th scope="col">{t('billing.columns.cteCount')}</th>
                    <th scope="col">{t('billing.columns.totalAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dialog.groups.map((group, index) => (
                    <tr key={groupKey(group, index)}>
                      <td>
                        {group.customerName}
                        {'partCount' in group && group.partCount > 1 ? (
                          <span className={styles.billingPart}>
                            {t('billing.part', { part: group.part, partCount: group.partCount })}
                          </span>
                        ) : null}
                      </td>
                      <td>{group.customerDocument}</td>
                      <td>{group.cteCount}</td>
                      <td>{formatAmount(group.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.summaryLine}>
              {t('billing.total')}: <strong>{formatAmount(totalAmount)}</strong>
            </p>
          </section>
        )}

        {blockGroups.length === 0 ? null : (
          <section className={styles.billingSection}>
            <h3>{t('billing.blocked')}</h3>
            <ul className={styles.billingList}>
              {blockGroups.map((group) => (
                <li key={group.reason}>
                  {t(`billing.blockReason.${group.reason}`, { defaultValue: group.reason })} —{' '}
                  {t('billing.blockedCount', { count: group.cteIds.length })}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className={styles.billingField}>
          <DueDateField
            invalid={dialog.dueDateError !== null}
            onChange={dialog.setDueDate}
            value={dialog.dueDate}
          />
        </div>
        {dialog.dueDateError === null ? null : (
          <p className={styles.hint} role="alert">
            {t(`billing.dueDateError.${dialog.dueDateError}`)}
          </p>
        )}

        {dialog.isSubmitting || hasResult ? (
          <section className={styles.billingSection}>
            <h3>{t('billing.progress.title')}</h3>
            <ProgressBar
              completed={dialog.outcomes.length}
              label={t('billing.progress.label')}
              total={dialog.groups.length}
              valueText={t('billing.progress.value', {
                completed: dialog.outcomes.length,
                percent: dialog.progress.percent,
                total: dialog.groups.length,
              })}
            />
            <p className={styles.summaryLine}>
              {t('billing.progress.summary', {
                errorCount: dialog.progress.errorCount,
                successCount: dialog.progress.successCount,
              })}
            </p>
          </section>
        ) : null}

        {hasResult ? (
          <section className={styles.billingSection}>
            <h3>{t('billing.results')}</h3>
            <ul aria-live="polite" className={styles.billingList}>
              {dialog.outcomes.map(renderOutcome)}
            </ul>
          </section>
        ) : null}

        <footer className={styles.billingFooter}>
          <Button onClick={dialog.close} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {isFinished ? t('billing.done') : t('billing.cancel')}
          </Button>
          {isFinished ? null : (
            <Button
              disabled={dialog.isSubmitting || dialog.groups.length === 0}
              onClick={dialog.confirm}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {dialog.isSubmitting ? t('billing.submitting') : t('billing.confirm')}
            </Button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
