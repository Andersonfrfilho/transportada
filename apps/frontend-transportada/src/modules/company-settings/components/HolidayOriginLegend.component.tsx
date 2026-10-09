/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import styles from '../styles/holidayImport.module.css'

const LEGEND_KEYS = ['national', 'state', 'typed', 'imported'] as const

/** O que cada origem quer dizer e qual vence: sem isto a coluna Origem é um rótulo sem significado. */
export function HolidayOriginLegend() {
  const { t } = useTranslation('businessCalendar')

  return (
    <div className={styles.legend}>
      <p className={styles.subtitle}>{t('import.legend.title')}</p>
      <ul className={styles.legendList}>
        {LEGEND_KEYS.map((key) => (
          <li key={key}>{t(`import.legend.${key}`)}</li>
        ))}
      </ul>
    </div>
  )
}
