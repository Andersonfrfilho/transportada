/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CteProfileBody,
  CteProfileComponent,
  CteProfileDetail,
  CteProfileMatcher,
  CteProfileOutputDocument,
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

export type NfseProfileOption = Readonly<{ label: string; value: string }>

type NfseProfileSummary = Readonly<{ id: string; name: string; status: string }>

/** Em `nfse` tomador, regra de frete, CFOP e ICMS são do perfil NFS-e: a tela os esconde. */
export function showsCteFiscalFields(outputDocument: CteProfileOutputDocument): boolean {
  return outputDocument === 'cte'
}

/** Só perfil ativo entra no seletor: a API recusa apontar para os outros. */
export function toNfseProfileOptions(
  profiles: readonly NfseProfileSummary[],
): readonly NfseProfileOption[] {
  return profiles
    .filter((profile) => profile.status === 'active')
    .map((profile) => ({ label: profile.name, value: profile.id }))
}

/** O corpo nunca leva combinação que o banco recusa: CT-e solta o ponteiro, NFS-e não bloqueia. */
function withCoherentOutput(state: ProfileFormState): ProfileFormState {
  if (showsCteFiscalFields(state.outputDocument)) return { ...state, nfseEmissionProfileId: null }
  return { ...state, municipalServicePolicy: 'allow' }
}

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
    municipalServicePolicy: settings.municipalServicePolicy,
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
    nfseEmissionProfileId: settings.nfseEmissionProfileId,
    observations: settings.observations,
    operationNature: settings.operationNature,
    outputDocument: settings.outputDocument,
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

function toSettings(state: ProfileFormState): CteProfileSettings {
  return {
    cargoInsuranceDeclared: state.cargoInsuranceDeclared,
    municipalServicePolicy: state.municipalServicePolicy,
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
    nfseEmissionProfileId: state.nfseEmissionProfileId,
    observations: state.observations,
    operationNature: state.operationNature,
    outputDocument: state.outputDocument,
    pickupDetails:
      state.pickupIndicator === RECEIVER_PICKUP_AT_DESTINATION ? state.pickupDetails.trim() : '',
    pickupIndicator: state.pickupIndicator,
    predominantProductMode: state.predominantProductMode,
    predominantProductName: state.predominantProductName,
    priority: state.priority,
    receiverIeIndicator: state.receiverIeIndicator,
    serviceType: state.serviceType,
    taker: state.taker,
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
    settings: toSettings(withCoherentOutput(state)),
  }
}
