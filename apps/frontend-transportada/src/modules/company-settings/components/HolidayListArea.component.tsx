/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { HolidayTableController } from '../hooks/useHolidayTable.hook'
import { describeBusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'
import type { HolidayRow } from '../shared/businessCalendarRows.service'
import type { HolidaySortColumn, HolidayTableView } from '../shared/businessCalendarTable.service'
import styles from '../styles/businessCalendar.module.css'

import { HolidayFilterBar } from './HolidayFilterBar.component'
import { HolidayPagination } from './HolidayPagination.component'
import { HolidayRefusal } from './HolidayRefusal.component'
import { HolidayTable } from './HolidayTable.component'
import type { HolidayTableNamespace } from './HolidayTableRow.component'

const SKELETON_ROWS = 3

type HolidayListAreaProps = Readonly<{
  columns: readonly HolidaySortColumn[]
  describeWhen: (row: HolidayRow) => string
  error: unknown
  hasKindFilter: boolean
  isError: boolean
  isLoading: boolean
  namespace: HolidayTableNamespace
  onDelete: (row: HolidayRow) => void
  onEdit: (row: HolidayRow) => void
  onRetry: () => void
  rows: readonly HolidayRow[]
  table: HolidayTableController
  view: HolidayTableView
}>

/**
 * A lista de um bloco, nos quatro estados que ela tem — carregando (esqueleto na forma da tabela), falha (o motivo e
 * "tentar de novo"), vazia e com filtro sem resultado. Nenhum deles é mudo.
 */
export function HolidayListArea(props: HolidayListAreaProps) {
  const { t } = useTranslation('businessCalendar')
  const { namespace, rows, table, view } = props

  if (props.isLoading) {
    return (
      <SkeletonGroup label={t(`${namespace}.loading`)}>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton height="var(--control-height-compact)" key={index} width="100%" />
        ))}
      </SkeletonGroup>
    )
  }
  if (props.isError) {
    return (
      <div className={styles.actions}>
        <HolidayRefusal refusal={describeBusinessCalendarRefusal(props.error)} />
        <Button onClick={props.onRetry} type="button" variant="secondary">
          <Icon name="refresh" />
          {t('list.retry')}
        </Button>
      </div>
    )
  }
  if (rows.length === 0) return <p className={styles.hint}>{t(`${namespace}.empty`)}</p>

  return (
    <>
      <HolidayFilterBar
        hasKindFilter={props.hasKindFilter}
        shown={view.total}
        table={table}
        total={rows.length}
      />
      {view.total === 0 ? (
        <p className={styles.hint}>{t('list.empty')}</p>
      ) : (
        <HolidayTable
          columns={props.columns}
          describeWhen={props.describeWhen}
          namespace={namespace}
          onDelete={props.onDelete}
          onEdit={props.onEdit}
          table={table}
          view={view}
        />
      )}
      <HolidayPagination onPage={table.setPage} view={view} />
    </>
  )
}
