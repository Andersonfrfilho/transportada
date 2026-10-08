/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { HolidayTableView } from '../shared/businessCalendarTable.service'
import styles from '../styles/businessCalendar.module.css'

type HolidayPaginationProps = Readonly<{
  onPage: (page: number) => void
  view: HolidayTableView
}>

/** Só aparece com mais de uma página; a página vai para a URL pelo hook da tabela. */
export function HolidayPagination({ onPage, view }: HolidayPaginationProps) {
  const { t } = useTranslation('businessCalendar')
  if (view.pageCount <= 1) return null

  return (
    <nav
      aria-label={t('list.pageOf', { count: view.pageCount, page: view.page })}
      className={styles.pagination}
    >
      <Button
        disabled={view.page <= 1}
        onClick={() => onPage(view.page - 1)}
        type="button"
        variant="ghost"
      >
        <Icon name="page-previous" />
        {t('list.previousPage')}
      </Button>
      <p>{t('list.pageOf', { count: view.pageCount, page: view.page })}</p>
      <Button
        disabled={view.page >= view.pageCount}
        onClick={() => onPage(view.page + 1)}
        type="button"
        variant="ghost"
      >
        {t('list.nextPage')}
        <Icon name="page-next" />
      </Button>
    </nav>
  )
}
