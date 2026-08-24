/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PHONE_MASK_LENGTH, formatPhone, stripPhone } from '@/modules/shared/phone.service'
import { toDisplayPersonName } from '@/modules/shared/personName.service'
import { formatCnpj, formatCpf, normalizeTaxId } from '@/modules/shared/taxId.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useCompanyLookup } from '../hooks/useCompanyLookup.hook'
import { useDriverAddressLookup } from '../hooks/useDriverAddressLookup.hook'
import { useDriverFieldFocus } from '../hooks/useDriverFieldFocus.hook'
import { useDriverForm } from '../hooks/useDriverForm.hook'
import { useDriverUniqueness } from '../hooks/useDriverUniqueness.hook'
import type { DriverRegionsController } from '../hooks/useDriverRegions.hook'
import type { DriverVehiclesController } from '../hooks/useDriverVehicles.hook'
import { type DriverFocusField } from '../shared/driverFieldFocus.service'
import { toOwnedVehicleIds } from '../shared/driverVehicles.service'
import type {
  FleetDriverBody,
  FleetDriverCreateBody,
  FleetDriverDetail,
  FleetDriverVersionInput,
} from '../shared/fleet.types'
import {
  FLEET_DRIVER_PROFILES,
  LICENSE_CATEGORIES,
  MDFE_OWNER_TAX_REGIME,
} from '../shared/fleet.types'
import { isFleetFeedbackError } from '../shared/fleetFeedback.service'
import styles from '../styles/fleet.module.css'
import { DriverAddressFields } from './DriverAddressFields.component'
import { DriverCoverageFields } from './DriverCoverageFields.component'
import { DriverPersonalFields } from './DriverPersonalFields.component'
import { DriverVehicleLinkField } from './DriverVehicleLinkField.component'
import { FleetFeedback } from './FleetFeedback.component'
import { FleetDateField, FleetField, FleetSelectField } from './FleetField.component'

/** A ficha aberta pelo veículo tem rascunho próprio: ela nasce de outra tela e some com ela. */
const QUICK_DRAFT_STORAGE_KEY = 'transportada.fleet.driver-quick-draft'

type DriverQuickCreateDialogProps = Readonly<{
  /** Ficha aberta para correção; ausente, o diálogo cadastra. */
  driver?: FleetDriverDetail
  /** Campo a revelar na abertura, quando outra tela apontou o que falta preencher. */
  focusField?: DriverFocusField
  onClose: () => void
  onCreate: (body: FleetDriverCreateBody) => Promise<FleetDriverDetail>
  onCreated: (driver: FleetDriverDetail) => void
  onUpdate: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  regions: DriverRegionsController
  vehicles: DriverVehiclesController
}>

/**
 * A mesma ficha da aba de motoristas, aberta em diálogo: os campos vêm do mesmo controlador,
 * senão o que só existe num dos dois some quando a ficha é aberta pelo outro caminho.
 */
