/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { HOLIDAY_PROVENANCE } from '../shared/holidayImport.constant'
import type { HolidayProvenance } from '../shared/businessCalendarRows.service'
import styles from '../styles/holidayImport.module.css'

type HolidayOriginBadgeProps = Readonly<{ provenance: HolidayProvenance }>

/**
 * De onde a data vem. Origem desconhecida (API que ainda não a manda) é traço com texto para leitor de tela: a tela
 * não chuta "cadastrada" para o que pode ser importado.
 */
export function HolidayOriginBadge({ provenance }: HolidayOriginBadgeProps) {
  const { t } = useTranslation('businessCalendar')

  if (provenance === HOLIDAY_PROVENANCE.UNKNOWN) {
    return (
      <>
        <span aria-hidden="true">{t('import.origin.unknown')}</span>
        <span className={styles.visuallyHidden}>{t('import.origin.unknownAria')}</span>
      </>
    )
  }

  return (
    <span className={styles.originBadge} data-origin={provenance}>
      {t(`import.origin.${provenance}`)}
    </span>
  )
}
