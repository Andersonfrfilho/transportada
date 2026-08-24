/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { focusFieldByLabel } from '@/modules/shared/focusFieldByLabel.service'

import styles from '../styles/fleet.module.css'

type InvalidFieldsHintProps = Readonly<{
  labels: readonly string[]
  panelRef: RefObject<HTMLElement | null>
}>

/**
 * Dizer o nome do campo põe o operador na direção certa; levá-lo até lá é o que o poupa de rolar
 * uma ficha de quarenta campos procurando o rótulo que acabou de ler no aviso.
 */
export function InvalidFieldsHint({ labels, panelRef }: InvalidFieldsHintProps) {
  const { t } = useTranslation('fleet')

  if (labels.length === 0) return null

  return (
    <>
      {` ${t('invalidFieldsLead')} `}
      {labels.map((label, index) => (
        <Fragment key={label}>
          {index === 0 ? null : ', '}
          <button
            className={styles.invalidField}
            type="button"
            onClick={() => focusFieldByLabel({ label: t(label), panel: panelRef.current })}
          >
            {t(label)}
          </button>
        </Fragment>
      ))}
      .
    </>
  )
}
