/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useExtraCharges } from '../hooks/useExtraCharges.hook'
import {
  buildQueueDraft,
  changeChargeAmount,
  findMissingAmount,
  selectedConfirmations,
  toggleCharge,
  type ChargeQueueDraft,
} from '../shared/chargeSelection.service'
import styles from '../styles/extraCharges.module.css'

/**
 * Spec 060 D4b/D5: **conferir e mandar a conta**, na mesma tela. A fila é o trabalho de todo dia —
 * "12 taxas sugeridas hoje" —, e o fechamento é o de todo mês.
 */
/** O calendário do design system pede os rótulos por prop: eles ficam num lugar só. */
function datePickerLabels(translate: (key: string) => string) {
  return {
    chooseYearLabel: translate('batch.calendar.chooseYear'),
    clearLabel: translate('batch.calendar.clear'),
    nextMonthLabel: translate('batch.calendar.nextMonth'),
    openCalendarLabel: translate('batch.calendar.open'),
    placeholder: translate('batch.calendar.placeholder'),
    previousMonthLabel: translate('batch.calendar.previousMonth'),
  }
}

export function ExtraChargeWorkspacePage() {
  const { t } = useTranslation('extraCharges')
  const authQuery = useAuthMeQuery()
  const controller = useExtraCharges({ permissions: authQuery.data?.data.permissions ?? [] })
  const [draft, setDraft] = useState<ChargeQueueDraft>({})
  const [contractorId, setContractorId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  /** O rascunho nasce da resposta uma vez: recarregar no meio apagaria o valor que o operador digitou. */
  const queue = controller.suggestions
  const currentDraft = Object.keys(draft).length === 0 ? buildQueueDraft(queue) : draft
  const missingAmount = findMissingAmount(queue, currentDraft)
  const selected = selectedConfirmations(queue, currentDraft)

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.hint}>{t('subtitle')}</p>
      </header>

      {controller.lastError === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${controller.lastError}`, { defaultValue: t('errors.REQUEST_FAILED') })}
        </p>
      )}

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <h2>{t('queue.title', { count: queue.length })}</h2>
          <p className={styles.hint}>{t('queue.hint')}</p>
        </header>

        {controller.isLoading ? (
          <SkeletonGroup label={t('queue.loading')}>
            <Skeleton height="2.5rem" />
            <Skeleton height="2.5rem" />
          </SkeletonGroup>
        ) : queue.length === 0 ? (
          <p className={styles.hint}>{t('queue.empty')}</p>
        ) : (
          <ul className={styles.queue}>
            {queue.map((charge) => (
              <li className={styles.queueRow} key={charge.id}>
                <Checkbox
                  ariaLabel={t('queue.select')}
                  checked={currentDraft[charge.id]?.isSelected ?? false}
                  disabled={!controller.canConfirm}
                  onChange={() => setDraft(toggleCharge(currentDraft, charge.id))}
                />
                <span className={styles.queueMeta}>
                  {t(`chargeType.${charge.chargeType}`)} · {charge.chargedOn}
                </span>
                <label className={styles.amountField}>
                  {t('queue.amount')}
                  <input
                    disabled={!controller.canConfirm}
                    inputMode="decimal"
                    onChange={(event) =>
                      setDraft(
                        changeChargeAmount(currentDraft, {
                          amount: event.target.value,
                          id: charge.id,
                        }),
                      )
                    }
                    value={currentDraft[charge.id]?.amount ?? charge.amount}
                  />
                </label>
                <Button
                  disabled={!controller.canConfirm}
                  onClick={() =>
                    void controller.dismissCharge({ id: charge.id, reason: t('queue.dismissReason') })
                  }
                  type="button"
                  variant="ghost"
                >
                  <Icon name="close" />
                  {t('queue.dismiss')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {missingAmount === undefined ? null : (
          <p className={styles.error} role="alert">
            {t('queue.missingAmount')}
          </p>
        )}

        <Button
          disabled={!controller.canConfirm || selected.length === 0 || missingAmount !== undefined}
          onClick={() => {
            void controller.confirmCharges(selected)
            setDraft({})
          }}
          type="button"
        >
          <Icon name="check" />
          {t('queue.confirm', { count: selected.length })}
        </Button>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <h2>{t('batch.title')}</h2>
          <p className={styles.hint}>{t('batch.hint')}</p>
        </header>

        <div className={styles.batchForm}>
          <label className={styles.field}>
            {t('batch.contractor')}
            <Select
              ariaLabel={t('batch.contractor')}
              onChange={setContractorId}
              options={controller.contractors.map((contractor) => ({
                label: contractor.displayName === '' ? contractor.taxId : contractor.displayName,
                value: contractor.id,
              }))}
              placeholder={t('batch.contractorPlaceholder')}
              value={contractorId}
            />
          </label>
          <label className={styles.field}>
            {t('batch.periodStart')}
            <DatePicker
              {...datePickerLabels(t)}
              ariaLabel={t('batch.periodStart')}
              onChange={setPeriodStart}
              value={periodStart}
            />
          </label>
          <label className={styles.field}>
            {t('batch.periodEnd')}
            <DatePicker
              {...datePickerLabels(t)}
              ariaLabel={t('batch.periodEnd')}
              onChange={setPeriodEnd}
              value={periodEnd}
            />
          </label>
        </div>

        <Button
          disabled={
            !controller.canCloseBatch ||
            contractorId === '' ||
            periodStart === '' ||
            periodEnd === ''
          }
          onClick={() =>
            void controller.closeBatch({ contractorId, periodEnd, periodStart })
          }
          type="button"
        >
          <Icon name="send" />
          {t('batch.close')}
        </Button>

        {controller.report === undefined ? null : (
          <div className={styles.report}>
            <p>
              {t('batch.reportTitle', {
                contractor: controller.report.contractorName,
                periodEnd: controller.report.batch.periodEnd,
                periodStart: controller.report.batch.periodStart,
              })}
            </p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('batch.date')}</th>
                  <th scope="col">{t('batch.client')}</th>
                  <th scope="col">{t('batch.type')}</th>
                  <th scope="col">{t('batch.amount')}</th>
                  <th scope="col">{t('batch.status')}</th>
                </tr>
              </thead>
              <tbody>
                {controller.report.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.chargedOn}</td>
                    <td>{item.clientName}</td>
                    <td>{t(`chargeType.${item.chargeType}`)}</td>
                    <td>{item.amount}</td>
                    <td>{t(`chargeStatus.${item.status}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* O total conferido pela API a partir das linhas — o relatório confere a si mesmo. */}
            <p className={styles.total}>
              {t('batch.total', { total: controller.report.itemsTotal })}
            </p>
            <p className={styles.hint}>{t('batch.linkHint')}</p>
          </div>
        )}
      </section>
    </main>
  )
}
