/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { CompanySettingsFieldError } from '../shared/companySettingsFormValidation.service'
import styles from '../styles/companySettings.module.css'

type CompanySettingsErrorSummaryProps = Readonly<{
  errors: readonly CompanySettingsFieldError[]
}>

function focusField(fieldId: string): void {
  const element = document.getElementById(fieldId)
  if (element === null) return
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // O scroll síncrono do foco cancelaria a rolagem suave iniciada acima.
  element.focus({ preventScroll: true })
}

export function CompanySettingsErrorSummary({ errors }: CompanySettingsErrorSummaryProps) {
  const { t } = useTranslation('companySettings')
  if (errors.length === 0) return null
  return (
    <div className={styles.errorSummary} role="alert">
      <p className={styles.errorSummaryTitle}>{t('validationSummaryTitle')}</p>
      <ul className={styles.errorSummaryList}>
        {errors.map((error) => (
          <li key={error.fieldId}>
            <button
              className={styles.errorSummaryLink}
              onClick={() => focusField(error.fieldId)}
              type="button"
            >
              {t('validationRequiredField', { field: t(error.field) })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
