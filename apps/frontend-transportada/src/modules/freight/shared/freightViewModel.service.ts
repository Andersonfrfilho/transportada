/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  FreightCalculationListPage,
  FreightRuleListPage,
  FreightSimulationResult,
} from './freightClient.service'

export type FreightDocumentOption = Readonly<{
  id: string
  issuedAt: string
  label: string
  status: 'authorized' | 'cancelled' | 'denied'
  totalAmount: string
  variant: 'complete' | 'event' | 'summary'
}>

export type FreightViewModel = Readonly<{
  calculations?: FreightCalculationListPage['items']
  canManageRules: boolean
  canSimulateFreight: boolean
  documents?: readonly FreightDocumentOption[]
  hasAdjustment?: boolean
  rules?: FreightRuleListPage['items']
  selectedDocumentId?: string
  simulation?: FreightSimulationResult
  status: 'adjusted' | 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'
}>

type ViewModelInput = Readonly<{
  calculations?: FreightCalculationListPage
  documents?: readonly FreightDocumentOption[]
  permissions: readonly string[]
  rules?: FreightRuleListPage
  simulation?: FreightSimulationResult
  status: 'error' | 'loading' | 'success'
}>

const SETTINGS_MANAGE = 'settings.manage'
const FREIGHT_SIMULATE = 'freight.simulate'

export function createFreightViewModel(input: ViewModelInput): FreightViewModel {
  const canManageRules = input.permissions.includes(SETTINGS_MANAGE)
  const canSimulateFreight = input.permissions.includes(FREIGHT_SIMULATE)

  if (!canManageRules && !canSimulateFreight) {
    return { canManageRules, canSimulateFreight, status: 'forbidden' }
  }
  if (input.status !== 'success') {
    return { canManageRules, canSimulateFreight, status: input.status }
  }

  const calculations = input.calculations?.items ?? []
  const documents = input.documents ?? []
  const rules = input.rules?.items ?? []
  const simulation = input.simulation
  if (
    calculations.length === 0 &&
    documents.length === 0 &&
    rules.length === 0 &&
    simulation === undefined
  ) {
    return { canManageRules, canSimulateFreight, status: 'empty' }
  }

  const selectedDocumentId = simulation?.nfeDocumentId ?? documents[0]?.id
  const hasAdjustment = (simulation?.adjustments.length ?? 0) > 0

  return {
    ...(calculations.length === 0 ? {} : { calculations }),
    canManageRules,
    canSimulateFreight,
    ...(documents.length === 0 ? {} : { documents }),
    hasAdjustment,
    ...(rules.length === 0 ? {} : { rules }),
    ...(selectedDocumentId === undefined ? {} : { selectedDocumentId }),
    ...(simulation === undefined ? {} : { simulation }),
    status: hasAdjustment ? 'adjusted' : 'ready',
  }
}
