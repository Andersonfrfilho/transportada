/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useCargoArrivalRegistration } from '../hooks/useCargoArrivalRegistration.hook'
import styles from '../styles/cargoReceiving.module.css'
import registrationStyles from '../styles/cargoRegistration.module.css'
import { AvailableDocumentPicker } from './AvailableDocumentPicker.component'
import { CargoArrivalPrefillNotice } from './CargoArrivalPrefillNotice.component'
import { CargoArrivalFormFields } from './CargoArrivalFormFields.component'
import { RegistrationRefusalSummary } from './RegistrationRefusalSummary.component'

/**
 * Registrar a chegada: dados do caminhão e as notas que vieram. A recusa do servidor chega nomeando todos
 * os campos e todas as notas, cada um com atalho (`web.md` §11), e o envio leva uma chave de idempotência
 * por tentativa — repetir o mesmo envio não duplica a chegada.
 */
export function CargoArrivalRegistration(): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const form = useCargoArrivalRegistration()
  const panelRef = useRef<HTMLFormElement>(null)
  const hasNamedRefusal =
    form.refusal !== undefined &&
    (form.refusal.fields.length > 0 || form.refusal.documents.length > 0)

  return (
    <form
      className={registrationStyles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.submit()
      }}
      ref={panelRef}
    >
      {form.prefill === undefined ? null : (
        <CargoArrivalPrefillNotice
          missingCount={form.picker.missingPreselectedCount}
          prefill={form.prefill}
        />
      )}
      <CargoArrivalFormFields form={form} />
      <AvailableDocumentPicker
        contractorId={form.draft.contractorId}
        issue={form.feedback.issueFor('documents')}
        picker={form.picker}
      />
      {form.refusal === undefined ? null : (
        <RegistrationRefusalSummary panelRef={panelRef} refusal={form.refusal} />
      )}
      {form.errorCode === undefined || hasNamedRefusal ? null : (
        <p className={styles.error} role="alert">
          {t([`errors.${form.errorCode}`, 'errors.unknown'], { code: form.errorCode })}
        </p>
      )}
      <div className={styles.actions}>
        <Button disabled={form.isSubmitting} type="submit">
          <Icon name="save" />
          {form.isSubmitting ? t('register.submitting') : t('register.submit')}
        </Button>
      </div>
    </form>
  )
}
