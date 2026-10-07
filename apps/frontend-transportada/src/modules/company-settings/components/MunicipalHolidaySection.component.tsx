/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useMunicipalHolidaySection } from '../hooks/useMunicipalHolidaySection.hook'
import { focusBusinessCalendarField } from '../shared/focusBusinessCalendarField.service'
import { describeHolidayDate, type HolidayRow } from '../shared/businessCalendarRows.service'
import type { HolidaySortColumn } from '../shared/businessCalendarTable.service'
import styles from '../styles/businessCalendar.module.css'

import { HolidayDeleteDialog } from './HolidayDeleteDialog.component'
import { HolidayListArea } from './HolidayListArea.component'
import { MunicipalHolidayForm } from './MunicipalHolidayForm.component'
import { MunicipalHorizonNotice } from './MunicipalHorizonNotice.component'

const COLUMNS: readonly HolidaySortColumn[] = ['place', 'kind', 'date', 'name']

type MunicipalHolidaySectionProps = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * "Feriados municipais" (RF3, RF7): o formulário de cadastro/edição, o aviso do horizonte de geração e a tabela. A
 * regra "todo ano" é UMA linha ("Todo ano, 14/07 — gerado até 2036"); as datas que ela gerou não são linhas.
 */
export function MunicipalHolidaySection({ companyId, enabled }: MunicipalHolidaySectionProps) {
  const { t } = useTranslation('businessCalendar')
  const section = useMunicipalHolidaySection({ companyId, enabled })
  const sectionRef = useRef<HTMLElement>(null)
  const { data } = section

  function describeWhen(row: HolidayRow): string {
    const date = describeHolidayDate(row)
    if (row.origin !== 'rule') return date
    return t('municipal.table.ruleSchedule', { date, year: row.materializedThroughYear })
  }

  return (
    <section aria-labelledby="municipal-holidays-title" className={styles.block} ref={sectionRef}>
      <h3 id="municipal-holidays-title">{t('municipal.title')}</h3>
      <p className={styles.hint}>{t('municipal.hint')}</p>
      <MunicipalHolidayForm
        controller={section.form}
        feedback={section.feedback}
        onShortcut={(field) => focusBusinessCalendarField({ field, panel: sectionRef.current })}
      />
      <MunicipalHorizonNotice
        controller={section.materialization}
        coveredThroughYear={section.coveredThroughYear}
        hasShortHorizon={section.hasShortHorizon}
      />
      <HolidayListArea
        columns={COLUMNS}
        describeWhen={describeWhen}
        error={data.error}
        hasKindFilter
        isError={data.isError}
        isLoading={data.isLoading}
        namespace="municipal"
        onDelete={section.remover.request}
        onEdit={section.form.handleEdit}
        onRetry={() => void data.refetch()}
        rows={data.rows}
        table={section.table}
        view={data.view}
      />
      <HolidayDeleteDialog controller={section.remover} />
    </section>
  )
}
