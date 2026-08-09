/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CompanyWizardController } from '../hooks/useCompanyWizard.hook'
import styles from '../styles/companySettings.module.css'
import wizardStyles from '../styles/companyWizard.module.css'
import { CompanyProfileFields } from './CompanyProfileFields.component'

type CompanyWizardProps = Readonly<{ wizard: CompanyWizardController }>

// Primeiro acesso: sem certificado nem cadastro fiscal ainda não faz sentido oferecer saída.
function doNotClose(): void {}

export function CompanyWizard({ wizard }: CompanyWizardProps) {
  const { t } = useTranslation('companySettings')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: doNotClose })

  return createPortal(
    <div className={wizardStyles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="company-wizard-title"
        aria-modal="true"
        className={wizardStyles.panel}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h1 className={wizardStyles.title} id="company-wizard-title">
          {t('wizardTitle')}
        </h1>
        <p className={wizardStyles.description}>{t('wizardDescription')}</p>
        <form
          className={styles.settingsForm}
          onSubmit={(event) => {
            event.preventDefault()
            wizard.submit()
          }}
        >
          <CompanyProfileFields
            disabled={wizard.isSaving}
            lookupPending={wizard.lookupPending}
            lookupStatus={wizard.lookupStatus}
            onChange={wizard.onChange}
            onLookupCnpj={wizard.onLookupCnpj}
            onTaxRegimeChange={wizard.onTaxRegimeChange}
            profile={wizard.profile}
          />
          {wizard.feedbackKey === null ? null : (
            <p
              className={
                wizard.feedbackKey === 'saved' ? wizardStyles.feedback : wizardStyles.feedbackError
              }
              role={wizard.feedbackKey === 'saved' ? 'status' : 'alert'}
            >
              {t(wizard.feedbackKey)}
            </p>
          )}
          <button className={styles.primaryAction} disabled={wizard.isSaving} type="submit">
            <Icon name="save" />
            {t('wizardSubmit')}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
