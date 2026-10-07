/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoOccurrenceFormController } from '../hooks/useCargoOccurrenceForm.hook'
import { resolveOccurrenceErrorKeys } from '../shared/cargoOccurrenceRefusal.service'
import styles from '../styles/cargoOccurrence.module.css'
import { RegistrationRefusalSummary } from './RegistrationRefusalSummary.component'

type CargoOccurrenceDialogFeedbackProps = Readonly<{
  form: CargoOccurrenceFormController
  panelRef: RefObject<HTMLElement | null>
}>

/** O que deu errado no formulário: a leitura que falhou, os campos recusados (cada um com atalho) e o texto do código. */
export function CargoOccurrenceDialogFeedback({
  form,
  panelRef,
}: CargoOccurrenceDialogFeedbackProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <>
      {form.loadFailed ? (
        <p className={styles.fieldError} role="alert">
          {t('occurrence.dialog.loadFailed')}
        </p>
      ) : null}
      {form.refusal === undefined ? null : (
        <RegistrationRefusalSummary panelRef={panelRef} refusal={form.refusal} />
      )}
      {form.errorCode === undefined ? null : (
        <p className={styles.fieldError} role="alert">
          {t(resolveOccurrenceErrorKeys(form.errorCode), { code: form.errorCode })}
        </p>
      )}
    </>
  )
}
