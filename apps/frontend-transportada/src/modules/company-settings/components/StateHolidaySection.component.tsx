/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useStateHolidaySection } from '../hooks/useStateHolidaySection.hook'
import { focusBusinessCalendarField } from '../shared/focusBusinessCalendarField.service'
import { describeHolidayDate, type HolidayRow } from '../shared/businessCalendarRows.service'
import type { HolidaySortColumn } from '../shared/businessCalendarTable.service'
import styles from '../styles/businessCalendar.module.css'

import { HolidayDeleteDialog } from './HolidayDeleteDialog.component'
import { HolidayListArea } from './HolidayListArea.component'
import { StateHolidayForm } from './StateHolidayForm.component'

const COLUMNS: readonly HolidaySortColumn[] = ['place', 'date', 'name']

type StateHolidaySectionProps = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * "Feriados estaduais" (RF4): valem para toda cidade da UF no prazo de entrega, mas não fecham clientes no
 * roteiro — por isso não há "gerado até": o estadual não é materializado, a política o expande.
 */
export function StateHolidaySection({ companyId, enabled }: StateHolidaySectionProps) {
  const { t } = useTranslation('businessCalendar')
  const section = useStateHolidaySection({ companyId, enabled })
  const sectionRef = useRef<HTMLElement>(null)

  function describeWhen(row: HolidayRow): string {
    const date = describeHolidayDate(row)
    return row.recurrence === 'yearly' ? t('state.table.yearlySchedule', { date }) : date
  }

  return (
    <section aria-labelledby="state-holidays-title" className={styles.block} ref={sectionRef}>
      <h3 id="state-holidays-title">{t('state.title')}</h3>
      <p className={styles.hint}>{t('state.hint')}</p>
      <StateHolidayForm
        controller={section.form}
        feedback={section.feedback}
        onShortcut={(field) => focusBusinessCalendarField({ field, panel: sectionRef.current })}
      />
      <HolidayListArea
        columns={COLUMNS}
        describeWhen={describeWhen}
        error={section.query.error}
        hasKindFilter={false}
        isError={section.query.isError}
        isLoading={section.query.isPending}
        namespace="state"
        onDelete={section.remover.request}
        onEdit={section.form.handleEdit}
        onRetry={() => void section.query.refetch()}
        rows={section.rows}
        table={section.table}
        view={section.view}
      />
      <HolidayDeleteDialog controller={section.remover} />
    </section>
  )
}
