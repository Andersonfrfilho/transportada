/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CteProfileBody,
  CteProfileComponent,
  CteProfileDetail,
  CteProfileMatcher,
  CteProfileSettings,
} from './cteProfiles.types'
import { createCteProfileDrafts, DEFAULT_VALID_FROM } from './cteProfilesDraft.service'
import {
  fromMoneyDecimal,
  fromRateFraction,
  toMoneyDecimal,
  toRateFraction,
} from './cteProfilesDecimal.service'

const RECEIVER_PICKUP_AT_DESTINATION = '0'

export type ComponentFormRow = Readonly<{
  amount: string
  calculationType: CteProfileComponent['calculationType']
  label: string
  rate: string
  validFrom: string
  validUntil: string
}>

export type ProfileFormState = Omit<
  CteProfileSettings,
  'icmsBaseReductionRate' | 'icmsRate' | 'priority'
> &
  Readonly<{
    components: readonly ComponentFormRow[]
    icmsBaseReductionRate: string
    icmsRate: string
    matchers: readonly CteProfileMatcher[]
    maximumAmount: string
    minimumAmount: string
    percentage: string
    priority: string
    validFrom: string
    validUntil: string
  }>

export function toDateInput(value: null | string): string {
  return value === null ? '' : value.slice(0, 10)
}

export function toIsoInstant(value: string, fallback: string): string {
  if (value === '') return fallback
  return `${value}T00:00:00.000Z`
}

function toNullableIsoInstant(value: string): null | string {
  return value === '' ? null : `${value}T00:00:00.000Z`
}

function toComponentRow(component: CteProfileComponent): ComponentFormRow {
  return {
    amount: fromMoneyDecimal(component.amount),
    calculationType: component.calculationType,
    label: component.label,
    rate: component.rate === null ? '' : fromRateFraction(component.rate),
    validFrom: toDateInput(component.validFrom),
    validUntil: toDateInput(component.validUntil),
  }
}

export function createEmptyComponentRow(): ComponentFormRow {
  return {
    amount: '',
    calculationType: 'percentage_of_cargo',
    label: '',
    rate: '',
    validFrom: toDateInput(DEFAULT_VALID_FROM),
    validUntil: '',
  }
}

export function toFormState(profile?: CteProfileDetail): ProfileFormState {
  const draft = createCteProfileDrafts().createProfileDraft()
  const settings: CteProfileSettings = profile ?? draft.settings
  const freightRule = profile?.freightRule ?? draft.freightRule
  const components = profile?.components ?? draft.components

  return {
    cargoInsuranceDeclared: settings.cargoInsuranceDeclared,
    cfopInternal: settings.cfopInternal,
    cfopInterstate: settings.cfopInterstate,
    chargeComponentLabel: settings.chargeComponentLabel,
    components: components.map(toComponentRow),
    deliveryDays: settings.deliveryDays,
    groupingMode: settings.groupingMode,
    icmsBaseReductionRate: fromRateFraction(settings.icmsBaseReductionRate),
    icmsCst: settings.icmsCst,
    icmsRate: fromRateFraction(settings.icmsRate),
    matchers: profile?.matchers ?? draft.matchers,
    matchMode: settings.matchMode,
    maximumAmount: fromMoneyDecimal(freightRule.maximumAmount),
    minimumAmount: fromMoneyDecimal(freightRule.minimumAmount),
    modal: settings.modal,
    name: settings.name,
    observations: settings.observations,
    operationNature: settings.operationNature,
    percentage: fromRateFraction(freightRule.percentage),
    pickupDetails: settings.pickupDetails,
    pickupIndicator: settings.pickupIndicator,
    predominantProductMode: settings.predominantProductMode,
    predominantProductName: settings.predominantProductName,
    priority: settings.priority,
    receiverIeIndicator: settings.receiverIeIndicator,
    serviceType: settings.serviceType,
    taker: settings.taker,
    validFrom: toDateInput(freightRule.validFrom),
    validUntil: toDateInput(freightRule.validUntil),
  }
}

function toComponent(row: ComponentFormRow, index: number): CteProfileComponent {
  const isFixedAmount = row.calculationType === 'fixed_amount'
  return {
    amount: isFixedAmount ? toMoneyDecimal(row.amount) : null,
    calculationType: row.calculationType,
    label: row.label,
    ordinal: String(index + 1),
    rate: isFixedAmount ? null : toRateFraction(row.rate),
    validFrom: toIsoInstant(row.validFrom, DEFAULT_VALID_FROM),
    validUntil: toNullableIsoInstant(row.validUntil),
  }
}

export function toProfileBody(state: ProfileFormState): CteProfileBody {
  return {
    components: state.components.map(toComponent),
    freightRule: {
      maximumAmount: toMoneyDecimal(state.maximumAmount),
      minimumAmount: toMoneyDecimal(state.minimumAmount),
      percentage: toRateFraction(state.percentage),
      validFrom: toIsoInstant(state.validFrom, DEFAULT_VALID_FROM),
      validUntil: toNullableIsoInstant(state.validUntil),
    },
    matchers: state.matchers.filter((matcher) => matcher.taxId.trim() !== ''),
    settings: {
      cargoInsuranceDeclared: state.cargoInsuranceDeclared,
      cfopInternal: state.cfopInternal,
      cfopInterstate: state.cfopInterstate,
      chargeComponentLabel: state.chargeComponentLabel,
      deliveryDays: state.deliveryDays,
      groupingMode: state.groupingMode,
      icmsBaseReductionRate: toRateFraction(state.icmsBaseReductionRate),
      icmsCst: state.icmsCst,
      icmsRate: toRateFraction(state.icmsRate),
      matchMode: state.matchMode,
      modal: state.modal,
      name: state.name,
      observations: state.observations,
      operationNature: state.operationNature,
      pickupDetails:
        state.pickupIndicator === RECEIVER_PICKUP_AT_DESTINATION ? state.pickupDetails.trim() : '',
      pickupIndicator: state.pickupIndicator,
      predominantProductMode: state.predominantProductMode,
      predominantProductName: state.predominantProductName,
      priority: state.priority,
      receiverIeIndicator: state.receiverIeIndicator,
      serviceType: state.serviceType,
      taker: state.taker,
    },
  }
}
