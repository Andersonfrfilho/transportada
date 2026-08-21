/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { CTE_PROFILE_COMPONENT_CALCULATION } from '../shared/cteProfiles.types'
import {
  createEmptyComponentRow,
  type ComponentFormRow,
  type ProfileFormState,
} from '../shared/cteProfilesForm.service'
import styles from '../styles/cteProfiles.module.css'
import { ProfileDateField, ProfileField, ProfileSelectField } from './ProfileField.component'

type CteProfileComponentRowsProps = Readonly<{
  components: readonly ComponentFormRow[]
  onChange: (patch: Partial<ProfileFormState>) => void
}>

export function CteProfileComponentRows({ components, onChange }: CteProfileComponentRowsProps) {
  const { t } = useTranslation('cteProfiles')

  function replaceRow(index: number, patch: Partial<ComponentFormRow>) {
    onChange({
      components: components.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    })
  }

  function removeRow(index: number) {
    onChange({ components: components.filter((_row, position) => position !== index) })
  }

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('componentsLegend')}</legend>
      {components.length === 0 ? <p className={styles.emptyGroup}>{t('componentsEmpty')}</p> : null}
      {components.map((row, index) => (
        <div className={styles.repeatableRow} key={`component-${String(index)}`}>
          <div className={styles.fieldGrid}>
            <ProfileField
              label={t('componentLabel')}
              value={row.label}
              onChange={(label) => replaceRow(index, { label })}
            />
            <ProfileSelectField
              label={t('componentCalculation')}
              optionLabelKey="componentCalculationOption"
              options={CTE_PROFILE_COMPONENT_CALCULATION}
              value={row.calculationType}
              onChange={(calculationType) => replaceRow(index, { calculationType })}
            />
            {row.calculationType === 'fixed_amount' ? (
              <ProfileField
                inputMode="decimal"
                label={t('componentAmount')}
                maxLength={20}
                value={row.amount}
                onChange={(amount) => replaceRow(index, { amount })}
              />
            ) : (
              <ProfileField
                inputMode="decimal"
                label={t('componentRate')}
                maxLength={10}
                value={row.rate}
                onChange={(rate) => replaceRow(index, { rate })}
              />
            )}
            <ProfileDateField
              label={t('validFrom')}
              value={row.validFrom}
              onChange={(validFrom) => replaceRow(index, { validFrom })}
            />
            <ProfileDateField
              label={t('validUntil')}
              value={row.validUntil}
              onChange={(validUntil) => replaceRow(index, { validUntil })}
            />
          </div>
          <div className={styles.formActions}>
            <Button size="sm" type="button" variant="ghost" onClick={() => removeRow(index)}>
              <Icon name="remove" />
              {t('removeComponent')}
            </Button>
          </div>
        </div>
      ))}
      <div className={styles.formActions}>
        <Button
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => onChange({ components: [...components, createEmptyComponentRow()] })}
        >
          <Icon name="add" />
          {t('addComponent')}
        </Button>
      </div>
    </fieldset>
  )
}
