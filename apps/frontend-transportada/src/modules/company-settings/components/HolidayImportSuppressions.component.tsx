/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useHolidayImportSuppressions } from '../hooks/useHolidayImportSuppressions.hook'
import { describeBusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'
import { formatCivilDate, formatInstantDate } from '../shared/holidayImportFormat.service'
import businessCalendarStyles from '../styles/businessCalendar.module.css'
import styles from '../styles/holidayImport.module.css'

import { HolidayRefusal } from './HolidayRefusal.component'

const SKELETON_ROWS = 2
const COLUMNS = ['place', 'scope', 'when', 'disabledOn'] as const

type HolidayImportSuppressionsProps = Readonly<{
  companyId: string | undefined
  enabled: boolean
}>

/**
 * "Feriados desligados": o que o operador tirou da importação. Restaurar apaga a supressão, mas a data só volta na
 * próxima execução diária da rotina — o texto fixo e o aviso depois do clique dizem isso.
 */
export function HolidayImportSuppressions({ companyId, enabled }: HolidayImportSuppressionsProps) {
  const { i18n, t } = useTranslation('businessCalendar')
  const list = useHolidayImportSuppressions({ companyId, enabled })

  return (
    <section aria-labelledby="holiday-suppressions-title" className={businessCalendarStyles.block}>
      <h3 id="holiday-suppressions-title">{t('import.suppressions.title')}</h3>
      <p className={businessCalendarStyles.hint}>{t('import.suppressions.hint')}</p>
      {list.isLoading ? (
        <SkeletonGroup label={t('import.suppressions.loading')}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton height="var(--control-height-compact)" key={index} width="100%" />
          ))}
        </SkeletonGroup>
      ) : null}
      {list.isError ? (
        <div className={businessCalendarStyles.actions}>
          <HolidayRefusal refusal={describeBusinessCalendarRefusal(list.error)} />
          <Button onClick={list.refetch} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('list.retry')}
          </Button>
        </div>
      ) : null}
      {!list.isLoading && !list.isError && list.total === 0 ? (
        <p className={businessCalendarStyles.hint}>{t('import.suppressions.empty')}</p>
      ) : null}
      {list.items.length === 0 ? null : (
        <div
          aria-label={t('import.suppressions.region')}
          className={businessCalendarStyles.tableScroll}
          role="region"
          tabIndex={0}
        >
          <table className={`${businessCalendarStyles.table} ${businessCalendarStyles.stacked}`}>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} scope="col">
                    {t(`import.suppressions.${column}`)}
                  </th>
                ))}
                <th scope="col">{t('import.suppressions.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((suppression) => {
                const place = list.labelOf(suppression)
                const date = formatCivilDate({
                  language: i18n.language,
                  value: suppression.holidayOn,
                })
                return (
                  <tr key={suppression.id}>
                    <td data-label={t('import.suppressions.place')}>{place}</td>
                    <td data-label={t('import.suppressions.scope')}>
                      {t(`import.suppressions.scopes.${suppression.scope}`)}
                    </td>
                    <td data-label={t('import.suppressions.when')}>{date}</td>
                    <td data-label={t('import.suppressions.disabledOn')}>
                      {formatInstantDate({
                        language: i18n.language,
                        value: suppression.suppressedAt,
                      })}
                    </td>
                    <td data-label={t('import.suppressions.actions')}>
                      <Button
                        aria-label={t('import.suppressions.restoreAria', { date, place })}
                        disabled={list.isRestoring}
                        onClick={() => void list.handleRestore(suppression)}
                        type="button"
                        variant="ghost"
                      >
                        <Icon name="refresh" />
                        {list.isRestoring
                          ? t('import.suppressions.restoring')
                          : t('import.suppressions.restore')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.pageCount <= 1 ? null : (
        <nav
          aria-label={t('import.suppressions.pageOf', { count: list.pageCount, page: list.page })}
          className={businessCalendarStyles.pagination}
        >
          <Button
            disabled={list.page <= 1}
            onClick={() => list.goToPage(list.page - 1)}
            type="button"
            variant="ghost"
          >
            <Icon name="page-previous" />
            {t('import.suppressions.previousPage')}
          </Button>
          <p>{t('import.suppressions.pageOf', { count: list.pageCount, page: list.page })}</p>
          <Button
            disabled={list.page >= list.pageCount}
            onClick={() => list.goToPage(list.page + 1)}
            type="button"
            variant="ghost"
          >
            {t('import.suppressions.nextPage')}
            <Icon name="page-next" />
          </Button>
        </nav>
      )}
      {list.isRestored ? (
        <p className={styles.restored} role="status">
          {t('import.suppressions.restoredNotice')}
        </p>
      ) : null}
      {list.refusal === undefined ? null : <HolidayRefusal refusal={list.refusal} />}
    </section>
  )
}
