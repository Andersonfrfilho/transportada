/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { HolidayFieldIds } from '../hooks/useHolidayFieldIds.hook'
import { HOLIDAY_NAME_MAX_LENGTH } from '../shared/businessCalendar.constant'
import type {
  HolidayField as HolidayFieldName,
  HolidayIssue,
} from '../shared/businessCalendarForm.validation'
import styles from '../styles/businessCalendar.module.css'

type HolidayFieldProps = Readonly<{
  children: ReactNode
  field: HolidayFieldName
  ids: HolidayFieldIds
  isWide?: boolean
  issue: HolidayIssue | undefined
  label: string
}>

/**
 * O invólucro de um campo do formulário: rótulo, controle e a mensagem de erro dele. O `data-field` é o nome que
 * a API usa — é por ele que o aviso de recusa leva o foco até aqui (`web.md` §11). O erro é do próprio campo
 * (`aria-invalid` + `aria-describedby`), nunca texto solto.
 */
export function HolidayField({
  children,
  field,
  ids,
  isWide = false,
  issue,
  label,
}: HolidayFieldProps) {
  const { t } = useTranslation('businessCalendar')

  return (
    <div
      {...(issue === undefined ? {} : { 'aria-describedby': ids.errorId, 'aria-invalid': true })}
      aria-labelledby={ids.labelId}
      className={isWide ? `${styles.field} ${styles.fieldWide}` : styles.field}
      data-field={field}
      role="group"
    >
      <span className={styles.fieldLabel} id={ids.labelId}>
        {label}
      </span>
      {children}
      {issue === undefined ? null : (
        <p className={styles.fieldError} data-field-error="" id={ids.errorId}>
          {t([`fieldErrors.${field}.${issue}`, `fieldErrors.${issue}`], {
            max: HOLIDAY_NAME_MAX_LENGTH,
          })}
        </p>
      )}
    </div>
  )
}
