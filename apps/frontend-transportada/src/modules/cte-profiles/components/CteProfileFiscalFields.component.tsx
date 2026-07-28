/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import {
  CTE_PROFILE_ICMS_CST,
  CTE_PROFILE_MODAL,
  CTE_PROFILE_PICKUP_INDICATOR,
  CTE_PROFILE_PREDOMINANT_PRODUCT_MODE,
  CTE_PROFILE_RECEIVER_IE_INDICATOR,
  CTE_PROFILE_SERVICE_TYPE,
  CTE_PROFILE_TAKER,
} from '../shared/cteProfiles.types'
import type { ProfileFormState } from '../shared/cteProfilesForm.service'
import styles from '../styles/cteProfiles.module.css'
import { ProfileCheckboxField, ProfileField, ProfileSelectField } from './ProfileField.component'

type CteProfileFiscalFieldsProps = Readonly<{
  onChange: (patch: Partial<ProfileFormState>) => void
  state: ProfileFormState
}>

export function CteProfileFiscalFields({ onChange, state }: CteProfileFiscalFieldsProps) {
  const { t } = useTranslation('cteProfiles')
  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('fiscalLegend')}</legend>
      <div className={styles.fieldGrid}>
        <ProfileField
          label={t('operationNature')}
          value={state.operationNature}
          onChange={(operationNature) => onChange({ operationNature })}
        />
        <ProfileField
          inputMode="numeric"
          label={t('cfopInternal')}
          maxLength={4}
          value={state.cfopInternal}
          onChange={(cfopInternal) => onChange({ cfopInternal })}
        />
        <ProfileField
          inputMode="numeric"
          label={t('cfopInterstate')}
          maxLength={4}
          value={state.cfopInterstate}
          onChange={(cfopInterstate) => onChange({ cfopInterstate })}
        />
        <ProfileSelectField
          label={t('icmsCst')}
          optionLabelKey="icmsCstOption"
          options={CTE_PROFILE_ICMS_CST}
          value={state.icmsCst}
          onChange={(icmsCst) => onChange({ icmsCst })}
        />
        <ProfileField
          inputMode="decimal"
          label={t('icmsRate')}
          maxLength={10}
          value={state.icmsRate}
          onChange={(icmsRate) => onChange({ icmsRate })}
        />
        <ProfileField
          inputMode="decimal"
          label={t('icmsBaseReductionRate')}
          maxLength={10}
          value={state.icmsBaseReductionRate}
          onChange={(icmsBaseReductionRate) => onChange({ icmsBaseReductionRate })}
        />
        <ProfileSelectField
          label={t('modal')}
          optionLabelKey="modalOption"
          options={CTE_PROFILE_MODAL}
          value={state.modal}
          onChange={(modal) => onChange({ modal })}
        />
        <ProfileSelectField
          label={t('serviceType')}
          optionLabelKey="serviceTypeOption"
          options={CTE_PROFILE_SERVICE_TYPE}
          value={state.serviceType}
          onChange={(serviceType) => onChange({ serviceType })}
        />
        <ProfileSelectField
          label={t('taker')}
          optionLabelKey="takerOption"
          options={CTE_PROFILE_TAKER}
          value={state.taker}
          onChange={(taker) => onChange({ taker })}
        />
        <ProfileSelectField
          label={t('receiverIeIndicator')}
          optionLabelKey="receiverIeOption"
          options={CTE_PROFILE_RECEIVER_IE_INDICATOR}
          value={state.receiverIeIndicator}
          onChange={(receiverIeIndicator) => onChange({ receiverIeIndicator })}
        />
        <ProfileSelectField
          label={t('pickupIndicator')}
          optionLabelKey="pickupOption"
          options={CTE_PROFILE_PICKUP_INDICATOR}
          value={state.pickupIndicator}
          onChange={(pickupIndicator) => onChange({ pickupIndicator })}
        />
        <ProfileField
          label={t('pickupDetails')}
          maxLength={160}
          value={state.pickupDetails}
          onChange={(pickupDetails) => onChange({ pickupDetails })}
        />
        <ProfileField
          inputMode="numeric"
          label={t('deliveryDays')}
          maxLength={4}
          value={state.deliveryDays}
          onChange={(deliveryDays) => onChange({ deliveryDays })}
        />
        <ProfileSelectField
          label={t('predominantProductMode')}
          optionLabelKey="predominantProductOption"
          options={CTE_PROFILE_PREDOMINANT_PRODUCT_MODE}
          value={state.predominantProductMode}
          onChange={(predominantProductMode) => onChange({ predominantProductMode })}
        />
        <ProfileField
          label={t('predominantProductName')}
          value={state.predominantProductName}
          onChange={(predominantProductName) => onChange({ predominantProductName })}
        />
        <ProfileField
          label={t('observations')}
          maxLength={500}
          value={state.observations}
          onChange={(observations) => onChange({ observations })}
        />
      </div>
      <ProfileCheckboxField
        checked={state.cargoInsuranceDeclared}
        label={t('cargoInsuranceDeclared')}
        onChange={(cargoInsuranceDeclared) => onChange({ cargoInsuranceDeclared })}
      />
    </fieldset>
  )
}
