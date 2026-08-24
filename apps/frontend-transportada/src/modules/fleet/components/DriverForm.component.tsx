/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PHONE_MASK_LENGTH, formatPhone, stripPhone } from '@/modules/shared/phone.service'
import { toDisplayPersonName } from '@/modules/shared/personName.service'
import { formatCnpj, formatCpf, normalizeTaxId } from '@/modules/shared/taxId.service'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useCompanyLookup } from '../hooks/useCompanyLookup.hook'
import { useDriverAddressLookup } from '../hooks/useDriverAddressLookup.hook'
import { useDriverForm } from '../hooks/useDriverForm.hook'
import { useDriverLinkedAddress } from '../hooks/useDriverLinkedAddress.hook'
import { useDriverUniqueness } from '../hooks/useDriverUniqueness.hook'
import type { FleetDriverCoverage } from '../shared/driverCoverage.service'
import type {
  FleetDriverBody,
  FleetDriverCreateBody,
  FleetDriverDetail,
  FleetDriverVehicleLink,
  FleetDriverVersionInput,
  FleetReplaceDriverRegionsInput,
  FleetReplaceDriverVehiclesInput,
  FleetVehicleDetail,
} from '../shared/fleet.types'
import {
  FLEET_DRIVER_PROFILES,
  LICENSE_CATEGORIES,
  MDFE_OWNER_TAX_REGIME,
} from '../shared/fleet.types'
import type { FreightRegion } from '../shared/freightRegion.types'
import { isFleetFeedbackError } from '../shared/fleetFeedback.service'
import { toOwnedVehicleIds } from '../shared/driverVehicles.service'
import styles from '../styles/fleet.module.css'
import { DriverAddressFields } from './DriverAddressFields.component'
import { DriverCoverageFields } from './DriverCoverageFields.component'
import { DriverLinkedAddressFields } from './DriverLinkedAddressFields.component'
import { DriverPersonalFields } from './DriverPersonalFields.component'
import { DriverVehicleLinkField } from './DriverVehicleLinkField.component'
import { FleetFeedback } from './FleetFeedback.component'
import { FleetDateField, FleetField, FleetSelectField } from './FleetField.component'

type DriverVehiclesInput = Readonly<{
  isReady: boolean
  links: readonly FleetDriverVehicleLink[]
  options: readonly FleetVehicleDetail[]
  replace: (input: FleetReplaceDriverVehiclesInput) => Promise<unknown>
}>

type DriverRegionsInput = Readonly<{
  coverage: readonly FleetDriverCoverage[]
  regions: readonly FreightRegion[]
  replace: (input: FleetReplaceDriverRegionsInput) => Promise<unknown>
}>

type DriverFormProps = Readonly<{
  driver?: FleetDriverDetail
  onCancel: () => void
  onCreate: (body: FleetDriverCreateBody) => Promise<FleetDriverDetail>
  onUpdate: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  regions: DriverRegionsInput
  vehicles: DriverVehiclesInput
}>

export function DriverForm({
  driver,
  onCancel,
  onCreate,
  onUpdate,
  regions,
  vehicles,
}: DriverFormProps) {
  const { t } = useTranslation('fleet')
  const panelRef = useRevealedPanel<HTMLFormElement>()
  const uniqueness = useDriverUniqueness(driver === undefined ? {} : { driverId: driver.id })
  const form = useDriverForm({
    onCreate,
    onSaveError: uniqueness.showSaveError,
    onUpdate,
    regions: { coverage: regions.coverage, replace: regions.replace },
    vehicles: { isReady: vehicles.isReady, links: vehicles.links, replace: vehicles.replace },
    ...(driver === undefined ? {} : { driver }),
  })
  const addressLookup = useDriverAddressLookup({ patch: form.patch, state: form.state })
  const companyLookup = useCompanyLookup({ patch: form.patch })
  const linkedAddress = useDriverLinkedAddress({ patch: form.patch, state: form.state })
  const ownedVehicleIds = toOwnedVehicleIds(vehicles.links)

  /** O controlador guarda a chave; quem a traduz é a tela, que é onde o idioma está. */
  function fieldErrorText(feedback: string | undefined): string | undefined {
    return feedback === undefined ? undefined : t(feedback)
  }

  function handleClear(): void {
    uniqueness.reset()
    form.clear()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void form.submit()
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit} ref={panelRef}>
      <h2>{driver === undefined ? t('newDriver') : t('editDriver')}</h2>
      <fieldset className={styles.fieldGroup}>
        <legend>{t('driverIdentityLegend')}</legend>
        <div className={styles.fieldGrid}>
          <FleetField
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
            inputRef={uniqueness.bindField('taxId')}
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
            optional
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
      <DriverLinkedAddressFields lookup={linkedAddress} state={form.state} onChange={form.patch} />
      <DriverPersonalFields state={form.state} onChange={form.patch} />
      <DriverAddressFields lookup={addressLookup} state={form.state} onChange={form.patch} />
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
        <Button type="button" variant="ghost" onClick={handleClear}>
          <Icon name="trash" />
          {t('clearForm')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <Icon name="close" />
          {t('cancel')}
        </Button>
        <Button disabled={form.isSaving} type="submit">
          <Icon name="save" />
          {t('save')}
        </Button>
      </div>
    </form>
  )
}
