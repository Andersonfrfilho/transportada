/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatMomentWithLocale } from '@/modules/shared/momentFormat.service'

import { useFieldReportHolds } from '../hooks/useFieldReportHolds.hook'
import styles from '../styles/pendingItems.module.css'

/** Spec 320: ocorrências do app de outro dia, retidas até o escritório liberar ou descartar. */
export function FieldReportHoldList(
  input: Readonly<{ companyId?: string; permissions: readonly string[] }>,
) {
  const { i18n, t } = useTranslation('pendingItems')
  const { canDecide, decisionMutation, holds, listQuery } = useFieldReportHolds(input)

  if (!canDecide || (!listQuery.isError && holds.length === 0)) return null

  return (
    <section aria-labelledby="field-report-holds-title" className={styles.holds}>
      <h2 id="field-report-holds-title">{t('holds.title')}</h2>
      <p className={styles.intro}>{t('holds.intro')}</p>
      {listQuery.isError ? (
        <p className={styles.boundary} role="alert">
          {t('holds.error')}
        </p>
      ) : (
        <ul className={styles.list}>
          {holds.map((hold) => (
            <li className={styles.suggestion} key={hold.id}>
              <div className={styles.suggestionHeader}>
                <strong>
                  {hold.occurrenceTypeName ?? t('holds.unknownType')}
                  {hold.invoiceNumber === null
                    ? ''
                    : ` · ${t('holds.invoice', { number: hold.invoiceNumber })}`}
                </strong>
                <span>
                  {t('holds.tapped', {
                    moment: formatMomentWithLocale({
                      locale: i18n.language,
                      value: hold.occurredAt,
                    }),
                  })}
                </span>
                <span>
                  {t('holds.received', {
                    moment: formatMomentWithLocale({
                      locale: i18n.language,
                      value: hold.receivedAt,
                    }),
                  })}
                </span>
                {hold.probableDuplicate ? (
                  <span className={styles.duplicateNote}>{t('holds.probableDuplicate')}</span>
                ) : null}
              </div>
              <div className={styles.suggestionActions}>
                <Button
                  disabled={decisionMutation.isPending}
                  onClick={() => decisionMutation.mutate({ decision: 'release', id: hold.id })}
                  type="button"
                >
                  {t('holds.release')}
                </Button>
                <Button
                  disabled={decisionMutation.isPending}
                  onClick={() => decisionMutation.mutate({ decision: 'discard', id: hold.id })}
                  type="button"
                  variant="ghost"
                >
                  {t('holds.discard')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {decisionMutation.isError ? (
        <p className={styles.boundary} role="alert">
          {t('holds.decisionError')}
        </p>
      ) : null}
    </section>
  )
}