export function DriverQuickCreateDialog({
  driver,
  focusField,
  onClose,
  onCreate,
  onCreated,
  onUpdate,
  regions,
  vehicles,
}: DriverQuickCreateDialogProps) {
  const { t } = useTranslation('fleet')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  /** Depois do `useModalDialog`, de propósito: efeito roda na ordem de declaração, e o foco de
   * abertura do diálogo desfaria o do campo. */
  const focus = useDriverFieldFocus({ field: focusField })
  const uniqueness = useDriverUniqueness(driver === undefined ? {} : { driverId: driver.id })
  const form = useDriverForm({
    ...(driver === undefined ? {} : { driver }),
    onCreate,
    onSaveError: uniqueness.showSaveError,
    onSaved: onCreated,
    onUpdate,
    regions: { coverage: regions.coverage, replace: regions.replace },
    storageKey: QUICK_DRAFT_STORAGE_KEY,
    vehicles: { isReady: vehicles.isReady, links: vehicles.links, replace: vehicles.replace },
  })
  const addressLookup = useDriverAddressLookup({ patch: form.patch, state: form.state })
  const companyLookup = useCompanyLookup({ patch: form.patch })
  const ownedVehicleIds = toOwnedVehicleIds(vehicles.links)

  /** O controlador guarda a chave; quem a traduz é a tela, que é onde o idioma está. */
  function fieldErrorText(feedback: string | undefined): string | undefined {
    return feedback === undefined ? undefined : t(feedback)
  }

  function handleClear(): void {
    uniqueness.reset()
    form.clear()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
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
          <h2 id="driver-quick-create-title">
            {driver === undefined ? t('ownerDriverCreateTitle') : t('ownerDriverEditTitle')}
          </h2>
          <button
            aria-label={t('cancel')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        <p className={styles.hint}>
          {driver === undefined ? t('ownerDriverCreateHint') : t('ownerDriverEditHint')}
        </p>
        <form onSubmit={handleSubmit}>
          <fieldset className={styles.fieldGroup}>
            <legend>{t('driverIdentityLegend')}</legend>
            <div className={styles.fieldGrid}>
              <FleetField
                inputRef={focus.bindInput('name')}
                label={t('driverName')}
                value={form.state.name}
                onChange={(name) => form.patch({ name: toDisplayPersonName(name) })}
              />
              <FleetField
                label={t('driverSurname')}
                value={form.state.surname}
                onChange={(surname) => form.patch({ surname: toDisplayPersonName(surname) })}
              />
              <FleetField
                error={fieldErrorText(uniqueness.errorOf('taxId'))}
                inputMode="numeric"
                inputRef={focus.bindInput('taxId', uniqueness.bindField('taxId'))}
                label={t('driverTaxId')}
                maxLength={14}
                value={formatCpf(form.state.taxId)}
                onBlur={() => uniqueness.confirm('taxId', form.state.taxId)}
                onChange={(taxId) => {
                  uniqueness.clear('taxId')
                  form.patch({ taxId: normalizeTaxId(taxId) })
                }}
              />
              <FleetField
                label={t('driverLinkedTaxId')}
                maxLength={18}
                value={formatCnpj(form.state.linkedTaxId)}
                onChange={companyLookup.changeTaxId}
              />
              <FleetField
                label={t('driverLinkedLegalName')}
                value={form.state.linkedLegalName}
                onChange={(linkedLegalName) => form.patch({ linkedLegalName })}
              />
              <FleetField
                error={fieldErrorText(uniqueness.errorOf('email'))}
                inputRef={uniqueness.bindField('email')}
                label={t('driverEmail')}
                value={form.state.email}
                onBlur={() => uniqueness.confirm('email', form.state.email)}
                onChange={(email) => {
                  uniqueness.clear('email')
                  form.patch({ email })
                }}
              />
              <FleetField
                error={fieldErrorText(uniqueness.errorOf('licenseNumber'))}
                inputMode="numeric"
                inputRef={uniqueness.bindField('licenseNumber')}
                label={t('driverLicense')}
                maxLength={11}
                value={form.state.licenseNumber}
                onBlur={() => uniqueness.confirm('licenseNumber', form.state.licenseNumber)}
                onChange={(licenseNumber) => {
                  uniqueness.clear('licenseNumber')
                  form.patch({ licenseNumber })
                }}
              />
              <FleetSelectField<string>
                clearable
                label={t('driverLicenseCategory')}
                optionLabelKey="licenseCategoryOption"
                options={LICENSE_CATEGORIES}
                placeholder={t('driverLicenseCategoryUnset')}
                value={form.state.licenseCategory}
                onChange={(licenseCategory) => form.patch({ licenseCategory })}
              />
              <FleetField
                inputMode="numeric"
                label={t('driverPhone')}
                maxLength={PHONE_MASK_LENGTH}
                value={formatPhone(form.state.phone)}
                onChange={(phone) => form.patch({ phone: stripPhone(phone) })}
              />
              <FleetField
                inputMode="numeric"
                inputRef={focus.bindInput('rntrc')}
                label={t('driverRntrc')}
                maxLength={9}
                value={form.state.rntrc}
                onChange={(rntrc) => form.patch({ rntrc })}
              />
              <FleetSelectField<string>
                clearable
                label={t('driverAnttCategory')}
                optionLabelKey="ownerTaxRegimeOption"
                options={MDFE_OWNER_TAX_REGIME}
                placeholder={t('driverAnttCategoryUnset')}
                value={form.state.anttCategory}
                onChange={(anttCategory) => form.patch({ anttCategory })}
              />
              {driver === undefined ? (
                <FleetSelectField
                  label={t('driverProfile')}
                  optionLabelKey="driverProfileOption"
                  options={FLEET_DRIVER_PROFILES}
                  value={form.state.profile}
                  onChange={(profile) => form.patch({ profile })}
                />
              ) : null}
              <FleetDateField
                label={t('driverBirthDate')}
                optional
                value={form.state.birthDate}
                onChange={(birthDate) => form.patch({ birthDate })}
              />
              <FleetDateField
                hint={t('driverFirstLicenseAtHint')}
                label={t('driverFirstLicenseAt')}
                optional
                value={form.state.firstLicenseAt}
                onChange={(firstLicenseAt) => form.patch({ firstLicenseAt })}
              />
              <FleetDateField
                hint={t('driverLicenseExpiresAtHint')}
                label={t('driverLicenseExpiresAt')}
                optional
                value={form.state.licenseExpiresAt}
                onChange={(licenseExpiresAt) => form.patch({ licenseExpiresAt })}
              />
            </div>
            <p className={styles.hint}>{t('driverLinkedTaxIdHint')}</p>
            {companyLookup.statusKey === null ? null : (
              <p className={styles.hint}>{t(companyLookup.statusKey)}</p>
            )}
            <p className={styles.hint}>{t('driverEmailHint')}</p>
            <p className={styles.hint}>{t('driverAnttHint')}</p>
            {driver === undefined ? <p className={styles.hint}>{t('driverProfileHint')}</p> : null}
          </fieldset>
          <DriverPersonalFields state={form.state} onChange={form.patch} />
          <DriverAddressFields
            lookup={addressLookup}
            state={form.state}
            stateTriggerRef={focus.bindTrigger('addressState')}
            onChange={form.patch}
          />
          <DriverVehicleLinkField
            onChange={form.setVehicles}
            options={vehicles.options}
            ownedVehicleIds={ownedVehicleIds}
            selectedVehicleIds={form.selectedVehicleIds}
          />
          <DriverCoverageFields coverage={form.coverage} regions={regions.regions} />
          {form.feedbackKey === null ? null : (
            <FleetFeedback isError={isFleetFeedbackError(form.feedbackKey)}>
              {t(form.feedbackKey)}
            </FleetFeedback>
          )}
          <div className={styles.formActions}>
            {driver === undefined ? (
              <Button type="button" variant="ghost" onClick={handleClear}>
                <Icon name="trash" />
                {t('clearForm')}
              </Button>
            ) : null}
            <Button onClick={onClose} type="button" variant="ghost">
              <Icon name="close" />
              {t('cancel')}
            </Button>
            <Button disabled={form.isSaving} type="submit">
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
