/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type ReactNode } from 'react'

import { getLandingApiBaseUrl } from '@/modules/shared/landingEnvironment.config'
import type { LandingSettings } from '@/modules/shared/landingSettings.service'
import { formatPhone, PHONE_MASK_LENGTH, stripPhone } from '@/modules/shared/phone.service'
import { CNPJ_LENGTH, formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'
import { createAggregateApplicationClient } from '../shared/landingClient.service'
import { formatPostalCode } from '../shared/postalCode.service'
import styles from './PreRegistrationForm.module.css'

const TAX_ID_MASK_LENGTH = CNPJ_LENGTH + 4 // 14 dígitos + 4 separadores do CNPJ mascarado
const POSTAL_CODE_MASK_LENGTH = 9

type SubmissionState = 'error' | 'idle' | 'submitted' | 'submitting'

type FormFields = Readonly<{
  companyId: string
  email: string
  name: string
  phone: string
  postalCode: string
  taxId: string
}>

const EMPTY_FIELDS: FormFields = { companyId: '', email: '', name: '', phone: '', postalCode: '', taxId: '' }

type PreRegistrationFormProps = Readonly<{ settings: LandingSettings }>

export function PreRegistrationForm({ settings }: PreRegistrationFormProps): ReactNode {
  const [fields, setFields] = useState<FormFields>(() => ({
    ...EMPTY_FIELDS,
    companyId: settings.units[0]?.companyId ?? '',
  }))
  const [state, setState] = useState<SubmissionState>('idle')

  const showUnitSelect = settings.units.length > 1

  function updateField<TField extends keyof FormFields>(field: TField, value: FormFields[TField]): void {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const companyId = showUnitSelect ? fields.companyId : (settings.units[0]?.companyId ?? '')
    if (companyId === '') {
      setState('error')
      return
    }

    setState('submitting')
    const client = createAggregateApplicationClient({ apiBaseUrl: getLandingApiBaseUrl() })
    const accepted = await client.submit({
      companyId,
      declaredData: { postalCode: fields.postalCode.replace(/\D/g, '') },
      email: fields.email,
      name: fields.name,
      phone: stripPhone(fields.phone),
      taxId: normalizeTaxId(fields.taxId),
    })

    if (!accepted) {
      setState('error')
      return
    }

    setState('submitted')
    setFields({ ...EMPTY_FIELDS, companyId: fields.companyId })
  }

  if (state === 'submitted') {
    return (
      <section className={styles.section}>
        <div className={`${styles.feedback} ${styles.feedbackSuccess}`} role="status">
          Candidatura recebida. Obrigado! Nossa equipe vai analisar os dados e entrar em contato.
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Pré-cadastro do agregado</h2>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <label className={styles.field}>
          <span className={styles.label}>Nome completo</span>
          <input
            className={styles.input}
            required
            type="text"
            value={fields.name}
            onChange={(event) => updateField('name', event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>CPF ou CNPJ</span>
          <input
            className={styles.input}
            inputMode="numeric"
            maxLength={TAX_ID_MASK_LENGTH}
            required
            type="text"
            value={fields.taxId}
            onChange={(event) => updateField('taxId', formatTaxId(event.target.value))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>E-mail</span>
          <input
            className={styles.input}
            required
            type="email"
            value={fields.email}
            onChange={(event) => updateField('email', event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Telefone</span>
          <input
            className={styles.input}
            inputMode="numeric"
            maxLength={PHONE_MASK_LENGTH}
            required
            type="text"
            value={fields.phone}
            onChange={(event) => updateField('phone', formatPhone(event.target.value))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>CEP</span>
          <input
            className={styles.input}
            inputMode="numeric"
            maxLength={POSTAL_CODE_MASK_LENGTH}
            type="text"
            value={fields.postalCode}
            onChange={(event) => updateField('postalCode', formatPostalCode(event.target.value))}
          />
        </label>
        {showUnitSelect ? (
          <label className={styles.field}>
            <span className={styles.label}>Unidade</span>
            <select
              className={styles.select}
              required
              value={fields.companyId}
              onChange={(event) => updateField('companyId', event.target.value)}
            >
              <option disabled value="">
                Selecione
              </option>
              {settings.units.map((unit) => (
                <option key={unit.companyId} value={unit.companyId}>
                  {unit.tradeName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {state === 'error' ? (
          <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
            Não foi possível enviar agora. Tente novamente em instantes.
          </div>
        ) : null}
        <button className={styles.submitButton} disabled={state === 'submitting'} type="submit">
          {state === 'submitting' ? 'Enviando…' : 'Enviar candidatura'}
        </button>
      </form>
    </section>
  )
}
