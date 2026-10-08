/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import type { BusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'
import styles from '../styles/businessCalendar.module.css'

const GENERIC_MESSAGE_KEY = 'errors.generic'

type HolidayRefusalProps = Readonly<{
  /** Sem atalho (a falha de uma lista, de um diálogo) a recusa diz só o motivo. */
  onShortcut?: (field: string) => void
  refusal: BusinessCalendarRefusal
}>

/**
 * `web.md` §11: a recusa diz o motivo e nomeia TODOS os campos de uma vez; cada nome é um atalho que leva ao campo.
 * O que a tela não conhece sai com o nome que a API usou. Sem campo nenhum, não há lista inventada.
 */
export function HolidayRefusal({ onShortcut, refusal }: HolidayRefusalProps) {
  const { t } = useTranslation('businessCalendar')
  const message =
    refusal.messageKey === GENERIC_MESSAGE_KEY
      ? t('errors.withCode', { code: refusal.code, message: t(GENERIC_MESSAGE_KEY) })
      : t(refusal.messageKey)

  return (
    <div className={styles.refusal} role="alert">
      <p>{message}</p>
      {refusal.fields.length === 0 || onShortcut === undefined ? null : (
        <p data-refusal-summary="">
          {t('refusal.lead')}{' '}
          {refusal.fields.map((item, index) => (
            <Fragment key={item.field}>
              {index === 0 ? null : ', '}
              <button
                className={styles.refusalShortcut}
                onClick={() => onShortcut(item.field)}
                type="button"
              >
                {item.labelKey === undefined ? item.field : t(item.labelKey)}
              </button>
            </Fragment>
          ))}
          .
        </p>
      )}
    </div>
  )
}
