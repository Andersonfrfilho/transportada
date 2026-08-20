/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type FormEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatCnpj, formatCpf, normalizeTaxId } from '@/modules/shared/taxId.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useDriverAddressLookup } from '../hooks/useDriverAddressLookup.hook'
import { FLEET_FEEDBACK_KEY_BY_ERROR } from '../shared/fleet.constant'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverFormState,
} from '../shared/fleet.types'
import { createDriverDraft, toDriverBody } from '../shared/fleetForm.service'
import styles from '../styles/fleet.module.css'
import { DriverAddressFields } from './DriverAddressFields.component'
import { DriverMembershipField } from './DriverMembershipField.component'
import { FleetDateField, FleetField } from './FleetField.component'

type DriverQuickCreateDialogProps = Readonly<{
  onClose: () => void
  onCreate: (body: FleetDriverBody) => Promise<FleetDriverDetail>
  onCreated: (driver: FleetDriverDetail) => void
}>

function resolveFeedbackKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return FLEET_FEEDBACK_KEY_BY_ERROR[code] ?? 'saveError'
}

export function DriverQuickCreateDialog({
  onClose,
  onCreate,
  onCreated,
}: DriverQuickCreateDialogProps) {
  const { t } = useTranslation('fleet')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const [state, setState] = useState<FleetDriverFormState>(createDriverDraft)
  const [isSaving, setIsSaving] = useState(false)
  const [feedbackKey, setFeedbackKey] = useState<null | string>(null)

  function patch(values: Partial<FleetDriverFormState>): void {
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  const addressLookup = useDriverAddressLookup({ patch, state })

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setIsSaving(true)
    try {
      const driver = await onCreate(toDriverBody(state))
      onCreated(driver)
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error))
      setIsSaving(false)
    }
  }

  return createPortal(
    <div className={styles.driverDialogOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="driver-quick-create-title"
        aria-modal="true"
        className={styles.driverDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.driverDialogHeader}>
          <h2 id="driver-quick-create-title">{t('ownerDriverCreateTitle')}</h2>
          <button
            aria-label={t('cancel')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        <p className={styles.hint}>{t('ownerDriverCreateHint')}</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <fieldset className={styles.fieldGroup}>
            <div className={styles.fieldGrid}>
              <FleetField
                label={t('driverName')}
                value={state.name}
                onChange={(name) => patch({ name })}
              />
              <FleetField
                inputMode="numeric"
                label={t('driverTaxId')}
                maxLength={14}
                value={formatCpf(state.taxId)}
                onChange={(taxId) => patch({ taxId: normalizeTaxId(taxId) })}
              />
              <FleetField
                label={t('driverLinkedTaxId')}
                maxLength={18}
                value={formatCnpj(state.linkedTaxId)}
                onChange={(linkedTaxId) => patch({ linkedTaxId: normalizeTaxId(linkedTaxId) })}
              />
              <FleetField
                inputMode="numeric"
                label={t('driverLicense')}
                maxLength={11}
                value={state.licenseNumber}
                onChange={(licenseNumber) => patch({ licenseNumber })}
              />
              <FleetField
                inputMode="numeric"
                label={t('driverPhone')}
                maxLength={11}
                value={state.phone}
                onChange={(phone) => patch({ phone })}
              />
              <DriverMembershipField
                value={state.membershipId}
                onChange={(membershipId) => patch({ membershipId })}
              />
              <FleetDateField
                label={t('driverBirthDate')}
                optional
                value={state.birthDate}
                onChange={(birthDate) => patch({ birthDate })}
              />
              <FleetDateField
                hint={t('driverLicenseExpiresAtHint')}
                label={t('driverLicenseExpiresAt')}
                optional
                value={state.licenseExpiresAt}
                onChange={(licenseExpiresAt) => patch({ licenseExpiresAt })}
              />
            </div>
            <p className={styles.hint}>{t('driverLinkedTaxIdHint')}</p>
            <p className={styles.hint}>{t('driverMembershipHint')}</p>
          </fieldset>
          <DriverAddressFields lookup={addressLookup} state={state} onChange={patch} />
          {feedbackKey === null ? null : (
            <p className={styles.feedback} role="status">
              {t(feedbackKey)}
            </p>
          )}
          <div className={styles.formActions}>
            <Button onClick={onClose} type="button" variant="ghost">
              <Icon name="close" />
              {t('cancel')}
            </Button>
            <Button disabled={isSaving} type="submit">
              <Icon name="save" />
              {t('save')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
