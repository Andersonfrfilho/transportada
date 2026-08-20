/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { formatCnpj, formatCpf, normalizeTaxId } from '@/modules/shared/taxId.service'

import { useDriverAddressLookup } from '../hooks/useDriverAddressLookup.hook'
import { useDriverForm } from '../hooks/useDriverForm.hook'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverVehicleLink,
  FleetDriverVersionInput,
  FleetReplaceDriverVehiclesInput,
  FleetVehicleDetail,
} from '../shared/fleet.types'
import { toOwnedVehicleIds } from '../shared/driverVehicles.service'
import styles from '../styles/fleet.module.css'
import { DriverAddressFields } from './DriverAddressFields.component'
import { FleetField } from './FleetField.component'

type DriverVehiclesInput = Readonly<{
  links: readonly FleetDriverVehicleLink[]
  options: readonly FleetVehicleDetail[]
  replace: (input: FleetReplaceDriverVehiclesInput) => Promise<unknown>
}>

type DriverFormProps = Readonly<{
  driver?: FleetDriverDetail
  onCancel: () => void
  onCreate: (body: FleetDriverBody) => Promise<FleetDriverDetail>
  onUpdate: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  vehicles: DriverVehiclesInput
}>

export function DriverForm({ driver, onCancel, onCreate, onUpdate, vehicles }: DriverFormProps) {
  const { t } = useTranslation('fleet')
  const form = useDriverForm({
    onCreate,
    onUpdate,
    vehicles: { links: vehicles.links, replace: vehicles.replace },
    ...(driver === undefined ? {} : { driver }),
  })
  const addressLookup = useDriverAddressLookup({ patch: form.patch, state: form.state })
  const ownedVehicleIds = toOwnedVehicleIds(vehicles.links)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void form.submit()
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit}>
      <h2>{driver === undefined ? t('newDriver') : t('editDriver')}</h2>
      <fieldset className={styles.fieldGroup}>
        <legend>{t('driverIdentityLegend')}</legend>
        <div className={styles.fieldGrid}>
          <FleetField
            label={t('driverName')}
            value={form.state.name}
            onChange={(name) => form.patch({ name })}
          />
          <FleetField
            inputMode="numeric"
            label={t('driverTaxId')}
            maxLength={14}
            value={formatCpf(form.state.taxId)}
            onChange={(taxId) => form.patch({ taxId: normalizeTaxId(taxId) })}
          />
          <FleetField
            label={t('driverLinkedTaxId')}
            maxLength={18}
            value={formatCnpj(form.state.linkedTaxId)}
            onChange={(linkedTaxId) => form.patch({ linkedTaxId: normalizeTaxId(linkedTaxId) })}
          />
          <FleetField
            inputMode="numeric"
            label={t('driverLicense')}
            maxLength={11}
            value={form.state.licenseNumber}
            onChange={(licenseNumber) => form.patch({ licenseNumber })}
          />
          <FleetField
            inputMode="numeric"
            label={t('driverPhone')}
            maxLength={11}
            value={form.state.phone}
            onChange={(phone) => form.patch({ phone })}
          />
          <FleetField
            label={t('driverMembership')}
            maxLength={36}
            value={form.state.membershipId}
            onChange={(membershipId) => form.patch({ membershipId })}
          />
          <FleetField
            label={t('driverBirthDate')}
            optional
            type="date"
            value={form.state.birthDate}
            onChange={(birthDate) => form.patch({ birthDate })}
          />
          <FleetField
            hint={t('driverLicenseExpiresAtHint')}
            label={t('driverLicenseExpiresAt')}
            optional
            type="date"
            value={form.state.licenseExpiresAt}
            onChange={(licenseExpiresAt) => form.patch({ licenseExpiresAt })}
          />
        </div>
        <p className={styles.hint}>{t('driverLinkedTaxIdHint')}</p>
        <p className={styles.hint}>{t('driverMembershipHint')}</p>
      </fieldset>
      <DriverAddressFields lookup={addressLookup} state={form.state} onChange={form.patch} />
      <fieldset className={styles.fieldGroup}>
        <legend>{t('driverVehiclesLegend')}</legend>
        <p className={styles.hint}>{t('driverVehiclesHint')}</p>
        {vehicles.options.length === 0 ? (
          <p className={styles.hint}>{t('driverVehiclesEmpty')}</p>
        ) : (
          <ul className={styles.vehicleLinkList}>
            {vehicles.options.map((vehicle) => (
              <li key={vehicle.id}>
                <Checkbox
                  checked={form.selectedVehicleIds.includes(vehicle.id)}
                  label={
                    <>
                      <strong>{vehicle.plate}</strong> {t(`roleOption.${vehicle.role}`)}
                      {ownedVehicleIds.includes(vehicle.id) ? (
                        <span className={styles.ownedBadge}>{t('driverOwnedVehicle')}</span>
                      ) : null}
                    </>
                  }
                  onChange={() => form.toggleVehicle(vehicle.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {form.feedbackKey === null ? null : (
        <p className={styles.feedback} role="status">
          {t(form.feedbackKey)}
        </p>
      )}
      <div className={styles.formActions}>
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
