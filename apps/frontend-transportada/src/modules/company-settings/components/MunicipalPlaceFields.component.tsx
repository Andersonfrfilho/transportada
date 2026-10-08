/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { SearchableSelect } from '@/components/ui/searchable-select'

import type { CityOptionsStatus, CityOption } from '../hooks/useCityOptions.hook'
import type { HolidayDraftController } from '../hooks/useHolidayDraft.hook'
import { useHolidayFieldIds } from '../hooks/useHolidayFieldIds.hook'
import { STATE_CHOICES } from '../shared/businessCalendar.constant'
import styles from '../styles/businessCalendar.module.css'

import { HolidayChoiceField } from './HolidayChoiceField.component'
import { HolidayField } from './HolidayField.component'
import { HolidayTextField } from './HolidayTextField.component'

type MunicipalPlaceFieldsProps = Readonly<{
  cityOptions: readonly CityOption[]
  cityStatus: CityOptionsStatus
  controller: HolidayDraftController
  isLocked: boolean
}>

function CityField({ cityOptions, cityStatus, controller, isLocked }: MunicipalPlaceFieldsProps) {
  const { t } = useTranslation('businessCalendar')
  const ids = useHolidayFieldIds()
  const { draft, issues } = controller
  const placeholder =
    cityStatus === 'loading' ? t('municipal.form.cityLoading') : t('municipal.form.cityPlaceholder')

  if (cityStatus === 'error' && !isLocked) {
    return (
      <>
        <p className={styles.alert} role="alert">
          {t('municipal.form.cityLoadError')}
        </p>
        <HolidayTextField
          field="cityIbgeCode"
          inputMode="numeric"
          issue={issues.cityIbgeCode}
          label={t('municipal.form.cityCodeAria')}
          onChange={(value) => controller.setText('cityIbgeCode', value)}
          placeholder={t('municipal.form.cityCodePlaceholder')}
          value={draft.cityIbgeCode}
        />
      </>
    )
  }

  return (
    <HolidayField
      field="cityIbgeCode"
      ids={ids}
      issue={issues.cityIbgeCode}
      label={t('fields.cityIbgeCode')}
    >
      <SearchableSelect
        ariaLabel={t('municipal.form.cityAria')}
        disabled={isLocked || cityStatus !== 'ready'}
        emptyLabel={t('municipal.form.cityEmpty')}
        onChange={(value) => controller.setText('cityIbgeCode', value)}
        options={cityOptions}
        placeholder={placeholder}
        searchPlaceholder={t('municipal.form.citySearch')}
        value={draft.cityIbgeCode}
      />
    </HolidayField>
  )
}

/** A UF e o município dela, pelo código IBGE. Na edição os dois ficam travados: a cidade é a identidade da linha. */
export function MunicipalPlaceFields(props: MunicipalPlaceFieldsProps) {
  const { t } = useTranslation('businessCalendar')
  const { controller, isLocked } = props

  return (
    <>
      <HolidayChoiceField
        ariaLabel={t('municipal.form.stateAria')}
        disabled={isLocked}
        field="stateIbgeCode"
        issue={controller.issues.stateIbgeCode}
        label={t('fields.stateIbgeCode')}
        onChange={(value) => controller.setText('stateIbgeCode', value)}
        options={STATE_CHOICES}
        placeholder={t('municipal.form.statePlaceholder')}
        value={controller.draft.stateIbgeCode}
      />
      <CityField {...props} />
    </>
  )
}
