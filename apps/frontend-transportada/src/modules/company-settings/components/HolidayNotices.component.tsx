/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { HolidayNotice } from '../shared/businessCalendarSubmit.service'
import styles from '../styles/businessCalendar.module.css'

type HolidayNoticesProps = Readonly<{ notices: readonly HolidayNotice[] }>

/** O que aconteceu depois de gravar: dito por extenso, e a adoção e as datas mantidas nunca ficam em silêncio. */
export function HolidayNotices({ notices }: HolidayNoticesProps) {
  const { t } = useTranslation('businessCalendar')

  return (
    <>
      {notices.map((notice) => (
        <p className={styles.status} key={notice.key} role="status">
          {t(notice.key, notice.count === undefined ? {} : { count: notice.count })}
        </p>
      ))}
    </>
  )
}
