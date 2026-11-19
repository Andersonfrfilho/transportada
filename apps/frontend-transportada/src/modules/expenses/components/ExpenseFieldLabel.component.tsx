/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'

import styles from '../styles/expenses.module.css'

type ExpenseFieldLabelProps = Readonly<{
  /** A ajuda do campo. Ausente ou vazia, o rótulo sai sozinho, sem o ícone. */
  hint?: string | undefined
  text: string
}>

/**
 * O rótulo do campo com a ajuda num tooltip, em vez de um parágrafo sob o campo.
 *
 * ⚠️ O gatilho é um **botão** e não o ícone solto: o toque num botão dá foco, e o `Tooltip` abre no
 * foco — é assim que a ajuda existe no celular, onde não há `hover`. Tocar fora tira o foco e fecha.
 */
export function ExpenseFieldLabel({ hint, text }: ExpenseFieldLabelProps) {
  const { t } = useTranslation('expenses')
  if (hint === undefined || hint === '') return <span>{text}</span>
  return (
    <span className={styles.fieldLabel}>
      {text}
      <Tooltip label={hint}>
        <button
          aria-label={t('dialog.help', { field: text })}
          className={styles.infoButton}
          type="button"
        >
          <Icon name="info" size="sm" />
        </button>
      </Tooltip>
    </span>
  )
}
