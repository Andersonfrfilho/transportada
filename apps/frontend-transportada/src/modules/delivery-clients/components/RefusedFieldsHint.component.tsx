/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type JSX, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { focusRefusedField } from '../shared/focusRefusedField.service'
import type { RefusedField } from '../shared/receivingRefusal.service'
import styles from '../styles/contractorDirectory.module.css'

type RefusedFieldsHintProps = Readonly<{
  fields: readonly RefusedField[]
  panelRef: RefObject<HTMLElement | null>
}>

/**
 * `web.md` §11: o aviso nomeia TODOS os campos recusados, pelo rótulo impresso, e cada nome é um
 * atalho que rola até o campo e põe o foco nele. Campo sem rótulo conhecido sai com o nome da API.
 */
export function RefusedFieldsHint({
  fields,
  panelRef,
}: RefusedFieldsHintProps): JSX.Element | null {
  const { t } = useTranslation('contractorDirectory')
  if (fields.length === 0) return null

  return (
    <p className={styles.refusal} data-refusal-summary="">
      {t('refusal.lead')}{' '}
      {fields.map((item, index) => (
        <Fragment key={item.field}>
          {index === 0 ? null : ', '}
          <button
            className={styles.refusalShortcut}
            onClick={() => focusRefusedField({ field: item.field, panel: panelRef.current })}
            type="button"
          >
            {item.labelKey === undefined ? item.field : t(item.labelKey)}
          </button>
        </Fragment>
      ))}
      .
    </p>
  )
}
